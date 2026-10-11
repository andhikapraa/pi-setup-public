// Origin: @oh-my-pi/pi-catalog/src/compat/revision.ts (parseRevision, parseRevisionPrefix,
// compareRevision, formatRevision — verbatim) and src/compat/taxonomy.ts `classifyModel`
// (reduced) with the "anthropic" class from rules/taxonomy/anthropic.kdl (OMP 18.1.16).
// Local changes: `classifyModel` only knows the anthropic class (namespace/bounded
// "anthropic", bounded "claude"; families opus/sonnet/haiku/fable/mythos by `*x*` glob;
// revision after "claude-" anywhere). Every other model classifies as "unknown". Callers
// only test `class === "anthropic"` (snapcompact `idealShapeVariant`, OMP `preferredDialect`
// anthropic check). Provider overrides and thinking/effort suffix collapse are dropped: the
// callers pass provider "" (no override matches) and suffixes never change family/revision.

/** A parsed `major.minor.patch` revision. */
export type Revision = readonly [number, number, number];

/** Structured identity subset consumed by snapcompact. */
export interface ModelIdentity {
	class: string;
	family?: string;
	revision?: string;
}

function parseComponent(value: string): number | undefined {
	if (!value) return undefined;
	let out = 0;
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code < 48 || code > 57) return undefined;
		out = out * 10 + (code - 48);
		if (out > 255) return undefined;
	}
	return out;
}

/**
 * Parses an explicit revision literal: one to three components separated by
 * `.` or `-` (`"4.6"`, `"4-6-1"`). Returns undefined on malformed input.
 */
export function parseRevision(value: string): Revision | undefined {
	const out: [number, number, number] = [0, 0, 0];
	let count = 0;
	for (const part of value.split(/[.-]/)) {
		if (count === 3) return undefined;
		const component = parseComponent(part);
		if (component === undefined) return undefined;
		out[count] = component;
		count++;
	}
	return count > 0 ? out : undefined;
}

/**
 * Extracts a leading revision from an identifier tail that begins with a
 * digit: up to three components separated by `.` or by `-` followed by a
 * digit (`"4-6-turbo"` → `[4, 6, 0]`). A component whose digits run directly
 * into a letter is a size token, never a revision component.
 */
function parseRevisionPrefix(value: string): Revision | undefined {
	const out: [number, number, number] = [0, 0, 0];
	let count = 0;
	let index = 0;
	while (count < 3) {
		const start = index;
		while (index < value.length && value.charCodeAt(index) >= 48 && value.charCodeAt(index) <= 57) {
			index++;
		}
		const trailing = index < value.length ? value.charCodeAt(index) : 0;
		const isSizeToken = (trailing >= 97 && trailing <= 122) || (trailing >= 65 && trailing <= 90);
		const component = isSizeToken ? undefined : parseComponent(value.slice(start, index));
		if (component === undefined) {
			return count > 0 ? out : undefined;
		}
		out[count] = component;
		count++;
		const separator = value[index];
		if (separator === undefined) break;
		const next = value.charCodeAt(index + 1);
		if ((separator !== "." && separator !== "-") || !(next >= 48 && next <= 57)) break;
		index++;
	}
	return out;
}

/** Lexicographic triple comparison: negative, zero, or positive. */
export function compareRevision(a: Revision, b: Revision): number {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

const ANTHROPIC_FAMILIES = ["opus", "sonnet", "haiku", "fable", "mythos"] as const;

/** OMP `boundedMatch`: exact token, or token followed by `- _ . :` or a digit. */
function boundedMatch(value: string, token: string): boolean {
	if (value === token) return true;
	if (!value.startsWith(token)) return false;
	const next = value.charCodeAt(token.length);
	return next === 45 || next === 95 || next === 46 || next === 58 || (next >= 48 && next <= 57); // - _ . : 0-9
}

/** OMP `rankFamilies` for `*family*` globs (equal priority; longer glob wins; equal length ties). */
function rankFamily(subject: string): { winner?: string; tied: boolean } {
	let winner: string | undefined;
	let tied = false;
	for (const family of ANTHROPIC_FAMILIES) {
		if (!subject.includes(family)) continue;
		if (winner !== undefined && winner.length === family.length) {
			tied = true;
		} else if (winner === undefined || winner.length < family.length) {
			winner = family;
			tied = false;
		}
	}
	return { winner, tied };
}

/** OMP `classifyFamily` (lenient): rescore a Bedrock-style `anthropic.model` id on ties. */
function classifyFamily(bare: string): string | undefined {
	const initial = rankFamily(bare);
	if (!initial.tied) return initial.winner;
	const separator = bare.search(/[.:]/);
	if (separator <= 0 || separator === bare.length - 1) return undefined;
	const namespace = bare.slice(0, separator);
	if (namespace !== "anthropic" && namespace !== "claude") return undefined;
	const rescored = rankFamily(bare.slice(separator + 1));
	return rescored.tied ? undefined : rescored.winner;
}

/** OMP `extractRevision` for the anthropic rule `revision prefix="claude-" anywhere=#true`. */
function extractRevision(bare: string): string | undefined {
	const start = bare.indexOf("claude-");
	if (start === -1) return undefined;
	const tail = bare.slice(start + "claude-".length);
	const digit = tail.search(/[0-9]/);
	if (digit === -1) return undefined;
	const revision = parseRevisionPrefix(tail.slice(digit));
	return revision ? `${revision[0]}.${revision[1]}.${revision[2]}` : undefined;
}

/**
 * Classify a model id (anthropic class only; see header). Signature matches OMP
 * `classifyModel(provider, modelId, opts)`; `provider` and `opts` are accepted for
 * call-site parity and do not change the result here.
 */
export function classifyModel(_provider: string, modelId: string, _opts?: { lenient?: boolean }): ModelIdentity {
	const lower = modelId.trim().toLowerCase();
	const slash = lower.lastIndexOf("/");
	const bare = slash === -1 ? lower : lower.slice(slash + 1);
	const isAnthropic =
		boundedMatch(bare, "anthropic") ||
		boundedMatch(bare, "claude") ||
		lower.split(/[/.:]/).some(part => part.length > 0 && boundedMatch(part, "anthropic"));
	if (!isAnthropic) return { class: "unknown" };
	const identity: ModelIdentity = { class: "anthropic" };
	const family = classifyFamily(bare);
	if (family !== undefined) identity.family = family;
	const revision = extractRevision(bare);
	if (revision !== undefined) identity.revision = revision;
	return identity;
}
