---
name: do
description: "Execute one approved plan or durable program manifest through pointer-first briefs, bounded Pi subagents, parent-owned integration, and acceptance verification. Use only after the work is approved."
disable-model-invocation: true
---

# Do Work

Execute approved work. `do` owns execution, integration, verification, and durable state transitions. It does not create a program, reinterpret product intent, or silently expand scope.

## Entry criteria

Accept either:

- an approved bounded plan; or
- an approved program manifest at the configured tracker or `.scratch/<slug>/program.json`.

If the work is not approved, is missing acceptance, or needs a product/architecture decision, stop and return to `program`, `wayfinder`, or the user. Do not create a program implicitly.

Read `AGENTS.md` and relevant `docs/agents/` context. Re-ground every durable pointer against current source immediately before execution. Current source wins over stale file paths; approved product truth wins over implementation convenience.

## Parent ownership

The parent session owns:

- canonical plan or program state;
- ticket claims and status transitions;
- frontier calculation;
- task briefs;
- subagent dispatch;
- integration into the parent workspace;
- acceptance verification;
- evidence recording;
- amendments and escalation.

Workers and reviewers never edit the manifest, tracker state, `AGENTS.md`, project record, spec, blocker graph, or another worker's target.

## Pointer-first brief

Every worker or reviewer receives pointers plus the exact current task, not copied plan bodies:

```text
# Target
Exact current files, symbols, or bounded surfaces; explicit non-goals.

# Change
Approved behavior and required migration or cleanup.

# Acceptance
Observable criteria and focused evidence required.

# Context pointers
Only canonical project, spec, program, ticket, research, prototype, and source references needed.
```

Re-resolve volatile paths, symbols, callers, tests, and commands in the parent immediately before dispatch. A durable ticket states an outcome; the parent turns it into the current target.

## Execution modes

### Inline by default

Execute inline when the ticket is small, when targets overlap, when discovery is shared, or when integration ordering is unclear. Inline execution avoids unnecessary context and delegation overhead.

### Subagent execution

Use the configured `pi-subagents` runtime only for a ticket that is independently executable and has a bounded brief. Use the custom roster:

```text
scout    read-only reconnaissance
worker   single approved implementation ticket
reviewer read-only adversarial verification
```

Activate the subagent tool only when delegation is authorized by the request, the approved program, or this workflow. Do not recursively delegate. Do not use arbitrary project-local agents without explicit trust and scope.

A worker may edit only its assigned target. A reviewer reads the integrated result and reports findings; it does not fix them. Prefer one worker per ticket, not one worker per file.

### Parallel frontier

Parallelize only tickets whose blockers are resolved and which have:

- disjoint write targets;
- no shared lockfile or generated registry;
- no shared migration or deployment sequence;
- no overlapping schema or public contract;
- no semantic ordering requirement;
- independently verifiable acceptance.

The parent must dispatch a bounded batch, with at most the configured concurrency, then integrate results one at a time. Isolation does not make merge order safe.

## Single-plan protocol

1. Convert approved acceptance items into ordered bounded work units.
2. Maintain a small session execution record only for transient ownership and evidence pointers; the approved plan remains canonical.
3. Re-ground the first unit against current source and repository conventions.
4. Execute inline or dispatch a bounded worker.
5. Integrate settled changes into the parent workspace.
6. Run focused acceptance verification in the parent workspace.
7. Apply one narrow corrective pass when evidence suggests a credible fix; keep the unit unfinished when evidence still fails.
8. Continue only after the current unit is verified.

## Program protocol

Canonical state lives in the approved tracker or `.scratch/<slug>/program.json`, never in a session transcript or `local://` artifact.

1. Validate schema version, unique ids, blockers, acyclic graph, statuses, and derived frontier.
2. Reconcile durable state with the integrated workspace. A completed ticket requires durable passing evidence. An abandoned running owner without evidence returns to pending.
3. Compute the pending, unblocked frontier.
4. If a ticket needs a product decision or its acceptance is invalid, mark it blocked or stale and return to the program amendment protocol.
5. Perform shared discovery once in the parent and record a bounded pointer.
6. Re-ground each runnable ticket and produce its pointer-first brief.
7. Mark ownership and status before dispatch.
8. Execute independent frontier tickets inline or through a bounded subagent batch.
9. Integrate each settled ticket into the parent workspace.
10. Verify every acceptance criterion in the parent before marking the ticket completed and recording evidence.
11. Recompute the frontier after every state change.
12. Run final integration verification across all approved outcomes and preservation obligations.

## Research and current best practice

When implementation exposes a library, framework, SDK, API, or CLI question that was not settled by `program`, stop before guessing. Use the parent grounding workflow:

```text
current source and repository patterns
→ Context7 for version-appropriate documentation
→ web-research for current ecosystem guidance when needed
→ Firecrawl only when ordinary retrieval is insufficient
```

Record the evidence and return a material product or architecture change to `program` or `wayfinder`. Do not let a worker silently introduce a new abstraction, retry policy, validation layer, or compatibility contract because a generic article suggested it.

## Conflict and failure handling

A child that discovers the approved outcome, acceptance, verification seam, or dependency graph is wrong must stop and report the conflict. It may not reinterpret intent.

For a failed child:

- preserve its changes only if they are safe and within the assigned scope;
- do not mark its ticket completed;
- record the failure evidence;
- use one narrow corrective pass when a credible correction exists;
- return to `program` when the contract or decision is wrong;
- return to the user when authorization or external action is required.

Do not hide failed verification with a fallback, skipped check, or status edit.

## Runtime boundaries

Use the installed Pi tools and configured `pi-subagents` runtime. Never launch another coding-agent runtime through shell. Do not commit, push, create or update a PR, publish, release, deploy, or send external messages unless the user separately authorizes that action.

Workers skip project-wide validation. The parent runs focused verification after integration and the final approved verification once at the end. Do not require a clean working tree or discard unrelated user changes.

## Completion

Execution is complete only when:

- every approved acceptance criterion has integrated evidence;
- affected callers and obsolete paths are handled;
- the final changed behavior is exercised;
- all required review or QA evidence is recorded;
- canonical program state matches the workspace;
- no unresolved decision or external blocker is hidden;
- the final report names changed surfaces, verification, unverified areas, and remaining risks.
