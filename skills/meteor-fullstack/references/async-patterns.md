# Async Patterns in Meteor 3

## The Fibers→Async Shift

Meteor 2 used **Fibers** to make async I/O look synchronous — the runtime transparently suspended the current fiber on any blocking call. Meteor 3 removes Fibers entirely. All server-side I/O uses standard JavaScript async/await.

This affects every layer: collection operations, method bodies, publication setup, startup code, and any server utility that touches the database.

## Collection API Migration

Every sync collection method has an async counterpart. On the server, always use the async version.

```js
// Meteor 2 (Fibers)
const doc = MyCollection.findOne(id);
MyCollection.insert({ name: 'test' });
MyCollection.update(id, { $set: { done: true } });
MyCollection.remove(id);
const count = MyCollection.find(selector).count();
const docs = MyCollection.find(selector).fetch();

// Meteor 3 (async/await)
const doc = await MyCollection.findOneAsync(id);
await MyCollection.insertAsync({ name: 'test' });
await MyCollection.updateAsync(id, { $set: { done: true } });
await MyCollection.removeAsync(id);
const count = await MyCollection.find(selector).countAsync();
const docs = await MyCollection.find(selector).fetchAsync();
```

### Cursor iteration

```js
// forEach
await MyCollection.find(selector).forEachAsync(async (doc) => {
  await processDoc(doc);
});

// map
const results = await MyCollection.find(selector).mapAsync(async (doc) => {
  return await transform(doc);
});
```

### Indexes

```js
// In server startup
Meteor.startup(async () => {
  await MyCollection.createIndexAsync({ email: 1 }, { unique: true });
  await MyCollection.createIndexAsync({ createdAt: -1 });
});
```

## Method Bodies

Method functions must be `async` when they contain any `await`:

```js
Meteor.methods({
  async 'items.create'(data) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    
    const user = await Meteor.userAsync();
    const id = await Items.insertAsync({
      ...data,
      ownerId: this.userId,
      ownerName: user.profile?.name,
      createdAt: new Date(),
    });
    
    return id;
  },

  async 'items.batchUpdate'(ids, modifier) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    
    let updated = 0;
    for (const id of ids) {
      const item = await Items.findOneAsync(id);
      if (item?.ownerId === this.userId) {
        await Items.updateAsync(id, modifier);
        updated++;
      }
    }
    return updated;
  },
});
```

## Calling Methods

```js
// Meteor 3 — always use callAsync
const result = await Meteor.callAsync('items.create', { title: 'New item' });

// DO NOT use Meteor.call with async methods
// Meteor.call('items.create', data, callback); // ← broken with async stubs
```

### Sub-promises for optimistic UI

`callAsync` exposes two phases:

```js
const call = Meteor.callAsync('items.create', data);

// Phase 1: stub completed — local Minimongo updated (optimistic)
await call.stubPromise;
console.log(Items.findOne({ title: data.title })); // visible locally

// Phase 2: server completed — real write committed
const id = await call.serverPromise;
```

In most cases, simply `await`ing the call is sufficient — the full call resolves when the server finishes.

## Publication Setup

Publication functions can be async for authorization and setup, but must return a sync cursor:

```js
Meteor.publish('projects.mine', async function () {
  if (!this.userId) {
    this.ready();
    return;
  }
  
  const user = await Meteor.users.findOneAsync(this.userId);
  const teamIds = user.teamIds || [];
  
  // Return sync cursor for live-query reactivity
  return Projects.find({ teamId: { $in: teamIds } });
});
```

The cursor returned by `find()` is sync — Meteor's oplog/poll driver handles reactivity internally.

## User APIs

```js
// Server (async required)
const userId = this.userId;                    // sync — just reads the context
const user = await Meteor.userAsync();         // async — DB lookup
const user = await Meteor.users.findOneAsync(userId);  // equivalent

// Client (sync fine — reads from Minimongo)
const userId = Meteor.userId();
const user = Meteor.user();
```

## Startup Code

```js
// Server
Meteor.startup(async () => {
  // Create indexes
  await Users.createIndexAsync({ 'emails.address': 1 });
  
  // Seed data
  const count = await Items.find().countAsync();
  if (count === 0) {
    await Items.insertAsync({ title: 'Sample', createdAt: new Date() });
  }
});
```

## Common Migration Mistakes

### 1. Using sync APIs on the server

```js
// WRONG — will throw or return undefined in Meteor 3
const doc = MyCollection.findOne(id);

// CORRECT
const doc = await MyCollection.findOneAsync(id);
```

### 2. Forgetting async on the method function

```js
// WRONG — await inside a non-async function
Meteor.methods({
  'items.get'(id) {
    return await Items.findOneAsync(id); // SyntaxError or silent failure
  },
});

// CORRECT
Meteor.methods({
  async 'items.get'(id) {
    return await Items.findOneAsync(id);
  },
});
```

### 3. Mixing Meteor.call with async stubs

```js
// WRONG — Meteor.call doesn't handle async stubs
Meteor.call('items.create', data, (err, res) => { /* ... */ });

// CORRECT
try {
  const res = await Meteor.callAsync('items.create', data);
} catch (err) {
  handleError(err);
}
```

### 4. Expecting sync Minimongo updates after callAsync

```js
// WRONG — stub may not have finished
Meteor.callAsync('items.create', data);
const item = Items.findOne({ title: data.title }); // might be null

// CORRECT — wait for stub
const call = Meteor.callAsync('items.create', data);
await call.stubPromise;
const item = Items.findOne({ title: data.title }); // now available
```

### 5. Returning non-EJSON values from methods

Method return values must be EJSON-serializable (plain objects, arrays, strings, numbers, dates, binary, ObjectID). Functions, class instances, and circular references will fail silently or throw.

## `Meteor.applyAsync` for Advanced Control

When you need fine-grained control over method invocation:

```js
const result = await Meteor.applyAsync('items.create', [data], {
  throwStubExceptions: true,     // throw stub errors instead of logging
  returnServerResultPromise: true, // ensure promise resolves to server result
  wait: true,                     // queue behind previous method calls
  noRetry: true,                  // don't re-send on reconnect
});
```

| Option | Effect |
|--------|--------|
| `throwStubExceptions` | Throw (not just log) if the stub errors; skip server call |
| `returnStubValue` | Resolve the promise with the stub's return value |
| `returnServerResultPromise` | Ensure promise resolves to the server result |
| `wait` | Don't send until all previous method calls finish |
| `noRetry` | Don't re-send on reconnect |
