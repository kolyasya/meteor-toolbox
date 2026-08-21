---
name: pr-review-guided
description: Guided, file-by-file PR review where the user controls the pace. Fetches the PR diff and metadata (using gh CLI, GitHub MCP, or local git fallbacks), sorts all changed files by number of lines (smallest first), reviews them one-by-one as the user says "next", and validates repository merge and branch rules. For each file it shows the diff, reads relevant surrounding context from the codebase (callers, schemas, tests) only when needed to confirm a bug, then gives a concise analysis and verdict. Flags real defects inline with exact fix proposals. Respects project-specific PR_REVIEW_INSTRUCTIONS.md, AGENTS.md, and merge safety rules. Use this skill whenever someone wants to review a GitHub PR interactively, step through a PR file by file, or do a guided code review of a pull request. Also triggers on "review pr", "sequential review", "file by file review", "let's review this PR together", "auto review", or "automated review".
---

# Guided PR Review

A file-by-file PR review. Two modes, same output format:

- **Manual** (default): the user drives the pace — one file per turn, navigation menu after each.
- **Automated**: you advance through all files without pausing, then run Phase 3.

Detect mode from the user's request. Triggers for automated: "auto", "automated mode", "review all", "no pauses".

## Why this approach

Large PRs are overwhelming when dumped all at once. Reviewing smallest files first:
- Builds context cheaply before hitting complex files
- Lets the user ask questions or request skips without losing track
- Surfaces the full picture before diving into 100-line diffs

## Phase 1: Preparation (do this all before showing any review)

### 1. Determine the PR

Accept a GitHub PR URL, PR number, or infer from the current branch. If none provided, ask.

### 2. Establish review standards

First, look for a **project-specific** review instructions file:
```bash
find . -name "PR_REVIEW_INSTRUCTIONS.md"
```

**If found**: read it strictly to extract content standards (severity labels, inline comment requirements, GitHub submission rules). The review process itself remains strictly governed by this skill: you must always execute the guided, file-by-file interactive flow as defined here.

**If not found**: check whether globally installed review skills are available. Look for any of these skill names: `code-reviewer`, `code-review`, `caveman-review`, `review`, `pr-review`. Check the following locations in order, stopping at the first match:

| Provider | Path |
|----------|------|
| Universal (all providers) | `~/.agents/skills/` |
| Antigravity / Gemini | `~/.gemini/config/skills/` |
| Claude Code | `~/.claude/commands/` |
| Cursor (global) | `~/.cursor/rules/` |
| Cursor (project) | `.cursor/rules/` |

If a matching skill file is found, load it and apply its standards as the review baseline. This ensures you inherit the user's preferred review style even without a project-specific config.

**If neither exists**: fall back to the default severity labels defined in the "Severity labels" section below.

### 3. Fetch PR metadata

Attempt to fetch the PR metadata using the following strategies in order:

1. **`gh` CLI**:
   ```bash
   gh pr view <PR_NUMBER> --json baseRefName,headRefName,title,body
   ```
2. **GitHub MCP**:
   Call the `get_pull_request` tool from the `github` MCP server with the owner, repository name, and PR number.
3. **Local git branch info & User Prompt**:
   - Infer the head branch using `git branch --show-current` or `git log -n 1 --pretty=format:"%H"`.
   - Ask the user for the base branch (defaulting to `main` or `master` if unknown).
   - Ask the user for the PR title and description, or read the recent commits with `git log -n 5`.

Extract: title, base branch, head branch, description/requirements, and any acceptance criteria.

### 4. Fetch and sort changed files

Build a sorted list of all changed files by **total lines changed (additions + deletions), ascending**, including new and test files. Choose the first available method:

1. **`gh` CLI**: Run this single command to fetch and sort stats perfectly without downloading the raw diff:
   ```bash
   gh pr view <PR_NUMBER> --json files --jq '.files | sort_by(.additions + .deletions) | .[] | "\(.path) (+\(.additions) / -\(.deletions))"'
   ```
2. **GitHub MCP**: Call `get_pull_request_files`. Read the `changes` property (or `additions` + `deletions`) for each file in the JSON response, and sort the list in context.
3. **Local git**: Parse the output of `git diff --stat origin/<base>...HEAD`.

Once you have the sorted list, fetch the full PR diff (`gh pr diff <PR_NUMBER>` or `git diff`) and save it to a scratch file for reference during the review.

### 5. Check environment

```bash
cat .meteor/release   # or equivalent version file
```
Note the tech stack (framework version, language) to inform review standards.

### 6. Present the file list

Show the complete sorted list with line counts before beginning reviews. This helps the user know what's coming and plan skips.

---

## Phase 2: Sequential Review

Present files one at a time using the fixed block format below.

**Manual mode:** after each file, call `ask_question` with the navigation menu — **do not advance until the user responds**.

**Automated mode:** after each file, continue immediately to the next without pausing. When all files are done, proceed directly to Phase 3.

### Per-file output block

Output this exact structure for every file:

```
---
📄 File N/M · path/to/file.ts (+A / -D)

```diff
<diff content>
```

**What it does:** One sentence describing the change.

**Issues:**
- [BUG] `line N` — description. Fix: `exact fix`
- [WARNING] `line N` — description.
(Omit section entirely if no issues.)

**Verdict:** ✅ Correct | ⚠️ Minor issues | 🔴 Defect — fix before merge
---
```

