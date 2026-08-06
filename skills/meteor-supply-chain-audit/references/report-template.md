# Supply Chain Audit Report

## 1. Lockfile & Package Manager Status
- **Competing lockfiles found:** [list paths, or "none"]
- **`packageManager` field:** [PASS / FAIL — missing or wrong value]
- **`engine-strict`:** [PASS / FAIL]
- **Native script allowlist:** [list of allowed packages, or "not configured"]
- **`ignore-scripts` present?** [YES — remove it / NO — OK]

## 2. Npm.depends Inventory

| Package Path | Dependencies | Dynamic Range? | Risk | Migration Action |
|:---|:---|:---|:---|:---|
| `packages/foo/package.js` | `bcrypt: "^5.0.0"` | ⚠️ YES | HIGH | Pin to `5.1.1` or move to `package.json` + `check-npm-versions` |

## 3. Gitignore & Tracked Artifact Hygiene
- **`.npm` folders tracked in git?** [YES — list files / NO]
- **`npm-shrinkwrap.json` files tracked?** [YES — list files / NO]
- **Missing `.gitignore` patterns:** [list, or "none"]

## 4. CI/CD Enforcement
- **`--frozen-lockfile` on all install steps?** [PASS / FAIL — list jobs missing it]
- **Untrusted build / trusted deploy separation?** [PASS / FAIL]
- **Native recompile inside Docker image?** [PASS / FAIL]

## 5. Prioritized Remediation
1. **Immediate:** [e.g., remove competing lockfiles, untrack `.npm` artifacts]
2. **Short-term:** [e.g., pin `Npm.depends` ranges, migrate to `check-npm-versions`]
3. **CI:** [e.g., add `--frozen-lockfile`, split build and deploy jobs]
