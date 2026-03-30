# Project Architecture & Module Organization

## File Loading Rules

Meteor has specific conventions for how files are loaded:

| Directory | Behavior |
|-----------|----------|
| `imports/` | **Lazy** — only loaded when explicitly imported. This is the recommended location for all app code. |
| `client/` | **Eager** — loaded only on the client, in alphabetical order |
| `server/` | **Eager** — loaded only on the server, in alphabetical order |
| `public/` | Served as static assets (images, fonts, etc.) |
| `private/` | Server-only assets accessible via `Assets.getText()` / `Assets.getBinary()` |
| `tests/` | Not loaded anywhere by default |
| Everything else | Loaded on **both** client and server (eager) |

The recommended approach is to put everything under `imports/` and explicitly import what's needed from `client/main.jsx` and `server/main.js`.

## Recommended Project Structure

```
my-app/
├── client/
│   └── main.jsx                  # Client entry: imports startup, renders React
├── server/
│   └── main.js                   # Server entry: imports startup, publications, methods
├── imports/
│   ├── api/                      # Data layer — collections, methods, publications
│   │   ├── todos/
│   │   │   ├── collection.js     # Mongo.Collection definition + helpers
│   │   │   ├── schema.js         # SimpleSchema definition
│   │   │   ├── methods.js        # Meteor.methods for this domain
│   │   │   └── publications.js   # Meteor.publish for this domain
│   │   ├── projects/
│   │   │   └── ...
│   │   └── users/
│   │       └── ...
│   ├── ui/                       # React components
│   │   ├── components/           # Reusable, presentational
│   │   ├── pages/                # Route-level components
│   │   ├── layouts/              # Layout wrappers
│   │   └── hooks/                # Custom React hooks
│   └── startup/
│       ├── client/               # Client bootstrap (routes, etc.)
│       └── server/               # Server bootstrap (indexes, seeds, etc.)
├── public/
├── private/
├── .meteor/
│   ├── packages                  # Meteor packages list
│   ├── versions                  # Locked package versions
│   └── platforms                 # Target platforms
└── package.json
```

### Entry points

```js
// client/main.jsx
import '/imports/startup/client';
import '/imports/api/todos/methods';  // load stubs on client

// server/main.js
import '/imports/startup/server';
import '/imports/api/todos/methods';
import '/imports/api/todos/publications';
```

## Import Rules

### Prefer direct file imports

The #1 architectural lesson from large Meteor apps: **avoid barrel imports** (index.js re-exports) for anything containing React components, actions, or schemas.

```js
// GOOD — direct file import
import { TodoList } from '/imports/ui/components/TodoList';
import { TodoSchema } from '/imports/api/todos/schema';

// RISKY — barrel import can pull in the entire feature tree
import { TodoList, TodoSchema, TodoActions } from '/imports/api/todos';
```

Why barrels are dangerous in Meteor:
- Meteor 3's module evaluation is strict about load order
- A barrel that mixes models + components + actions creates circular import chains
- When module A imports from a barrel that includes module B, which imports module A, the re-entered module resolves as `{}` or `undefined`
- Symptoms: `Element type is invalid`, `undefined is not a function`, `Invalid schema input type`

### Safe vs unsafe barrel patterns

```js
// SAFE barrel — only re-exports data/model code
// imports/api/todos/index.js
export { Todos } from './collection';
export { TodoSchema } from './schema';

// UNSAFE barrel — mixes data + UI + actions
// imports/api/todos/index.js
export { Todos } from './collection';
export { TodoSchema } from './schema';
export { TodoList } from './components/TodoList';      // UI
export { TodoActions } from './actions';                // actions
export { TodoStepper } from './components/TodoStepper'; // more UI
```

### Import path conventions

```js
// Absolute imports from project root (Meteor convention)
import { Todos } from '/imports/api/todos/collection';
import { TodoList } from '/imports/ui/components/TodoList';

// Meteor package imports
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { useTracker } from 'meteor/react-meteor-data';
import { check } from 'meteor/check';
```

## Circular Dependencies

### How they manifest

In Meteor 3, circular imports surface as:

1. **`Element type is invalid ... got: object`** — a React component arrived as a raw module namespace object `{ __esModule: true }` instead of a function/class
2. **`undefined is not a function`** — an imported function hasn't been defined yet at evaluation time
3. **`Invalid schema input type`** — a schema referenced an input component that was `undefined`

### The pattern

```
Module A imports from Barrel X
  → Barrel X exports Module B
    → Module B imports Module A
      → Module A is still evaluating → resolves as {} or undefined
```

### Prevention rules

1. **Feature-root imports should be data-safe only** — the root import of a domain module (`/imports/api/todos`) should only expose collections, schemas, and pure functions. Never mix in React components or action registrations.

2. **Components and containers use direct file imports** — not barrels:
   ```js
   // In a component file
   import { ProjectCard } from '/imports/ui/components/ProjectCard';
   // NOT: import { ProjectCard } from '/imports/ui/components';
   ```

3. **Shared/leaf UI must not import feature-level actions or panels** — a generic `<Menu>` or `<Card>` component should receive behavior via props/callbacks, not by importing domain actions.

4. **Schema/form modules are their own layer** — they should import from the data layer, not from the UI component layer.

5. **Same-layer aggregation is OK; cross-layer aggregation is dangerous**:
   - OK: a barrel that re-exports multiple schema files
   - Dangerous: a barrel that re-exports schemas + components + actions

