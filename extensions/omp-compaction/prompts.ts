// Origin: OMP 18.1.16 pi-agent-core/src/compaction/prompts/*.md, copied verbatim as string
// constants because Pi's jiti loader can't import `.md` with `{ type: "text" }`.

/** handoff-document.md */
export const HANDOFF_DOCUMENT_PROMPT = `<critical>
Write a handoff document for another instance of yourself.
The handoff MUST be sufficient for seamless continuation without access to this conversation.
Output ONLY the handoff document. No preamble, no commentary, no wrapper text.
</critical>

<instruction>
Capture exact technical state, not abstractions.
- File paths, symbol names, commands run
- Test results, observed failures
- Decisions made
- Partial work affecting the next step
Register: address the successor directly in the imperative ("Fix X", "Run Y") — never first person ("I need to…", "my attempt…").
The handoff mechanism is invisible to the document: NEVER list writing, generating, or delivering a handoff/summary/context document as progress or a next step. Progress and Next Steps cover the user's task only.
</instruction>

<output>
Use exactly this structure:

## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]

## Progress
### Done
- [x] [Completed tasks with specifics]

### In Progress
- [ ] [Current work if any]

### Pending
- [ ] [Tasks mentioned but not started]

## Key Decisions
- **[Decision]**: [Rationale]

## Critical Context
- Code snippets, file paths, function/type names, error messages, data essential to continue
- Repository state if relevant

## Next Steps
1. [What should happen next]
</output>

{{#if additionalFocus}}
<instruction>
Additional focus: {{additionalFocus}}
</instruction>
{{/if}}
`;

/** handoff-summary-context.md */
export const HANDOFF_SUMMARY_CONTEXT_PROMPT = `Context replaced. The <handoff> below is a handoff document a prior instance of you wrote from the full conversation. It is your own working memory, not user input.
- First person inside it refers to you (the prior instance).
- "Next Steps" is your own resumed plan; re-check it against the latest user message before acting.
- The handoff already exists and is complete: NEVER write another handoff document unless the user explicitly asks.
MUST build on prior work; NEVER duplicate prior work.

<handoff>
{{summary}}
</handoff>
`;
