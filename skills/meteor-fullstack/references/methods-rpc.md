# Meteor Methods (RPC)

Methods are Meteor's remote procedure call mechanism — functions defined on the server that can be called from the client (or server-to-server) over DDP.

## Defining Methods

### Basic pattern

```js
import { Meteor } from 'meteor/meteor';
import { Todos } from '/imports/api/todos/collection';

Meteor.methods({
  async 'todos.create'(text) {
    if (!this.userId) throw new Meteor.Error('not-authorized', 'Must be logged in');
    
    return await Todos.insertAsync({
      text,
      userId: this.userId,
      createdAt: new Date(),
      completed: false,
    });
  },

  async 'todos.setCompleted'(todoId, completed) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    
    const todo = await Todos.findOneAsync(todoId);
    if (!todo) throw new Meteor.Error('not-found', 'Todo not found');
    if (todo.userId !== this.userId) throw new Meteor.Error('forbidden', 'Not your todo');
    
    await Todos.updateAsync(todoId, { $set: { completed } });
  },

  async 'todos.remove'(todoId) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    await Todos.removeAsync({ _id: todoId, userId: this.userId });
  },
});
```

### Method context (`this`)

Inside a method body, `this` provides:

| Property | Description |
|----------|-------------|
| `this.userId` | ID of the logged-in user (null if unauthenticated) |
| `this.connection` | DDP connection object (null for server-to-server or REST calls) |
| `this.isSimulation` | `true` when running as a client stub |
| `this.unblock()` | Allow the next method from this client to run without waiting for this one |

### Using `this.unblock()`

By default, methods from the same client run sequentially. Call `this.unblock()` early if subsequent methods don't depend on this one:

```js
async 'analytics.track'(event, data) {
  this.unblock(); // don't block the client's next method call
  await Analytics.insertAsync({ event, data, userId: this.userId, at: new Date() });
}
```

## Calling Methods

### From the client

```js
// Always use callAsync in Meteor 3
try {
  const todoId = await Meteor.callAsync('todos.create', 'Buy groceries');
  console.log('Created:', todoId);
} catch (err) {
  console.error(err.reason); // Meteor.Error reason string
}
```

### From the server

```js
// Server-to-server calls — also use callAsync
const result = await Meteor.callAsync('todos.create', 'Server-generated todo');
```

### From another service (e.g., GraphQL resolver via DDP)

```js
// Using an Asteroid/DDP client
await asteroid.loginWithToken({ token: context.token });
const result = await asteroid.call('todos.create', 'From GraphQL');
```

## Method Stubs (Optimistic UI)

A **stub** is a client-side copy of a server method. When the client calls the method:

1. The stub runs immediately on the client (writes to local Minimongo)
2. The server method runs on the server
3. When the server responds, Minimongo reconciles — if the server result differs, the client-side changes are rolled back

### How stubs work

If the method is defined in a shared file (loaded on both client and server), the same function acts as both the real method and the stub:

```js
// imports/api/todos/methods.js — loaded on BOTH client and server
Meteor.methods({
  async 'todos.create'(text) {
    return await Todos.insertAsync({ text, userId: this.userId, createdAt: new Date() });
  },
});
```

On the client, `insertAsync` writes to Minimongo (local). On the server, it writes to MongoDB (real).

### Client-only stub (simplified version)

Sometimes the server method does complex validation, sends emails, etc. You can define a lighter stub just for the client:

```js
// client/stubs/todos.js — client only
Meteor.methods({
  async 'todos.create'(text) {
    // Just update local cache — server handles the rest
    Todos.insert({ text, userId: Meteor.userId(), createdAt: new Date() });
  },
});
```

### No-op stub for complex methods

When the server method has heavy async logic (multiple awaits, nested calls), the stub can cause "Can't set timers inside simulations" errors. Fix by making the stub a no-op:

```js
// Shared file
Meteor.methods({
  async 'orders.process'(orderId) {
    if (Meteor.isClient) return; // no-op stub — avoids simulation issues

    // Complex server-only logic
    const order = await Orders.findOneAsync(orderId);
    await validateInventory(order);
    await chargePayment(order);
    await Orders.updateAsync(orderId, { $set: { status: 'processed' } });
    await sendConfirmationEmail(order);
  },
});
```

