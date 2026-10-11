---
name: project-init
description: "Explicitly initialize or refresh a repository's shared engineering context, tracker contract, domain-doc layout, and optional durable project record. Use only when the user asks to bootstrap, adopt, initialize, or define a major rewrite. Do not invoke automatically for ordinary features, fixes, or exploration."
disable-model-invocation: true
---

# Project Init

Create the smallest durable repository contract that future agents and engineers can trust. This workflow is explicit and approval-gated. It does not scaffold application code or configure external systems.

## Modes

Select exactly one from the request and repository evidence:

- **Instructions:** refresh shared `AGENTS.md` guidance only.
- **Greenfield:** capture destination, users, constraints, decisions, and open questions for a new project.
- **Adoption:** document how an incumbent repository works without proposing a rewrite.
- **Brownfield rewrite:** record the current baseline, preservation contract, accepted breakage, and migration constraints for a major rewrite or replatform.

Use `learn-codebase` for understanding an existing repository without initialization. Route unresolved specification-blocking choices to `wayfinder`; route decision-complete multi-session delivery to `program`.

## Repository contract


Prefer these harness-neutral, committed files:

```text
AGENTS.md                         # canonical shared instructions
docs/agents/issue-tracker.md     # tracker contract
docs/agents/domain.md             # domain-doc layout and consumer rules
docs/agents/project.md           # optional durable project record
docs/agents/triage-labels.md     # only when a triage consumer exists
```

Do not write project-init output to `.omp/` or `.pi/`. Those directories are harness/runtime configuration, not shared repository contracts.

`AGENTS.md` is the canonical shared contract. Preserve `CLAUDE.md` and other harness files. Add a bridge only with explicit approval and only when it does not duplicate shared rules.

Existing product docs, `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, contribution guides, and instruction files remain authoritative for the facts they own. Reference them; do not create competing copies.

## Workflow

### 1. Inspect

Read the smallest evidence set that establishes the current contract:

- `AGENTS.md`, `CLAUDE.md`, and existing `docs/agents/` files;
- existing `CONTEXT.md`, `CONTEXT-MAP.md`, ADRs, architecture and contribution docs;
- manifests, lockfiles, CI/build/test/deployment/runtime configuration;
- repository metadata only to identify the existing issue workflow;
- monorepo signals and source boundaries when the selected mode needs them.

For Adoption or Brownfield, load `../learn-codebase/SKILL.md` and use mapped learning. Do not full-read the repository unless explicitly requested. Read `../writing-for-agents/SKILL.md` before drafting agent-facing files.

Detect whether the repository already uses a tracker, domain layout, generated setup, or triage consumer. Do not ask for facts that current files or tools establish.

### 2. Separate evidence from choices

Label each material statement as one of:

- **Observed fact:** supported by current repository files, configuration, runtime behavior, or supplied documents.
- **Confirmed decision:** explicitly supplied or approved by the user.
- **Open decision:** a material human choice not settled by evidence.
- **Inference:** provisional; do not write as durable truth without confirmation.

### 3. Propose

Before writing, show one compact proposal containing:

- selected mode and evidence;
- files to create or update;
- owned-block insertion locations;
- tracker choice and domain-doc layout;
- any `docs/agents/project.md` destination, constraints, or preservation sections;
- open decisions and risks.

Ask for approval unless the original request explicitly authorizes initialization and supplies every material answer. Never silently choose product, migration, tracker, credential, or safety tradeoffs.

### 4. Write approved files

Use these rules:

- update owned blocks in place; never append duplicates;
- preserve every line outside an owned block;
- use `docs/agents/issue-tracker.md` for the tracker contract;
- use `docs/agents/domain.md` for single-context or multi-context rules;
- use `docs/agents/project.md` for Greenfield, Adoption, or Brownfield durable context;
- create `docs/agents/triage-labels.md` only when a triage skill or equivalent consumer exists;
- use `templates/` in this skill as seed material, adapting facts to the repository;
- never write secrets, credentials, private tokens, or invented facts.

Tracker choices may be GitHub, GitLab, local Markdown under `.scratch/`, or another user-described workflow. Record the workflow; do not create remote issues, labels, projects, remotes, credentials, or tracker configuration.

Default domain layout is single-context: root `CONTEXT.md` plus `docs/adr/`. Offer multi-context only when repository evidence shows a real monorepo need. Do not create empty domain docs merely to satisfy the setup.

### 5. Validate

Verify:

- each generated file is approved and repository-specific;
- `AGENTS.md` owned content appears exactly once;
- no surrounding content was lost;
- tracker, domain, and project docs match actual repository conventions;
- durable project records contain no placeholders;
- no external system or application state changed;
- rerunning the workflow would update in place rather than duplicate content.

### 6. Retain and route

Retain no source inventory in memory. If useful, retain only a few durable facts such as the canonical instruction file, tracker, domain layout, ownership boundary, or preservation invariant, with repository paths as evidence.

Route next:

- unresolved specification-blocking choices → `wayfinder`;
- decision-complete multi-session work → `program`;
- bounded decision-complete feature/fix → normal planning;
- instructions or adoption complete without implementation → stop.

## Non-goals

Do not scaffold production code, choose a framework, install packages, create infrastructure, mutate external trackers, create remote labels, overwrite existing instruction files, or turn observations into approved product truth.

## Completion

The workflow is complete only when the approved repository files are written, their boundaries and idempotency are verified, evidence and open decisions are explicit, and the next workflow is named.
