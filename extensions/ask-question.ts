import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * ask_question: one question with up to three options plus a custom answer.
 * Works wherever Pi has a dialog UI (`ctx.hasUI`): the terminal and RPC clients
 * such as T3 Code, which forward `select`/`input` dialogs to their own UI.
 * Replaces @henryqw/pi-ask-question (MIT), which only ran in the terminal.
 */

const CUSTOM_OPTION_LABEL = "Something else.";
const RECOMMENDED_SUFFIX = /\s*\(recommended\)\s*$/i;

const AskQuestionParams = Type.Object({
  question: Type.String({ description: "Question to ask user", minLength: 1 }),
  options: Type.Array(
    Type.Object({
      label: Type.String({ description: "Display label for the option", minLength: 1 }),
      description: Type.Optional(
        Type.String({ description: "Optional description shown below label", minLength: 1 }),
      ),
    }),
    {
      description: "One to three meaningful options, ordered with recommended option first",
      minItems: 1,
      maxItems: 3,
    },
  ),
});

export default function askQuestionExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_question",
    label: "Ask Question",
    description:
      "Ask the user one question with up to three options or a custom answer. First option is shown as recommended.",
    promptSnippet: "Ask the user one question with up to three options or a custom answer",
    promptGuidelines: [
      "Use ask_question instead of plain assistant text whenever user input is needed to proceed. If it reports that no UI is available, ask in plain assistant text.",
      "Give ask_question one to three concise, meaningful options without inventing filler, put recommended option first, and omit '(Recommended)' from its label.",
      "Give ask_question option descriptions only when they explain meaningful tradeoffs; never repeat option labels.",
    ],
    parameters: AskQuestionParams,
    executionMode: "sequential",
    exposure: "model-only",

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const text = (value: string) => ({
        content: [{ type: "text" as const, text: value }],
        details: {},
      });
      if (!ctx.hasUI) return text("Error: UI not available; ask in plain assistant text instead");

      const question = params.question.trim();
      const options = params.options.map((option) => ({
        label: option.label.trim().replace(RECOMMENDED_SUFFIX, ""),
        description: option.description?.trim(),
      }));
      const labels = options.map((option) => option.label.toLowerCase());
      if (!question) return text("Error: Question must not be blank");
      if (labels.some((label) => !label)) return text("Error: Option labels must not be blank");
      if (new Set(labels).size !== labels.length)
        return text("Error: Option labels must be unique");
      if (labels.includes(CUSTOM_OPTION_LABEL.toLowerCase()))
        return text(`Error: Option label "${CUSTOM_OPTION_LABEL}" is reserved`);

      const choices = options.map(
        (option, index) =>
          `${index + 1}. ${option.label}${index === 0 ? " (Recommended)" : ""}${
            option.description ? `: ${option.description}` : ""
          }`,
      );
      choices.push(`${choices.length + 1}. ${CUSTOM_OPTION_LABEL}`);

      const blocking = ctx.mode === "tui";
      if (blocking) pi.events.emit("herdr:blocked", { active: true, label: "Input required" });
      try {
        const selected = await ctx.ui.select(question, choices, { signal });
        if (selected === undefined) return text("User cancelled question");
        const index = choices.indexOf(selected);
        if (index >= 0 && index < options.length) {
          return text(`User selected: ${index + 1}. ${options[index]!.label}`);
        }
        // RPC clients may return free text instead of a listed choice (T3's
        // custom answer field); otherwise the user picked "Something else."
        const custom =
          index === -1
            ? selected.trim()
            : (await ctx.ui.input(CUSTOM_OPTION_LABEL, "Type your answer", { signal }))?.trim();
        return custom ? text(`User wrote: ${custom}`) : text("User cancelled question");
      } finally {
        if (blocking) pi.events.emit("herdr:blocked", { active: false });
      }
    },
  });
}
