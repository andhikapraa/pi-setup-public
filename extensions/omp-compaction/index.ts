// Port of OMP 18.1.16 context maintenance to Pi: `/compact [soft|remote|snapcompact] [focus]`,
// `/handoff [focus]`, `/shake [elide|images|thinking]`, and the OMP method order for automatic
// compaction. Origin + local changes: UPSTREAM.json.
//
// Pi runs `/compact` itself and passes its arguments to `session_before_compact` as
// `customInstructions`; this extension parses them there. Remote (provider-side) compaction is
// not available on Pi and always falls back to soft.

import {
	estimateTokens,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionBeforeCompactEvent,
	type SessionBeforeCompactResult,
} from "@earendil-works/pi-coding-agent";
import { generateHandoff } from "./handoff.ts";
import {
	type CompactionMethod,
	DEFAULT_COMPACTION_METHOD_ORDER,
	findCompactMode,
	HANDOFF_MARKER,
	parseCompactArgs,
} from "./methods.ts";
import { rebuildCompactionContext } from "./rebuild.ts";
import { runShake, type ShakeMode } from "./shake.ts";
import { latestCompaction, mergedFileLists, runSoft } from "./soft.ts";
import { modelSupportsImages, runSnapcompact } from "./snapcompact/run.ts";
import { upsertFileOperations } from "./snapcompact/snapcompact.ts";

/** OMP: after an automatic shake, stop if context is below this share of the threshold. */
const SHAKE_SUFFICIENT_RATIO = 0.8;

/** OMP shake verbs (builtin-lifecycle.ts parseShakeMode). */
function parseShakeMode(args: string): ShakeMode | { error: string } {
	const verb = args.trim().toLowerCase();
	if (verb === "" || verb === "elide") return "elide";
	if (verb === "images" || verb === "thinking") return verb;
	return { error: `Unknown /shake mode "${verb}". Use elide, images, or thinking.` };
}

/** Context tokens after shaking, from the projection (Pi's chars/4 estimate). */
function projectedTokens(ctx: ExtensionContext): number {
	return ctx.sessionManager.buildSessionProjection().messages.reduce((sum, m) => sum + estimateTokens(m), 0);
}

