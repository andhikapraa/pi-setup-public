import { CustomEditor, type ExtensionAPI, type ExtensionContext, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/**
 * Port of OMP 18.1.16's editor status bar (status-line/component.ts, "box" layout,
 * default preset, nerd symbols, titanium theme) onto Pi's input box top border.
 *   left group:  pi icon · model · thinking │ folder │ git │ cost
 *   gauge:       session-accent line filled by context use, with % and window labels
 *   right group: session name
 * Pi's editor has no side borders, so the bar spans the full width and copied text
 * never includes │ or ╰─. Not ported: mode/collab/pr segments, compaction markers.
 */

// Titanium theme colors (OMP defaults/titanium.json).
const C = {
  bg: "#0f1216",
  sep: "#2a3038",
  border: "#2a3038",
  borderAccent: "#00b4ff",
  model: "#00b4ff",
  path: "#e8ecf4",
  gitClean: "#00ff88",
  gitDirty: "#ffb347",
  spend: "#d4c090",
  dim: "#6b7280",
  text: "#e8ecf4",
};
// Hues already used by the theme; the session accent shifts away from them.
const THEME_HEXES = ["#00b4ff", "#00ff88", "#ffb347", "#ff4757", "#d4c090", "#0082b3"];

// OMP nerd symbol preset.
const ICON = {
  pi: "\u{f0d57}",
  model: "\uec19",
  folder: "\uf115",
  branch: "\uf126",
  off: "\uf05e",
};
const THINKING: Record<string, string> = {
  minimal: "\u{f0a9e} min",
  low: "\u{f0a9f} low",
  medium: "\u{f0aa1} med",
  high: "\u{f0aa3} high",
  xhigh: "\u{f0aa5} xhi",
};
const SEP_THIN_LEFT = "\ue0b1";
const SEP_THIN_RIGHT = "\ue0b3";
const CAP_AFTER_LEFT = "\ue0b0";
const CAP_BEFORE_RIGHT = "\ue0b2";

const fg = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`;
};
const bg = (hex: string) => fg(hex).replace("[38;", "[48;");
const paint = (hex: string, s: string) => `${fg(hex)}${s}\x1b[39m`;

const hexToHue = (hex: string): number | undefined => {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (max === 0 || d / max < 0.1) return undefined;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

const hslToHex = (h: number, s: number, l: number) => {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

/** OMP getSessionAccentHex for dark themes: djb2 hue in 0-120, nudged ≥10° from theme hues. */
const sessionAccent = (name: string) => {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = (((hash << 5) + hash) ^ name.charCodeAt(i)) >>> 0;
  let hue = hash % 360 % 120;
  const taken = THEME_HEXES.map(hexToHue).filter((h): h is number => h !== undefined);
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const free = (h: number) => taken.every((t) => dist(h, t) >= 10);
  if (!free(hue)) {
    search: for (let d = 1; d <= 120; d++) {
      for (const dir of [1, -1]) {
        const c = Math.max(0, Math.min(120, hue + d * dir));
        if (free(c)) {
          hue = c;
          break search;
        }
      }
    }
  }
  return hslToHex(hue, 0.9, 0.72);
};

const formatNumber = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : `${n}`;

const shortPath = (cwd: string, max: number) => {
  const home = process.env.HOME;
  const p = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return p.length > max ? `…${p.slice(p.length - max + 1)}` : p;
};

interface Git {
  branch?: string;
  staged: number;
  unstaged: number;
  untracked: number;
}

export default function (pi: ExtensionAPI) {
  let git: Git | undefined;
  let tui: TUI | undefined;

  const refreshGit = async (cwd: string) => {
    const r = await pi.exec("git", ["status", "--porcelain=v1", "-b"], { cwd }).catch(() => undefined);
    if (!r || r.code !== 0) {
      git = undefined;
    } else {
      const [head = "", ...rows] = r.stdout.split("\n").filter(Boolean);
      const branch = head.replace(/^## /, "").split("...")[0]?.replace(/^No commits yet on /, "");
      git = { branch, staged: 0, unstaged: 0, untracked: 0 };
      for (const row of rows) {
        if (row.startsWith("??")) git.untracked++;
        else {
          if (row[0] !== " ") git.staged++;
          if (row[1] !== " ") git.unstaged++;
        }
      }
    }
    tui?.requestRender();
  };

  const segments = (ctx: ExtensionContext) => {
    const sep = paint(C.sep, SEP_THIN_LEFT);
    const left: string[] = [];
    left.push(paint(C.dim, ICON.pi));

    let model = ctx.model ? ctx.model.name || ctx.model.id : "no-model";
    if (model.startsWith("Claude ")) model = model.slice(7);
    let modelText = `${ICON.model} ${model}`;
    if (ctx.model?.reasoning) {
      const level = pi.getThinkingLevel();
      modelText += ` · ${level === "off" ? `${ICON.off} off` : (THINKING[level] ?? level)}`;
    }
    left.push(paint(C.model, modelText));
    left.push(paint(C.path, `${ICON.folder} ${shortPath(ctx.cwd, 40)}`));

    if (git?.branch || (git && git.staged + git.unstaged + git.untracked > 0)) {
      const dirty = git.staged + git.unstaged + git.untracked > 0;
      const marks = [
        git.unstaged ? `*${git.unstaged}` : "",
        git.staged ? `+${git.staged}` : "",
        git.untracked ? `?${git.untracked}` : "",
      ].filter(Boolean);
      const text = [git.branch ? `${ICON.branch} ${git.branch}` : "", ...marks].filter(Boolean).join(" ");
      left.push(paint(dirty ? C.gitDirty : C.gitClean, text));
    }

    let cost = 0;
    for (const e of ctx.sessionManager.getEntries()) {
      if (e.type === "message" && e.message.role === "assistant") cost += e.message.usage.cost.total;
    }
    if (cost > 0) left.push(paint(C.spend, `$${cost.toFixed(2)}`));

    const name = pi.getSessionName();
    const accent = name ? sessionAccent(name) : C.borderAccent;
    const right = name ? [paint(accent, name)] : [];
    return { left, right, sep, sepRight: paint(C.sep, SEP_THIN_RIGHT), accent };
  };

  /** OMP renderGroup: dark band, thin separators, solid powerline cap facing the gauge. */
  const group = (parts: string[], sep: string, dir: "left" | "right") => {
    if (parts.length === 0) return "";
    const body = `${bg(C.bg)}${fg(C.text)} ${parts.join(` ${sep}${fg(C.text)}${bg(C.bg)} `)} \x1b[0m`;
    const cap = `${fg(C.bg)}${dir === "left" ? CAP_AFTER_LEFT : CAP_BEFORE_RIGHT}\x1b[0m`;
    return dir === "left" ? body + cap : cap + body;
  };
  const groupWidth = (parts: string[]) =>
    parts.length === 0 ? 0 : parts.reduce((s, p) => s + visibleWidth(p), 0) + (parts.length - 1) * 3 + 2 + 1;

  /** OMP "embedded" gauge: used share in session accent, rest in border color, % and window labels inline. */
  const gauge = (width: number, pct: number | null, window: number, accent: string) => {
    if (pct === null || !window) return paint(accent, "─".repeat(width));
    const clamped = Math.min(100, Math.max(0, pct));
    const percentLabel = `${clamped > 0 && clamped < 1 ? clamped.toFixed(1) : Math.round(pct)}%`;
    const windowLabel = formatNumber(window);
    let scale = width;
    let percentStart = -1;
    let windowStart = -1;
    if (width >= percentLabel.length + windowLabel.length + 4) {
      windowStart = width - windowLabel.length - 1;
      scale = windowStart;
    }
    const used = Math.min(scale, Math.max(1, Math.round((clamped / 100) * scale)));
    if (windowStart >= 0) percentStart = Math.max(1, Math.min(scale - percentLabel.length - 1, used));
    const overflow = pct > 100;
    let out = "";
    for (let i = 0; i < width; i++) {
      let color = i < used ? accent : C.border;
      let ch = "─";
      if (percentStart >= 0 && i >= percentStart && i < percentStart + percentLabel.length) {
        color = overflow ? "#ff4757" : accent;
        ch = percentLabel[i - percentStart] ?? "─";
      } else if (windowStart >= 0 && i >= windowStart && i < windowStart + windowLabel.length) {
        color = C.dim;
        ch = windowLabel[i - windowStart] ?? "─";
      }
      out += paint(color, ch);
    }
    return out;
  };

  pi.on("session_start", (_event, ctx) => {
    void refreshGit(ctx.cwd);

    class InputBarEditor extends CustomEditor {
      constructor(t: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
        super(t, theme, keybindings);
        tui = t;
      }

      /**
       * Pi only opens the menu for `/` at the start of a message. Open it after a mid-prompt
       * `/` (and keep it updating while typing the name) so multi-skills can offer skills,
       * like OMP. tryTriggerAutocomplete is private in pi-tui, so it is looked up at runtime
       * and skipped if a Pi update removes it.
       */
      handleInput(data: string): void {
        super.handleInput(data);
        if (this.isShowingAutocomplete() || !/^[a-z0-9:/_-]$/.test(data)) return;
        const lines = this.getLines();
        const { line, col } = this.getCursor();
        const before = (lines[line] ?? "").slice(0, col);
        const hasTextBefore =
          lines.slice(0, line).join("").trim() !== "" || before.replace(/\/[a-z0-9:_-]*$/, "").trim() !== "";
        if (!hasTextBefore || !/(?:^|\s)\/[a-z0-9:_-]*$/.test(before)) return;
        const trigger: unknown = Reflect.get(this, "tryTriggerAutocomplete");
        if (typeof trigger === "function") trigger.call(this);
      }

      render(width: number): string[] {
        const lines = super.render(width);
        if (lines.length < 2 || width < 10) return lines;
        const { left, right, sep, sepRight, accent } = segments(ctx);
        const usage = ctx.getContextUsage();
        const window = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
        const pct = usage?.percent ?? null;

        // OMP overflow order: trim session name, drop right, then drop left segments keeping the path.
        const labels = pct === null || !window ? 1 : `${Math.round(pct)}%`.length + formatNumber(window).length + 4;
        const total = () => groupWidth(left) + groupWidth(right) + labels;
        if (right[0] && total() > width) {
          right[0] = truncateToWidth(right[0], Math.max(8, visibleWidth(right[0]) - (total() - width)));
        }
        while (total() > width && right.length) right.pop();
        while (total() > width && left.length > 1) left.splice(left.length - 1 === 2 ? 1 : left.length - 1, 1);

        const gap = Math.max(1, width - groupWidth(left) - groupWidth(right));
        const bar = group(left, sep, "left") + gauge(gap, pct, window, accent) + group(right, sepRight, "right");
        lines[0] = truncateToWidth(bar, width, "");
        // OMP colors the editor frame with the session accent; Pi colors it by thinking level.
        // Repaint Pi's bottom border (last line starting with ─, above any autocomplete list).
        for (let i = lines.length - 1; i > 0; i--) {
          const plain = (lines[i] ?? "").replace(/\x1b\[[0-9;]*m/g, "");
          if (plain.startsWith("─")) {
            lines[i] = paint(accent, plain);
            break;
          }
        }
        return lines;
      }
    }

    ctx.ui.setEditorComponent((t, theme, keybindings) => new InputBarEditor(t, theme, keybindings));
  });

  pi.on("agent_end", (_event, ctx) => {
    void refreshGit(ctx.cwd);
  });
}
