---
name: meteor-observer-leaks
description: Use when hunting Meteor 3 publication observer leaks, server `observeChanges` / `observeChangesAsync` / `observeAsync`, `stop is not a function` in onStop, silent `stop?.()` no-ops, or access-revocation observers after a Fibers→async port.
---

# Hunting observer leaks

On the **server**, Meteor 3 `observeChanges` / `observe` return a **Promise of a handle**. Assigning without `await` stores a Promise. Promises have no `.stop()`, so teardown either throws or no-ops and the live query keeps running.

Client MiniMongo `observeChanges()` still returns a handle. Skip `client/` and client-only files.

### Canonical Teardown Pattern

```js
Meteor.publish('items.view', function (teamId) {
  let stopped = false;
  let handle = null;

  this.onStop(() => {
    stopped = true;
    handle?.stop();
  });

  const cursor = Items.find({ teamId });
  cursor.observeChangesAsync({
    added: (id, fields) => this.added('items', id, fields),
    changed: (id, fields) => this.changed('items', id, fields),
    removed: (id) => this.removed('items', id),
  }).then((h) => {
    handle = h;
    if (stopped) handle.stop();
  });

  this.ready();
});
```

## Hunt

Grep the Meteor app (not `client/`):

```bash
rg -n --glob '!client/**' 'observeChanges|observeChangesAsync|\.observeAsync|\.observe\('
```

**Done when** every match has a file:line and a class below. An unscored hit is an incomplete hunt.

## Classify every hit

| Class | What you see | Severity |
|---|---|---|
| **throw** | `const h = cursor.observeChanges(...)` then `h.stop()` | onStop TypeError; handle leaks if unsub during setup |
| **silent leak** | same, but `h.stop?.()` | no throw; observer never stopped |
| **teardown race** | `await observeChangesAsync` **then** `onStop(() => h.stop())` | handle leaks if the sub dies during the await |
| **fixed** | `onStop` registered first with a `stopped` flag; `await observeChangesAsync` / `observeAsync`; `if (stopped) handle.stop()` | keep |
| **client** | MiniMongo in `client/` or a client-only module | keep sync `observeChanges` |

`await` without the flag is **teardown race**, not fixed. `stop?.()` is **silent leak**, not defensive.

Publication `find()` cursors stay **sync**. Only the observer API is async.

## Report

For each non-fixed, non-client hit: class, file:line, whether `onStop` runs before the await.

Fix only when asked. Pattern to copy: Canonical teardown pattern (flag + `onStop` first + `observeChangesAsync` + `if (stopped) handle.stop()`).

Monti APM `Cannot read properties of null (reading 'id')` / `trace has not started yet` is the agent crashing in `subscription.error` when `_session` is gone. Score the **app** observer (or the pub that called `this.error`); do not treat Monti as the leak.
