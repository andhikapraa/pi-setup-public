// Origin: OMP 18.1.16 host glue around the vendored snapcompact engine:
// - pi-coding-agent/src/session/session-maintenance.ts:924-1056 (snapcompact checks and run),
//   :1969-1976 (#projectPreSnapcompactContextTokens), :2849-2900 (#computeSnapcompactMaxFrames),
//   :2902-2943 (#snapcompactFramePayloadBytes, #projectSnapcompactContextTokens);
// - pi-agent-core/src/compaction/messages.ts:140-168,232-247 (compactionSummary blocks → model content);
// - pi-agent-core/src/compaction/compaction.ts:751-773 + prompts/snapcompact-archive-context.md.
// Local changes:
// - Inputs come from Pi's `session_before_compact` preparation + branch entries; OMP's
//   `recentMessages` and non-message tokens (system prompt + tools) are rebuilt from Pi's
//   session projection. Token counts use Pi's chars/4 `estimateTokens` (OMP: tiktoken), with
//   OMP's FRAME_TOKEN_ESTIMATE per archived frame.
// - `snapcompact.shape` setting is not configurable on Pi: always OMP's default "auto".
// - Failures return `{ skip: reason }` (OMP's notice text) instead of throwing, so the caller can
//   continue its method order.

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type Api, getCurrentSystemMessage, type ImageContent, type Message, type Model, type TextContent } from "@earendil-works/pi-ai";
import {
	buildSessionProjection,
	convertToLlm,
	estimateTokens,
	type SessionBeforeCompactEvent,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { renderPrompt } from "../vendor/prompt.ts";
import { classifyModel } from "./identity.ts";
import { nativeAvailable } from "./native.ts";
import * as snapcompact from "./snapcompact.ts";

/** OMP snapcompact `Archive`: frames + kept source text, persisted in `details.omp.archive`. */
export type SnapcompactArchive = snapcompact.Archive;

type CompactionPreparation = SessionBeforeCompactEvent["preparation"];

/** Verbatim copy of pi-agent-core/src/compaction/prompts/snapcompact-archive-context.md. */
const SNAPCOMPACT_ARCHIVE_CONTEXT_PROMPT = `Previous snapcompact archive source text:

{{archiveText}}
`;

/** OMP `DEFAULT_RESERVE_TOKENS` (pi-agent-core compaction.ts). */
const DEFAULT_RESERVE_TOKENS = 16384;

/** OMP SUMMARY_TEMPLATE_TOKENS allowance in #computeSnapcompactMaxFrames. */
const SUMMARY_TEMPLATE_TOKENS = 2000;

/** Pi `convertToLlm` minus system messages: prompt state, never archived history. */
const convertForArchive = (messages: AgentMessage[]): Message[] =>
	convertToLlm(messages).filter(message => message.role !== "system");

/** True when the model accepts image input (snapcompact frames are images). */
export function modelSupportsImages(model: Model<Api>): boolean {
	return model.input.includes("image");
}

/**
 * Validate a persisted archive (`details.omp.archive`, untrusted JSON) with OMP
 * `getPreservedArchive`. Returns undefined when it carries neither frames nor text.
 */
export function parseSnapcompactArchive(value: unknown): SnapcompactArchive | undefined {
	return snapcompact.getPreservedArchive({ [snapcompact.PRESERVE_KEY]: value });
}

/** OMP `effectiveReserveTokens`: max(15% of the window, configured reserve). */
function effectiveReserveTokens(contextWindow: number, reserveTokens: number | undefined): number {
	return Math.max(Math.floor(contextWindow * 0.15), reserveTokens ?? DEFAULT_RESERVE_TOKENS);
}

function countMessages(messages: readonly AgentMessage[]): number {
	let tokens = 0;
	for (const message of messages) tokens += estimateTokens(message);
	return tokens;
}

/**
 * Tokens of the rebuilt compaction summary message: summary + text blocks (chars/4,
 * as Pi counts a compactionSummary) plus OMP's FRAME_TOKEN_ESTIMATE per frame
 * (OMP tokenizer.ts compactionSummary branch).
 */
function summaryMessageTokens(summary: string, blocks: readonly (TextContent | ImageContent)[]): number {
	let chars = summary.length;
	let frames = 0;
	for (const block of blocks) {
		if (block.type === "text") chars += block.text.length;
		else frames++;
	}
	return Math.ceil(chars / 4) + frames * snapcompact.FRAME_TOKEN_ESTIMATE;
}

/**
 * Rebuild what OMP reads from its own session state: the kept-recent messages
 * (`preparation.recentMessages`, entries from `firstKeptEntryId` on) and the fixed
 * non-message overhead (current system prompt + tool definitions).
 */
function projectHostContext(
	branchEntries: SessionEntry[],
	firstKeptEntryId: string,
): { recentMessages: AgentMessage[]; nonMessageTokens: number } {
	const projection = buildSessionProjection(branchEntries);
	const system = getCurrentSystemMessage(projection.messages);
	const firstKept = projection.entries.findIndex(entry => entry.sourceEntry.id === firstKeptEntryId);
	const recentMessages =
		firstKept < 0
			? []
			: projection.entries
					.slice(firstKept)
					.filter(entry => entry.sourceEntry.type !== "compaction")
					.flatMap(entry => entry.messages.filter(message => message.role !== "system"));
	return { recentMessages, nonMessageTokens: system ? estimateTokens(system) : 0 };
}

/**
 * Port of OMP #computeSnapcompactMaxFrames: 0 = no headroom at all (skip), 1 = only
 * the text-only layout fits, else the frame budget capped by MAX_FRAMES_DEFAULT,
 * the base64 data budget and the provider image budget.
 */
function computeMaxFrames(
	model: Model<Api>,
	contextWindow: number,
	reserveTokens: number | undefined,
	baseTokens: number,
): number {
	if (contextWindow <= 0) {
		return Math.min(
			snapcompact.MAX_FRAMES_DEFAULT,
			snapcompact.maxFramesForDataBudget(),
			snapcompact.providerFrameBudget(model.provider),
		);
	}
	const totalBudget = contextWindow - effectiveReserveTokens(contextWindow, reserveTokens);
	if (baseTokens >= totalBudget) return 0;
	const shape = snapcompact.resolveShape(model, "auto");
	const edgeCap = snapcompact.geometry(shape).capacity;
	const textEdgeTokens = Math.ceil((2 * edgeCap * 1.15) / 4);
	const frameBudget = totalBudget - baseTokens - (textEdgeTokens + SUMMARY_TEMPLATE_TOKENS);
	if (frameBudget < snapcompact.FRAME_TOKEN_ESTIMATE) return 1;
	return Math.min(
		Math.floor(frameBudget / snapcompact.FRAME_TOKEN_ESTIMATE),
		snapcompact.MAX_FRAMES_DEFAULT,
		snapcompact.maxFramesForDataBudget(),
		snapcompact.providerFrameBudget(model.provider),
	);
}

/** Run OMP snapcompact for a Pi compaction. Returns `{ skip }` with OMP's reason when unavailable/not reducing. */
export async function runSnapcompact(args: {
	preparation: CompactionPreparation;
	previousArchive: SnapcompactArchive | undefined;
	model: Model<Api>;
	contextWindow: number;
	/** `event.branchEntries`: source of OMP's recentMessages and system/tool overhead. */
	branchEntries: SessionEntry[];
}): Promise<
	| {
			summary: string;
			firstKeptEntryId: string;
			tokensBefore: number;
			archive: SnapcompactArchive;
			readFiles: string[];
			modifiedFiles: string[];
	  }
	| { skip: string }
> {
	const { preparation, previousArchive, model, contextWindow, branchEntries } = args;
	if (!nativeAvailable) {
		return { skip: `snapcompact renderer is not installed for ${process.platform}-${process.arch}` };
	}
	if (!modelSupportsImages(model)) {
		return { skip: `snapcompact needs a vision-capable model (${model.id} is text-only)` };
	}

	// Claude refuses inputs that reproduce its own reasoning as text, and the archive is
	// replayed into every later request: drop `¶think:` for Anthropic-dialect models (OMP #6093).
	const includeThinking = classifyModel("", model.id, { lenient: true }).class !== "anthropic";
	const previousPreserveData = previousArchive ? { [snapcompact.PRESERVE_KEY]: previousArchive } : undefined;

	const text = snapcompact.serializeConversation(
		convertForArchive(preparation.messagesToSummarize.concat(preparation.turnPrefixMessages)),
		{ includeThinking },
	);
	const probeText = snapcompact.renderabilityProbeText(text, previousPreserveData, preparation.previousSummary);
	const shape = snapcompact.resolveShapeForText(probeText, model, "auto");
	const renderScan = snapcompact.scanRenderability(probeText, { shape });
	if (!renderScan.isSafe) {
		const percent = (renderScan.unrenderableRatio * 100).toFixed(1);
		return { skip: `snapcompact disabled: unsupported characters for selected snapcompact font (${percent}%).` };
	}

	const { recentMessages, nonMessageTokens } = projectHostContext(branchEntries, preparation.firstKeptEntryId);
	const recentTokens = countMessages(recentMessages);
	const reserveTokens = preparation.settings.reserveTokens;
	const maxFrames = computeMaxFrames(model, contextWindow, reserveTokens, nonMessageTokens + recentTokens);
	if (maxFrames < 1) {
		return { skip: "snapcompact: kept history alone exceeds the context budget." };
	}

	const result = await snapcompact.compact<AgentMessage>(
		{
			firstKeptEntryId: preparation.firstKeptEntryId,
			messagesToSummarize: preparation.messagesToSummarize,
			turnPrefixMessages: preparation.turnPrefixMessages,
			tokensBefore: preparation.tokensBefore,
			previousSummary: preparation.previousSummary,
			previousPreserveData,
			fileOps: preparation.fileOps,
		},
		{ convertToLlm: convertForArchive, model, maxFrames, includeThinking },
	);
	const resultArchive = snapcompact.getPreservedArchive(result.preserveData);
	if (resultArchive && snapcompact.frameDataBytes(resultArchive.frames) > snapcompact.FRAME_DATA_BYTES_BUDGET) {
		return { skip: "snapcompact produced too much standing image payload." };
	}

	// Pi's estimateTokens never counts thinking signatures, so OMP's two projections
	// (encrypted-reasoning excluded for the reduction check, included for the window
	// check) coincide here.
	const blocks = resultArchive
		? snapcompact.historyBlocks(resultArchive, { maxFrameDataBytes: snapcompact.FRAME_DATA_BYTES_BUDGET })
		: [];
	const projected = nonMessageTokens + summaryMessageTokens(result.summary, blocks) + recentTokens;
	const reductionBaseline =
		nonMessageTokens +
		countMessages(preparation.messagesToSummarize) +
		countMessages(preparation.turnPrefixMessages) +
		recentTokens;
	if (projected >= reductionBaseline) {
		return { skip: "snapcompact would not reduce context." };
	}
	const budget =
		contextWindow > 0
			? contextWindow - effectiveReserveTokens(contextWindow, reserveTokens)
			: Number.POSITIVE_INFINITY;
	if (projected > budget) {
		return { skip: "snapcompact could not bring the context under the limit." };
	}

	const { readFiles, modifiedFiles } = result.details ?? snapcompact.computeFileLists(preparation.fileOps);
	return {
		summary: result.summary,
		firstKeptEntryId: result.firstKeptEntryId,
		tokensBefore: result.tokensBefore,
		// An archive with neither frames nor text is what `compact` persisted for an empty
		// history; OMP stores it as-is and its rebuild attaches no blocks.
		archive: resultArchive ?? { frames: [], totalChars: 0, truncatedChars: previousArchive?.truncatedChars ?? 0 },
		readFiles,
		modifiedFiles,
	};
}

/**
 * Model-facing content for a snapcompact compaction summary: [text summary, ...head text,
 * image frames, tail text] (OMP convertMessageToLlm compactionSummary with `blocks`, no
 * wrapper). Frames past FRAME_DATA_BYTES_BUDGET are dropped oldest-first by `historyBlocks`.
 */
export function snapcompactContent(summary: string, archive: SnapcompactArchive): (TextContent | ImageContent)[] {
	const valid = parseSnapcompactArchive(archive);
	const blocks = valid
		? snapcompact.historyBlocks(valid, { maxFrameDataBytes: snapcompact.FRAME_DATA_BYTES_BUDGET })
		: [];
	return [{ type: "text", text: summary }, ...blocks];
}

/**
 * Archive text rendered as a plain previous-summary for a later soft compaction
 * (OMP formatPreviousSnapcompactArchive). Empty string when the archive has no source
 * text; OMP then keeps the previous summary unchanged (mergePreviousSummaryWithSnapcompactArchive).
 */
export function archiveAsText(archive: SnapcompactArchive): string {
	const archiveText = snapcompact.archiveSourceText(archive);
	return archiveText ? renderPrompt(SNAPCOMPACT_ARCHIVE_CONTEXT_PROMPT, { archiveText }) : "";
}
