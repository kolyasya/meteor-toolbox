# Collections & Data Models

## Defining Collections

```js
import { Mongo } from 'meteor/mongo';

export const Todos = new Mongo.Collection('todos');
export const Projects = new Mongo.Collection('projects');
```

The string argument is the MongoDB collection name. The collection object is available on both client (Minimongo) and server (real MongoDB).

### Collection options

```js
const Logs = new Mongo.Collection('logs', {
  idGeneration: 'MONGO',  // use MongoDB ObjectIDs instead of Meteor's random strings
});
```

### Server-only collections

For collections that should never exist on the client (e.g., audit logs):

```js
// server/collections.js — only imported on server
export const AuditLog = new Mongo.Collection('auditLog');
```

Or define with `null` name for a local-only (in-memory) collection:

```js
const LocalCache = new Mongo.Collection(null); // client-only, not persisted
```

## Schemas with SimpleSchema

Use `simpl-schema` (or `aldeed:simple-schema`) for runtime validation:

```js
import SimpleSchema from 'simpl-schema';

export const TodoSchema = new SimpleSchema({
  text: {
    type: String,
    min: 1,
    max: 500,
  },
  completed: {
    type: Boolean,
    defaultValue: false,
  },
  userId: {
    type: String,
    regEx: SimpleSchema.RegEx.Id,
  },
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
    },
  },
  updatedAt: {
    type: Date,
    autoValue() {
      return new Date();
    },
  },
  tags: {
    type: Array,
    optional: true,
  },
  'tags.$': {
    type: String,
  },
});

// Attach to collection for automatic validation on insert/update
Todos.attachSchema(TodoSchema);
```

### Schema with autoValue for audit fields

```js
const BaseSchema = new SimpleSchema({
  createdAt: {
    type: Date,
    autoValue() {
      if (this.isInsert) return new Date();
      if (this.isUpsert) return { $setOnInsert: new Date() };
      this.unset(); // don't allow update
    },
  },
  createdBy: {
    type: String,
    autoValue() {
      if (this.isInsert) return this.userId;
      if (this.isUpsert) return { $setOnInsert: this.userId };
      this.unset();
    },
  },
  updatedAt: {
    type: Date,
    autoValue() {
      return new Date();
    },
  },
});
```

Extend domain schemas with the base:

```js
const ProjectSchema = BaseSchema.extend({
  name: { type: String },
  status: { type: String, allowedValues: ['active', 'archived'] },
  memberIds: { type: Array },
  'memberIds.$': { type: String },
});
```

## Collection Helpers (dburles:collection-helpers)

Attach methods to documents — every document returned by `find`/`findOne` gets these:

```js
import { Meteor } from 'meteor/meteor';

Todos.helpers({
  owner() {
    return Meteor.users.findOne(this.userId);
  },
  isOverdue() {
    return !this.completed && this.dueDate && this.dueDate < new Date();
  },
  project() {
    return Projects.findOne(this.projectId);
  },
  formattedDate() {
    return this.createdAt.toLocaleDateString();
  },
});

// Usage
const todo = Todos.findOne(id);
console.log(todo.owner().profile.name);
console.log(todo.isOverdue());
```

Helpers are sync — they work on both client (Minimongo) and server. For async operations on the server, use methods instead.

## Collection Transform

An alternative to `collection-helpers` — define a transform function:

```js
class TodoDocument {
  constructor(doc) {
    Object.assign(this, doc);
  }
  
  isOverdue() {
    return !this.completed && this.dueDate && this.dueDate < new Date();
  }
  
  get displayName() {
    return `${this.text} (${this.completed ? 'done' : 'pending'})`;
  }
}

export const Todos = new Mongo.Collection('todos', {
  transform: (doc) => new TodoDocument(doc),
});
```

## Indexes

Define indexes in server startup:

```js
Meteor.startup(async () => {
  await Todos.createIndexAsync({ userId: 1, createdAt: -1 });
  await Todos.createIndexAsync({ projectId: 1, order: 1 });
  await Todos.createIndexAsync(
    { 'emails.address': 1 },
    { unique: true, sparse: true }
  );
  
  // Text index for search
  await Todos.createIndexAsync({ text: 'text', tags: 'text' });
  
  // TTL index — auto-delete after 30 days
  await Logs.createIndexAsync(
    { createdAt: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60 }
  );
});
```

## Aggregation Pipeline

Use `rawCollection()` for MongoDB aggregation:

```js
async function getProjectStats(projectId) {
  const pipeline = [
    { $match: { projectId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
      },
    },
    { $sort: { count: -1 } },
  ];
  
  return await Todos.rawCollection().aggregate(pipeline).toArray();
}
```

`rawCollection()` returns the underlying Node MongoDB driver collection object — you get access to all native MongoDB operations.

## The `rawCollection()` Pitfall

Using `rawCollection()` (often for bulk operations like `bulkWrite` or `insertMany`) **completely bypasses Meteor's collection hooks** (e.g., `Meteor-Community-Packages/meteor-collection-hooks`).

