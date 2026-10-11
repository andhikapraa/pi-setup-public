---
name: wayfinder
description: "Map and resolve specification-blocking decisions for a large multi-session effort whose route is still obscured by fog. Use only while the destination cannot become a decision-complete plan or program. Produces decisions and evidence, not production implementation."
disable-model-invocation: true
---

# Wayfinder

Wayfinder finds the route to a named destination. It owns unresolved decisions and their dependencies; it does not decompose or execute the build.

## Entry boundary

Use Wayfinder only when all are true:

- the effort is too large or uncertain for one focused planning context;
- a concrete destination can be named;
- product, architecture, migration, or operational choices still block a buildable specification.

If the route is clear, use `program` for decision-complete multi-session delivery or normal planning for bounded work. Do not create a map merely because the project is large.

## Context

Read `AGENTS.md`, then the relevant files under `docs/agents/`, including `project.md`, `issue-tracker.md`, and `domain.md` when present. Read `CONTEXT.md`, `CONTEXT-MAP.md`, and applicable ADRs. Return foundational contradictions to `project-init` instead of choosing silently.

Use `../domain-modeling/SKILL.md` only when terminology or an ADR-level tradeoff actively changes. Use `../prototype/SKILL.md` only when runnable behavior or visible alternatives are needed.

## Durable storage

Use the repository's configured tracker only when the user explicitly authorizes creating or updating remote map and decision records. Otherwise use:

```text
.scratch/<slug>/wayfinder.md
.scratch/<slug>/decisions/<NN>-<decision-slug>.md
```

Do not use `.omp/` or `.pi/` for repository state. Local files are canonical when no tracker is authorized. Postplan URLs and session artifacts are evidence pointers, not canonical state.

### Map

The map is a low-resolution index, not a duplicate of decision detail:

```markdown
# <Destination title>

## Destination
<Concrete state this effort is making specifiable.>

## Notes
<Constraints, source pointers, relevant skills, and operating context.>

## Decisions so far
- [<Resolved decision name>](<durable pointer>): <one-line consequence>

## Not yet specified
<In-scope fog that cannot yet be phrased precisely.>

## Out of scope
<Work explicitly beyond this destination, with rationale.>
```
## Ground the effort before discussing decisions

For implementation planning, complete a bounded grounding pass before mapping fog or asking architecture and technology questions. This is a planning prerequisite, not a research ticket.

1. Read repository instructions and current project context.
2. Inspect the relevant source, callers, schemas, tests, runtime boundaries, and existing patterns with `learn-codebase`, `smart-explore`, `read`, and available code-search tools.
3. Identify libraries, frameworks, SDKs, APIs, CLIs, and external technologies that materially affect the route.
4. Use Context7 for current library, framework, SDK, API, and CLI guidance.
5. Use `web-research` with Exa when current technology practice, ecosystem constraints, comparisons, or maintainer guidance are needed.
6. Use Firecrawl only when direct retrieval or ordinary search is insufficient, such as multi-page extraction, rendered documentation, PDFs, or Research Index paper work.
7. Record bounded evidence pointers and separate observed facts, sourced facts, inference, and unresolved choices.

Do not present an architecture or technology recommendation as grounded until the relevant repository context and current technology guidance have been checked. If the user explicitly asks for an opinion-only discussion, state that research was not performed and do not present the opinion as researched.

Facts are tool work, not user questions. Ask the user only for product preferences, risk acceptance, or other choices that evidence cannot settle.

Resolved detail lives once, in its decision file or authorized tracker resolution. The map stores only a gist and pointer.

### Decision files

Each decision is one focused question:

```markdown
# <Decision name>

- id: <stable-id>
- type: research | grilling | prototype | task
- status: pending | running | blocked | resolved | out-of-scope
- claimedBy: <owner or null>
- blockedBy: [<decision-id>]
- resolution: <empty while open; durable pointer when resolved>

## Question
<One precise question whose answer advances the specification.>
```

