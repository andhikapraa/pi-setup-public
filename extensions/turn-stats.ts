import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/**
 * Port of OMP's per-response usage row (modes/components/usage-row.ts), shown after
 * every assistant message, including the ones that only call tools:
 *   time  Δ prompt→reply   input+cacheWrite   output   cache read   time to first token   output/s
 * Stored as a custom session entry: shown in the chat, never sent to the model.
 * Pi messages carry no timing, so request start, first token and end are measured here.
 */

interface UsageRow {
  at: number;
  input: number;
  output: number;
  cacheRead: number;
  /** User prompt to this reply's end. */
  elapsedMs?: number;
  /** Request start to first streamed token. */
  ttftMs?: number;
  /** Request start to reply end; tokens/s uses this, like OMP. */
  durationMs?: number;
}

/** Below this the rate is meaningless (OMP MIN_DURATION_MS). */
const MIN_DURATION_MS = 100;

const formatNumber = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`;

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.round(s % 60)}s`;
};

const timestamp = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

export default function (pi: ExtensionAPI) {
  let promptAt: number | undefined;
  let requestAt: number | undefined;
  let firstTokenAt: number | undefined;
  // Measured at message_end, stored at turn_end (after Pi persists the turn).
  let pending: UsageRow | undefined;

  pi.on("agent_start", async () => {
    promptAt = Date.now();
  });

  // Each turn is one model request.
  pi.on("turn_start", async () => {
    requestAt = Date.now();
    firstTokenAt = undefined;
  });

  pi.on("message_update", async (event) => {
    if (firstTokenAt === undefined && event.message.role === "assistant") firstTokenAt = Date.now();
  });

  pi.on("message_end", async (event) => {
    const m = event.message;
    if (m.role !== "assistant") return;
    const u = m.usage;
    // OMP shows rows only for billed responses.
    if (u.input + u.output + u.cacheRead + u.cacheWrite === 0) return;
    const now = Date.now();
    pending = {
      at: now,
      input: u.input + u.cacheWrite,
      output: u.output,
      cacheRead: u.cacheRead,
      elapsedMs: promptAt ? now - promptAt : undefined,
      ttftMs: requestAt && firstTokenAt ? firstTokenAt - requestAt : undefined,
      durationMs: requestAt ? now - requestAt : undefined,
    };
  });

  // turn_end runs after the reply is persisted, and Pi commits returned entries right after
  // it, so the row stays below its reply on reload. A deferred pi.appendEntry() instead
  // races session disposal (print mode exit, /new, /reload) and throws on a stale ctx.
  pi.on("turn_end", async (event) => {
    if (!pending) return;
    const row = pending;
    pending = undefined;
    return { entries: [...event.entries, { type: "custom", customType: "usage-row", data: row }] };
  });

  pi.registerEntryRenderer<UsageRow>("usage-row", (entry, _opts, theme) => {
    const s = entry.data;
    if (!s) return new Text("", 0, 0);
    const parts = [timestamp(s.at)];
    if (s.elapsedMs && s.elapsedMs > 0) parts.push(`Δ ${formatDuration(s.elapsedMs)}`);
    parts.push(` ${formatNumber(s.input)}`, ` ${formatNumber(s.output)}`);
    if (s.cacheRead > 0) parts.push(` ${formatNumber(s.cacheRead)}`);
    if (s.ttftMs && s.ttftMs > 0) parts.push(` ${(s.ttftMs / 1000).toFixed(1)}s`);
    if (s.durationMs && s.durationMs > MIN_DURATION_MS && s.output > 0) {
      parts.push(` ${((s.output / s.durationMs) * 1000).toFixed(1)}/s`);
    }
    return new Text(theme.fg("dim", parts.join("  ")), 1, 0);
  });
}
