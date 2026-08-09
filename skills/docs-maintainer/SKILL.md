---
name: docs-maintainer
description: >
  Maintain repository documentation as a supplement to code, never a substitute.
  Use when auditing existing docs for drift, deciding whether a new doc is justified,
  writing or updating an ADR, maintaining a domain glossary, or building a thin
  navigation layer. Trigger on: docs drift, markdown files, documentation, ADR,
  architecture decision record, glossary, domain language, ARCHITECTURE.md, README,
  docs as source of truth, documentation antipattern.
---

# Documentation Maintainer

Code is the **single source of truth**. Every markdown file in the repo is a bet that it will stay synchronized with that source — a bet that gets harder to win as the codebase evolves. This skill's job is to keep that bet honest.

## The drift problem

When docs describe what code already expresses, two sources of truth exist. When they diverge — and they will, because docs aren't executable and can't be tested against the code — the agent has no way to know which one is correct. Conflicting sources cause silent errors worse than missing context. The fix is not better maintenance discipline; it is writing fewer docs that can drift.

**Do not write docs that restate what the code expresses.** Code organization, naming, interfaces, and module boundaries are self-explanatory when written well. A doc that describes them is a cache of the code — a copy that cannot stay fresh.

## Three legitimate doc types

These are the gaps code cannot close by construction:

### 1. Architecture Decision Records (ADRs)

Code shows the decision made; it cannot show the alternatives that were rejected or the reasoning that ruled them out. That context vanishes without an ADR.

**Write an ADR when:**
- A significant architectural or design choice was made
- Viable alternatives existed and were consciously rejected
- The reasoning will not be obvious to a future reader of the code

**ADR structure (thin):**
```markdown
# ADR-NNN: [Title]

## Status
Accepted | Superseded by ADR-NNN

## Context
What problem forced a decision.

## Decision
What was chosen.

## Alternatives considered
What else was evaluated and why it was ruled out.

## Consequences
Trade-offs accepted.
```

Keep ADRs immutable once accepted. Supersede, never edit-in-place.

### 2. Domain glossary

Code can't explain what the domain terms _mean_ — what an "order" or a "settlement" or a "claim" is in the business sense. Without a shared vocabulary, the agent has to guess from usage, which produces inconsistent interpretations.

**Include in the glossary:**
- Domain nouns used across the codebase with non-obvious meaning
- Terms that collide with general English (e.g., "session", "event", "policy")
- Abbreviations and acronyms
- Relationships between domain concepts not captured in the schema

**Do not include:**
- Technical terms standard in the stack (no need to define "middleware")
- Anything the code already makes clear from naming and structure

### 3. Navigation thin-layer

A short map of the major entry points, boundaries, and conventions so the agent can orient without reading every file. This is **not** a description of what the code does — it is a pointer to where things live.

**Navigation doc contains:**
- Top-level directory layout with one-line purpose per directory
- The three or four files an agent should read first to understand the system
- Cross-cutting conventions (e.g., "all server entry points are in `server/`")
- Where to find ADRs and the glossary

**Navigation doc does not contain:**
- Descriptions of what modules or classes do
- Configuration values (those live in config files)
- API documentation (that lives in code comments or a generated reference)

## Audit workflow

When asked to audit existing docs, work through this checklist:

1. **Identify drift candidates.** For each prose statement in a doc, ask: does the code already express this? If yes, flag it for removal.
2. **Check executable gaps.** For each remaining statement, ask: is there a test, schema, or type that verifies this claim? Unverifiable claims about code behaviour are high-drift risk.
3. **Classify remaining content.** Each surviving block must map to one of the three legitimate types (ADR, glossary, navigation). If it doesn't fit, it shouldn't exist.
4. **Trim navigation docs to pointers.** Replace any paragraph describing what a module does with a single-line pointer to where it lives.
5. **Report.** List each removed or flagged section with the reason: _restates code_, _unverifiable claim_, _no legitimate type match_.

## Signals a doc has drifted

- A doc says a function or method does X; the function does Y
- A doc describes a module structure that no longer matches the directory layout
- A doc references a config key, env var, or constant that has been renamed or removed
- Two docs contradict each other on the same fact
- A doc uses a domain term not found anywhere in the code (renamed concept)

## Writing new docs

Before creating any new doc, pass the **necessity test**:

> "Is there something here that code, tests, types, or config **cannot** express by construction?"

If the answer is no, the doc is a cache. Improve the code instead — rename, restructure, add a type, write a comment at the declaration site. A well-placed code comment is harder to drift than a separate markdown file because it lives next to the thing it describes and gets read in the same edit session.

If the answer is yes, the content belongs to one of the three legitimate types. Write only that.
