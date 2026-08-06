---
name: meteor-supply-chain-audit
description: >
  Audit a Meteor + pnpm project for supply chain hygiene: lockfile drift,
  Npm.depends risk, and CI enforcement gaps. User-invoked; does not trigger
  automatically.
disable-model-invocation: true
---

# Meteor Supply Chain Audit

**Leading word: drift** — all three sections below detect one thing: dependency state that has *drifted* from the locked, controlled baseline. Every finding is a drift report; every fix closes the gap.

Run the three sections in order. Each section ends with a pass/fail verdict and a remediation list. Assemble the full report only after all three sections are complete.

---

## Section 1 — Lockfile & Package Manager Drift

**Goal:** confirm exactly one `pnpm-lock.yaml` exists and no competing lockfiles have drifted into source control.

1. Search the repo tree for lockfiles: `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`.
2. **FAIL** if any `package-lock.json`, `npm-shrinkwrap.json`, or `yarn.lock` is tracked in git.
3. **FAIL** if there is not exactly one `pnpm-lock.yaml` at the application root.
4. Check `package.json` for `"packageManager": "pnpm@<version>"`. **FAIL** if absent.
5. Check `app/.npmrc` for `engine-strict=true`. **FAIL** if absent.
6. Check `pnpm-workspace.yaml` or `package.json` for `onlyBuiltDependencies` / `allowBuilds`. List every package in the allowlist; flag any that are not native C++/binary packages.
7. Confirm `ignore-scripts` is absent or commented out in `.npmrc` (its presence silently breaks the native allowlist).

**Section 1 done when:** verdict is PASS or every FAIL has an entry in the remediation list.

---

## Section 2 — `Npm.depends` Drift

**Goal:** inventory all local npm dependencies embedded in Meteor packages and quantify their drift risk.

1. Search `packages/*/package.js` for `Npm.depends({...})`. Collect every file and its full dependency map.
2. For each dependency, check the version string. **HIGH RISK** if the string contains `^`, `~`, `*`, or `x` — these force Meteor's compiler to run background resolution and generate `.npm/package/npm-shrinkwrap.json` files that drift on every build.
3. Check `.gitignore` for the patterns below. **FAIL** if any are missing:
   ```
   packages/*/.npm/
   **/packages/*/.npm/package/npm-shrinkwrap.json
   .meteor/local/
   ```
4. Run `git ls-files packages/**/.npm` (or equivalent). **FAIL** if any `.npm` build artifacts are currently tracked.
5. For each `Npm.depends` entry, record migration feasibility:
   - **Migratable:** package can move to root `package.json` + `tmeasday:check-npm-versions` in `package.js`.
   - **Blocked:** package requires Meteor package internals (e.g., must be available at `Npm.require` call time before app boot).

**Section 2 done when:** every `Npm.depends` entry has a risk rating and a migration action.

---

## Section 3 — CI/CD Enforcement Drift

**Goal:** confirm the pipeline enforces the locked state and separates trust boundaries.

1. Inspect `.github/workflows/`. Verify every `pnpm install` step uses `--frozen-lockfile`. **FAIL** if any install step is missing the flag.
2. Verify the pipeline has a hard boundary between:
   - **Untrusted build** — runs `pnpm install` and `meteor build` with zero secrets and read-only permissions.
   - **Trusted deploy** — handles Docker push, AWS credentials, etc.

   **FAIL** if both stages share the same job or the same secrets scope.
3. Confirm production `pnpm install` inside `bundle/programs/server` runs inside the target Docker image (so native bindings compile against container glibc, not the host runner OS). **FAIL** if the install runs on the host runner and the bundle is copied in afterwards.

**Section 3 done when:** verdict is PASS or every FAIL has an entry in the remediation list.

---

## Report Format

After all three sections, emit the report using the template in [`references/report-template.md`](references/report-template.md).
