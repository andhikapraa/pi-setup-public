---
name: smart-explore
description: "Explore focused code questions efficiently by choosing the smallest reliable retrieval path: repository context, LSP when available, exact search, context-mode analysis, and targeted reads. Use to find implementations, trace callers, understand large files, or answer focused architecture questions without loading unrelated code."
---

# Smart Explore

Choose the cheapest precise retriever first, then read the smallest complete current-source units that prove the answer.

## Procedure

1. **Frame the question.** Name the concrete target: symbol definition, callers, runtime flow, file responsibility, configuration, or behavior test. Split broad questions into named subflows.
2. **Choose the first retriever.**
   - Known symbol, path, error, route, field, or config key: use exact search or LSP if the project exposes one.
   - Conceptual ownership or cross-module flow: query repository context if available, then verify candidates against current source.
   - Large or structured output: when context-mode is installed, use `ctx_execute`, `ctx_execute_file`, or `ctx_batch_execute` and print only the derived answer; otherwise filter with `rg`, `jq`, `head`, or a short script before reading.
   - Broad repository mapping: use the repository's mapping workflow instead of expanding a focused exploration into a survey.
3. **Search narrowly.** Start at the relevant source root or file family. Broaden only when the result is empty or suspiciously incomplete. Use exact search for strings, errors, routes, flags, serialized fields, templates, scripts, and unsupported languages.
4. **Follow structure.** When LSP is available, prefer workspace/document symbols, definition, type definition, references, implementations, call hierarchy, and hover. Cross-check generated code, templates, configuration, dynamic dispatch, or reflection manually.
5. **Read complete constructs.** Read the complete function, method, class, declaration, config block, or document section identified by discovery. Include imports, types, decorators, nearby helpers, tests, and boundary adapters when they affect meaning.
6. **Synthesize.** Return symbols and roles, the traced data/control flow, current evidence paths and ranges, uncertainty, and only the next narrow read when genuinely required.

## Context-mode rule

When context-mode is installed, use it for logs, large JSON/CSV/API responses, many files, repository statistics, and analysis that would otherwise flood the conversation. Use direct reads and edits for small targeted inspection and files that need modification. Prefer one batch or sandbox call when it replaces several independent reads. Do not use context-mode merely because it exists.

## Impact checks

For a changed public symbol, find its callers and implementations. Search sibling enum values, config keys, serialized fields, registrations, and tests. Inspect trust, persistence, concurrency, and UI boundaries. Current source, tests, configuration, and runtime behavior outrank index excerpts or remembered context.

## Fallbacks

If repository context is unavailable or narrow, use exact search and targeted reads. If LSP is unavailable or stale, search identifiers and related strings, inspect imports/exports/registrations, and cross-check tests manually. Never treat an empty index or semantic result as proof that no path exists.

## Guardrails

- Do not read a large file or whole repository by default.
- Do not treat a symbol name as proof of behavior.
- Do not miss non-code configuration or schemas controlling the path.
- Re-ground after edits or file changes.
- Do not turn focused exploration into full repository mapping.
- Do not add speculative abstractions, validation, retries, or unrelated cleanup while exploring.

## Completion

Exploration is complete when the relevant construct and governing context are current, callers and boundary consumers are checked where relevant, and the answer is synthesized with evidence rather than raw tool output.
