// Origin: OMP 18.1.16
//   pi-agent-core/src/compaction/shake.ts (region detection, configs)
//   pi-agent-core/src/compaction/tool-protection.ts (protection matchers)
//   pi-coding-agent/src/session/shake-types.ts (ShakeMode, ShakeResult, formatShakeSummary)
//   pi-coding-agent/src/session/session-maintenance.ts:588-767 (dropImages / shake orchestration)
//   pi-coding-agent/src/session/messages.ts:798-817 (stripImagesFromArrayContent)
// Local changes:
//   - Scans Pi's `buildSessionProjection()` (already compaction-bounded, context edits applied)
//     instead of mutating raw branch entries; persists via append-only `context_edit` entries
//     (one per target, latest wins) instead of `rewriteEntries`.
//   - Tokens: Pi chars/4 heuristic instead of OMP's tokenizer.
//   - Recovery: originals go to `<sessionDir>/omp-shake/<sessionId>-<n>.md` instead of an
//     `artifact://` session artifact; the artifact-recovery matcher protects reads of that dir.
//   - Skill-read matcher also protects Pi skill reads (`.../SKILL.md` paths).
//   - Already-shaken tool results are detected by placeholder text (Pi has no `prunedAt`).
//   - Not ported: `useless` tool-result bypass, plan-file protection, tool-result
//     `details.meta`/`details.images` (not model-visible in Pi), provider-session teardown.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import type { ImageContent, TextContent, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
	ContextEditableContent,
	ContextEditEntry,
	ExtensionContext,
	ProjectedSessionEntry,
} from "@earendil-works/pi-coding-agent";

/** Mode selector for `/shake` (OMP builtin-lifecycle.ts:316-321 exposes all three). */
export type ShakeMode = "elide" | "images" | "thinking";

/** One appended context edit, for CORE's bookkeeping entry. */
export interface ShakeEdit {
	targetId: string;
	kind: "toolResult" | "block" | "images" | "thinking";
	tokens: number;
}

/** Outcome of a shake run (contract fields + OMP ShakeResult counters). */
export interface ShakeOutcome {
	mode: ShakeMode;
	/** Regions/blocks removed (elide: tool results + blocks; images/thinking: blocks dropped). */
	regions: number;
	/** Estimated context tokens reclaimed (OMP reports 0 for images/thinking). */
	tokensSaved: number;
	/** Absolute path of the recovery file holding elided originals. */
	recoveryFile?: string;
	toolResultsDropped: number;
	blocksDropped: number;
	imagesDropped?: number;
	thinkingBlocksDropped?: number;
	/** Context edits appended; CORE records these (e.g. `pi.appendEntry("omp-shake", …)`). */
	edits: ShakeEdit[];
	/** OMP one-line operator summary. */
	summary: string;
}

interface ProtectedToolContext {
	readonly toolResult: ToolResultMessage;
	readonly toolCall: ToolCall | undefined;
	readonly recoveryDir: string;
	readonly cwd: string;
}

type ProtectedToolMatcher = string | ((context: ProtectedToolContext) => boolean);

export interface ShakeConfig {
	/** Keep the most recent context tokens (across all entries) intact. */
	protectTokens: number;
	/** Only shake when total estimated savings meets this threshold. */
	minSavings: number;
	/** Tool-result protection matchers. */
	protectedTools: ProtectedToolMatcher[];
	/** Minimum token size for a fenced/XML block to be eligible. */
	fenceMinTokens: number;
}

const SKILL_INTERNAL_URL_PREFIX = "skill://";
const RECOVERY_DIR_NAME = "omp-shake";
/** Pi's per-image char estimate (compaction.js ESTIMATED_IMAGE_CHARS). */
const ESTIMATED_IMAGE_CHARS = 4800;

/** Extract the `path` argument from a paired `read` tool call. */
function getReadToolPath({ toolResult, toolCall }: ProtectedToolContext): string | undefined {
	if (toolResult.toolName !== "read" || toolCall?.name !== "read") return undefined;
	const path = toolCall.arguments.path;
	return typeof path === "string" ? path : undefined;
}

/** Skill reads: OMP `skill://` URLs or Pi skill files (`SKILL.md`). */
function isSkillReadToolResult(context: ProtectedToolContext): boolean {
	const path = getReadToolPath(context);
	if (path === undefined) return false;
	return path.startsWith(SKILL_INTERNAL_URL_PREFIX) || path === "SKILL.md" || /[\\/]SKILL\.md$/.test(path);
}

