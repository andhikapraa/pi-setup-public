/**
 * Multi-skill invocation for Pi (vendored from pi-multi-skills 1.2.1, MIT; see UPSTREAM.json).
 *
 * Type `/` in the middle of a prompt to pick a skill; it inserts `/skill:name`, which loads
 * through the same `<skill>` block Pi uses for a leading `/skill:name`. Several skills per
 * prompt work. A `/` at the very start keeps Pi's normal command menu. References inside
 * code fences, inline code, paths (`docs/skill:x`), or escaped as `\/skill:` are ignored.
 * The menu opening on a mid-line `/` is triggered by the editor in ../input-bar.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expandSkillReferences } from "./expander";
import { getSkillCompletionPrefix } from "./parser";
import { buildSkillRegistry, type SkillInfo } from "./resolver";

const MAX_AUTOCOMPLETE_RESULTS = 20;
const LARGE_INJECTION_CHARACTERS = 50_000;

function truncateDescription(description: string, length: number): string {
  return description.length > length ? `${description.slice(0, length)}...` : description;
}

function rankAutocompleteSkills(registry: Map<string, SkillInfo>, partial: string): SkillInfo[] {
  return [...registry.values()]
    .filter(({ name }) => name.includes(partial))
    .sort((left, right) => {
      const prefixDifference = Number(!left.name.startsWith(partial)) - Number(!right.name.startsWith(partial));
      if (prefixDifference !== 0) return prefixDifference;
      const indexDifference = left.name.indexOf(partial) - right.name.indexOf(partial);
      return indexDifference || left.name.localeCompare(right.name);
    })
    .slice(0, MAX_AUTOCOMPLETE_RESULTS);
}

export default function multiSkillsExtension(pi: ExtensionAPI): void {
  let cachedRegistry: Map<string, SkillInfo> | undefined;

  const refreshRegistry = (): Map<string, SkillInfo> => {
    cachedRegistry = buildSkillRegistry(pi.getCommands());
    return cachedRegistry;
  };

  const getRegistry = (): Map<string, SkillInfo> => cachedRegistry ?? refreshRegistry();

  pi.on("session_start", (_event, ctx) => {
    refreshRegistry();
    const theme = ctx.ui.theme;

    // Stacks on Pi's provider: leading `/` commands and file-path completion keep working.
    ctx.ui.addAutocompleteProvider((current) => ({
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const line = lines[cursorLine] ?? "";
        const beforeCursor = line.slice(0, cursorCol);
        const slash = /(?:^|\s)(\/[a-z0-9:_-]*)$/.exec(beforeCursor);
        // Only mid-prompt: text must come before the slash, otherwise it's a command.
        const textBefore =
          slash !== null &&
          (lines.slice(0, cursorLine).join("").trim() !== "" ||
            beforeCursor.slice(0, beforeCursor.length - (slash[1]?.length ?? 0)).trim() !== "");
        const linePartial = textBefore ? getSkillCompletionPrefix(beforeCursor) : undefined;
        if (linePartial === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);

        // Re-check against the whole text so a `/` inside an open code fence doesn't complete.
        const partial =
          cursorLine === 0
            ? linePartial
            : getSkillCompletionPrefix([...lines.slice(0, cursorLine), beforeCursor].join("\n"));
        if (partial === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);
        if (options.signal.aborted) return null;

        // Prefix match only, so a stray `/word` in prose doesn't keep the menu open.
        const items = rankAutocompleteSkills(getRegistry(), partial)
          .filter(({ name }) => name.startsWith(partial))
          .map((skill) => ({
            value: `/skill:${skill.name} `,
            label: theme.fg("accent", `/skill:${skill.name}`),
            description: truncateDescription(skill.description, 80),
          }));
        if (items.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);

        return { prefix: slash?.[1] ?? "/", items };
      },

      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        if (!item.value.startsWith("/skill:") || !prefix.startsWith("/")) {
          return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
        }
        // Replace only the typed `/token`; keep the rest of the draft.
        const line = lines[cursorLine] ?? "";
        const start = cursorCol - prefix.length;
        const next = [...lines];
        next[cursorLine] = line.slice(0, start) + item.value + line.slice(cursorCol);
        return { lines: next, cursorLine, cursorCol: start + item.value.length };
      },

      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
      },
    }));
  });

  pi.on("input", async (event, ctx) => {
    // Extension-injected messages shouldn't trigger skill loading.
    if (event.source === "extension") return { action: "continue" };
    // A prompt starting with `/` is a command (incl. Pi's own `/skill:name`); prepending a
    // skill block would stop Pi from recognizing it, so leave it untouched.
    if (event.text.trimStart().startsWith("/")) return { action: "continue" };
    if (!event.text.includes("/skill:")) return { action: "continue" };

    const expansion = await expandSkillReferences(event.text, getRegistry());

    for (const failure of expansion.failures) {
      ctx.ui.notify(`Could not read skill file for $${failure.skill.name}: ${failure.message}`, "error");
    }
    if (!expansion.transformed) return { action: "continue" };

    if (expansion.bodyCharacters > LARGE_INJECTION_CHARACTERS) {
      ctx.ui.notify(
        `Loaded skill instructions contain ${expansion.bodyCharacters.toLocaleString("en-US")} characters; consider invoking fewer skills to preserve context.`,
        "warning",
      );
    }

    return event.images
      ? { action: "transform", text: expansion.text, images: event.images }
      : { action: "transform", text: expansion.text };
  });
}
