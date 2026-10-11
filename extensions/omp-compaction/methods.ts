// Origin: OMP 18.1.16 pi-coding-agent/src/session/compact-modes.ts (verbatim mode table +
// parseCompactArgs) and compaction-methods.ts (DEFAULT_COMPACTION_METHOD_ORDER).
// Local changes: adds the Pi-side details type persisted on compaction entries and the
// private marker `/handoff` uses to route Pi's `ctx.compact` into the handoff method.

import { parseSnapcompactArchive, type SnapcompactArchive } from "./snapcompact/run.ts";

/** Subcommand selecting a one-off compaction mode for manual `/compact`. */
export type CompactMode = "soft" | "remote" | "snapcompact";

/** OMP context-maintenance methods, in configurable fallback order. */
export type CompactionMethod = "remote" | "snapcompact" | "handoff" | "shake" | "soft";

/** OMP `compaction.methodOrder` default. */
export const DEFAULT_COMPACTION_METHOD_ORDER: readonly CompactionMethod[] = [
	"remote",
	"snapcompact",
	"handoff",
	"shake",
	"soft",
];

export interface CompactModeDef {
	readonly name: CompactMode;
	/** One-line description surfaced in autocomplete + help. */
	readonly description: string;
	/** Method order for this run, replacing the configured order. */
	readonly methodOrder: readonly CompactionMethod[];
	/** The mode produces no LLM summary, so trailing focus text is rejected. */
	readonly rejectsFocus?: boolean;
}

export const COMPACT_MODES: readonly CompactModeDef[] = [
	{
		name: "soft",
		description: "Summarize locally with the active model (skip server compaction)",
		methodOrder: ["soft"],
	},
	{
		name: "remote",
		description: "Summarize via OpenAI-compatible server compaction, then fall back to a local summary",
		methodOrder: ["remote", "soft"],
	},
	{
		name: "snapcompact",
		description: "Archive history onto dense bitmap images the model reads back (no LLM call)",
		methodOrder: ["snapcompact"],
		rejectsFocus: true,
	},
];

/** Resolve a subcommand token (case-insensitive) to its mode definition. */
export function findCompactMode(name: string): CompactModeDef | undefined {
	const key = name.trim().toLowerCase();
	return COMPACT_MODES.find(mode => mode.name === key);
}

/** Parsed `/compact` arguments: an optional mode plus optional focus text. */
export interface ParsedCompactArgs {
	mode?: CompactMode;
	instructions?: string;
}

/**
 * Split `/compact` args into a leading mode subcommand + focus instructions.
 * When the first token is not a known mode, the whole string is focus instructions.
 * A recognized mode with `rejectsFocus` and trailing text is an error.
 */
export function parseCompactArgs(args: string): ParsedCompactArgs | { error: string } {
	const trimmed = args.trim();
	if (!trimmed) return {};

	const spaceIndex = trimmed.search(/\s/);
	const firstToken = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
	const mode = findCompactMode(firstToken);
	if (!mode) return { instructions: trimmed };

	const focus = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
	if (mode.rejectsFocus && focus) {
		return {
			error: `/compact ${mode.name} does not take focus instructions (it archives history without an LLM summary).`,
		};
	}
	return { mode: mode.name, instructions: focus || undefined };
}

/** Prefix `/handoff` puts in `ctx.compact` instructions; never typed by users. */
export const HANDOFF_MARKER = "\u0000omp-handoff\u0000";

/** Persisted on Pi compaction entries as `details`; drives context rebuild and file tracking. */
export interface OmpCompactionDetails {
	omp: { method: "soft" | "snapcompact" | "handoff"; archive?: SnapcompactArchive };
	readFiles: string[];
	modifiedFiles: string[];
}

/** Narrow untrusted entry details to the extension's shape. */
export function readOmpDetails(details: unknown): OmpCompactionDetails | undefined {
	if (!details || typeof details !== "object" || !("omp" in details)) return undefined;
	const omp = details.omp;
	if (!omp || typeof omp !== "object" || !("method" in omp)) return undefined;
	const method = omp.method;
	if (method !== "soft" && method !== "snapcompact" && method !== "handoff") return undefined;
	const list = (key: string): string[] => {
		const value: unknown = key in details ? Reflect.get(details, key) : undefined;
		return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
	};
	const archive: unknown = "archive" in omp ? omp.archive : undefined;
	return {
		omp: { method, archive: parseSnapcompactArchive(archive) },
		readFiles: list("readFiles"),
		modifiedFiles: list("modifiedFiles"),
	};
}