/** Recovery reads of shake files — eliding one only mints another file and can repeat indefinitely. */
function isRecoveryReadToolResult(context: ProtectedToolContext): boolean {
	const path = getReadToolPath(context);
	if (path === undefined) return false;
	const absolute = isAbsolute(path) ? path : resolve(context.cwd, path);
	return absolute.startsWith(context.recoveryDir + sep);
}

/** Auto-shake config: protects the live tail, conservative thresholds. */
export const DEFAULT_SHAKE_CONFIG: ShakeConfig = {
	protectTokens: 16_000,
	minSavings: 4_000,
	protectedTools: ["skill", isSkillReadToolResult, isRecoveryReadToolResult],
	fenceMinTokens: 400,
};

/** Manual `/shake`: no savings threshold, recovery reads included, small recent tail kept. */
export const AGGRESSIVE_SHAKE_CONFIG: ShakeConfig = {
	protectTokens: 4_000,
	minSavings: 0,
	protectedTools: ["skill", isSkillReadToolResult],
	fenceMinTokens: 400,
};

/** Rough token cost of a placeholder line; used only for the savings gate. */
const PLACEHOLDER_TOKEN_ESTIMATE = 16;

/** Matches placeholders this module writes, so re-runs skip already-shaken results. */
const SHAKEN_PLACEHOLDER = /^\[shaken ~\d+ tokens(?: — recover: [^\]]*)?\]$/;

// Mirror prompt.ts top-level XML detection. Lowercase tag names only.
const OPENING_XML = /^<([a-z_-]+)(?:\s+[^>]*)?>$/;
const CLOSING_XML = /^<\/([a-z_-]+)>$/;

/** Editable projected target: the single model-visible message of an editable source entry. */
interface Target {
	targetId: string;
	message: AgentMessage;
}

interface ToolResultRegion {
	kind: "toolResult";
	target: Target;
	tokens: number;
	originalText: string;
	label: string;
}

interface BlockRegion {
	kind: "block";
	target: Target;
	/** Index into the content array, or -1 for string-form content. */
	blockIndex: number;
	start: number;
	end: number;
	tokens: number;
	originalText: string;
	label: string;
}

type ShakeRegion = ToolResultRegion | BlockRegion;

interface ReplacementItem<R extends ShakeRegion = ShakeRegion> {
	region: R;
	replacement: string;
}

/** chars/4 estimate (Pi compaction heuristic). */
function textTokens(chars: number): number {
	return Math.ceil(chars / 4);
}

/** Editable message of a projected entry (mirrors appendContextEdit's editable check). */
function editableMessage(entry: ProjectedSessionEntry): AgentMessage | undefined {
	const source = entry.sourceEntry;
	if (entry.messages.length !== 1) return undefined;
	if (source.type === "custom_message") return entry.messages[0];
	if (source.type !== "message") return undefined;
	const role = source.message.role;
	if (role !== "user" && role !== "assistant" && role !== "toolResult") return undefined;
	return entry.messages[0];
}

function collectToolCallsById(entries: readonly ProjectedSessionEntry[]): Map<string, ToolCall> {
	const toolCalls = new Map<string, ToolCall>();
	for (const entry of entries) {
		for (const message of entry.messages) {
			if (message.role !== "assistant") continue;
			for (const block of message.content) {
				if (block.type === "toolCall") toolCalls.set(block.id, block);
			}
		}
	}
	return toolCalls;
}

function isProtectedToolResult(context: ProtectedToolContext, matchers: readonly ProtectedToolMatcher[]): boolean {
	for (const matcher of matchers) {
		if (typeof matcher === "string") {
			if (context.toolResult.toolName === matcher) return true;
			continue;
		}
		if (matcher(context)) return true;
	}
	return false;
}

/** Joined non-empty text of a tool result; undefined when none or already shaken. */
function toolResultText(message: ToolResultMessage): { originalText: string; tokens: number } | undefined {
	const fragments: string[] = [];
	let chars = 0;
	for (const block of message.content) {
		if (block.type === "text" && block.text.length > 0) {
			fragments.push(block.text);
			chars += block.text.length;
		}
	}
	if (fragments.length === 0) return undefined;
	if (fragments.length === 1 && SHAKEN_PLACEHOLDER.test(fragments[0])) return undefined;
	return { originalText: fragments.join("\n"), tokens: textTokens(chars) };
}

