// Origin: OMP 18.1.16 pi-agent-core/src/compaction/compaction.ts (renderHandoffPrompt,
// generateHandoffFromContext, shouldRetryHandoffWithAutoToolChoice) and
// pi-coding-agent/src/session/session-handoff.ts (live-context snapshot).
// Local changes: the request goes through Pi's ctx.modelRegistry.complete with the live
// system prompt and branch messages; the document is committed by Pi as a compaction entry
// (OMP also commits in place, keeping keepRecentTokens).

import type { AssistantMessage, Message } from "@earendil-works/pi-ai";
import { convertToLlm, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { HANDOFF_DOCUMENT_PROMPT } from "./prompts.ts";
import { renderPrompt } from "./vendor/prompt.ts";

/** Handoff prompt with optional focus (OMP renderHandoffPrompt). */
export function renderHandoffPrompt(focus?: string): string {
	return renderPrompt(HANDOFF_DOCUMENT_PROMPT, focus ? { additionalFocus: focus } : {});
}

/**
 * Providers that only accept `tool_choice: auto` reject "none" (OMP retry predicate).
 * Pi's AssistantMessage has no HTTP status field, so only the message text is matched.
 */
function shouldRetryWithAutoToolChoice(response: AssistantMessage): boolean {
	const message = response.errorMessage ?? "";
	return /\btool_choice\b/i.test(message) && /\bauto\b/i.test(message) && /\bsupported\b/i.test(message);
}

/**
 * Write a handoff document from the live conversation. Uses the session's system prompt
 * so the provider can reuse its cached prefix; tools are disabled. Throws on empty output.
 */
export async function generateHandoff(ctx: ExtensionContext, focus: string | undefined, signal: AbortSignal): Promise<string> {
	const model = ctx.model;
	if (!model) throw new Error("No model selected");
	const history = convertToLlm(ctx.sessionManager.buildSessionProjection().messages).filter(m => m.role !== "system");
	const messages: Message[] = [
		...history,
		{ role: "user", content: [{ type: "text", text: renderHandoffPrompt(focus) }], timestamp: Date.now() },
	];
	const context = { systemPrompt: ctx.getSystemPrompt(), messages };
	// OMP clamps reasoning for summarization: "off" disables it, otherwise keep the session level.
	const reasoning = ctx.thinkingLevel && ctx.thinkingLevel !== "off" ? ctx.thinkingLevel : undefined;
	const options = { signal, reasoning, sessionId: ctx.sessionManager.getSessionId() };

	const request = (toolChoice: "none" | "auto") =>
		ctx.modelRegistry.streamSimple(model, context, { ...options, toolChoice }).result();
	let response = await request("none");
	if (response.stopReason === "error" && shouldRetryWithAutoToolChoice(response)) response = await request("auto");
	if (response.stopReason === "aborted") throw new Error("Handoff cancelled");
	if (response.stopReason === "error") {
		throw new Error(`Handoff generation failed: ${response.errorMessage ?? "unknown error"}`);
	}
	const document = response.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map(c => c.text)
		.join("\n")
		.trim();
	if (!document) throw new Error("Handoff generation produced an empty document");
	return document;
}
