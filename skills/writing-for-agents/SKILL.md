---
name: writing-for-agents
description: Design or revise documents consumed by coding agents, including AGENTS.md, CLAUDE.md, SKILL.md, RULES.md, and documents reached through context pointers. Use when creating or revising persistent agent instructions or skills.
---

# Writing for Agents

Write agent instructions as executable operating contracts. Optimize for predictable behavior with the least always-loaded context.

## Start with the consumer

Before editing, identify:

- which agent or workflow reads the document;
- when it loads: every session, by path, or only after a skill trigger;
- which distinct branches it must handle;
- which existing source owns each fact or rule;
- what observable behavior should change.

A document without a clear consumer or invocation condition is usually the wrong artifact.

## Context pointers

A strong pointer front-loads the trigger, names each branch once, states what the target contains, and avoids repeating identity or explanation already present there. A required document behind a vague pointer is a reliability bug.

## Spend the correct load

Keep global and root instructions small. Put conditional procedures and reference material behind skills, nested instructions, or precise pointers. Do not cache facts already available from the environment unless lookup is expensive or the non-obvious usage rule matters.

## Information hierarchy

1. In-file steps: actions in order.
2. In-file reference: rules every branch needs.
3. Disclosed reference: branch-specific material behind a precise pointer.

Split only at a real invocation or sequence boundary. Keep a concept's definition, rules, caveats, and completion criteria together.

## Steps and completion

Every step needs a checkable completion criterion. Prefer exhaustive bounds such as every changed caller checked, one owned block preserved, and the original reproduction no longer failing. Replace vague endings such as "understand" or "make robust" with observable checks.

State desired behavior positively. Use prohibitions only for hard safety boundaries and pair them with the safe action.

## File-specific contracts

### Root AGENTS.md

Use for team-shared, harness-neutral contracts: system properties that must survive, exact setup and verification commands, stable architecture and ownership, integration boundaries, commonly missed checks, hazards, protected state, safe fixtures, vocabulary, and pointers to deeper material.

Exclude file inventories, generic style advice, temporary plans, branch state, ticket status, long API references, personal preferences, and duplicated README or configuration content. Keep it under 200 lines when practical.

### RULES.md

Use for short persistent hard constraints that apply to every relevant operation. Do not move long background or conditional procedures into it.

### SKILL.md

The description owns invocation and must name the real trigger branches. The body owns execution and completion. Make side effects and authorization boundaries explicit. Load supporting files only on the branch that needs them. Do not duplicate global tool policy or repository instructions.

## Revision procedure

1. Read the complete target and every authoritative source it points to.
2. State the consumer, trigger branches, and intended behavior change.
3. Map each section to keep, disclose, move, rewrite, or delete.
4. Write positive ordered steps with checkable completion criteria.
5. Consolidate duplicated meanings and sharpen pointers.
6. Check conflicts with broader and narrower instruction files.
7. Verify markers, imports, links, and surrounding content.
8. Re-read as the consuming agent and confirm it can choose a branch without guessing.

## Completion

The edit is complete when every trigger branch has one clear route, every required step has a checkable end, no meaning is duplicated across authoritative files, always-loaded text contains only stable broadly applicable guidance, and conditional detail is reachable through a precise pointer. Preserve existing user content and instruction precedence.
