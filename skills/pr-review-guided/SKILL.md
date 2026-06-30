---
name: pr-review-guided
description: Guided, file-by-file PR review where the user controls the pace. Fetches the PR diff via the `gh` CLI, sorts all changed files by number of lines (smallest first), and reviews them one-by-one as the user says "next". For each file it shows the diff, reads relevant surrounding context from the codebase (callers, schemas, tests) only when needed to confirm a bug, then gives a concise analysis and verdict. Flags real defects inline with exact fix proposals. Respects project-specific PR_REVIEW_INSTRUCTIONS.md rules when present. Use this skill whenever someone wants to review a GitHub PR interactively, step through a PR file by file, or do a guided code review of a pull request. Also triggers on "review pr", "sequential review", "file by file review", or "let's review this PR together".
---

# Guided PR Review

A conversational, file-by-file PR review. The user drives the pace — you prepare everything upfront, then surface one file per turn.

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

**If found**: read it and treat it as the primary authority throughout the review. It overrides the defaults in this skill. Key things to extract: severity labels, output format, inline comment requirements, GitHub submission rules.

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

```bash
gh pr view <PR_NUMBER>
gh pr view <PR_NUMBER> --json baseRefName,headRefName,commits
```

Extract: title, base branch, head branch, description/requirements, any acceptance criteria.

### 4. Fetch the diff

Prefer local git diff over `gh pr diff` — it's faster and doesn't truncate:
```bash
git diff origin/<base>...HEAD
git diff --stat origin/<base>...HEAD
```

Save the diff to a scratch file for reference throughout the session.

### 5. Sort files by size

Parse the `--stat` output. Build a sorted list of all changed files by **total lines changed (additions + deletions), ascending**. New files and test files count by their actual diff size — don't exclude them.

### 6. Check environment

```bash
cat .meteor/release   # or equivalent version file
```
Note the tech stack (framework version, language) to inform review standards.

### 7. Present the file list

Show the complete sorted list with line counts before beginning reviews. This helps the user know what's coming and plan skips.

---

## Phase 2: Sequential Review

Present files one at a time. **Wait for the user to say "next" (or equivalent) before advancing.**

The user may also say:
- "skip" / "skip this one" → note it as deferred, move to next
- "go back" → re-review the previous file
- "jump to [file]" → skip ahead to a specific file
- "done" → end the review and give a summary

### Per-file review process

**Step 1: Show the diff**

Show the raw diff for the file with clear header:

```
### File N of M: [filename] (X changes)

\```diff
<diff content here>
\```
```

**Step 2: Gather context — only if needed**

Don't read every file the diff touches. Only read surrounding context when you need to confirm a **real bug or defect** — not for curiosity. Good reasons to look further:
- A return value is used by a caller and the type changed
- A guard condition was removed — is there another guard?
- A schema field was added — is it populated everywhere it's returned?
- A new DB query pattern — does the project enforce async?

Read the minimum: check the specific caller, schema, or related file. Don't explore.

**Step 3: Give the verdict**

Use this structure (adapt length to the file's complexity):

- **Analysis**: What the change does, and whether the logic is sound
- **Issues** (if any): Specific defects with exact file + line reference and a concrete fix
- **Verdict**: `Correct` / `Minor issues` / `Defect — fix before merge`

Keep it tight. If the file is a trivial type change or import reorder, one sentence is enough.

### Severity labels

Follow any labels defined in `PR_REVIEW_INSTRUCTIONS.md`. As defaults:

| Label | Meaning |
|-------|---------|
| **[BUG]** | Logic error, missing field, wrong condition — must fix |
| **[WARNING]** | Potential issue that may or may not be a problem in practice |
| **[SUGGESTION]** | Identifier naming, code smell, minor improvement |
| **[NIT]** | Cosmetic, docs, trivial — report only if 3+ in same file |

### What NOT to do

- Don't dump an entire file's worth of suggestions at once
- Don't read files outside the diff unless absolutely necessary for a P0 issue
- Don't praise good patterns — just move on if it's fine
- Don't say "consider adding error handling" without showing exactly where and what

---

## Phase 3: End of Review

When all non-skipped files have been reviewed, do the following **in order**:

### Step 1: Offer to revisit skipped files

If any files were skipped during the session, **before showing the summary**, explicitly propose going back to them:

> "We've reviewed all X files. You skipped these Y file(s) earlier:
> - `path/to/skipped-file.ts`
> - `path/to/other-file.ts`
>
> Want to revisit them now, or skip them entirely?"

If the user wants to revisit: run the normal per-file review for each skipped file, in order of their original size-sorted position. Update their verdict in the tracking list.

If the user declines: mark them as "intentionally skipped" in the summary.

### Step 2: Show the summary

Once all decisions are made (including skipped file disposition):

1. Show a **summary table**: file → verdict
2. List open defects that need addressing before merge
3. If `PR_REVIEW_INSTRUCTIONS.md` or the fallback skill has GitHub submission rules, remind the user — don't post comments to GitHub unless they explicitly ask

### Summary format

```
## Review Summary

| File | Verdict |
|------|---------|
| types/common.ts | ✅ Correct |
| api/documents/helpers.ts | ✅ Correct |
| api/documentTypes/utils/getRefinementState.ts | ⚠️ Defect — brand missing from active/ready state return |
| api/some/skipped-file.ts | ⏭️ Intentionally skipped |

**Defects to fix before merge:**
1. `getRefinementState.ts` — Add `brand` to the final return block (lines 86-92)

**Skipped:**
- `api/some/skipped-file.ts` — not reviewed by user's choice
```

---

## Notes on efficiency

- The sorted-ascending order is not just UX — it builds your own context incrementally. Trivial files (type additions, test registrations) tell you what concepts the PR introduces before you hit the meaty service files.
- When you spot a defect in an early file, keep track of it. It often shows up again (correctly or incorrectly) in later files.
- If the PR description has acceptance criteria, use them as a checklist. Note which are covered and which aren't as you go.
