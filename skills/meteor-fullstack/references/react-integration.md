# React Integration with Meteor

Meteor's reactive data system connects to React via the `react-meteor-data` package, which provides `useTracker` (hooks) and `withTracker` (HOC).

## useTracker (Recommended)

The primary way to consume reactive Meteor data in functional React components:

```js
import { useTracker } from 'meteor/react-meteor-data';
```

### Basic usage

```js
function App() {
  const currentUser = useTracker(() => Meteor.user(), []);
  
  if (!currentUser) return <LoginPage />;
  return <Dashboard user={currentUser} />;
}
```

### With subscriptions

```js
function TodoList() {
  const { todos, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('todos.mine');
    return {
      isLoading: !handle.ready(),
      todos: Todos.find({}, { sort: { createdAt: -1 } }).fetch(),
    };
  }, []);

  if (isLoading) return <LoadingSpinner />;
  
  return (
    <ul>
      {todos.map(todo => <TodoItem key={todo._id} todo={todo} />)}
    </ul>
  );
}
```

### With reactive dependencies

The second argument is a dependency array (like `useEffect`). When dependencies change, the tracker re-runs:

```js
function ProjectTasks({ projectId }) {
  const { tasks, project, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('project.withTasks', projectId);
    return {
      isLoading: !handle.ready(),
      project: Projects.findOne(projectId),
      tasks: Tasks.find({ projectId }, { sort: { order: 1 } }).fetch(),
    };
  }, [projectId]);

  // ...
}
```

### Separate subscription and data hooks

For complex components, split subscription management from data fetching:

```js
function TaskBoard({ projectId }) {
  // Subscribe — re-subscribes only when projectId changes
  const isLoading = useTracker(() => {
    const handle = Meteor.subscribe('project.withTasks', projectId);
    return !handle.ready();
  }, [projectId]);

  // Fetch — re-runs whenever Minimongo changes OR projectId changes
  const tasks = useTracker(
    () => Tasks.find({ projectId }).fetch(),
    [projectId]
  );

  const columns = useTracker(
    () => Columns.find({ projectId }, { sort: { order: 1 } }).fetch(),
    [projectId]
  );

  if (isLoading) return <Skeleton />;
  return <Board columns={columns} tasks={tasks} />;
}
```

### useTracker with async (useTracker 2.0)

`useTracker` can accept an async function. It returns `undefined` while loading:

```js
function UserProfile({ userId }) {
  const user = useTracker(async () => {
    return await Meteor.users.findOneAsync(userId);
  }, [userId]);

  if (!user) return <Skeleton />;
  return <ProfileCard user={user} />;
}
```

However, for most cases the sync version with `.fetch()` is simpler and works better with Tracker reactivity.

## withTracker (HOC Pattern)

The class-component-era pattern, still widely used in existing codebases:

```js
import { withTracker } from 'meteor/react-meteor-data';

function TodoListUI({ todos, isLoading }) {
  if (isLoading) return <Spinner />;
  return todos.map(t => <TodoItem key={t._id} todo={t} />);
}

export const TodoList = withTracker(() => {
  const handle = Meteor.subscribe('todos.mine');
  return {
    isLoading: !handle.ready(),
    todos: Todos.find({}, { sort: { createdAt: -1 } }).fetch(),
  };
})(TodoListUI);
```

`withTracker` passes the returned object as props to the wrapped component. The tracker function re-runs whenever any reactive data source it reads changes.

### withTracker with props

```js
export const ProjectView = withTracker(({ projectId }) => {
  const handle = Meteor.subscribe('project.detail', projectId);
  return {
    isLoading: !handle.ready(),
    project: Projects.findOne(projectId),
    tasks: Tasks.find({ projectId }).fetch(),
  };
})(ProjectViewUI);
```

## Data Container Pattern

A common architecture pattern: separate data-fetching containers from presentational components:

```
components/
├── TodoList.jsx          # Pure presentational component
├── TodoListContainer.jsx # withTracker/useTracker data wrapper
└── TodoItem.jsx          # Pure presentational component
```

