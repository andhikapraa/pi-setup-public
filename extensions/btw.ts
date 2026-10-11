import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, type Message, uuidv7 } from "@earendil-works/pi-ai";
import {
  buildSessionContext,
  convertToLlm,
  copyToClipboard,
  type ExtensionAPI,
  type ExtensionContext,
  getMarkdownTheme,
  serializeConversation,
} from "@earendil-works/pi-coding-agent";
import { Markdown, matchesKey, Text } from "@earendil-works/pi-tui";

/**
 * /btw: OMP-style side questions. Answers use the current conversation as context
 * but are never added to it, never run tools, and work while the agent is busy.
 *   /btw <question>  ask a new independent side question
 *   /btw             browse this session's side questions (view, follow up, copy, delete)
 * Panel keys (main editor empty): Esc cancel/close, f follow-up, c copy.
 * History: <sessionDir>/btw-history/<sessionId>/<topicId>.json; memory-only without a session file.
 *
 * Prompt cache: the side request replays the main turn's exact last request (system prompt,
 * tool declarations, messages) plus the messages finished since, then appends the question,
 * so the provider sees the main conversation's prefix. Tool calls in the reply are discarded.
 * Before the first main request of this process (e.g. right after resume) there is nothing
 * to replay, so it falls back to sending the conversation as text, which misses the cache.
 */

const SIDE_INSTRUCTION = `[Side question from the user. This is not a new task: do not continue the work above,
do not call tools, and do not claim to have changed anything. Answer directly and concisely in text.]`;

const FALLBACK_SYSTEM_PROMPT = `You answer a side question about an ongoing coding-agent conversation.
The main conversation is provided as context only. Do not continue its task, do not call tools,
and do not claim to have changed anything. Answer the side question directly and concisely.`;

interface Turn {
  question: string;
  answer: string;
  status: "done" | "running" | "cancelled" | "error";
}

interface Topic {
  id: string;
  createdAt: number;
  turns: Turn[];
}

const WIDGET = "btw";

/**
 * Mid-turn, the last assistant message may hold tool calls whose results haven't arrived.
 * Providers reject a user message after unanswered tool calls, so cut back to before that
 * assistant message. The shared prefix up to there still hits the cache.
 */
const withoutPendingToolCalls = (messages: Message[]): Message[] => {
  const answered = new Set(messages.flatMap((m) => (m.role === "toolResult" ? [m.toolCallId] : [])));
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const pending = m.content.some((c) => c.type === "toolCall" && !answered.has(c.id));
    return pending ? messages.slice(0, i) : messages;
  }
  return messages;
};