Every blocker must exist, no decision may block itself, and the graph must be acyclic. A frontier decision is pending, unclaimed, and has only resolved blockers. Refer to decisions by linked names in prose; keep ids for machine state.

## Ticket types

- **research:** Fact-finding through repository tools, `web-research`, Context7, Firecrawl, or primary sources. It does not require a human interview.
- **grilling:** One human choice that cannot be inferred. Use `ask_question` in interactive TUI sessions. In non-interactive mode, ask one structured plain-text question and wait for the user's reply. Never answer for the user.
- **prototype:** A cheap runnable or visible artifact needed to make a behavior choice concrete. Invoke `../prototype/SKILL.md` and record the resulting evidence.
- **task:** Prerequisite work that makes a decision answerable, such as obtaining access or measuring an option. It must not deliver the destination implementation. A task ticket is not a task-subagent request.

Do not install a task-subagent extension for ordinary Wayfinder work. Use direct Pi tools for bounded prerequisites. Parallelize only independent research when a real bounded mechanism is available; researchers must write evidence to their decision record and must not mutate the map directly.

## Fog of war

Map breadth-first and distinguish:

- **Decision ticket:** precise question can be stated now, even if blocked.
- **Not yet specified:** in scope, but nearer decisions are required before the question can be phrased precisely.
- **Out of scope:** beyond the named destination and never graduates unless the destination is redrawn.

Do not pre-slice fog into speculative tickets. A resolved decision may reveal several new decisions, one, or none.

## Chart the map

Charting is one focused session and resolves no human decision.

1. Name the destination.
2. Confirm that real fog exists. If the route is already specifiable, stop and route to `program` or normal planning.
3. Ask only currently unblocked human choices. Use `ask_question` with one to three meaningful options and put the recommendation first. Do not ask questions whose prerequisites remain open. Facts are tool work.
4. Draft the map with known decisions, precise open tickets, future fog, and exclusions.
5. Persist local state only as part of this explicitly invoked workflow.
6. Before remote tracker mutation, present the map, ticket names, types, and blocker graph and obtain explicit authorization.
7. Create decision identities before wiring blockers.
8. Stop after charting. Do not hand-resolve a decision in the charting session.

## Work through the map

Resolve one decision ticket per focused session. Independent research is the only exception.

1. Load the map's Destination, Notes, Decisions so far, fog, and exclusions. Do not load every ticket body.
2. Select a named frontier decision, using the user's named decision or the first available frontier item.
3. Claim it before work by setting `claimedBy` and `status: running`. Re-read the file immediately before writing to avoid overwriting another claim.
4. Load only related decisions and evidence.
5. Resolve by type:
   - research: use current repository and web/documentation tools;
   - grilling: call `ask_question` in TUI, or ask structured plain text otherwise;
   - prototype: invoke `../prototype/SKILL.md`;
   - task: perform only the prerequisite action and record its result.
6. Record the answer, rationale, and evidence. Set `resolution`, mark resolved, and clear the claim.
7. Append one linked gist to `Decisions so far`; do not duplicate the full answer.
8. Recompute the frontier. Graduate newly precise fog into decisions and wire blockers.
9. Mark work beyond the destination out-of-scope with one linked rationale.

## Interaction contract

`ask_question` is available only in interactive Pi TUI sessions. It accepts one question and one to three options, with a custom-answer path. In `pi -p`, RPC, or another non-interactive mode, it cannot open UI; ask one plain-text question instead and wait for the user's response. Never silently choose a material human decision because the UI is unavailable.

## Completion

Wayfinding is complete when no unresolved decision blocks a decision-complete specification and no in-scope fog prevents decomposition. Report:

- settled Destination;
- linked decision gists and binding constraints;
- remaining non-blocking exclusions;
- durable map location;
- why the work is ready for `program` or, if small, normal planning.

Wayfinder stops before implementation. It does not commit, push, create a PR, deploy, or promote prototype code into production.
