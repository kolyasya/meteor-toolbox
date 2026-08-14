# Chunk table

Read-only git. Produce one *chunk*: **one year, at most 20 ephemeral candidates**, oldest tip first.

Use the **roster**, **oracles**, **host**, and **exclude** list from the dispatch prompt. Do not invent patterns.

## Inventory

If no year was given, print tip-year counts, then take the oldest year that still has unprocessed ephemeral candidates.

```bash
git for-each-ref --format='%(committerdate:format:%Y)' refs/remotes/origin | sort | uniq -c
```

## Classify

List that year's remotes oldest-tip-first. Drop names on the exclude list (already in the report's Deleted or Keeps tables). Classify every remaining name from the roster:

- **Protected** → not a candidate
- **Ephemeral** → candidate
- else → **skipped**

Protected wins when both match. Take the first **20 candidates**.

Done when the chunk has ≤20 candidate names, exclude names are absent, and every other name from that slice is skipped or protected.

## Merge-check

For each candidate, get author and latest commit date:

```bash
git log -1 --format='%an|%cs' "$b"
```

Ancestor-check each oracle from the prompt:

```bash
git merge-base --is-ancestor "$b" <oracle>
```

Consolidate merge results into the `Merged Into` column (e.g., `main, staging`, `staging`, or `none`).
`yes` on every oracle → **propose delete**. Anything else → **keep** (reason: `not merged into <missing oracle>`).

For keep rows, `git cherry -v` against each oracle. A `-` line is an equivalent patch, not a merge. Keep (reason: `cherry-pick only`).

Open-PR check on proposed-delete heads only when host is `gh` or `github MCP`:

```bash
gh pr list --head "${b#origin/}" --state all --json number,state
```

An open PR moves the row to keep (reason: `PR #N open`). Host `local git`: skip PR checks (PR column: `-`).

Done when every candidate has author, latest commit date, merged into, PR status, and a propose value with reason if kept.

## Return

Return only this. No git logs.

```markdown
Year: YYYY
Year counts: <paste uniq -c>
Remaining ephemeral candidates this year after this chunk: N

| Branch | Author | Latest Commit Date | Merged Into | PR | Propose | Reason |
|---|---|---|---|---|---|---|
| origin/… | Name | YYYY-MM-DD | main, staging | #123 (closed) | delete | |
| origin/… | Name | YYYY-MM-DD | staging | - | keep | not merged into main |

Proposed delete:
- …

Keep:
- … (<reason: not merged / cherry / open PR>)

Skipped:
- …

Protected in this slice:
- … (or none)

Excluded by report:
- … (or none)
```
