// Origin: OMP 18.1.16 soft compaction (pi-agent-core/src/compaction/compaction.ts compact(),
// :751-773 snapcompact-archive migration). Local changes: the summary itself is Pi's built-in
// summarizer (structurally equivalent, see UPSTREAM.json); this module only covers what Pi
// can't: summarizing after a snapcompact (Pi would treat the frame-reading template as the
// previous summary) and carrying file lists across extension compactions.

import {
	compact,
	type ExtensionContext,
	type SessionBeforeCompactEvent,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { readOmpDetails, type OmpCompactionDetails } from "./methods.ts";
import { archiveAsText } from "./snapcompact/run.ts";
import { computeFileLists, upsertFileOperations } from "./snapcompact/snapcompact.ts";

/** Latest compaction entry on the branch, with its extension details if any. */
export function latestCompaction(branch: SessionEntry[]) {
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry?.type === "compaction") return { entry, details: readOmpDetails(entry.details) };
	}
	return undefined;
}

/** Read/modified file lists for this compaction, merged with the previous extension compaction. */
export function mergedFileLists(event: SessionBeforeCompactEvent): { readFiles: string[]; modifiedFiles: string[] } {
	const fileOps = event.preparation.fileOps;
	const previous = latestCompaction(event.branchEntries)?.details;
	if (previous) {
		for (const file of previous.readFiles) fileOps.read.add(file);
		for (const file of previous.modifiedFiles) fileOps.edited.add(file);
	}
	return computeFileLists(fileOps);
}

/**
 * Soft compaction. Returns undefined to let Pi's built-in summarizer run, unless the
 * previous compaction was an extension one: then the previous summary is rebuilt from its
 * archive text (snapcompact) and file lists are merged, and Pi's `compact()` runs here.
 */
export async function runSoft(
	ctx: ExtensionContext,
	event: SessionBeforeCompactEvent,
	focus: string | undefined,
): Promise<{ summary: string; firstKeptEntryId: string; tokensBefore: number; details: OmpCompactionDetails } | undefined> {
	const previous = latestCompaction(event.branchEntries)?.details;
	if (!previous) return undefined;
	const model = ctx.model;
	if (!model) throw new Error("No model selected");

	const preparation = event.preparation;
	if (previous.omp.method === "snapcompact" && previous.omp.archive) {
		const text = archiveAsText(previous.omp.archive);
		if (text) preparation.previousSummary = text;
	}
	const { readFiles, modifiedFiles } = mergedFileLists(event);
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) throw new Error(`No credentials for ${model.provider}/${model.id}`);

	const result = await compact(
		preparation,
		model,
		auth.apiKey,
		auth.headers,
		focus,
		event.signal,
		ctx.thinkingLevel,
		undefined,
		auth.env,
		undefined,
		undefined,
		ctx.sessionManager.getSessionId(),
	);
	return {
		summary: upsertFileOperations(result.summary, readFiles, modifiedFiles),
		firstKeptEntryId: result.firstKeptEntryId,
		tokensBefore: result.tokensBefore,
		details: { omp: { method: "soft" }, readFiles, modifiedFiles },
	};
}
