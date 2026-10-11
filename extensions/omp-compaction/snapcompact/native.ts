// Origin: @oh-my-pi/pi-natives/native/index.js:105,109 (exports) and native/index.d.ts
// (`SnapcompactRenderOptions`, `renderSnapcompactPng`, `snapcompactSupportedChars`), OMP 18.1.16.
// Local changes: the pi-natives JS loader is Bun-only (Bun's import-meta dir, Bun spawn), so the
// N-API addon is loaded directly with Node's `createRequire`. The addon is not committed: setup
// downloads the platform package `@oh-my-pi/pi-natives-<platform>@18.1.16` into `../native/`.
// Linux x64 prefers the AVX2 "modern" build, as OMP's loader does. When no addon loads, the
// bindings are undefined and snapcompact reports itself unavailable. Only the two snapcompact
// bindings are exposed.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/** Shape options for one snapcompact frame. */
export interface SnapcompactRenderOptions {
	/**
	 * Frame width in pixels; also bounds the grid rows
	 * (`floor(size/cellHeight/lineRepeat)`). Output height hugs the rows the
	 * text actually uses instead of padding to a square.
	 */
	size: number;
	/**
	 * Bundled font: `"5x8"`, `"6x12"`, `"8x13"` (X.org BDF), `"8x8"`
	 * (unscii-8), or `"silver"` (embedded TrueType). Default `"5x8"`.
	 */
	font?: string;
	/**
	 * Target cell advance in pixels. Differing from the font's natural cell
	 * triggers the Lanczos stretch path. Default: font natural width.
	 */
	cellWidth?: number;
	/** Target cell pitch in pixels. Default: font natural height. */
	cellHeight?: number;
	/**
	 * Ink variant: `"sent"` (six-hue sentence cycling) or `"bw"` (black).
	 * Default `"sent"`.
	 */
	variant?: string;
	/**
	 * Print each text line this many times; copies after the first sit on a
	 * pale highlight band. Default 1.
	 */
	lineRepeat?: number;
	/**
	 * Stretch behavior. Unset: auto — Lanczos-stretch whenever the target
	 * cell differs from the font's natural cell. `false`: never stretch —
	 * render indexed with glyphs at natural size on the requested cell box
	 * (e.g. 8x13 glyphs on an 8x16 pitch, the "8on16" shapes). `true`: force
	 * the stretch path (identical to auto; natural cells render indexed).
	 */
	stretch?: boolean;
	/**
	 * Layout columns: `1` (default) row-major grid; `2` two newspaper "doc"
	 * columns of pre-wrapped newline-separated lines.
	 */
	columns?: number;
}

interface SnapcompactBindings {
	renderSnapcompactPng(text: string, options: SnapcompactRenderOptions): Promise<string>;
	snapcompactSupportedChars(font: string, chars: string): string;
}

/** Candidate addon files for this platform, best first (OMP loader-state.js variant order). */
function candidates(): string[] {
	const tag = `${process.platform}-${process.arch}`;
	if (tag !== "linux-x64") return [`pi_natives.${tag}.node`];
	let avx2 = false;
	try {
		avx2 = /\bavx2\b/i.test(readFileSync("/proc/cpuinfo", "utf8"));
	} catch {
		// Unknown CPU features: baseline is always safe.
	}
	const files = ["pi_natives.linux-x64-baseline.node"];
	return avx2 ? ["pi_natives.linux-x64-modern.node", ...files] : files;
}

function loadBindings(): SnapcompactBindings | undefined {
	const require = createRequire(import.meta.url);
	for (const file of candidates()) {
		try {
			return require(`../native/${file}`);
		} catch {
			// Missing or incompatible build: try the next one.
		}
	}
	return undefined;
}

const bindings = loadBindings();

/** False when no snapcompact renderer exists for this platform (not downloaded or unsupported). */
export const nativeAvailable = bindings !== undefined;

function requireBindings(): SnapcompactBindings {
	if (!bindings) throw new Error(`snapcompact renderer unavailable on ${process.platform}-${process.arch}`);
	return bindings;
}

/**
 * Render one snapcompact frame on a libuv worker: print pre-normalized text
 * onto a `size`-wide bitmap and encode it as PNG. Returns the PNG as base64.
 * `U+000E`/`U+000F` in `text` toggle dim-gray ink spans without occupying a cell.
 */
export const renderSnapcompactPng = (text: string, options: SnapcompactRenderOptions): Promise<string> =>
	requireBindings().renderSnapcompactPng(text, options);

/**
 * Return the subset of `chars` that the named snapcompact font can render.
 * Renderer control codes are considered renderable.
 */
export const snapcompactSupportedChars = (font: string, chars: string): string =>
	requireBindings().snapcompactSupportedChars(font, chars);
