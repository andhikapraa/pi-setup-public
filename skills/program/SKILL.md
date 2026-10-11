---
name: program
description: "Turn decision-complete multi-session work into one approved durable program of dependent, demoable vertical slices. Use when product and technical choices are settled but delivery needs persistent state, verification seams, blocker edges, amendments, and execution across contexts or implementers."
disable-model-invocation: true
---

# Program

Collapse settled product truth into one durable execution graph, then hand the approved frontier to `do`. Program is planning and approval, not implementation.

## Entry criteria

Use Program only when:

- the destination and observable behavior are settled;
- material product, architecture, migration, and operational choices are resolved;
- the work spans multiple sessions or implementers;
- delivery can be expressed as dependent, independently verifiable outcomes.

If specification-blocking fog remains, use `wayfinder`. If the work fits one focused execution unit, use normal planning. Do not create a program merely because the project is large.

## Authority and storage

Read `AGENTS.md` and the relevant files under `docs/agents/`, especially `project.md`, domain rules, and tracker contract. Read the completed Wayfinder map and linked decision records when one exists. Current source, tests, configuration, and runtime behavior remain authoritative for implementation facts.

Canonical state is either an explicitly authorized tracker record or:

```text
.scratch/<slug>/program.json
```

An optional:

```text
.scratch/<slug>/spec.md
```

is justified only when multiple sessions or implementers need one durable narrative. Do not use `.omp/` or `.pi/` for repository program state. `local://` is session-scoped and never canonical.

## Verification seam

Before decomposing, identify the highest existing seam that can prove the destination through observable behavior. Prefer one public module, request boundary, CLI, user journey, or other stable interface over many low-level tests.

Record:

- the behavior the seam proves;
- prior repository evidence for the convention;
- any missing seam requiring a bounded prefactor ticket;
- acceptance criteria requiring browser, CLI, integration, migration, security, or operational proof.

Do not invent seams solely to make ticketing convenient.

## Optional durable spec

## Ground implementation decisions before decomposition

Before turning approved decisions into tickets, perform a bounded implementation-grounding pass. This is not a new product-decision phase; it verifies that the chosen implementation follows current repository and library practice.

1. Re-read the relevant current source, callers, schemas, tests, configuration, and runtime boundaries.
2. Identify every library, framework, SDK, API, and CLI whose usage affects the program.
3. Use Context7 to check current, version-appropriate syntax, constraints, and recommended implementation patterns for those technologies.
4. Use `web-research` with Exa for current ecosystem constraints or primary guidance that Context7 does not cover. Use Firecrawl only when direct retrieval is insufficient.
5. Record bounded evidence pointers and separate repository facts, documentation facts, inference, and decisions.
6. Reconcile the result with the approved destination. If best-practice research exposes a material conflict with a settled decision, stop and return it to `wayfinder` or an amendment gate rather than silently changing the program.

Do not invent a new abstraction, compatibility layer, retry policy, validation layer, or test seam merely because a generic best-practice article mentions it. Apply current guidance only when it improves the approved observable outcome within the stated scope.

When a spec has a real consumer, keep it decision-rich and implementation-light:

```markdown
# <Program title>

## Problem
<User or operational problem.>

## Destination
<Observable completed state.>

## Outcomes
<Numbered user, system, migration, or operational outcomes.>

## Implementation decisions
<Settled module, contract, schema, compatibility, and architecture choices.>

## Testing decisions
<Verification seams, observable behavior, prior art, and environment requirements.>

## Out of scope
<Explicit exclusions and accepted deferrals.>

## Context pointers
<Project, Wayfinder decisions, ADRs, prototypes, and source evidence.>
```

Avoid volatile file paths and working code. Include a small state machine, reducer, schema, or type shape only when an approved prototype makes prose materially less precise.

## Manifest schema

Use schema version 1:

```json
{
  "schemaVersion": 1,
  "slug": "string",
  "title": "string",
  "status": "draft | approved | running | blocked | completed",
  "durableStore": ".scratch/<slug>/program.json",
  "approvalRevision": 0,
  "decisions": [{
    "id": "string",
    "revision": 1,
    "summary": "string",
    "rationale": "string"
  }],
  "tickets": [{
    "id": "string",
    "title": "string",
    "outcome": "string",
    "acceptance": ["string"],
    "blockedBy": ["ticket-id"],
    "status": "pending | running | blocked | stale | completed",
    "owner": "string or null",
    "blockReason": "string or null",
    "evidence": ["string reference"]
  }]
}
```

Validate before approval and execution:

- slug, title, ticket titles, outcomes, and acceptance criteria are non-empty;
- ids are unique;
- every blocker exists, is not self-referential, and the graph is acyclic;
- unfinished approved/running work has a derived pending frontier unless genuinely blocked;
- readiness is derived from status and blockers, never separately asserted;
- stale tickets cannot run until an approved amendment returns them to pending;
- blocked tickets have a concrete external block reason;
- decision revisions are positive and do not exceed `approvalRevision`;
- completed means every ticket is completed.

## Decompose as tracer bullets

1. Re-ground current repository conventions and the selected verification seam.
2. Define each ticket as one-context-sized, end-to-end behavior that is demoable or verifiable.
3. Write acceptance as observable outcomes and evidence requirements, not internal steps.
4. Keep volatile paths and symbols out of durable tickets; `do` resolves exact targets immediately before execution.
5. Add a prefactor only when it creates the correct seam or makes the approved change safer, with its own acceptance.
6. Do not split by backend, frontend, database, or tests. A ticket cuts through every layer needed for one outcome.
7. For wide refactors, use expand-contract. Keep each migration batch independently valid where possible.
8. Add only genuine blocker edges.
9. Present decisions, seams, outcomes, acceptance, and blocker graph together for approval.

## Approval

Use `ask_question` for one approval gate in interactive TUI sessions. Offer one to three meaningful options, with approval first. In non-interactive mode, present the complete program and ask for explicit plain-text approval; do not assume approval.

Approval authorizes execution of approved tickets through `do`. It does not authorize commits, pushes, PRs, releases, deployment, external tracker mutation beyond the explicitly approved store, or later product changes.

On approval:

- set `approvalRevision` to 1;
- set status to `approved`;
- persist the exact approved manifest and optional spec;
- report the initial frontier.

## Amendments and invalidation

Implementation discoveries that preserve approved outcomes, acceptance, and dependencies may be recorded as ticket evidence.

A changed product decision, ticket outcome, acceptance criterion, verification seam, or blocker graph requires user approval:

1. append the changed decision and rationale;
2. increment `approvalRevision`;
3. update affected outcomes, acceptance, and edges;
4. mark affected unfinished tickets stale;
5. revalidate graph and frontier;
6. after approval, return valid stale tickets to pending;
7. mark a completed ticket stale only when its evidence no longer satisfies the amended contract.

## Handoff to do

Hand `do` pointers to the manifest, optional spec, project record, Wayfinder map, prototype decision, and initial frontier. Do not duplicate those documents into child briefs. `do` owns execution, integration, verification, and canonical state transitions.

Do not assume a task-subagent runtime. `do` executes inline by default and may use only an explicitly available bounded mechanism for independent work. Program tickets remain outcomes, not agent prompts.

## Completion

Program creation is complete only when:

- the manifest is valid and durable;
- all tickets have observable outcomes and acceptance;
- the graph is acyclic and frontier is derived;
- the verification seam is named;
- user approval is recorded;
- the handoff to `do` is explicit;
- no implementation has started as part of program creation.
