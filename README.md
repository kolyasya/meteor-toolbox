# Meteor Toolbox — Agent Skills

A curated collection of AI agent skills for Meteor.js development, supply chain security, and code review workflows.

## Installation

Install all skills in this repository:

```bash
npx skills add kolyasya/meteor-toolbox
```

Or install a specific skill:

```bash
npx skills add kolyasya/meteor-toolbox --skill docs-maintainer
npx skills add kolyasya/meteor-toolbox --skill meteor-fullstack
npx skills add kolyasya/meteor-toolbox --skill meteor-supply-chain-audit
npx skills add kolyasya/meteor-toolbox --skill pr-review-guided
```

---

## Available Skills

| Skill | Description | Install Command |
|-------|-------------|-----------------|
| [`docs-maintainer`](#docs-maintainer) | Maintain repository documentation as a supplement to code | `npx skills add kolyasya/meteor-toolbox --skill docs-maintainer` |
| [`meteor-fullstack`](#meteor-fullstack) | Full-stack Meteor 3.x development: async APIs, methods, pub/sub, React integration, MongoDB, GraphQL | `npx skills add kolyasya/meteor-toolbox --skill meteor-fullstack` |
| [`meteor-supply-chain-audit`](#meteor-supply-chain-audit) | Audit Meteor + pnpm supply chain hygiene: lockfiles, `Npm.depends` risk, and CI enforcement | `npx skills add kolyasya/meteor-toolbox --skill meteor-supply-chain-audit` |
| [`pr-review-guided`](#pr-review-guided) | Guided, file-by-file GitHub PR review with user-controlled pacing | `npx skills add kolyasya/meteor-toolbox --skill pr-review-guided` |

---

### `docs-maintainer`

Maintain repository documentation as a supplement to code, never a substitute.

```bash
npx skills add kolyasya/meteor-toolbox --skill docs-maintainer
```

**Triggers on:** `docs drift`, `markdown files`, `documentation`, `ADR`, `architecture decision record`, `glossary`, `domain language`, `ARCHITECTURE.md`, `README`, `docs as source of truth`, `documentation antipattern`.

**Covers:**
- Audit documentation for drift and unnecessary duplication
- Write Architecture Decision Records (ADRs) for design choices
- Maintain domain glossaries for business vocabulary
- Create thin navigation layers for system orientation
- Remove documentation that duplicates executable code

---

### `meteor-fullstack`

Full-stack Meteor 3.x development with React, MongoDB, async APIs, methods, pub/sub, and GraphQL.

```bash
npx skills add kolyasya/meteor-toolbox --skill meteor-fullstack
```

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

### `meteor-supply-chain-audit`

Audit a Meteor + pnpm project for supply chain hygiene, lockfile drift, `Npm.depends` risk, and CI enforcement gaps.

```bash
npx skills add kolyasya/meteor-toolbox --skill meteor-supply-chain-audit
```

**Invocation:** User-invoked (`meteor-supply-chain-audit` or `/meteor-supply-chain-audit`).

**Covers:**
- Lockfile inventory & consolidation (eliminating competing `package-lock.json` / `yarn.lock`)
- Package manager & `.npmrc` restriction checks (`engine-strict`, `packageManager`, script allowlists)
- Meteor `Npm.depends` risk assessment & dynamic version range detection (`^`, `~`, `*`)
- Git hygiene for `.npm` build artifacts & shrinkwrap files
- CI/CD frozen lockfile enforcement, build/deploy job separation, and container recompile checks
- Generates a prioritized remediation report

---

### `pr-review-guided`

Guided, file-by-file PR review where the user controls the pace.

```bash
npx skills add kolyasya/meteor-toolbox --skill pr-review-guided
```

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