```js
// TodoListContainer.jsx
import { useTracker } from 'meteor/react-meteor-data';
import { TodoList } from './TodoList';

export function TodoListContainer({ filter }) {
  const { todos, isLoading } = useTracker(() => {
    const handle = Meteor.subscribe('todos.filtered', filter);
    return {
      isLoading: !handle.ready(),
      todos: Todos.find(buildQuery(filter), { sort: { createdAt: -1 } }).fetch(),
    };
  }, [filter]);

  return <TodoList todos={todos} isLoading={isLoading} />;
}
```

## Calling Methods from React

### Simple pattern

```js
function CreateTodoForm() {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await Meteor.callAsync('todos.create', text);
      setText('');
    } catch (err) {
      setError(err.reason || 'Failed to create todo');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input value={text} onChange={e => setText(e.target.value)} />
      <button type="submit">Add</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
```

### With loading state

```js
function DeleteButton({ todoId }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await Meteor.callAsync('todos.remove', todoId);
    } catch (err) {
      alert(err.reason);
      setIsDeleting(false);
    }
  };

  return (
    <button onClick={handleDelete} disabled={isDeleting}>
      {isDeleting ? 'Deleting...' : 'Delete'}
    </button>
  );
}
```

## Accounts UI Integration

```js
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    Meteor.loginWithPassword(email, password, (err) => {
      if (err) alert(err.reason);
    });
  };

  return (
    <form onSubmit={handleLogin}>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button type="submit">Log In</button>
    </form>
  );
}

function LogoutButton() {
  return <button onClick={() => Meteor.logout()}>Log Out</button>;
}

function AuthGate({ children }) {
  const user = useTracker(() => Meteor.user(), []);
  const loggingIn = useTracker(() => Meteor.loggingIn(), []);

  if (loggingIn) return <Spinner />;
  if (!user) return <LoginForm />;
  return children;
}
```

## Common Pitfalls

### 1. Missing dependency array in useTracker

```js
// WRONG — no deps array means it never re-subscribes, but also never
// re-runs the tracker when projectId changes in some edge cases
const data = useTracker(() => {
  Meteor.subscribe('project', projectId);
  return Projects.findOne(projectId);
});

// CORRECT — re-runs when projectId changes
const data = useTracker(() => {
  Meteor.subscribe('project', projectId);
  return Projects.findOne(projectId);
}, [projectId]);
```

### 2. Subscriptions in useEffect instead of useTracker

```js
// WRONG — subscription isn't tied to Tracker reactivity
useEffect(() => {
  const handle = Meteor.subscribe('todos');
  return () => handle.stop();
}, []);

// CORRECT — useTracker manages the reactive lifecycle
const isLoading = useTracker(() => {
  const handle = Meteor.subscribe('todos');
  return !handle.ready();
}, []);
```

### 3. Calling async Meteor methods inside useTracker

```js
// WRONG — useTracker expects synchronous reactive reads
const data = useTracker(() => {
  const result = await Meteor.callAsync('getData'); // breaks
  return result;
});

// CORRECT — methods go in event handlers or useEffect
const [data, setData] = useState(null);
useEffect(() => {
  Meteor.callAsync('getData').then(setData);
}, []);
```

### 4. Non-reactive data sources in useTracker

`useTracker` only re-runs when **reactive** data sources change. `Session.get()`, `Mongo.Collection` queries, and `Meteor.user()` are reactive. Plain variables, fetch calls, and localStorage are not:

```js
// This won't re-run when localStorage changes
const data = useTracker(() => {
  return JSON.parse(localStorage.getItem('prefs'));
}, []);

// Use useState + useEffect for non-reactive sources, or Session
```

## Performance Tips

- Avoid subscribing in deeply nested components — subscribe at the page/route level and pass data down as props
- Use `fields` projection in both publications and client-side `find()` to minimize re-renders
- Memoize expensive computations derived from reactive data with `useMemo`
- For large lists, consider pagination via method calls instead of publishing entire datasets
- Use `React.memo` on list item components to prevent re-rendering unchanged items when the parent's Tracker re-runs
