---
name: learn-codebase
description: Build or resume a reliable working model of a codebase using its persistent local repository index, then verify bounded evidence against current source. Use when asked to learn, prime, read, map, or get up to speed on a repository. Read every source file in full only when the user explicitly requests full-read mode.
---

# Learn Codebase

Build an accurate, reusable map without replaying the whole repository into every session. The native repository-context engine persists a local index across sessions and refreshes only changed files. `learn-codebase` uses that index to select current evidence; it does not inject or reread the entire repository.

## Persistent session model

Repository knowledge has three separate homes:

- The local repository index stores rebuildable file chunks, symbols, content hashes, and import relationships outside the prompt.
- Mnemopi stores prior task outcomes and a small number of stable, citation-backed project facts.
- Current `read` and LSP results remain authoritative for implementation decisions.

On a later session in an already indexed repository:

1. Let the native engine refresh changed, added, and deleted files automatically.
2. Query `repository_context` for the current architectural or task question.
3. Verify selected excerpts with `read`, LSP, tests, and configuration.
4. Expand only when evidence exposes a gap.

Do not repeat the original breadth-first survey merely because the session is new. Rebuild or comprehensively remap only when the repository is new, the index is unavailable, a major rewrite invalidated the prior map, or the user explicitly requests a fresh remap.

## Modes

### Default: mapped learning

Use this unless the user explicitly asks to read every source file in full.

1. Query `repository_context` for repository topology, entry points, runtimes, and boundaries.
2. Verify the highest-information results against manifests and current source.
3. Fill only unresolved map layers with `glob`, LSP, `grep`, and bounded reads.
4. Form concrete questions about the architecture.
5. Expand outward through definitions, references, imports, and runtime paths.
6. Stop when the requested working model is supported by cited evidence.

### Full-read mode: explicit opt-in only

Enter this mode only for an unambiguous request such as “read every source file in full.” Do not infer it from “learn the codebase,” “prime,” or “get up to speed.”

In full-read mode:

- Still create the breadth-first map first so coverage is measurable.
- Enumerate the source-file set and exclusions before reading.
- Read every included source file completely, paging large files with targeted `read` ranges.
- Track completed, excluded, generated, binary, vendored, and unreadable files.
- Never claim complete coverage while any included file remains unread.

## Workflow

### 1. Establish scope

Read `.omp/PROJECT.md` first when it exists. Treat it as confirmed project intent and preservation context, then verify its implementation claims against the current repository. Surface stale or contradictory claims explicitly; do not silently rewrite the record during codebase learning.

Query `repository_context` before broad filesystem discovery. Ask for repository topology, entry points, runtimes, boundaries, persistence, integrations, and verification paths. The persistent result is a candidate map, not proof. Verify its important paths with current source.

Use `glob` only for missing layers or when the repository index has no useful result. Identify:

- source roots and application entry points
- package/workspace manifests and lockfiles
- build, deployment, and runtime configuration
- tests, fixtures, migrations, schemas, and generated output
- documentation that explains architecture or conventions
- vendored, generated, cache, build, and dependency directories to exclude

Do not recursively list everything at once. Expand one directory level at a time, prioritizing directories that appear to contain owned source.

### 2. Build the breadth-first map

Create a compact map with these layers:

1. **Repository layer:** packages, services, apps, libraries, infrastructure.
2. **Runtime layer:** executables, servers, workers, jobs, CLIs, browser entry points.
3. **Boundary layer:** HTTP/API, database, queues, files, external services, authentication.
4. **Feature layer:** major domains and where their implementation and tests live.
5. **Verification layer:** test layout, local run commands, and release/deploy paths.

Prefer manifests, entry points, route registries, dependency wiring, schema declarations, and test configuration because they reveal more structure per read.

### 3. Ask evidence questions

Turn the map into questions such as:

- What starts the program and wires dependencies?
- Where does a request, command, or event enter and leave the system?
- Which modules own persistent state?
- Where are authorization and validation enforced?
- Which abstractions are public boundaries versus internal helpers?
- What tests define the important observable contracts?

Every implementation read must answer a named question, resolve a contradiction, or follow an observed dependency.

### 4. Read within a bounded frontier

For each question:

1. Use `lsp` workspace/document symbols when available.
2. Follow definitions, references, implementations, and call hierarchy.
3. Use `grep` for exact strings, configuration keys, routes, schema fields, and unsupported languages.
4. Use `glob` for file families and adjacent tests.
5. Use targeted `read` ranges that include the complete relevant construct and enough surrounding context to understand it.

Begin with a small frontier: normally 3–8 high-information files or constructs. Expand only when the evidence points to another file. Do not read whole large files merely because they were discovered.

### 5. Cross-check the model

For each important conclusion, seek at least two independent signals when practical, for example:

- entry-point wiring plus implementation
- route declaration plus handler
- schema plus persistence call
- production code plus test
- interface plus concrete implementation

Mark uncertainty explicitly. If names or comments disagree with behavior, trust executable code and tests, then report the conflict.

### 6. Deliver the codebase map

Report:

- repository and runtime topology
- key entry points and data/control flows
- major modules and ownership boundaries
- persistence and external integrations
- test strategy and operational paths
- conventions worth preserving
- open questions and risky unknowns
- evidence paths for every material claim

Do not provide a file-by-file diary. Synthesize the working model the next task needs.

### 7. Preserve only durable knowledge

The repository index persists source-derived context automatically. Do not retain source chunks or file inventories in Mnemopi.

At completion, identify facts that will materially improve future decisions: ownership boundaries, cross-file invariants, mandatory synchronization rules, security or persistence boundaries, non-obvious operational paths, and user-confirmed conventions. If at least one fact qualifies, make one bounded `retain` call containing no more than ten items; three to ten is normal, but never pad the set with weak observations.

Each retained item must state:

- the subject and verified fact;
- why the fact changes future implementation or review decisions;
- current evidence paths and symbols;
- the repository and branch scope when the fact is not repository-wide;
- content hashes when supplied by `repository_context`.

Do not retain transient branch state, complete topology inventories, line-number-only observations, generated content, or facts trivially rediscovered from one filename. If no fact clears the stability threshold, skip retention explicitly. On later recall, verify the cited source before relying on or repeating the fact.

## Guardrails

- Never claim to understand code you did not inspect.
- Never substitute filename inference for evidence.
- Avoid generated, vendored, dependency, cache, and build output unless the request specifically concerns them.
- Re-read changed files before relying on earlier observations.
- Use full-file reads for small, dense files when that is cheaper and clearer than fragmented reads.
- Full-read mode is user-requested, never automatic.

## Provenance

Adapted from the earlier `learn-codebase` workflow, with exhaustive reading retained as an explicit opt-in mode and mapped learning as the default.
