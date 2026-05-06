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
