// Origin: @oh-my-pi/pi-utils/src/prompt.ts (OMP 18.1.16) — `render`, `compile`, `format`, `xml` helper.
// Local changes:
// - Exported as `renderPrompt(template, data)` (OMP `prompt.render`).
// - Only the helpers the vendored prompts use are registered. Audit of every `{{…}}` in
//   snapcompact-summary.md, file-operations.md (both copies), handoff-document.md,
//   handoff-summary-context.md, compaction-summary-context.md, snapcompact-archive-context.md
//   and auto-handoff-threshold-focus.md: plain `{{var}}`, built-in `#if`/`else`, and `#xml`.
// - `format()` keeps only the post-render path `render()` uses (replaceAsciiSymbols and
//   normalizeRfc2119 default to false there, so those branches are dropped).

import * as Handlebars from "./template.ts";

// Opening XML tag (not self-closing, not closing)
const OPENING_XML = /^<([a-z_-]+)(?:\s+[^>]*)?>$/;

/**
 * Closing XML tag matcher, manual equivalent of `/^<\/([a-z_-]+)>$/`. Caller
 * guarantees `s` starts `</`.
 */
function closingTagName(s: string): string | null {
	const n = s.length;
	if (n < 4 || s.charCodeAt(n - 1) !== 62 /* > */) return null;
	for (let j = 2; j < n - 1; j++) {
		const c = s.charCodeAt(j);
		if (!((c >= 97 /* a */ && c <= 122) /* z */ || c === 45 /* - */ || c === 95) /* _ */) return null;
	}
	return s.slice(2, n - 1);
}

/**
 * Manual equivalent of {@link OPENING_XML}. Caller guarantees `s` starts with
 * `<` but not `</`. Falls back to the regex when the char after the tag name
 * is non-ASCII (possible unicode whitespace).
 */
function openingTagName(s: string): string | null {
	const n = s.length;
	if (n < 3 || s.charCodeAt(n - 1) !== 62 /* > */) return null;
	let j = 1;
	while (j < n - 1) {
		const c = s.charCodeAt(j);
		if ((c >= 97 /* a */ && c <= 122) /* z */ || c === 45 /* - */ || c === 95 /* _ */) j++;
		else break;
	}
	if (j === 1) return null;
	if (j === n - 1) return s.slice(1, j); // `<tag>`
	const c = s.charCodeAt(j);
	if (c !== 32 /* space */ && c !== 9 /* tab */) {
		if (c < 128) return null;
		const match = OPENING_XML.exec(s);
		return match ? match[1] : null;
	}
	// `\s+[^>]*>$` ⇔ no further `>` before the final char.
	return s.indexOf(">", j + 1) === n - 1 ? s.slice(1, j) : null;
}
// Table row
const TABLE_ROW = /^\|.*\|$/;
// Table separator (|---|---|)
const TABLE_SEP = /^\|[-:\s|]+\|$/;
// Any non-whitespace char — blank-line check without allocating a trimmed copy
const NON_BLANK = /\S/;

/** Compact a table row by trimming cell padding */
function compactTableRow(line: string): string {
	const cells = line.split("|");
	return cells.map(c => c.trim()).join("|");
}

/** Compact a table separator row */
function compactTableSep(line: string): string {
	const cells = line.split("|").filter(c => c.trim());
	const normalized = cells.map(c => {
		const trimmed = c.trim();
		const left = trimmed.startsWith(":");
		const right = trimmed.endsWith(":");
		if (left && right) return ":---:";
		if (left) return ":---";
		if (right) return "---:";
		return "---";
	});
	return `|${normalized.join("|")}|`;
}

/**
 * OMP `format(content, { renderPhase: "post-render" })`: trim trailing whitespace,
 * collapse blank-line runs, drop blank lines before closing XML tags, compact
 * markdown tables; fenced code blocks pass through untouched.
 */