/** chars/4 estimate of one message, matching Pi's `estimateTokens`. */
function estimateMessageTokens(message: AgentMessage): number {
	let chars = 0;
	switch (message.role) {
		case "user":
		case "custom":
		case "toolResult":
			if (typeof message.content === "string") return textTokens(message.content.length);
			for (const block of message.content) {
				chars += block.type === "text" ? block.text.length : ESTIMATED_IMAGE_CHARS;
			}
			return textTokens(chars);
		case "assistant":
			for (const block of message.content) {
				if (block.type === "text") chars += block.text.length;
				else if (block.type === "thinking") chars += block.thinking.length;
				else chars += block.name.length + JSON.stringify(block.arguments).length;
			}
			return textTokens(chars);
		case "branchSummary":
		case "compactionSummary":
			return textTokens(message.summary.length);
		case "bashExecution":
			return textTokens(message.command.length + message.output.length);
		default:
			return 0;
	}
}

/**
 * Locate fenced code blocks and top-level XML element spans inside `text`.
 * Returns `[start, end)` ranges covering the full block (fence/tag lines included,
 * trailing newline excluded). Unterminated blocks yield nothing; XML is ignored in fences.
 */
function scanTextForBlockRanges(text: string): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	let inFence = false;
	let fenceStart = -1;
	const tagStack: string[] = [];
	let xmlStart = -1;

	let lineStart = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i !== text.length && text[i] !== "\n") continue;
		const line = text.slice(lineStart, i);
		const lineEnd = i;
		const trimmedStart = line.trimStart();

		const isFenceLine = trimmedStart.startsWith("```") || trimmedStart.startsWith("~~~");
		if (isFenceLine) {
			if (!inFence) {
				inFence = true;
				fenceStart = lineStart;
			} else {
				inFence = false;
				ranges.push({ start: fenceStart, end: lineEnd });
				fenceStart = -1;
			}
			lineStart = i + 1;
			continue;
		}

		if (!inFence) {
			const isOpeningXml = line.length === trimmedStart.length && OPENING_XML.test(trimmedStart);
			if (isOpeningXml) {
				const match = OPENING_XML.exec(trimmedStart);
				if (match) {
					if (tagStack.length === 0) xmlStart = lineStart;
					tagStack.push(match[1]);
				}
			} else {
				const closingMatch = CLOSING_XML.exec(trimmedStart);
				if (closingMatch && tagStack.length > 0 && tagStack[tagStack.length - 1] === closingMatch[1]) {
					tagStack.pop();
					if (tagStack.length === 0 && xmlStart >= 0) {
						ranges.push({ start: xmlStart, end: lineEnd });
						xmlStart = -1;
					}
				}
			}
		}

		lineStart = i + 1;
	}

	return mergeRanges(ranges);
}

/** Sort by start and drop ranges overlapping an earlier kept one (keeps the outermost span). */
function mergeRanges(ranges: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
	if (ranges.length <= 1) return ranges;
	const sorted = [...ranges].sort((a, b) => a.start - b.start);
	const kept: Array<{ start: number; end: number }> = [];
	let lastEnd = -1;
	for (const range of sorted) {
		if (range.start < lastEnd) continue;
		kept.push(range);
		lastEnd = range.end;
	}
	return kept;
}

function pushBlockRegions(
	target: Target,
	blockIndex: number,
	text: string,
	config: ShakeConfig,
	label: string,
	out: ShakeRegion[],
): void {
	for (const range of scanTextForBlockRanges(text)) {
		const length = range.end - range.start;
		if (length === 0) continue;
		const tokens = textTokens(length);
		if (tokens < config.fenceMinTokens) continue;
		out.push({
			kind: "block",
			target,
			blockIndex,
			start: range.start,
			end: range.end,
			tokens,
			originalText: text.slice(range.start, range.end),
			label,
		});
	}
}

function scanContentBlocks(
	target: Target,
	content: string | ReadonlyArray<TextContent | ImageContent>,
	config: ShakeConfig,
	label: string,
	out: ShakeRegion[],
): void {
	if (typeof content === "string") {
		pushBlockRegions(target, -1, content, config, label, out);
		return;
	}
	for (let bi = 0; bi < content.length; bi++) {
		const block = content[bi];
		if (block.type === "text") pushBlockRegions(target, bi, block.text, config, label, out);
	}
}

