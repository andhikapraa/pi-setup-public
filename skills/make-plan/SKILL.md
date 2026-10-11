---
name: make-plan
description: "Create a source-verified implementation plan when an external library, SDK, API, CLI, cloud service, or version-specific behavior is load-bearing. Use for documentation facts the repository cannot establish alone; use normal planning when local evidence is sufficient."
disable-model-invocation: true
---

# Make Plan

Produce an implementation plan whose external assumptions are verified against current primary documentation. This workflow is for documentation-dependent planning, not generic repository planning.

## Routing boundary

Use this workflow only when external or version-specific facts materially determine implementation, such as SDK signatures, framework migration behavior, cloud bindings, CLI flags, protocol constraints, or deprecated APIs.

Use normal planning when repository evidence is sufficient. Use `wayfinder` when product or architecture choices remain unresolved. Use `program` when the decision-complete plan needs durable multi-session state and vertical slices.

## Establish local constraints first

Read `AGENTS.md` and relevant `docs/agents/` files. Inspect actual dependency versions, lockfile, runtime configuration, language, platform, and nearby implementation patterns before researching external APIs.

Documentation for the wrong version is not evidence. Resolve the installed or targeted version before accepting a signature, example, flag, default, or compatibility promise.

## Research load-bearing facts

Use the existing Pi research routes:

- Context7 for libraries, frameworks, SDKs, APIs, CLIs, and version-specific configuration;
- known official URLs through `read`;
- Exa via `web-research` for current primary-source discovery and ecosystem constraints;
- source repositories when official documentation is incomplete;
- Firecrawl only for deeper corroboration, rendered docs, PDFs, or structured extraction.

Research inline by default. Do not assume a task-subagent runtime for documentation work. If independent research truly benefits from concurrency, use the configured `pi-subagents` runtime only with bounded read-only agents and synthesize in the parent.

Retry empty or implausibly narrow documentation results with a different source or query. Never invent a method, parameter, flag, default, or compatibility promise because it would be convenient.

## Evidence ledger

Before planning edits, record only facts that change the plan:

| Fact | Allowed API or behavior | Version or environment | Primary source | Guardrail |
|---|---|---|---|---|
| <load-bearing question> | <exact signature, flag, default, or constraint> | <qualification> | <URL or repository path> | <deprecated or unsupported alternative> |

Separate established facts from inference. Resolve conflicts in favor of the source that owns the behavior, normally current official documentation or source for the exact version.

Do not create a repository research note unless the user requests one or a durable `program` needs the pointer. Cite sources directly in the plan.

## Produce the plan

Return a normal Pi implementation plan with ordered phases. Every implementation item includes:

- **Target:** current repository areas or contracts affected, grounded in live source;
- **Change:** observable behavior or integration change, using only verified external APIs;
- **Documentation:** exact source pointers supporting load-bearing calls, fields, flags, or configuration;
- **Acceptance:** behavioral evidence, focused test, or smoke scenario proving the contract;
- **Guardrails:** version mismatches, deprecated paths, undocumented parameters, or unsafe examples to avoid.

Prefer an established current repository pattern over an imagined abstraction. Keep source pointers close to the phase that consumes them so later `do` or `program` contexts do not repeat discovery.

## Approval and handoff

For an ordinary bounded plan, present the plan in the parent session and wait for explicit user approval before implementation. In interactive TUI, use `ask_question` only for a material approval or unresolved choice; in non-interactive mode, request explicit plain-text approval.

After approval:

- execute bounded work through `do`; or
- convert decision-complete multi-session work into `program`;
- do not silently create a durable program from a normal plan.

## Final verification phase

The plan must verify:

1. project versions still match the researched documentation;
2. implemented calls and configuration use only supported signatures;
3. known deprecated or invented patterns are absent;
4. the real changed path works through its observable verification scenario.

## Completion

The plan is complete when:

- every load-bearing external claim has a primary source and version qualification;
- repository versions and conventions were checked first;
- research confirmed or changed concrete plan steps rather than becoming a bibliography;
- phases are executable through `do` or convertible to `program` without repeating documentation discovery;
- unresolved human decisions are explicit rather than hidden inside implementation phases.
