# Meteor Toolbox — Agent Skills

A curated collection of AI agent skills for Meteor.js development and code review workflows.

## Installation

```bash
npx skills add kolyasya/meteor-toolbox
```

This installs all skills in this repository into your agent.

---

## Available Skills

| Skill | Description |
|-------|-------------|
| [`meteor-fullstack`](#meteor-fullstack) | Full-stack Meteor 3.x development: async APIs, methods, pub/sub, React integration, MongoDB, GraphQL |
| [`pr-review-guided`](#pr-review-guided) | Guided, file-by-file GitHub PR review with user-controlled pacing |

---

### `meteor-fullstack`

Full-stack Meteor 3.x development with React, MongoDB, async APIs, methods, pub/sub, and GraphQL.

**Triggers on:** `Meteor`, `Meteor.js`, `Meteor 3`, `MeteorJS`, `callAsync`, `useTracker`, `withTracker`, Meteor methods, Meteor publications, Meteor subscriptions, `SubsManager`, `Minimongo`, `DDP`, `Mongo.Collection`, `Meteor.Error`, optimistic UI, Fibers migration, meteor async.

**Covers:**
- Async-first collection APIs (`insertAsync`, `findOneAsync`, `updateAsync`, etc.)
- Methods (RPC), publications, and subscriptions
- React integration via `useTracker` / `withTracker`
- Project structure, import conventions, circular dependency prevention
- Common pitfalls: simulation errors, `rawCollection()` hooks, DDP queue blocking
- Accounts, email (`Email.sendAsync`), authorization patterns
- Reference files for deeper topics: pub/sub, async migration, performance, architecture

---

### `pr-review-guided`

Guided, file-by-file PR review where the user controls the pace.

**Triggers on:** "review pr", "review this PR", "sequential review", "file by file review", "let's review this PR together".

**Covers:**
- Fetches PR diff via `gh` CLI or local `git diff`
- Sorts changed files by size (smallest first) to build context incrementally
- Reviews one file per turn — user says "next" to advance, "skip" to defer, "done" to end
- Reads surrounding codebase context only when needed to confirm a real defect
- Respects project-specific `PR_REVIEW_INSTRUCTIONS.md` when present; falls back to `code-reviewer` or `caveman-review` skill standards
- Produces a summary table with per-file verdicts and a list of defects to fix before merge

---

## Contributing

Suggestions and Pull Requests for new skills or improvements are welcome!