export default function ompCompaction(pi: ExtensionAPI): void {
	/** Run one method. `undefined` = method unavailable or declined; caller tries the next. */
	async function runMethod(
		method: CompactionMethod,
		event: SessionBeforeCompactEvent,
		ctx: ExtensionContext,
		focus: string | undefined,
		explicit: boolean,
	): Promise<SessionBeforeCompactResult | "default" | undefined> {
		const model = ctx.model;
		if (!model) return undefined;
		switch (method) {
			case "remote":
				if (explicit) ctx.ui.notify("Remote compaction is unavailable on Pi; using soft.", "info");
				return undefined;
			case "snapcompact": {
				if (focus) return undefined; // focus implies a directed LLM summary
				if (!explicit && !modelSupportsImages(model)) return undefined;
				const result = await runSnapcompact({
					preparation: event.preparation,
					previousArchive: latestCompaction(event.branchEntries)?.details?.omp.archive,
					model,
					contextWindow: model.contextWindow,
					branchEntries: event.branchEntries,
				});
				if ("skip" in result) {
					ctx.ui.notify(`Snapcompact skipped: ${result.skip}`, "warning");
					return undefined;
				}
				return {
					compaction: {
						summary: result.summary,
						firstKeptEntryId: result.firstKeptEntryId,
						tokensBefore: result.tokensBefore,
						details: {
							omp: { method: "snapcompact", archive: result.archive },
							readFiles: result.readFiles,
							modifiedFiles: result.modifiedFiles,
						},
					},
				};
			}
			case "handoff": {
				const document = await generateHandoff(ctx, focus, event.signal);
				const { readFiles, modifiedFiles } = mergedFileLists(event);
				return {
					compaction: {
						summary: upsertFileOperations(document, readFiles, modifiedFiles),
						firstKeptEntryId: event.preparation.firstKeptEntryId,
						tokensBefore: event.preparation.tokensBefore,
						details: { omp: { method: "handoff" }, readFiles, modifiedFiles },
					},
				};
			}
			case "shake": {
				const outcome = await runShake(ctx, { mode: "elide", config: "default" });
				if (outcome.regions > 0) {
					pi.appendEntry("omp-shake", { file: outcome.recoveryFile, regions: outcome.edits });
					ctx.ui.notify(outcome.summary, "info");
				}
				// OMP stops at shake only when it brought context well under the threshold.
				const settings = pi.getSettings().compaction;
				const threshold = model.contextWindow - (settings?.reserveTokens ?? 16384);
				const enough = outcome.regions > 0 && projectedTokens(ctx) < threshold * SHAKE_SUFFICIENT_RATIO;
				// On overflow Pi only retries the turn after a real compaction, so keep going.
				if (enough && event.reason !== "overflow") return { cancel: true };
				return undefined;
			}
			case "soft": {
				const result = await runSoft(ctx, event, focus);
				return result ? { compaction: result } : "default";
			}
		}
	}

	pi.on("session_before_compact", async (event, ctx) => {
		const raw = event.customInstructions ?? "";
		let order: readonly CompactionMethod[];
		let focus: string | undefined;
		let explicit = false;

		if (raw.startsWith(HANDOFF_MARKER)) {
			order = ["handoff"];
			focus = raw.slice(HANDOFF_MARKER.length).trim() || undefined;
			explicit = true;
		} else if (event.reason === "manual") {
			const parsed = parseCompactArgs(raw);
			if ("error" in parsed) {
				ctx.ui.notify(parsed.error, "error");
				return { cancel: true };
			}
			focus = parsed.instructions;
			const mode = parsed.mode ? findCompactMode(parsed.mode) : undefined;
			explicit = mode !== undefined;
			// Bare manual /compact never runs handoff or shake (OMP manual selection).
			order = mode
				? mode.methodOrder
				: DEFAULT_COMPACTION_METHOD_ORDER.filter(m => m !== "handoff" && m !== "shake");
		} else {
			// OMP auto: handoff is skipped on overflow (its request would reuse the oversized input).
			order = DEFAULT_COMPACTION_METHOD_ORDER.filter(m => !(m === "handoff" && event.reason === "overflow"));
		}

		for (const method of order) {
			try {
				const result = await runMethod(method, event, ctx, focus, explicit);
				if (result === "default") return undefined; // Pi's built-in soft summary
				if (result) return result;
			} catch (error) {
				if (event.signal.aborted) throw error;
				const message = error instanceof Error ? error.message : String(error);
				// An explicit single-method request has nowhere to fall back to.
				if (order.length === 1) throw error;
				ctx.ui.notify(`${method} compaction failed: ${message}; trying next method.`, "warning");
			}
		}
		// Every method declined. Explicit remote → soft is the last entry; otherwise Pi's default.
		return undefined;
	});

	pi.on("context", async (event, ctx) => rebuildCompactionContext(event, ctx));

	pi.registerCommand("handoff", {
		description: "Replace the conversation with a handoff document written by the model",
		handler: async (args, ctx) => {
			ctx.ui.notify("Writing handoff document…", "info");
			ctx.compact({
				customInstructions: `${HANDOFF_MARKER}${args.trim()}`,
				onComplete: result =>
					ctx.ui.notify(`Handoff complete. ~${result.tokensBefore} tokens replaced by the handoff document.`, "info"),
				onError: error => ctx.ui.notify(`Handoff failed: ${error.message}`, "error"),
			});
		},
	});

	pi.registerCommand("shake", {
		description: "Drop heavy content from context (elide | images | thinking)",
		handler: async (args, ctx) => {
			const mode = parseShakeMode(args);
			if (typeof mode !== "string") {
				ctx.ui.notify(mode.error, "error");
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Agent is busy; press Esc first, then /shake.", "warning");
				return;
			}
			const outcome = await runShake(ctx, { mode, config: "aggressive" });
			if (outcome.regions > 0) {
				pi.appendEntry("omp-shake", { file: outcome.recoveryFile, regions: outcome.edits });
			}
			ctx.ui.notify(outcome.summary, "info");
		},
	});
}