function collectBlockRegions(target: Target, config: ShakeConfig, out: ShakeRegion[]): void {
	const message = target.message;
	if (message.role === "assistant") {
		for (let bi = 0; bi < message.content.length; bi++) {
			const block = message.content[bi];
			if (block.type === "text") pushBlockRegions(target, bi, block.text, config, "assistant", out);
		}
		return;
	}
	if (message.role === "user") {
		scanContentBlocks(target, message.content, config, "user", out);
		return;
	}
	if (message.role === "custom") {
		scanContentBlocks(target, message.content, config, message.customType, out);
	}
}

/**
 * Locate every eligible shake region in the projection (document order).
 * Keeps the most recent `protectTokens` intact, honors `protectedTools`, skips
 * already-shaken results; returns [] when savings fall below `minSavings`.
 * The projection is already cut at the latest compaction's firstKeptEntryId.
 */
function collectShakeRegions(
	entries: readonly ProjectedSessionEntry[],
	config: ShakeConfig,
	protection: { recoveryDir: string; cwd: string },
): ShakeRegion[] {
	const n = entries.length;
	if (n === 0) return [];

	// Tokens of all entries strictly more recent than index i.
	const accumulatedAfter = new Array<number>(n);
	let acc = 0;
	for (let i = n - 1; i >= 0; i--) {
		accumulatedAfter[i] = acc;
		for (const message of entries[i].messages) acc += estimateMessageTokens(message);
	}

	const toolCallsById = collectToolCallsById(entries);

	const regions: ShakeRegion[] = [];
	for (let i = 0; i < n; i++) {
		if (accumulatedAfter[i] < config.protectTokens) continue;
		const message = editableMessage(entries[i]);
		if (!message) continue;
		const target: Target = { targetId: entries[i].sourceEntry.id, message };
		if (message.role === "toolResult") {
			const context: ProtectedToolContext = {
				toolResult: message,
				toolCall: toolCallsById.get(message.toolCallId),
				recoveryDir: protection.recoveryDir,
				cwd: protection.cwd,
			};
			if (isProtectedToolResult(context, config.protectedTools)) continue;
			const text = toolResultText(message);
			if (!text) continue;
			regions.push({
				kind: "toolResult",
				target,
				tokens: text.tokens,
				originalText: text.originalText,
				label: message.toolName,
			});
			continue;
		}
		collectBlockRegions(target, config, regions);
	}

	let savings = 0;
	for (const region of regions) savings += Math.max(0, region.tokens - PLACEHOLDER_TOKEN_ESTIMATE);
	if (savings < config.minSavings) return [];
	return regions;
}

/** Splice block regions into one text, highest start first so offsets stay valid. */
function spliceText(text: string, items: ReadonlyArray<ReplacementItem<BlockRegion>>): string {
	let out = text;
	for (const { region, replacement } of [...items].sort((a, b) => b.region.start - a.region.start)) {
		out = out.slice(0, region.start) + replacement + out.slice(region.end);
	}
	return out;
}

/** Splice regions into an array of text/image blocks, leaving untouched blocks as-is. */
function spliceArray<B extends { type: string }>(
	content: readonly B[],
	byBlock: Map<number, ReplacementItem<BlockRegion>[]>,
): B[] {
	return content.map((block, bi) => {
		const list = byBlock.get(bi);
		if (!list || !("text" in block) || typeof block.text !== "string") return block;
		return { ...block, text: spliceText(block.text, list) };
	});
}

/**
 * Replacement content for one target. Tool result: first non-empty text block becomes the
 * placeholder, other text dropped, non-text kept. Blocks: placeholders spliced over spans.
 */
function replacementContent(message: AgentMessage, items: ReadonlyArray<ReplacementItem>): ContextEditableContent | undefined {
	if (message.role === "toolResult") {
		const item = items.find(entry => entry.region.kind === "toolResult");
		if (!item) return undefined;
		const replacementIndex = message.content.findIndex(block => block.type === "text" && block.text.length > 0);
		if (replacementIndex < 0) return undefined;
		const kept: (TextContent | ImageContent)[] = [];
		for (let index = 0; index < message.content.length; index++) {
			const block = message.content[index];
			if (block.type !== "text") kept.push(block);
			else if (index === replacementIndex) kept.push({ type: "text", text: item.replacement });
		}
		return kept;
	}
	const byBlock = new Map<number, ReplacementItem<BlockRegion>[]>();
	for (const { region, replacement } of items) {
		if (region.kind !== "block") continue;
		const list = byBlock.get(region.blockIndex) ?? [];
		list.push({ region, replacement });
		byBlock.set(region.blockIndex, list);
	}
	if (message.role === "assistant") return spliceArray(message.content, byBlock);
	if (message.role === "user" || message.role === "custom") {
		const content = message.content;
		if (typeof content !== "string") return spliceArray(content, byBlock);
		const list = byBlock.get(-1);
		return list ? spliceText(content, list) : undefined;
	}
	return undefined;
}