### Common Failure
Switching to `rawCollection` for speed but forgetting that your schema or hooks normally handle:
- `updatedAt` / `createdAt` timestamps.
- `createdBy` / `modifiedBy` user IDs.
- Denormalized field syncing (e.g., counting items in a category).
- Search index updates.

### Manual Hook Replication
If you must use `rawCollection`, you must manually include these fields in your modifier:

```js
const now = new Date();
const userId = Meteor.userId();

await Todos.rawCollection().bulkWrite([
  {
    updateOne: {
      filter: { _id: 'abc' },
      update: { 
        $set: { 
          status: 'done',
          updatedAt: now,      // Replicating hook logic
          modifiedBy: userId,  // Replicating hook logic
        } 
      }
    }
  }
]);
```

## ORM / Model Layer Patterns

### Simple model pattern

Wrap collections with a model that provides business logic:

```js
// imports/api/todos/model.js
import { Todos } from './collection';

export const TodoModel = {
  async create(userId, data) {
    return await Todos.insertAsync({
      ...data,
      userId,
      completed: false,
      createdAt: new Date(),
    });
  },

  async complete(todoId, userId) {
    const todo = await Todos.findOneAsync(todoId);
    if (!todo) throw new Meteor.Error('not-found');
    if (todo.userId !== userId) throw new Meteor.Error('forbidden');
    
    await Todos.updateAsync(todoId, {
      $set: { completed: true, completedAt: new Date() },
    });
  },

  async findForUser(userId, options = {}) {
    const { limit = 50, skip = 0, completed } = options;
    const query = { userId };
    if (completed !== undefined) query.completed = completed;
    
    return await Todos.find(query, {
      sort: { createdAt: -1 },
      limit,
      skip,
    }).fetchAsync();
  },
};
```

### Class-based model with collection factory

```js
class Model {
  constructor(collectionName, schema) {
    this.collection = new Mongo.Collection(collectionName);
    if (schema) this.collection.attachSchema(schema);
  }
  
  find(selector, options) {
    return this.collection.find(selector, options);
  }
  
  async findOneAsync(selectorOrId) {
    return await this.collection.findOneAsync(selectorOrId);
  }
  
  async insertAsync(doc) {
    return await this.collection.insertAsync(doc);
  }
  
  async updateAsync(selector, modifier) {
    return await this.collection.updateAsync(selector, modifier);
  }
  
  async removeAsync(selector) {
    return await this.collection.removeAsync(selector);
  }
}
```

The key trade-off: a custom model/ORM layer adds consistency but couples persistence to transport (methods), authorization, and lifecycle hooks. Keep the model layer focused on data operations and separate business orchestration into services.

## MongoDB Query Patterns

### Common operators

```js
// Comparison
Todos.find({ priority: { $gte: 3 } });
Todos.find({ status: { $in: ['active', 'pending'] } });
Todos.find({ status: { $ne: 'deleted' } });

// Logical
Todos.find({ $or: [{ completed: false }, { priority: { $gte: 5 } }] });
Todos.find({ $and: [{ teamId }, { status: 'active' }] });

// Array
Todos.find({ tags: 'urgent' });           // array contains value
Todos.find({ tags: { $all: ['a', 'b'] } }); // array contains all
Todos.find({ 'tags.0': 'primary' });      // first element

// Nested
Todos.find({ 'metadata.source': 'api' });

// Existence
Todos.find({ dueDate: { $exists: true } });

// Regex
Todos.find({ text: { $regex: /urgent/i } });
```

### Update operators

```js
await Todos.updateAsync(id, { $set: { completed: true } });
await Todos.updateAsync(id, { $unset: { tempField: '' } });
await Todos.updateAsync(id, { $inc: { viewCount: 1 } });
await Todos.updateAsync(id, { $push: { tags: 'new-tag' } });
await Todos.updateAsync(id, { $pull: { tags: 'old-tag' } });
await Todos.updateAsync(id, { $addToSet: { tags: 'unique-tag' } });

// Multi-update (update all matching)
await Todos.updateAsync(
  { projectId, completed: false },
  { $set: { archived: true } },
  { multi: true }
);
```

## Allow/Deny (Legacy — Avoid)

Meteor's `allow`/`deny` rules permit direct client-side collection writes. This pattern is discouraged — use methods instead for all writes:

```js
// DON'T do this in modern Meteor apps
Todos.allow({
  insert(userId, doc) { return userId === doc.userId; },
  update(userId, doc) { return userId === doc.userId; },
  remove(userId, doc) { return userId === doc.userId; },
});

// DO this instead — all writes go through methods
Meteor.methods({
  async 'todos.insert'(data) { /* validation, auth, insert */ },
  async 'todos.update'(id, changes) { /* validation, auth, update */ },
  async 'todos.remove'(id) { /* auth check, remove */ },
});
```

Methods give you a single, auditable entry point for all writes with full control over validation and authorization.