Keep **What it does** to one sentence. For trivial files (type alias, import reorder) that sentence is the entire analysis — omit Issues and use `✅ Correct`.

### Navigation menu (manual mode only)

After outputting the block, call `ask_question` with:

```
Question: "File N/M reviewed. What next?"
Options:
  - "➡️ Next file"
  - "⏭️ Skip next file"
  - "↩️ Go back to previous file"
  - "🏁 Done — show summary"
```

If the user writes a free-text comment instead of selecting, acknowledge it, apply any requested changes to the verdict, then show the menu again.

In **automated mode**, skip this menu entirely. A free-text comment mid-run pauses the run — acknowledge it, then continue.

### Gather context — only if needed

Read surrounding code only to confirm a **real defect**, not for curiosity. Good triggers:
- Return type changed and a caller consumes it
- Guard condition removed — is there another?
- Schema field added — is it populated everywhere returned?
- New DB query — does the project enforce async?

Read the minimum: the specific caller, schema, or related file. Don't explore.

### Severity labels

Follow any labels defined in `PR_REVIEW_INSTRUCTIONS.md`. As defaults:

| Label | Meaning |
|-------|---------|
| **[BUG]** | Logic error, missing field, wrong condition — must fix |
| **[WARNING]** | Potential issue that may or may not be a problem in practice |
| **[SUGGESTION]** | Identifier naming, code smell, minor improvement |
| **[NIT]** | Cosmetic, docs, trivial — report only if 3+ in same file |

---

## Phase 3: End of Review

When the user selects **🏁 Done** or all files are reviewed, do the following **in order**:

### Step 1: Offer to revisit skipped files

If any files were skipped, call `ask_question` before the summary:

```
Question: "You skipped N file(s): [list]. Revisit them now?"
Options:
  - "Yes — review skipped files"
  - "No — mark as intentionally skipped"
```

If yes: run the per-file block for each skipped file in original order. Update their verdict.

If no: mark them as `⏭️ Intentionally skipped` in the summary.

### Step 2: Verify merge and branch rules

Analyze repository instructions to verify that the pull request is safe to merge:

1. **Locate rule files:**
   Read project rule files if they exist:
   - `AGENTS.md`, `CLAUDE.md`, `.agents/rules/`
   - `CONTRIBUTING.md`, `.github/pull_request_template.md`
   - `PR_REVIEW_INSTRUCTIONS.md`

2. **Verify PR against rules:**
   - **Branch rules:** Verify the target base branch (e.g. `staging`, `main`) and the source branch naming conventions against documented workflow rules.
   - **Required additions:** Check if the changes require accompanying updates (such as unit tests, database migrations, changelog entries, version increments, or documentation).
   - **Merge safety & destructive changes:** Check for breaking changes, destructive schema modifications, new environment variables, or package updates that require explicit review.

3. **Determine merge readiness:**
   - 🟢 **Safe to merge:** All files reviewed, no open defects, and all repository branch and merge rules pass.
   - 🟡 **Caution / Incomplete requirements:** Non-blocking warnings exist, or required non-code updates (e.g., changelog or documentation) are missing.
   - 🔴 **Blocked:** Open defects exist, or the PR violates branch/merge rules (e.g., wrong target branch, destructive schema change without approval).

### Step 3: Show the summary

Once all decisions and checks are complete:

1. Show a **summary table**: file → verdict
2. List open defects that need addressing before merge
3. Show the **Merge Safety & Rules Assessment**
4. If `PR_REVIEW_INSTRUCTIONS.md` or the fallback skill has GitHub submission rules, remind the user — do not post comments to GitHub unless they explicitly ask

### Summary format

```
## Review Summary

| File | Verdict |
|------|---------|
| types/common.ts | ✅ Correct |
| api/documents/helpers.ts | ⚠️ Minor issues |
| api/documentTypes/utils/getRefinementState.ts | 🔴 Defect — brand missing from active/ready state return |
| api/some/skipped-file.ts | ⏭️ Intentionally skipped |

**Defects to fix before merge:**
1. `getRefinementState.ts` — Add `brand` to the final return block (lines 86-92)

**Merge Safety & Rules Check:**
- **Branch Target:** ✅ Target branch `staging` matches repository workflow rules
- **Accompanying Changes:** ⚠️ No test file added for new helper `getRefinementState.ts`
- **Safety / Destructive Ops:** ✅ No breaking schema changes or destructive operations detected

**Merge Readiness Verdict:** 🔴 Blocked (fix 1 defect before merge)

**Skipped:**
- `api/some/skipped-file.ts` — not reviewed by user's choice
```

---

## Notes on efficiency

- The sorted-ascending order is not just UX — it builds your own context incrementally. Trivial files (type additions, test registrations) tell you what concepts the PR introduces before you hit the meaty service files.
- When you spot a defect in an early file, keep track of it. It often shows up again (correctly or incorrectly) in later files.
- If the PR description has acceptance criteria, use them as a checklist. Note which are covered and which aren't as you go.
