# Publications & Subscriptions

Meteor's pub/sub system pushes reactive data from the server to the client over DDP. The server publishes cursors; the client subscribes and receives live-updating documents in local Minimongo.

## Basic Publication

```js
import { Meteor } from 'meteor/meteor';
import { Todos } from '/imports/api/todos/collection';

Meteor.publish('todos.all', function () {
  if (!this.userId) {
    this.ready();
    return;
  }
  return Todos.find({ userId: this.userId }, {
    fields: { text: 1, completed: 1, createdAt: 1 },
    sort: { createdAt: -1 },
    limit: 100,
  });
});
```

Key rules:
- Use `function()` (not arrow functions) to access `this.userId` and `this.ready()`
- Return a cursor (or array of cursors) from `collection.find()` — sync, not async
- Use `fields` to limit what's sent to the client (security + performance)
- Call `this.ready()` when publishing nothing (signals that the subscription is complete)
- Publication names should be globally unique

## Async Publication Setup

Publication functions can be `async` for setup work, but the returned cursor must be from a sync `find()`:

```js
Meteor.publish('projects.forTeam', async function (teamId) {
  check(teamId, String);
  
  // Async setup — check membership
  const team = await Teams.findOneAsync(teamId);
  if (!team || !team.memberIds.includes(this.userId)) {
    this.ready();
    return;
  }
  
  // Return sync cursor for reactivity
  return Projects.find({ teamId }, {
    fields: { name: 1, status: 1, updatedAt: 1 },
  });
});
```

## Multiple Cursors

A publication can return an array of cursors from different collections:

```js
Meteor.publish('project.detail', function (projectId) {
  check(projectId, String);
  if (!this.userId) return this.ready();
  
  return [
    Projects.find({ _id: projectId }),
    Tasks.find({ projectId }),
    Comments.find({ projectId }, { sort: { createdAt: -1 }, limit: 50 }),
  ];
});
```

Each cursor must be from a **different collection** — you can't return two cursors from the same collection in one publication.

## Composite Publications (reywood:publish-composite)

For relational/nested data where child documents depend on parent document IDs:

```js
import { publishComposite } from 'meteor/reywood:publish-composite';

publishComposite('project.withTasks', function (projectId) {
  return {
    find() {
      return Projects.find({ _id: projectId, memberIds: this.userId });
    },
    children: [
      {
        find(project) {
          return Tasks.find({ projectId: project._id });
        },
        children: [
          {
            find(task) {
              return Comments.find({ taskId: task._id });
            },
          },
        ],
      },
      {
        find(project) {
          return Meteor.users.find(
            { _id: { $in: project.memberIds } },
            { fields: { 'profile.name': 1, 'emails': 1 } }
          );
        },
      },
    ],
  };
});
```

`publishComposite` re-evaluates children reactively when parent documents change — if a project gains a new member, their user document is automatically published.

## Client-Side Subscriptions

### Direct subscribe

```js
const handle = Meteor.subscribe('todos.all');
handle.ready();  // boolean — is the initial data set loaded?
handle.stop();   // stop the subscription
```

### In React with useTracker

```js
import { useTracker } from 'meteor/react-meteor-data';

function TodoList() {
  const { todos, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('todos.all');
    return {
      isLoading: !handle.ready(),
      todos: Todos.find({}, { sort: { createdAt: -1 } }).fetch(),
    };
  }, []);

  if (isLoading) return <Spinner />;
  return todos.map(t => <TodoItem key={t._id} todo={t} />);
}
```

### With parameters

```js
function ProjectTasks({ projectId }) {
  const { tasks, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('project.detail', projectId);
    return {
      isLoading: !handle.ready(),
      tasks: Tasks.find({ projectId }, { sort: { order: 1 } }).fetch(),
    };
  }, [projectId]); // re-subscribe when projectId changes
}
```

## SubsManager (meteorhacks:subs-manager)

Caches subscriptions to prevent re-subscribing when navigating between routes:

```js
import { SubsManager } from 'meteor/meteorhacks:subs-manager';

// Create a manager — caches up to 10 subscriptions for up to 5 minutes
export const AppSubs = new SubsManager({ cacheLimit: 10, expireIn: 5 });

// Use like Meteor.subscribe
const handle = AppSubs.subscribe('todos.all');
```

This is particularly useful for list/detail navigation patterns where users go back and forth.

## Counts

Publishing document counts without sending all documents to the client:

