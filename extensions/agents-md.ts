import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Adds this setup's AGENTS.md (the package root) to every run as a context file.
 *
 * Pi loads only one AGENTS.md from the agent directory, which belongs to the user. This one
 * goes first, so the user's own ~/.pi/agent/AGENTS.md and project AGENTS.md files come after
 * it and take precedence where they differ. Read on each run, so edits apply without a restart.
 * Disable this extension with `pi config` to drop the setup's instructions.
 */
const AGENTS_MD = join(dirname(dirname(fileURLToPath(import.meta.url))), "AGENTS.md");

export default function agentsMd(pi: ExtensionAPI): void {
	pi.on("before_agent_start", (event) => {
		if (!existsSync(AGENTS_MD)) return;
		const files = event.systemPromptOptions.contextFiles;
		if (files.some((file) => file.path === AGENTS_MD)) return;
		files.unshift({ path: AGENTS_MD, content: readFileSync(AGENTS_MD, "utf8") });
	});
}