type AppendContextEdit = (targetId: string, replacement: ContextEditEntry["replacement"]) => void;

/** Reach the live SessionManager's `appendContextEdit` (omitted from ReadonlySessionManager's type). */
function getAppendContextEdit(ctx: ExtensionContext): AppendContextEdit {
	const manager: object = ctx.sessionManager;
	const fn: unknown = Reflect.get(manager, "appendContextEdit");
	if (typeof fn !== "function") {
		throw new Error(
			"omp-compaction /shake: ctx.sessionManager.appendContextEdit is unavailable; this Pi build cannot persist context edits",
		);
	}
	return (targetId, replacement) => {
		Reflect.apply(fn, manager, [targetId, replacement]);
	};
}

/** Write originals to `<sessionDir>/omp-shake/<sessionId>-<n>.md`; undefined when not persisted or on failure. */
async function saveRecoveryFile(
	ctx: ExtensionContext,
	recoveryDir: string,
	regions: readonly ShakeRegion[],
): Promise<string | undefined> {
	if (ctx.sessionManager.getSessionFile() === undefined) return undefined;
	const parts: string[] = [];
	for (let i = 0; i < regions.length; i++) {
		const region = regions[i];
		parts.push(`### region ${i + 1} (${region.label}, ~${region.tokens} tok)`, "", region.originalText, "");
	}
	try {
		await mkdir(recoveryDir, { recursive: true });
		const prefix = `${ctx.sessionManager.getSessionId()}-`;
		let max = 0;
		for (const name of await readdir(recoveryDir)) {
			if (!name.startsWith(prefix) || !name.endsWith(".md")) continue;
			const n = Number(name.slice(prefix.length, -3));
			if (Number.isInteger(n) && n > max) max = n;
		}
		const file = join(recoveryDir, `${prefix}${max + 1}.md`);
		await writeFile(file, parts.join("\n"), { flag: "wx" });
		return file;
	} catch {
		return undefined;
	}
}

function shakeElidePlaceholder(region: ShakeRegion, index: number, recoveryFile: string | undefined): string {
	if (recoveryFile) {
		return `[shaken ~${region.tokens} tokens — recover: read ${recoveryFile} (region ${index + 1})]`;
	}
	return `[shaken ~${region.tokens} tokens]`;
}

/** Strip image parts; an all-image array becomes a single "[image removed]" text block. */
function stripImages(content: ReadonlyArray<TextContent | ImageContent>): {
	content: (TextContent | ImageContent)[];
	removed: number;
} {
	const kept: (TextContent | ImageContent)[] = [];
	let removed = 0;
	for (const part of content) {
		if (part.type === "image") removed++;
		else kept.push(part);
	}
	if (removed > 0 && kept.length === 0) kept.push({ type: "text", text: "[image removed]" });
	return { content: kept, removed };
}

/** OMP dropImages over the projection: one context edit per message carrying images. */
function dropImages(entries: readonly ProjectedSessionEntry[], append: AppendContextEdit, edits: ShakeEdit[]): number {
	let removed = 0;
	for (const entry of entries) {
		const message = editableMessage(entry);
		if (!message) continue;
		if (message.role !== "user" && message.role !== "toolResult" && message.role !== "custom") continue;
		if (typeof message.content === "string") continue;
		const result = stripImages(message.content);
		if (result.removed === 0) continue;
		append(entry.sourceEntry.id, { content: result.content });
		edits.push({ targetId: entry.sourceEntry.id, kind: "images", tokens: 0 });
		removed += result.removed;
	}
	return removed;
}