### Custom counts pattern

```js
// Server — publish a count
Meteor.publish('todos.count', function () {
  let count = 0;
  let initializing = true;

  const handle = Todos.find({ userId: this.userId }).observeChanges({
    added: () => {
      count++;
      if (!initializing) this.changed('counts', 'todos', { count });
    },
    removed: () => {
      count--;
      this.changed('counts', 'todos', { count });
    },
  });

  initializing = false;
  this.added('counts', 'todos', { count });
  this.ready();

  this.onStop(() => handle.stop());
});

// Client — read the count
const Counts = new Mongo.Collection('counts');
const todoCount = Counts.findOne('todos')?.count || 0;
```

### Using natestrauser:publish-performant-counts

```js
import { publishCount } from 'meteor/natestrauser:publish-performant-counts';

Meteor.publish('todos.count', function () {
  publishCount(this, 'todosCount', Todos.find({ userId: this.userId }));
});
```

## Publication Wrappers

For apps with repeated authorization patterns, a wrapper function reduces boilerplate:

```js
function definePub(name, options, publishFn) {
  Meteor.publish(name, async function (...args) {
    if (!this.userId) {
      this.ready();
      return;
    }

    const user = await Meteor.users.findOneAsync(this.userId);
    
    if (options.requireRole) {
      if (!user.roles?.includes(options.requireRole)) {
        this.ready();
        return;
      }
    }

    return publishFn.call(this, { user, args });
  });
}

// Usage
definePub('admin.users', { requireRole: 'admin' }, function ({ user }) {
  return Meteor.users.find({}, { fields: { profile: 1, emails: 1, roles: 1 } });
});
```

## Subscription Lifecycle

Understanding the lifecycle helps debug "missing data" issues:

1. Client calls `Meteor.subscribe('name', ...args)`
2. DDP sends `sub` message to server
3. Server runs the `publish` function
4. Server sends `added` messages for each document in the cursor
5. Server sends `ready` message — `handle.ready()` becomes `true`
6. Cursor is now live — `changed`, `added`, `removed` messages flow as data changes
7. Client calls `handle.stop()` (or component unmounts) — DDP sends `unsub`
8. Server stops the cursor observer, cleans up

## Performance Considerations

- **Use `fields` projection** — don't send entire documents when the client only needs a few fields
- **Use `limit`** — don't publish unbounded cursors for large collections
- **Avoid publish-with-relations on large datasets** — composite publications re-observe on every parent change
- **Consider `disable-oplog` for complex queries** — oplog tailing doesn't support all MongoDB operators ($where, $near, certain aggregation stages). Meteor falls back to poll-and-diff which can be expensive
- **Use SubsManager** for route-based subscriptions to avoid re-subscribing on navigation

## Common Pitfalls

### 1. Arrow functions lose `this`

```js
// WRONG — arrow function doesn't bind this
Meteor.publish('todos', () => {
  return Todos.find({ userId: this.userId }); // this.userId is undefined
});

// CORRECT
Meteor.publish('todos', function () {
  return Todos.find({ userId: this.userId });
});
```

### 2. Not calling this.ready() when publishing nothing

```js
// WRONG — client hangs in loading state forever
Meteor.publish('todos', function () {
  if (!this.userId) return; // subscription never becomes ready
});

// CORRECT
Meteor.publish('todos', function () {
  if (!this.userId) {
    this.ready();
    return;
  }
  return Todos.find({ userId: this.userId });
});
```

### 3. Two cursors from the same collection

```js
// WRONG — can't return two cursors from the same collection
Meteor.publish('dashboard', function () {
  return [
    Todos.find({ userId: this.userId, completed: false }),
    Todos.find({ userId: this.userId, completed: true, completedAt: { $gte: lastWeek } }),
  ];
});

// CORRECT — merge into one query
Meteor.publish('dashboard', function () {
  return Todos.find({
    userId: this.userId,
    $or: [
      { completed: false },
      { completed: true, completedAt: { $gte: lastWeek } },
    ],
  });
});
```

### 4. Publishing sensitive user fields

```js
// DANGEROUS — publishes hashed passwords, tokens, etc.
Meteor.publish('users.all', function () {
  return Meteor.users.find();
});

// SAFE — explicit field whitelist
Meteor.publish('users.all', function () {
  return Meteor.users.find({}, {
    fields: { 'profile.name': 1, 'profile.avatar': 1, 'emails.address': 1 },
  });
});
```