export default function (pi: ExtensionAPI) {
  let topics: Topic[] = [];
  let shown: Topic | undefined;
  let running: { topic: Topic; abort: AbortController } | undefined;
  let ctxRef: ExtensionContext | undefined;
  let unsubscribeKeys: (() => void) | undefined;
  // Exact transcript of the latest main request, and the messages finished after it.
  let lastRequest: AgentMessage[] | undefined;
  let sinceRequest: AgentMessage[] = [];

  const historyDir = (ctx: ExtensionContext) => {
    const sm = ctx.sessionManager;
    return sm.getSessionFile() ? join(sm.getSessionDir(), "btw-history", sm.getSessionId()) : undefined;
  };

  const save = (topic: Topic) => {
    const dir = ctxRef && historyDir(ctxRef);
    if (!dir) return;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, `${topic.id}.json`);
    // A running turn is saved as cancelled so a crash never leaves a stale "running" record.
    const turns = topic.turns.map((t) => (t.status === "running" ? { ...t, status: "cancelled" as const } : t));
    writeFileSync(file, JSON.stringify({ ...topic, turns }, null, 2), { mode: 0o600 });
    chmodSync(file, 0o600);
  };

  const load = (ctx: ExtensionContext) => {
    const dir = historyDir(ctx);
    topics = [];
    if (!dir || !existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      try {
        topics.push(JSON.parse(readFileSync(join(dir, name), "utf-8")) as Topic);
      } catch {
        // Skip unreadable records rather than failing session start.
      }
    }
    topics.sort((a, b) => b.createdAt - a.createdAt);
  };

  const render = () => {
    const ctx = ctxRef;
    if (!ctx) return;
    if (!shown) {
      ctx.ui.setWidget(WIDGET, undefined);
      return;
    }
    const topic = shown;
    ctx.ui.setWidget(WIDGET, (_tui, theme) => {
      const mdTheme = getMarkdownTheme();
      return {
        render(width: number) {
          const lines: string[] = [theme.fg("accent", "─".repeat(Math.max(0, width)))];
          topic.turns.forEach((turn, i) => {
            const label = i === 0 ? "btw" : "follow-up";
            lines.push(...new Text(theme.fg("accent", `${label}: `) + turn.question, 1, 0).render(width));
            const body = turn.answer || (turn.status === "running" ? theme.fg("muted", "thinking…") : "");
            if (body) lines.push(...new Markdown(body, 1, 0, mdTheme).render(width));
            if (turn.status === "cancelled") lines.push(theme.fg("warning", " Cancelled"));
            if (turn.status === "error") lines.push(theme.fg("error", " Failed"));
          });
          const busy = running?.topic === topic;
          const keys = busy ? "esc cancel" : "esc close · f follow-up · c copy · /btw history";
          lines.push(theme.fg("dim", ` ${keys}`));
          return lines;
        },
        invalidate() {},
      };
    });
  };

  const show = (topic: Topic | undefined) => {
    shown = topic;
    render();
  };

  const lastAnswer = (topic: Topic) =>
    [...topic.turns].reverse().find((t) => t.answer.trim())?.answer;

  const ask = async (ctx: ExtensionContext, topic: Topic, question: string) => {
    if (running) {
      ctx.ui.notify("A /btw request is already running; press Esc to cancel it first", "warning");
      return;
    }
    const model = ctx.model;
    if (!model) {
      ctx.ui.notify("No model selected", "error");
      return;
    }

    const prior = topic.turns.filter((t) => t.status === "done");
    const turn: Turn = { question, answer: "", status: "running" };
    topic.turns.push(turn);
    if (!topics.includes(topic)) topics.unshift(topic);

    const reply = (text: string): AssistantMessage => ({
      role: "assistant",
      content: [{ type: "text", text }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop",
      timestamp: Date.now(),
    });
    const user = (text: string): Message => ({ role: "user", content: [{ type: "text", text }], timestamp: Date.now() });
    const sideTurns: Message[] = [];
    prior.forEach((t, i) => sideTurns.push(user(i === 0 ? `${SIDE_INSTRUCTION}\n\n${t.question}` : t.question), reply(t.answer)));
    sideTurns.push(user(prior.length === 0 ? `${SIDE_INSTRUCTION}\n\n${question}` : question));

    let context: { systemPrompt?: string; messages: Message[] };
    if (lastRequest) {
      // No systemPrompt/tools/toolChoice here: they live in the replayed leading system message,
      // and changing tool_choice would invalidate the provider's cached message prefix.
      const main = convertToLlm([...lastRequest, ...sinceRequest]);
      context = { messages: [...withoutPendingToolCalls(main), ...sideTurns] };
    } else {
      const sm = ctx.sessionManager;
      const main = buildSessionContext(sm.getEntries(), sm.getLeafId()).messages;
      const conversation = serializeConversation(convertToLlm(main));
      context = {
        systemPrompt: FALLBACK_SYSTEM_PROMPT,
        messages: [
          user(`## Main conversation (context only)\n\n${conversation || "(empty)"}`),
          reply("Understood. What is your side question?"),
          ...sideTurns,
        ],
      };
    }

    const abort = new AbortController();
    running = { topic, abort };
    show(topic);

    try {
      const stream = ctx.modelRegistry.streamSimple(model, context, {
        signal: abort.signal,
        // Same routing id as the main session so providers keyed on it reuse the cached prefix.
        sessionId: ctx.sessionManager.getSessionId(),
        reasoning: ctx.thinkingLevel === "off" ? undefined : ctx.thinkingLevel,
      });
      for await (const event of stream) {
        if (event.type === "text_delta") {
          turn.answer += event.delta;
          render();
        } else if (event.type === "error") {
          turn.status = event.reason === "aborted" ? "cancelled" : "error";
          if (event.reason === "error") ctx.ui.notify(`btw: ${event.error.errorMessage ?? "request failed"}`, "error");
        } else if (event.type === "done") {
          turn.status = "done";
          const u = event.message.usage;
          ctx.ui.setStatus(WIDGET, `btw ↑${u.input} R${u.cacheRead} W${u.cacheWrite}`);
        }
      }
      if (turn.status === "running") turn.status = abort.signal.aborted ? "cancelled" : "done";
    } catch (err) {
      turn.status = abort.signal.aborted ? "cancelled" : "error";
      if (!abort.signal.aborted) ctx.ui.notify(`btw: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      running = undefined;
      save(topic);
      render();
    }
  };

  const followUp = async (ctx: ExtensionContext, topic: Topic) => {
    const question = (await ctx.ui.input("btw follow-up", "Ask a follow-up…"))?.trim();
    if (question) await ask(ctx, topic, question);
  };

  const copy = async (ctx: ExtensionContext, topic: Topic) => {
    const answer = lastAnswer(topic);
    if (!answer) return ctx.ui.notify("Nothing to copy", "info");
    await copyToClipboard(answer);
    ctx.ui.notify("Copied btw answer", "info");
  };

  const browse = async (ctx: ExtensionContext) => {
    if (topics.length === 0) return ctx.ui.notify("No side questions in this session. Use /btw <question>.", "info");
    const labels = topics.map((t, i) => {
      const state = running?.topic === t ? " (running)" : "";
      const more = t.turns.length > 1 ? ` +${t.turns.length - 1}` : "";
      return `${i + 1}. ${t.turns[0]?.question.slice(0, 70) ?? ""}${more}${state}`;
    });
    const picked = await ctx.ui.select("btw history (newest first)", labels);
    if (!picked) return;
    const topic = topics[labels.indexOf(picked)];
    if (!topic) return;
    show(topic);
    const isRunning = running?.topic === topic;
    const actions = isRunning ? ["View", "Cancel"] : ["View", "Follow up", "Copy answer", "Delete"];
    const action = await ctx.ui.select("btw", actions);
    if (action === "Cancel") running?.abort.abort();
    else if (action === "Follow up") await followUp(ctx, topic);
    else if (action === "Copy answer") await copy(ctx, topic);
    else if (action === "Delete") {
      const dir = historyDir(ctx);
      if (dir) rmSync(join(dir, `${topic.id}.json`), { force: true });
      topics = topics.filter((t) => t !== topic);
      show(undefined);
    }
  };

  const bindKeys = (ctx: ExtensionContext) => {
    unsubscribeKeys?.();
    // Panel keys only apply while a panel is visible and the main editor is empty,
    // so typing a normal prompt that starts with f or c is never intercepted.
    unsubscribeKeys = ctx.ui.onTerminalInput((data) => {
      if (!shown || ctx.ui.getEditorText() !== "") return undefined;
      const topic = shown;
      if (matchesKey(data, "escape")) {
        if (running?.topic === topic) running.abort.abort();
        else show(undefined);
        return { consume: true };
      }
      if (running) return undefined;
      if (data === "f") {
        void followUp(ctx, topic);
        return { consume: true };
      }
      if (data === "c") {
        void copy(ctx, topic);
        return { consume: true };
      }
      return undefined;
    });
  };

  // Other installed extensions don't rewrite context, so this snapshot matches the provider request.
  pi.on("context_with_system", async (event) => {
    lastRequest = structuredClone(event.messages);
    sinceRequest = [];
    return undefined;
  });

  // Messages finished after the last request (the assistant reply, tool results) extend the prefix.
  pi.on("message_end", async (event) => {
    if (lastRequest) sinceRequest.push(event.message);
    return undefined;
  });

  pi.on("session_start", async (_event, ctx) => {
    running?.abort.abort();
    running = undefined;
    lastRequest = undefined;
    sinceRequest = [];
    ctxRef = ctx;
    load(ctx);
    show(undefined);
    if (ctx.mode === "tui") bindKeys(ctx);
  });

  pi.on("session_shutdown", async () => {
    running?.abort.abort();
    unsubscribeKeys?.();
    unsubscribeKeys = undefined;
  });

  pi.registerCommand("btw", {
    description: "Ask a side question without adding it to the conversation (bare: history)",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") return ctx.ui.notify("/btw requires interactive mode", "error");
      ctxRef = ctx;
      const question = args.trim();
      if (!question) return browse(ctx);
      // Not awaited: the command returns immediately so the main turn keeps streaming.
      void ask(ctx, { id: uuidv7(), createdAt: Date.now(), turns: [] }, question);
    },
  });
}
