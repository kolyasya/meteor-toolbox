# Chunk table

Read-only git. Produce one *chunk*: **one year, at most 20 ephemeral candidates**, oldest tip first.

Use the **roster**, **oracles**, **host**, and **exclude** list from the dispatch prompt. Do not invent patterns.

## Inventory

If no year was given, print tip-year counts, then take the oldest year that still has unprocessed ephemeral candidates.

```bash
git for-each-ref --format='%(committerdate:format:%Y)' refs/remotes/origin | sort | uniq -c
```

## Classify

List that year's remotes oldest-tip-first. Drop names on the exclude list (already in the keep *report*). Classify every remaining name from the roster:

- **Protected** → not a candidate
- **Ephemeral** → candidate
- else → **skipped**

Protected wins when both match. Take the first **20 candidates**.

Done when the chunk has ≤20 candidate names, exclude names are absent, and every other name from that slice is skipped or protected.

## Merge-check

For each candidate, ancestor-check both oracles from the prompt:

```bash
git merge-base --is-ancestor "$b" <oracle>
```

`yes` on every oracle → **propose delete**. Anything else → **keep**.

For keep rows, `git cherry -v` against each oracle. A `-` line is an equivalent patch, not a merge. Keep.

Open-PR check on proposed-delete heads only when host is `gh` or `github MCP`. An open PR moves the row to keep. Host `local git`: skip PR checks.

Done when every candidate has a result per oracle and a propose value.

## Return

Return only this. No git logs.

```markdown
Year: YYYY
Year counts: <paste uniq -c>
Remaining ephemeral candidates this year after this chunk: N

| Branch | <oracle> | … | Propose |
|---|---|---|---|
| origin/… | yes/no | yes/no | delete/keep |

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
