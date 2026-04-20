---
name: meteor-fullstack
description: "Full-stack Meteor 3.x development with React, MongoDB, async APIs, methods, pub/sub, and GraphQL. Use this skill when working on any Meteor project — writing methods, publications, subscriptions, React data containers, collection helpers, ORM patterns, Meteor-to-React integration via useTracker/withTracker, async migration from Fibers, optimistic UI, DDP, or debugging Meteor-specific issues like circular dependencies, method stubs, and simulation errors. Trigger on: Meteor, Meteor.js, Meteor 3, MeteorJS, callAsync, useTracker, withTracker, Meteor methods, Meteor publications, Meteor subscriptions, SubsManager, Minimongo, DDP, Mongo.Collection, Meteor.Error, optimistic UI, Fibers migration, meteor async."
---

# Meteor Full-Stack Development (v3.x + React)

Modern Meteor 3.x full-stack development guide covering async-first patterns, React integration, MongoDB collections, methods, pub/sub, and project architecture.

Meteor 3 removed Fibers entirely — all server-side I/O is standard async/await. This is the single most important thing to internalize: every collection operation, every method body, every publication setup function that touches the database must be async.

---

## Quick Reference: Async Collection APIs

Always use the `*Async` variants on the server. Sync versions exist only for client-side Minimongo.

| Operation | Async API (server) | Sync API (client Minimongo only) |
|-----------|-------------------|----------------------------------|
| Insert | `insertAsync(doc)` | `insert(doc)` |
| Find one | `findOneAsync(selector)` | `findOne(selector)` |
| Update | `updateAsync(selector, modifier)` | `update(selector, modifier)` |
| Upsert | `upsertAsync(selector, modifier)` | `upsert(selector, modifier)` |
| Remove | `removeAsync(selector)` | `remove(selector)` |
| Count | `countAsync()` (on cursor) | `count()` |
| Fetch | `fetchAsync()` (on cursor) | `fetch()` |
| forEach | `forEachAsync(fn)` (on cursor) | `forEach(fn)` |
| map | `mapAsync(fn)` (on cursor) | `map(fn)` |
| Observe | `observeAsync(callbacks)` | `observe(callbacks)` |
| Create index | `createIndexAsync(index, options)` | — |
| Send email | `Email.sendAsync(options)` | `Email.send(options)` |

Publications still return **sync cursors** via `collection.find(...)` for live-query reactivity — that hasn't changed.

---

## Core Concepts at a Glance

### Methods (RPC)

Server functions callable from the client. In v3, always async:

```js
Meteor.methods({
  async 'todos.create'(text) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    return await Todos.insertAsync({ text, createdAt: new Date(), userId: this.userId });
  },
});

// Client
const id = await Meteor.callAsync('todos.create', 'Buy milk');
```

Read `references/methods-rpc.md` for stubs, optimistic UI, `applyAsync` options, and the simulation timing trap.

### Publications & Subscriptions

Server pushes reactive data to the client over DDP:

```js
// Server
Meteor.publish('todos.byUser', function () {
  if (!this.userId) return this.ready();
  return Todos.find({ userId: this.userId });
});

// Client (React)
const { todos, isLoading } = useTracker(() => {
  const handle = Meteor.subscribe('todos.byUser');
  return {
    isLoading: !handle.ready(),
    todos: Todos.find({}, { sort: { createdAt: -1 } }).fetch(),
  };
}, []);
```

Read `references/pubsub.md` for composite publications, SubsManager caching, counts, and publication wrappers.

### React Integration

Meteor's reactive data layer connects to React through `useTracker` (hooks) or `withTracker` (HOC):

```jsx
import { useTracker } from 'meteor/react-meteor-data';

function TodoList() {
  const { todos, user } = useTracker(() => ({
    todos: Todos.find().fetch(),
    user: Meteor.user(),
  }));

  return todos.map(t => <TodoItem key={t._id} todo={t} user={user} />);
}
```

Read `references/react-integration.md` for `withTracker` patterns, subscription lifecycle in components, and common pitfalls.

---

## Project Structure

A typical Meteor 3 + React project:

```
my-app/
├── client/              # Client entry, main.jsx, global styles
│   └── main.jsx         # Meteor.startup(() => render(<App />))
├── server/              # Server entry, publications, startup
│   ├── main.js          # Meteor.startup, indexes, seeds
│   └── publications/    # Pub definitions by domain
├── imports/             # Shared code (lazy-loaded by convention)
│   ├── api/             # Collections, methods, schemas
│   │   ├── todos/
│   │   │   ├── collection.js
│   │   │   ├── methods.js
│   │   │   └── publications.js
│   │   └── users/
│   ├── ui/              # React components
│   │   ├── components/  # Reusable UI
│   │   ├── pages/       # Route-level components
│   │   └── layouts/     # Layout wrappers
│   └── startup/         # Client/server bootstrap
├── public/              # Static assets (served as-is)
├── private/             # Server-only assets (Assets API)
├── .meteor/             # Meteor internals, packages, versions
└── package.json
```

Key conventions:
- Everything under `imports/` is lazy — only loaded when explicitly imported
- `client/` and `server/` directories are eagerly loaded on their respective sides
- Files outside `imports/` that aren't in `client/` or `server/` load on both sides

