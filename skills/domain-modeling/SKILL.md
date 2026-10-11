---
name: domain-modeling
description: "Build or sharpen a project's canonical domain language and record rare durable tradeoff decisions. Use when terminology is ambiguous, CONTEXT.md or CONTEXT-MAP.md is being created or changed, or a surprising hard-to-reverse decision may need an ADR."
---

# Domain Modeling

Create a shared language that makes product discussion, code, tests, plans, and reviews precise. This is active model work, not merely reading an existing glossary.

## Authority boundaries

- `CONTEXT.md` owns canonical domain terms and relationships. It is a glossary, not an implementation spec.
- `CONTEXT-MAP.md` points to multiple context-specific glossaries in a genuinely large multi-context repository.
- ADRs under `docs/adr/` own the rationale for rare, hard-to-reverse technical or product decisions.
- `docs/agents/project.md` owns project destination, constraints, non-goals, open decisions, and preservation context when present.
- Wayfinder decision files own unresolved and resolved decision detail while wayfinding is active.

Reference these artifacts instead of repeating their content. A decision may point to an ADR; the map and project record should keep only the short consequence or pointer they need.

Do not use `.omp/` or `.pi/` for repository domain state. Those are harness/runtime configuration directories, not shared project contracts.

## Layout

Default to one context:

```text
CONTEXT.md
docs/adr/
```

Use multiple contexts only when `CONTEXT-MAP.md` already exists or repository evidence shows independently owned domain languages:

```text
CONTEXT-MAP.md
packages/<context>/CONTEXT.md
packages/<context>/docs/adr/
docs/adr/
```

Create files lazily. Do not create an empty glossary, map, or ADR directory.

## Active discipline

### Challenge terms

When the user or code uses a word that conflicts with the glossary, surface the conflict immediately. When one word carries several meanings, name the distinct concepts.

Example: `account` might mean a billing customer, an authenticated user, or a ledger account. Those require different canonical terms.

### Stress-test scenarios

Use concrete edge cases to expose weak boundaries:

- Can one Order be partially cancelled?
- Can a User belong to several Customers?
- Does archival remove visibility, mutability, or both?
- Which identity survives a merge or migration?

Ask only questions whose prerequisites are settled. Facts come from current source and tools; human choices come from the user. Use `ask_question` in interactive Pi TUI sessions, and one structured plain-text question in non-interactive sessions.

### Cross-check current behavior

Verify claims against current code, schemas, tests, and project records. If language and executable behavior disagree, state the contradiction and ask which should become authoritative. Do not silently rewrite either side.

### Update terms when they crystallize

Once a term is resolved, update the owning `CONTEXT.md` in the same work rather than keeping a second scratch glossary.

Use this compact format:

```markdown
# Domain Context

## <Canonical term>
<One precise definition in domain language.>

- Distinct from: <nearby term and the difference>
- Invariants: <stable relationship or constraint, when useful>
- Examples: <one or two boundary-revealing examples, when useful>
```

Keep implementation paths, class names, database columns, API details, and workflow state out of the glossary. Link only when a deeper explanation is essential.

## ADR gate

Offer an ADR only when all three are true:

1. changing the decision later is meaningfully expensive;
2. a future engineer would reasonably ask why this choice was made;
3. real alternatives were considered and rejected for specific reasons.

If any condition is absent, keep the decision in its existing owner and do not create an ADR.

Ask before creating a new ADR unless the user explicitly requested one. Match the repository's numbering and naming convention. A minimal ADR contains:

```markdown
# <Decision title>

## Status
Accepted

## Context
<The force or problem that required a durable choice.>

## Decision
<The chosen direction.>

## Alternatives
<Serious alternatives and why they lost.>

## Consequences
<Benefits, costs, constraints, and follow-on obligations.>
```

## Grounding

Before changing canonical terms or recording a durable decision:

1. read the current glossary, project context, and applicable ADRs;
2. inspect current source, schemas, tests, and user-visible behavior;
3. use repository search/LSP to find existing consumers of the terms;
4. use Context7 or `web-research` only when an external technology or domain convention affects the choice;
5. separate observed behavior, intended language, inference, and user decision;
6. record contradictions instead of normalizing them silently.

## Integration with other workflows

- `project-init` may reference existing glossary and ADR locations but does not create a competing domain model.
- `wayfinder` uses domain modeling when a decision changes terminology or a durable tradeoff; the decision file remains the resolution source while the glossary or ADR records only its owned meaning.
- `program` and `do` consume canonical terms. They do not rename domain concepts ad hoc.
- `review` flags implementation or documentation that contradicts canonical vocabulary or an applicable ADR.

## Completion

Domain modeling is complete for the current decision when:

- each overloaded or conflicting term has one canonical meaning;
- important relationships survive concrete edge-case scenarios;
- current code or docs were checked for contradictions;
- the owning glossary was updated without implementation detail;
- any ADR passed all three gates and records real alternatives;
- no project, Wayfinder, or ADR content was duplicated into another authority.
