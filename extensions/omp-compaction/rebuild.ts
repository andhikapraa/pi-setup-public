// Origin: OMP 18.1.16 pi-agent-core/src/compaction/messages.ts:140-168,197-221 (how a
// compactionSummary becomes model input: snapcompact blocks; handoff wrapper).
// Local changes: Pi renders every compaction as text-only with its own prefix, so a `context`
// handler swaps the summary message per request for extension compactions.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ContextEvent, ContextEventResult, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { HANDOFF_SUMMARY_CONTEXT_PROMPT } from "./prompts.ts";
import { latestCompaction } from "./soft.ts";
import { snapcompactContent } from "./snapcompact/run.ts";
import { renderPrompt } from "./vendor/prompt.ts";

/**
 * Replace the compaction summary with OMP's model-facing form: snapcompact → summary text +
 * archive head/frames/tail as a user message; handoff → handoff-summary-context wrapper.
 * Only the latest compaction is in context, so matching its summary text is exact.
 */
export function rebuildCompactionContext(event: ContextEvent, ctx: ExtensionContext): ContextEventResult | undefined {
	const latest = latestCompaction(ctx.sessionManager.getBranch());
	const method = latest?.details?.omp.method;
	if (!latest || (method !== "snapcompact" && method !== "handoff")) return undefined;

	const index = event.messages.findIndex(m => m.role === "compactionSummary" && m.summary === latest.entry.summary);
	if (index === -1) return undefined;
	const original = event.messages[index];
	if (!original) return undefined;

	const archive = latest.details?.omp.archive;
	const content =
		method === "snapcompact" && archive
			? snapcompactContent(latest.entry.summary, archive)
			: [{ type: "text" as const, text: renderPrompt(HANDOFF_SUMMARY_CONTEXT_PROMPT, { summary: latest.entry.summary }) }];
	if (method === "snapcompact" && !archive) return undefined;

	const replacement: AgentMessage = { role: "user", content, timestamp: original.timestamp };
	const messages = [...event.messages];
	messages[index] = replacement;
	return { messages };
}