function formatRendered(content: string): string {
	const lines = content.split("\n");
	// oxlint-disable-next-line unicorn/no-new-array -- length preallocation
	const result: string[] = new Array(lines.length);
	let n = 0; // logical length of `result` (pops are n--)
	let inCodeBlock = false;

	const topLevelTags: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const last = raw.charCodeAt(raw.length - 1);
		let line = last <= 32 || last >= 128 ? raw.trimEnd() : raw;
		let s = 0;
		let first = line.charCodeAt(0);
		while (first === 32 /* space */ || first === 9 /* tab */) first = line.charCodeAt(++s);
		if (first >= 128) {
			// Possible unicode leading whitespace — defer to trimStart for exactness.
			s = line.length - line.trimStart().length;
			first = line.charCodeAt(s);
		}

		if ((first === 96 /* ` */ || first === 126) /* ~ */ && (line.startsWith("```", s) || line.startsWith("~~~", s))) {
			inCodeBlock = !inCodeBlock;
			result[n++] = line;
			continue;
		}

		if (inCodeBlock) {
			result[n++] = line;
			continue;
		}

		let isClosingLine = false;
		if (first === 60 /* < */) {
			const trimmedStart = s === 0 ? line : line.slice(s);
			if (trimmedStart.charCodeAt(1) === 47 /* / */) {
				const tagName = closingTagName(trimmedStart);
				if (tagName !== null) {
					isClosingLine = true;
					if (topLevelTags.length > 0 && topLevelTags[topLevelTags.length - 1] === tagName) {
						topLevelTags.pop();
					}
				}
			} else if (s === 0 && !trimmedStart.endsWith("/>")) {
				const tagName = openingTagName(trimmedStart);
				if (tagName !== null) topLevelTags.push(tagName);
			}
		} else if (first === 124 /* | */) {
			const trimmedStart = s === 0 ? line : line.slice(s);
			if (TABLE_SEP.test(trimmedStart)) {
				line = `${line.slice(0, s)}${compactTableSep(trimmedStart)}`;
			} else if (TABLE_ROW.test(trimmedStart)) {
				line = `${line.slice(0, s)}${compactTableRow(trimmedStart)}`;
			}
		}

		if (s >= line.length) {
			// Blank line (`line` carries no trailing whitespace, so it is "").
			const next = lines[i + 1];
			// Strip any run of 2+ consecutive blank lines entirely; preserve a single blank.
			if (next === undefined || next.length === 0 || !NON_BLANK.test(next)) {
				while (n > 0 && result[n - 1].length === 0) n--;
				let j = i + 1;
				while (j < lines.length && (lines[j].length === 0 || !NON_BLANK.test(lines[j]))) j++;
				i = j - 1;
				continue;
			}
			if (n === 0 || result[n - 1].length === 0) {
				continue;
			}
		}

		if (isClosingLine) {
			while (n > 0 && result[n - 1].length === 0) n--;
		}

		result[n++] = line;
	}

	while (n > 0 && result[n - 1].length === 0) n--;
	result.length = n;

	return result.join("\n");
}

const handlebars = Handlebars.create();

/**
 * {{#xml "tag"}}content{{/xml}}
 * Wraps content in XML-style tags. Returns empty string if content is empty.
 */
handlebars.registerHelper("xml", function (this: unknown, tag: unknown, options: unknown): string {
	if (typeof tag !== "string" || !isHelperOptions(options)) return "";
	const content = options.fn(this).trim();
	if (!content) return "";
	return `<${tag}>\n${content}\n</${tag}>`;
});

/** Narrow the trailing helper argument to the engine's HelperOptions. */
function isHelperOptions(value: unknown): value is Handlebars.HelperOptions {
	return typeof value === "object" && value !== null && "fn" in value && typeof value.fn === "function";
}

const compiledTemplateCache = new Map<string, Handlebars.TemplateDelegate<Record<string, unknown>>>();

/** Compile (cached by raw template) with OMP's `{ noEscape: true, strict: false }`. */
function compile(template: string): Handlebars.TemplateDelegate<Record<string, unknown>> {
	const cached = compiledTemplateCache.get(template);
	if (cached) return cached;
	const compiled = handlebars.compile<Record<string, unknown>>(template, { noEscape: true, strict: false });
	compiledTemplateCache.set(template, compiled);
	return compiled;
}

/** Render a prompt template with OMP `prompt.render` semantics (render, then post-render format). */
export function renderPrompt(template: string, data: Record<string, unknown>): string {
	return formatRendered(compile(template)(data));
}
