import type { ExtensionAPI, ExtensionCommandContext, SessionEntry as Entry } from "@earendil-works/pi-coding-agent";

const isRole = (e: Entry, role: string) => e.type === "message" && e.message.role === role;

/** Tools that can leave changes on disk; bash is included because it can write files. */
const FILE_CHANGING_TOOLS = new Set(["write", "edit", "bash"]);

/**
 * /retry: OMP-style recovery. Only acts when the last turn failed or was aborted.
 *   Drops the failed reply (kept in /tree) and resumes from the step before it,
 *   so tool calls that already ran stay in context.
 * /regen: re-run the last user prompt from scratch (previous attempt kept in /tree).
 */
export default function (pi: ExtensionAPI) {
  const resend = async (ctx: ExtensionCommandContext, user: Entry) => {
    if (user.type !== "message") return;
    // Navigating to a user message rewinds to its parent and puts its text in the editor.
    const { cancelled } = await ctx.navigateTree(user.id, { summarize: false });
    if (cancelled) return;
    ctx.ui.setEditorText("");
    pi.sendUserMessage(user.message.content);
  };

  pi.registerCommand("retry", {
    description: "Recover the last failed/aborted turn and continue from where it stopped",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy; press Esc first, then /retry", "warning");
        return;
      }
      const branch = ctx.sessionManager.getBranch();
      const last = [...branch].reverse().find((e) => isRole(e, "assistant"));
      if (!last || last.type !== "message" || last.message.role !== "assistant") {
        ctx.ui.notify("Nothing to retry", "info");
        return;
      }
      const reason = last.message.stopReason;
      if (reason !== "error" && reason !== "aborted") {
        ctx.ui.notify("Last turn finished normally; use /regen for a new answer", "info");
        return;
      }
      const parent = last.parentId ? ctx.sessionManager.getEntry(last.parentId) : undefined;
      if (!parent) {
        ctx.ui.notify("Nothing to retry", "info");
        return;
      }
      // Failed on the very first reply: nothing to resume, so resend the prompt.
      if (isRole(parent, "user")) {
        await resend(ctx, parent);
        return;
      }
      const { cancelled } = await ctx.navigateTree(parent.id, { summarize: false });
      if (cancelled) return;
      ctx.ui.setEditorText("");
      // Pi has no public continue(); a hidden note restarts the turn from this point.
      pi.sendMessage(
        {
          customType: "retry-continue",
          content: "The previous response failed before finishing. Continue the task from where it stopped.",
          display: false,
        },
        { triggerTurn: true },
      );
    },
  });

  pi.registerCommand("regen", {
    description: "Re-run the last user prompt from scratch (previous attempt stays in /tree)",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Agent is busy; press Esc first, then /regen", "warning");
        return;
      }
      const branch = ctx.sessionManager.getBranch();
      const userIndex = branch.findLastIndex((e) => isRole(e, "user"));
      const user = branch[userIndex];
      if (!user) {
        ctx.ui.notify("Nothing to regenerate", "info");
        return;
      }
      // Regenerating drops the turn from context, but its file changes stay on disk.
      const changers = new Set<string>();
      for (const e of branch.slice(userIndex + 1)) {
        if (e.type !== "message" || e.message.role !== "assistant") continue;
        for (const block of e.message.content) {
          if (block.type === "toolCall" && FILE_CHANGING_TOOLS.has(block.name)) changers.add(block.name);
        }
      }
      if (changers.size > 0) {
        const ok = await ctx.ui.confirm(
          "Regenerate anyway?",
          `This turn used ${[...changers].join(", ")}. Changes already made on disk stay, ` +
            "but the new attempt won't know about them. Use /retry for recovery, or revert first.",
        );
        if (!ok) return;
      }
      await resend(ctx, user);
    },
  });
}