Read `references/architecture.md` for circular dependency prevention, import rules, and module organization patterns.

---

## Common Patterns

### Error Handling in Methods

Only `Meteor.Error` reaches the client — other exceptions are sanitized to a generic 500:

```js
// Server method
async 'orders.cancel'(orderId) {
  const order = await Orders.findOneAsync(orderId);
  if (!order) throw new Meteor.Error('not-found', 'Order not found');
  if (order.userId !== this.userId) throw new Meteor.Error('not-authorized', 'Not your order');
  await Orders.updateAsync(orderId, { $set: { status: 'cancelled' } });
}

// Client
try {
  await Meteor.callAsync('orders.cancel', orderId);
} catch (err) {
  if (err.error === 'not-found') showToast(err.reason);
}
```

### Collection Helpers

Attach computed properties and methods to documents using `dburles:collection-helpers`:

```js
Todos.helpers({
  isOverdue() {
    return this.dueDate && this.dueDate < new Date();
  },
  owner() {
    return Meteor.users.findOne(this.userId);
  },
});

// Usage — any document from Todos.find/findOne gets these methods
const todo = Todos.findOne(id);
if (todo.isOverdue()) { /* ... */ }
```

### Authorization Pattern

Guard methods and publications with `this.userId`:

```js
Meteor.methods({
  async 'projects.archive'(projectId) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    const project = await Projects.findOneAsync(projectId);
    if (project.ownerId !== this.userId) {
      throw new Meteor.Error('forbidden', 'Only the owner can archive');
    }
    return await Projects.updateAsync(projectId, { $set: { archived: true } });
  },
});
```

### Accounts & Users

Meteor's built-in accounts system provides `Meteor.userId()`, `Meteor.user()`, and their async equivalents:

```js
// Server — async required in v3
const user = await Meteor.userAsync();

// Client — sync is fine (reads from Minimongo)
const user = Meteor.user();
const userId = Meteor.userId();

// Reactive in useTracker
const user = useTracker(() => Meteor.user(), []);
```

### Sending Email

Always use `Email.sendAsync` on the server — it returns a Promise and fits the async-first model:

```js
import { Email } from 'meteor/email';

Meteor.methods({
  async 'notifications.send'(to, subject, html) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    await Email.sendAsync({ from: 'noreply@example.com', to, subject, html });
  },
});
```

---

## What to Watch Out For

### 1. "Can't set timers inside simulations"

This browser error occurs when an async method stub is running (simulation context is active) and a `withTracker`/`useTracker` component re-renders, calling `Meteor.defer`. Fix: add `if (Meteor.isClient) return;` at the top of complex stubs to make them no-ops on the client. The server still runs the full logic; Minimongo updates via the subscription.

### 2. `Meteor.call` with async stubs

`Meteor.call` was designed for sync stubs. Always use `Meteor.callAsync` in v3. Mixing them causes stubs to not resolve properly.

### 3. Circular dependencies in barrel imports

Mixed barrels that re-export models, components, actions, and schemas from a single index file are the #1 source of `Element type is invalid` and `undefined` errors in Meteor apps. Prefer direct file imports on hot paths.

### 4. Sync collection APIs on the server

Using `collection.insert()` (sync) on the server in Meteor 3 will throw or behave unpredictably. Always use `insertAsync`, `updateAsync`, etc. on the server.

### 5. `Email.send` on the server

`Email.send` is the legacy sync form. In Meteor 3, always use `await Email.sendAsync(options)` inside method bodies so errors surface correctly and the Promise is properly awaited.

### 6. Publication setup vs cursor return

Publication functions can be `async` for setup work (auth checks, DB lookups), but must ultimately return a sync cursor or call `this.ready()`:

```js
Meteor.publish('items.forTeam', async function (teamId) {
  const team = await Teams.findOneAsync(teamId);
  if (!team.members.includes(this.userId)) return this.ready();
  return Items.find({ teamId });  // sync cursor for reactivity
});
```

---

## Reference Files

For deeper coverage, read these when working on specific areas:

| File | When to read |
|------|-------------|
| `references/methods-rpc.md` | Writing methods, stubs, optimistic UI, `callAsync` vs `applyAsync`, error handling |
| `references/pubsub.md` | Publications, subscriptions, composite pubs, SubsManager, counts, reactive data flow |
| `references/react-integration.md` | `useTracker`, `withTracker`, subscription lifecycle in React, data containers |
| `references/collections-models.md` | Defining collections, schemas, helpers, ORM patterns, indexes, aggregation |
| `references/async-patterns.md` | Fibers→async migration, async method patterns, async publication setup, common mistakes |
| `references/architecture.md` | Project structure, import rules, circular dependency prevention, client/server split |

---

## Code Style Defaults

Unless the project specifies otherwise:

- Use **named exports** (avoid default exports)
- Name files after the primary export
- Prefer **direct file imports** over barrel imports for React components, actions, and schemas
- Use `async`/`await` everywhere on the server — never rely on sync collection APIs
- Guard all methods and publications with `this.userId` checks
- Throw `Meteor.Error(errorCode, reason)` for client-visible errors
- Use `npm` as the package manager