/** OMP thinking mode: drop assistant thinking blocks without replacement text. */
function dropThinking(entries: readonly ProjectedSessionEntry[], append: AppendContextEdit, edits: ShakeEdit[]): number {
	let removed = 0;
	for (const entry of entries) {
		const message = editableMessage(entry);
		if (!message || message.role !== "assistant") continue;
		const kept = message.content.filter(block => block.type !== "thinking");
		const dropped = message.content.length - kept.length;
		if (dropped === 0) continue;
		// Provider serializers omit empty assistant turns, so don't invent model-authored text.
		append(entry.sourceEntry.id, { content: kept });
		edits.push({ targetId: entry.sourceEntry.id, kind: "thinking", tokens: 0 });
		removed += dropped;
	}
	return removed;
}

/** One-line operator summary (OMP formatShakeSummary). */
export function formatShakeSummary(result: Omit<ShakeOutcome, "summary">): string {
	if (result.mode === "images") {
		const n = result.imagesDropped ?? 0;
		return n === 0 ? "No images found in this session." : `Dropped ${n} image${n === 1 ? "" : "s"} from this session.`;
	}
	if (result.mode === "thinking") {
		const n = result.thinkingBlocksDropped ?? 0;
		return n === 0
			? "No thinking blocks found in this session."
			: `Dropped ${n} thinking block${n === 1 ? "" : "s"} from this session.`;
	}
	const parts: string[] = [];
	if (result.toolResultsDropped > 0) {
		parts.push(`${result.toolResultsDropped} tool result${result.toolResultsDropped === 1 ? "" : "s"}`);
	}
	if (result.blocksDropped > 0) {
		parts.push(`${result.blocksDropped} block${result.blocksDropped === 1 ? "" : "s"}`);
	}
	if (parts.length === 0) return "Nothing to shake.";
	return `Shook ${parts.join(" + ")} (~${result.tokensSaved} tokens freed).`;
}

function finish(result: Omit<ShakeOutcome, "summary">): ShakeOutcome {
	return { ...result, summary: formatShakeSummary(result) };
}

/** Apply OMP shake to the current branch via Pi context_edit entries; originals saved to a recovery file. */
export async function runShake(
	ctx: ExtensionContext,
	opts: { mode: ShakeMode; config: "default" | "aggressive" },
): Promise<ShakeOutcome> {
	const append = getAppendContextEdit(ctx);
	const entries = ctx.sessionManager.buildSessionProjection().entries;
	const edits: ShakeEdit[] = [];
	const base = { mode: opts.mode, tokensSaved: 0, toolResultsDropped: 0, blocksDropped: 0, edits };

	if (opts.mode === "images") {
		const removed = dropImages(entries, append, edits);
		return finish({ ...base, regions: removed, imagesDropped: removed });
	}
	if (opts.mode === "thinking") {
		const removed = dropThinking(entries, append, edits);
		return finish({ ...base, regions: removed, thinkingBlocksDropped: removed });
	}

	const recoveryDir = join(ctx.sessionManager.getSessionDir(), RECOVERY_DIR_NAME);
	const config = opts.config === "aggressive" ? AGGRESSIVE_SHAKE_CONFIG : DEFAULT_SHAKE_CONFIG;
	const regions = collectShakeRegions(entries, config, { recoveryDir, cwd: ctx.cwd });
	if (regions.length === 0) return finish({ ...base, regions: 0 });

	const recoveryFile = await saveRecoveryFile(ctx, recoveryDir, regions);

	const byTarget = new Map<string, { target: Target; items: ReplacementItem[] }>();
	let toolResultsDropped = 0;
	let blocksDropped = 0;
	let originalTokens = 0;
	let replacementTokens = 0;
	for (let index = 0; index < regions.length; index++) {
		const region = regions[index];
		if (region.kind === "toolResult") toolResultsDropped++;
		else blocksDropped++;
		const replacement = shakeElidePlaceholder(region, index, recoveryFile);
		originalTokens += region.tokens;
		replacementTokens += textTokens(replacement.length);
		const group = byTarget.get(region.target.targetId) ?? { target: region.target, items: [] };
		group.items.push({ region, replacement });
		byTarget.set(region.target.targetId, group);
	}

	for (const { target, items } of byTarget.values()) {
		const content = replacementContent(target.message, items);
		if (content === undefined) continue;
		append(target.targetId, { content });
		for (const { region } of items) edits.push({ targetId: target.targetId, kind: region.kind, tokens: region.tokens });
	}

	return finish({
		...base,
		regions: regions.length,
		tokensSaved: Math.max(0, originalTokens - replacementTokens),
		toolResultsDropped,
		blocksDropped,
		recoveryFile,
	});
}
