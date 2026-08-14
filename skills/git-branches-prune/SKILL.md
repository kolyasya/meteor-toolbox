---
name: git-branches-prune
description: Batch cleanup of temporary remote branches after user approval.
disable-model-invocation: true
---

# Git branches prune

Process one *batch* per turn. *Dispatch* a fast subagent to build the list. Require user approval before you delete any branch. *Report* holds the active branch list at the top, deleted branches in the middle, and kept branches below.


The only git the parent runs is delete-and-prune after the gate.

## 1. Roster

*Report* path: `tmp/git-branches-prune-report.md`, or `{temp-docs-dir}/git-branches-prune-report.md` when AGENTS.md names a temp-docs directory.

Read the report if it exists. Load its roster, deleted names, and keep names.

Read `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursor/skills/`, and a parent-repo `AGENTS.md` if present. Build file-derived patterns:

- **Protected** — long-lived / env / release trains named there
- **Temporary** — feature, hotfix, merge, buffer, revert, or ticket branches

Cite a source for each pattern. Merge oracles default to `origin/main` and `origin/staging`; use the pair AGENTS.md names if it differs.

**Host** (GitHub / remote extras: open PRs): use the git/GitHub tool those files name. If none, probe `gh`, then GitHub MCP. If neither works: host is **local git**. Tell the user once: only local git access; open-PR checks skipped. GitHub access is `gh`, MCP, or local git.

Merge with the report: refresh file-derived rows from this scan; **user** rows stay. User wins on conflict. Ambiguous names are protected.

Write the working roster at the top of the report (keeps and deleted tables unchanged). Show it. Done when the header is that roster (including host), every long-lived branch named in those files is on the protected list, temporary patterns cover feature/hotfix/merge/buffer/ticket, and keep/deleted names are in hand.

When the user states a pattern rule, add it to the roster as source `user` and write the header before the next dispatch.

```markdown
# Git branches prune

## Roster

Oracles: `origin/main`, `origin/staging`
Host: gh | github MCP | local git

### Protected
| Pattern | Source |
|---|---|
| `envs/*` | AGENTS.md |
| `release/*` | user 2026-08-13 |

### Temporary
| Pattern | Source |
|---|---|
| `JIRA-` | AGENTS.md |
| `feature/` `hotfix/` `merge` `buffer` `revert-` | user 2026-08-13 |

## Deleted

| Branch | Author | Latest Commit Date | Merged Into | PR | Analysis Date |
|---|---|---|---|---|---|

## Keeps

| Branch | Author | Latest Commit Date | Merged Into | Reason | Analysis Date |
|---|---|---|---|---|---|
```

## 2. Dispatch

Launch **one** cheap subagent that can run git (this env's shell / bash / general runner). Pick a cheap fast family this env actually offers — no version pins, inherit only if none exist:

Haiku, Composer, Gemini Flash, GPT mini, DeepSeek, Qwen Coder, Llama 8B, Codestral, Yi-Coder

Point it at [chunk.md](chunk.md). Give it:

- the roster (protected + temporary + oracles + host)
- exclude: every branch already in Deleted or Keeps
- year: oldest unfinished, or the year in progress

Done when the return has a year, a candidate table of ≤20 rows, and a skipped list. Every candidate row has branch, author, latest commit date, merged into, PR, propose, and reason if kept. Excluded names do not appear.

If the return is incomplete, dispatch again naming the gap. Parent does not inventory, classify, or merge-check.

## 3. Gate

Show candidate table with proposed delete, keep, and skipped. Stop. Done when the user names the branches to delete, or approves the proposed-delete set. Pattern rules stated here go to the roster (step 1).

## 4. Delete

Only user-approved names. Strip `origin/` once (`origin/origin/feature/X` → `origin/feature/X`). Current checkout stays. Local `git` unless the roster host names a different delete tool.

```bash
git push origin --delete <name> [<name> ...]
git branch -d <name>   # only if a local branch exists; never -D
git fetch origin --prune
```

Done when `git show-ref` has none of the deleted names.

## 5. Record

Append a row in **Deleted** for every deleted branch from this batch: Branch, Author, Latest Commit Date, Merged Into, PR, and Analysis Date.

Append a row in **Keeps** for every skipped branch from this batch: user keep, not merged, open PR, current checkout, or other can't-delete. Reason on the row.

Done when every processed branch from this batch has a row in either Deleted or Keeps.

## 6. Next batch

Re-read the report. Same year if temporary candidates remain; otherwise the next year. Dispatch again. Stop when years are exhausted or the user ends the pass.

## Rationalizations

| Excuse | Reality |
|---|---|
| "I know the env branches" | Roster from files + report header this run. |
| "User said the pattern, I'll remember" | User rows go in the roster header. |
| "I'll open GitHub in a browser" | Host is gh, MCP, or local git. Tell the user. |
| "Pin composer-2.5-fast" | Cheap family this env offers. No version pins. |
| "Faster to run the git myself" | Dispatch. Parent presents, gates, deletes, records. |
| "Skip the report" | Write roster, deleted, and keeps before the next dispatch. |
| "Merged everywhere, just delete" | Gate first. The list is a proposal. |
| "`-D` because `-d` refused" | Stop. Tell the user. User must say force. |