The trade-off: no optimistic UI for this method. The client waits for the server response. This is often the right choice for complex operations.

### The simulation timing trap

In Meteor 3, the simulation context (`isSimulation = true`) stays set as a global until the stub's Promise fully resolves — not just until the first `await`. While the stub is pending, any `withTracker`/`useTracker` re-render that calls `Meteor.defer` will throw:

```
Error: Can't set timers inside simulations
```

This is a race condition triggered when:
1. A method with an async stub is called
2. The stub has multiple `await`s
3. A React component re-renders via Tracker while the stub is still running

The fix is `if (Meteor.isClient) return;` at the top of the stub.

### Diagnostic checklist for simulation errors

1. Check the stack trace — find the `useTracker`/`withTracker` component
2. Find what method was called just before (button click, form submit)
3. Check if the method is defined in a shared file (acts as stub on client)
4. Check if the stub body has multiple `await`s
5. Add `if (Meteor.isClient) return;` at the top

## Error Handling

### Server-side errors

Only `Meteor.Error` instances reach the client. All other exceptions are sanitized to a generic internal error:

```js
// This reaches the client with error code and reason
throw new Meteor.Error('not-found', 'Item not found');
throw new Meteor.Error('validation-error', 'Title is required', { field: 'title' });

// This does NOT reach the client (sanitized for security)
throw new Error('database connection failed');
// Client sees: [500] Internal server error
```

### `Meteor.Error` constructor

```js
new Meteor.Error(error, reason, details)
```

| Param | Type | Purpose |
|-------|------|---------|
| `error` | string or number | Machine-readable error code |
| `reason` | string | Human-readable message |
| `details` | string (optional) | Additional info (JSON-stringified if needed) |

### Client-side error handling

```js
try {
  await Meteor.callAsync('items.update', id, changes);
} catch (err) {
  if (err instanceof Meteor.Error) {
    switch (err.error) {
      case 'not-authorized': redirectToLogin(); break;
      case 'validation-error': showFieldErrors(JSON.parse(err.details)); break;
      default: showToast(err.reason);
    }
  } else {
    showToast('Something went wrong');
  }
}
```

## ValidatedMethod (mdg:validated-method)

A structured alternative to raw `Meteor.methods` that enforces argument validation:

```js
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import SimpleSchema from 'simpl-schema';

export const createTodo = new ValidatedMethod({
  name: 'todos.create',
  validate: new SimpleSchema({
    text: { type: String, min: 1, max: 500 },
    listId: { type: String, regEx: SimpleSchema.RegEx.Id },
  }).validator(),
  async run({ text, listId }) {
    if (!this.userId) throw new Meteor.Error('not-authorized');
    return await Todos.insertAsync({ text, listId, userId: this.userId });
  },
});

// Call like any other method
await createTodo.callAsync({ text: 'Hello', listId: someListId });
// or
await Meteor.callAsync('todos.create', { text: 'Hello', listId: someListId });
```

## Method Organization

Keep methods close to their collection, organized by domain:

```
imports/api/
├── todos/
│   ├── collection.js    # Mongo.Collection + helpers
│   ├── methods.js       # Meteor.methods for todos
│   ├── publications.js  # Meteor.publish for todos
│   └── schema.js        # SimpleSchema definition
├── projects/
│   ├── collection.js
│   ├── methods.js
│   └── publications.js
```

Import method files on both client and server to get stubs working:

```js
// imports/startup/client/index.js
import '/imports/api/todos/methods';

// imports/startup/server/index.js  
import '/imports/api/todos/methods';
```

## Rate Limiting

Use `ddp-rate-limiter` to prevent method abuse:

```js
import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

DDPRateLimiter.addRule({
  type: 'method',
  name: 'todos.create',
  userId: null, // apply to all users (or specify a function)
  connectionId: () => true,
}, 5, 1000); // 5 calls per 1000ms
```
