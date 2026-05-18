## `this.unblock()` — DDP Queue Parallelism

### Why it exists

Meteor enforces **strict sequential (FIFO) execution per client connection** by default. If the same client fires Method A then Method B, Method B won't start until Method A fully resolves — even if Method A is just sitting idle waiting for an external HTTP response. This protects data integrity (e.g., ensuring a `createUser` completes before a `createWorkspace` that queries the new user), but it unnecessarily freezes the entire UI for slow, independent I/O.

Calling `this.unblock()` tells the DDP server: *"pop the next message out of this client's queue and start processing it now — don't make the client wait for me."* The current method continues running; subsequent methods from the same client are just no longer blocked on it.

### Meteor 3 + async/await — it's still necessary

A common misconception: since Meteor 3 methods are natively async, `this.unblock()` must be redundant. **This is false.** Meteor still enforces sequential per-session execution even for async methods. A method sitting in `await fetch(externalApi)` will still block Method B from starting until the `await` resolves, unless you call `this.unblock()`. The same applies to Publications — Meteor 3 officially supports `this.unblock()` inside publications so that long-running subscriptions don't block subsequent ones from the same user.

### When to use it

Call `this.unblock()` at the **very top** of the method (after any early auth/rate-limit checks that might throw):

```js
Meteor.methods({
  async 'reports.generate'(params) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    this.unblock(); // ← as early as possible after auth guard

    const report = await heavyExternalApiCall(params);
    return report;
  },
});
```

**Best candidates:**
- Methods that call external APIs (Stripe, AI endpoints, weather services, etc.)
- Heavy or complex database aggregations the client needs to display
- Read-only operations (search, dashboard analytics) that have no ordering dependency

### When NOT to use it

Do **not** unblock when the client fires a sequence of methods where one depends on a prior one completing:

```js
// Client fires these back-to-back:
await Meteor.callAsync('users.signup', data);  // inserts user to DB
await Meteor.callAsync('workspace.createInitial', userId);  // reads that user

// If 'users.signup' is unblocked, 'workspace.createInitial' may run
// concurrently and find no user record yet. Race condition!
```

Never unblock write methods that produce state consumed by immediately-following methods from the same client.

### `this.unblock()` vs. `Meteor.defer()`

These are complementary tools for different situations:

| | `this.unblock()` | `Meteor.defer()` |
|---|---|---|
| **Client waits for result?** | Yes — method still returns its value | No — method returns immediately, deferred code is fire-and-forget |
| **Queue effect** | Releases the DDP queue while method runs | Pushes task completely outside the method pipeline |
| **Typical use** | Fetching a Stripe receipt the UI needs to display | Sending a welcome email after registration |

Use `Meteor.defer()` when the client genuinely does not need to wait for a side effect. Use `this.unblock()` when the client needs the return value but shouldn't freeze other requests while waiting.

### Combined example

```js
import { Meteor } from 'meteor/meteor';
import { Email } from 'meteor/email';

Meteor.methods({
  async 'orders.checkout'(orderId) {
    // Auth check first — this can throw, so unblock goes after
    if (!this.userId) throw new Meteor.Error('not-authorized');

    // Unblock so the user can still navigate/interact while payment processes
    this.unblock();

    // Slow external I/O — client needs this result
    const paymentStatus = await ChargeExternalProvider(orderId);

    if (paymentStatus.success) {
      // Fire-and-forget — client doesn't care when the email lands
      Meteor.defer(() => {
        Email.sendAsync({
          to: getUserEmail(this.userId),
          subject: 'Your Order Receipt',
          text: 'Thank you for your purchase!',
        });
      });
    }

    return paymentStatus;
  },
});
```

### Limitations

`this.unblock()` frees the DDP queue for async I/O tasks only. Node.js is still single-threaded: heavy **synchronous CPU work** (large array transforms, file compression, synchronous crypto) will still freeze the entire server regardless. For CPU-bound tasks, use worker threads or off-process microservices.

---

## Publication / Oplog Performance

With oplog disabled, all reactive queries poll. Use this checklist for performance:

- [ ] **Projections**: Are you using `fields` to limit BSON size?
- [ ] **Transforms**: Can you use `transform: null` to avoid helper overhead?
- [ ] **Auth**: Is your reactive cursor doing complex permission checks?
- [ ] **Composite**: Are you using `publishComposite` for single collections?

---

### 1. Separate Auth from Reactive Cursor

**Key Rule**: Do complex auth once at publication start; return a simple, indexed cursor for the reactive part.

Complex access selectors (`$or`, `$and`, role checks) poll the entire collection. Move auth to a one-time check at setup; keep the reactive cursor minimal.

```js
Meteor.publish('item.view', async function (itemId) {
  const hasAccess = await Items.findOneAsync(
    { _id: itemId, ...itemAccessSelector },
    { fields: { _id: 1 } }
  );
  if (!hasAccess) return this.ready();

  const accessObserver = await Items.find(
    { _id: itemId },
    { fields: { team: 1, members: 1, status: 1 } }
  ).observeChangesAsync({
    changed: async () => {
      const stillHasAccess = await Items.findOneAsync(
        { _id: itemId, ...itemAccessSelector }, 
        { fields: { _id: 1 } }
      );
      if (!stillHasAccess) {
        this.stop();
      }
    },
    removed: () => this.stop(),
  });

  this.onStop(() => accessObserver.stop());

  return Items.find({ _id: itemId }); // single indexed lookup per poll
});
```

### 2. Skip Collection Helpers Transform

`dburles:collection-helpers` sets `_transform` on the collection. With polling, the transform runs on every document on every poll cycle. If the cursor only accesses stored fields (not helper methods), pass `transform: null`.

```js
return Meteor.users.find(selector, {
  fields: { profile: 1, emails: 1 },
  transform: null,
});
```

### 3. Skip publishComposite When No Children

`publishComposite` adds wrapper overhead. If there are no child cursors, use `find` directly.

```js
// Before — unnecessary wrapper
publishComposite(context, { id }) {
  return { find: () => Items.find({ _id: id }) };
}

// After — direct cursor
find(context, { id }) {
  return Items.find({ _id: id });
}
```

### 4. Always Use Field Projections

Never return full documents when a subset suffices. Reduces BSON size and transform cost.

```js
return Teams.find(selector, {
  fields: { _id: 1, name: 1, type: 1, members: 1 },
  transform: null,
});
```

For helpers that load related data (e.g., `getUserInfo`), define a constant with required fields and reuse it across all call sites.

### 5. Use `rawCollection` for Bulk Operations

For massive updates, Meteor's `updateAsync({ ... }, { multi: true })` can be slow as it triggers hooks for every document. Use `rawCollection().bulkWrite()` for maximum speed, but **be careful**: this bypasses all Meteor hooks.

See `references/collections-models.md` for how to replicate hooks manually when using `rawCollection`.
