---
name: meteor-circular-deps
description: "Diagnose Meteor.js circular dependencies and bundle leaks caused by eager bundling. Triggers: `module: falsy`, `Failed to register array mixin`, `Element type is invalid`, undefined imports, barrel/bucket files (`index.js`), or bundle auditing. Use this for Meteor + Reify architectures instead of generic JS advice."
---

# Meteor circular dependencies and bundle leaks (diagnostic)

Meteor bundles ES modules eagerly. Cycles that look fine in a plain Node/Webpack setup can still bite you: **evaluation order changes when the graph changes**, so a new file can reorder imports and expose a cycle that used to be hidden. A common symptom is a binding that is still `undefined` when another module reads it (`module: falsy` in stack traces).

## When this is likely (symptoms)

- Stack traces mentioning **`module: falsy`** or **`Failed to register array mixin`** while loading models/mixins.
- **`Element type is invalid`** in React after a refactor, often with a component that imported fine before.
- **`Cannot read property 'X' of undefined`** immediately after `import { Foo } from ...` where `Foo` should exist.
- Failure appears **after adding an unrelated file** (import order / cycle surface area changed).
- Barrel / **bucket** files (`index.js`, `common.js`, `client.js`, `server.js`) re-exporting most of a domain **and** being imported from inside that same domain.

---

## Step 1 — Map cycles with madge

From the Meteor app root (where `.meteor` lives):

```bash
npx madge --circular --extensions ts,tsx,js,jsx ./client ./imports ./modules ./packages 2>/dev/null || true
npx madge --circular --extensions ts,tsx,js,jsx .
```

Narrow the path if the repo is huge (e.g. `./modules/models/Issues`).

Optional **SVG** (good for sharing in a ticket):

```bash
npx madge --circular --image graph.svg --extensions ts,tsx,js,jsx .
```

**How to read the output:** each cycle is a ring of files. Your fix will almost always require **breaking one edge** on that ring (see Step 4).

If you need richer rules (forbidden deps, layers), mention **depcruise** as an alternative; it is heavier to configure than madge.

---

## Step 2 — Bundle inspector (client vs server)

After a successful **`meteor build`** or dev run that produced maps, run the bundled script from this skill (or copy it into the repo):

```bash
node /path/to/meteor-circular-deps/scripts/bundle-inspector.js --root .
```

Paths default to:

- `.meteor/local/build/programs/web.browser/app/app.js.map`
- `.meteor/local/build/programs/server/app/app.js.map`

Use `--fail-both <regex>` and `--fail-server-only <regex>` to encode project-specific leak rules (see script `--help`).

Interpretation:

- **Shared (both)** — normal for isomorphic modules; suspicious if “server-only” concepts appear here.
- **Client-only / server-only** — helps spot mistaken imports (autocomplete pulling the wrong entry file).

---

## Step 3 — Tie cycles to the failing stack trace

1. Take the **deepest app file** in the stack (first `modules/...` or `imports/...` line under `moduleLink` / `fileEvaluate`).
2. In the madge cycle list, find a cycle that includes that file **or** its barrel entry (`index.js`, `common.js`, etc.).
3. Pick the **weakest link**: an import that can be replaced with a more specific file, moved behind `import()`, or inverted (dependency injection).

---

## Step 4 — Targeted fixes (prefer small diffs)

**A. Barrel / bucket anti-pattern (most common in domain folders)**

- **Inside a domain**, import **concrete modules** (`./foo.js`, `./helpers/bar.js`), not the domain’s `index.js` / `client.js` / `server.js` re-export that also pulls in the consumer.
- Keep bucket files for **external** entry points only (other packages, startup, routes).

**B. Break cycles without a big rewrite**

- **Move shared types/constants** to a leaf file that imports nothing from the cycle.
- **Lazy `import()`** for heavy or optional branches that create a back-edge (use where ordering must not run at module top-level).
- **Constructor / function injection** instead of importing a singleton at module scope (e.g. pass registry into `registerMixins` if your ORM allows it).

**C. React “invalid element”**

- Often the same issue: default export is `undefined` because the module did not finish evaluating. Fix the cycle at the root before reaching for `React.lazy`.

**D. Model / mixin `module: falsy`**

- The mixin array entry is literally `undefined` because the mixin module’s export was not initialized yet. Trace which mixin file is at the failing index; run madge on the path from Model → that mixin → back to Model (or Requests/Messages index barrels).

---

## Step 5 — Verify

1. Re-run **madge** — the reported cycle involving the touched files should be gone or shortened.
2. Re-run **bundle inspector** if the change touched client/server boundaries.
3. Run a normal rebuild (a full reset is unnecessary).

---

## Related project conventions

If the repo’s `AGENTS.md` discourages barrel imports for React/runtime objects, treat that as **reinforcement**: barrel files are both a bundle-shape problem and a circular-dep amplifier.