### Debugging workflow

When you hit a circular dependency crash:

1. Check the exact imported symbol — add `console.log('MyComponent:', MyComponent)` right after the import
2. If it's `{}` or `undefined`, the module was re-entered during evaluation
3. Trace the import chain: your file → what it imports → what that imports → back to your file
4. Fix by replacing the barrel import with a direct file import
5. If static import doesn't work, use a runtime `require()` as a documented workaround — but treat this as technical debt

### Runtime deferral (last resort)

When a static fix doesn't hold (rare but possible in deeply coupled legacy code):

```js
// Documented workaround — lazy require to break the cycle
let HeavyComponent;
function getHeavyComponent() {
  if (!HeavyComponent) {
    HeavyComponent = require('/imports/ui/components/HeavyComponent').HeavyComponent;
  }
  return HeavyComponent;
}

// Use in render
function MyContainer() {
  const Component = getHeavyComponent();
  return <Component />;
}
```

Document every instance of this pattern and the cycle it breaks.

## Client-Server Split

### Shared code (runs on both sides)

- Collection definitions (`new Mongo.Collection(...)`)
- Method definitions (`Meteor.methods({...})`) — shared so stubs work on the client
- Schema definitions
- Utility functions and constants
- Type definitions

### Client-only code

- React components and routing
- `useTracker` / `withTracker` containers
- Subscription calls (`Meteor.subscribe(...)`)
- Client-only libraries (DOM manipulation, etc.)

### Server-only code

- Publication definitions (`Meteor.publish(...)`)
- Database indexes
- Server startup and seed data
- API integrations (external HTTP calls)
- Email sending
- Cron jobs / scheduled tasks
- Security-sensitive logic

### Guarding code for one side

```js
if (Meteor.isServer) {
  // Only runs on server
  import('/imports/api/server-only-module');
}

if (Meteor.isClient) {
  // Only runs on client
  import('/imports/ui/client-only-module');
}
```

Or use directory conventions — files in `server/` are never sent to the client.

## Environment Configuration

### Meteor.settings

```json
// settings.json
{
  "private": {
    "smtp": { "host": "...", "port": 587 },
    "apiKeys": { "stripe": "sk_..." }
  },
  "public": {
    "appName": "My App",
    "analyticsId": "UA-..."
  }
}
```

```bash
meteor run --settings settings.json
```

```js
// Server — access all settings
Meteor.settings.private.smtp.host;

// Client — only public settings
Meteor.settings.public.appName;
```

### Environment variables

```js
// Meteor-specific
process.env.MONGO_URL        // MongoDB connection string
process.env.ROOT_URL         // App's root URL
process.env.MAIL_URL         // SMTP URL for Email.send()
process.env.METEOR_SETTINGS  // JSON settings (alternative to --settings file)
```

## GraphQL Integration

Meteor apps can expose a GraphQL API alongside or instead of methods:

```js
// Server
import { ApolloServer } from '@apollo/server';
import { WebApp } from 'meteor/webapp';

const server = new ApolloServer({ typeDefs, resolvers });
await server.start();

// Mount on Meteor's Connect/Express server
WebApp.connectHandlers.use('/graphql', expressMiddleware(server));
```

GraphQL resolvers can call Meteor methods internally, or access collections directly:

```js
const resolvers = {
  Query: {
    async todos(_, args, context) {
      if (!context.userId) throw new AuthenticationError('Must be logged in');
      return await Todos.find({ userId: context.userId }).fetchAsync();
    },
  },
  Mutation: {
    async createTodo(_, { text }, context) {
      if (!context.userId) throw new AuthenticationError('Must be logged in');
      const id = await Todos.insertAsync({ text, userId: context.userId });
      return await Todos.findOneAsync(id);
    },
  },
};
```

## Meteor Packages vs npm

Meteor has its own package system (`.meteor/packages`) alongside npm:

```
# .meteor/packages
meteor-base@1.5.2
mongo@2.0.1
react-meteor-data@3.0.0
accounts-password@3.0.2
check@1.4.3
ddp-rate-limiter@1.2.2
```

General guidance:
- Use **Meteor packages** for Meteor-specific functionality (accounts, reactive data, DDP, etc.)
- Use **npm packages** for everything else (React, lodash, date-fns, etc.)
- Meteor packages can depend on npm packages internally
- Some packages exist in both systems — prefer the Meteor version for Meteor-integrated features

## Testing

### Unit tests

```js
import { Meteor } from 'meteor/meteor';
import { assert } from 'chai';
import { Todos } from '/imports/api/todos/collection';
import '/imports/api/todos/methods';

if (Meteor.isServer) {
  describe('todos.create', function () {
    it('inserts a todo', async function () {
      const userId = 'test-user-id';
      const context = { userId };
      
      const createTodo = Meteor.server.method_handlers['todos.create'];
      const todoId = await createTodo.apply(context, ['Test todo']);
      
      const todo = await Todos.findOneAsync(todoId);
      assert.equal(todo.text, 'Test todo');
      assert.equal(todo.userId, userId);
    });

    it('throws when not logged in', async function () {
      const createTodo = Meteor.server.method_handlers['todos.create'];
      try {
        await createTodo.apply({}, ['Test']);
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.error, 'not-authorized');
      }
    });
  });
}
```

Run tests:
```bash
meteor test --driver-package meteortesting:mocha --port 3100
```

### Integration tests with React

Use `@testing-library/react` with Meteor's test mode for component testing with real subscriptions and methods.
