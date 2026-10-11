import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ToolResultEvent } from "@earendil-works/pi-coding-agent";

type Finding = {
  name?: string;
  severity?: string;
  snippet?: string;
};

const UI_EXTENSIONS: Record<string, true> = {
  ".css": true,
  ".html": true,
  ".jsx": true,
  ".scss": true,
  ".tsx": true,
  ".vue": true,
};

const IGNORED_SEGMENTS: Record<string, true> = {
  ".git": true,
  ".next": true,
  ".turbo": true,
  build: true,
  coverage: true,
  dist: true,
  node_modules: true,
};

const MAX_FINDINGS = 5;
const SCAN_TIMEOUT_MS = 15_000;

function isUiPath(filePath: string): boolean {
  const segments = filePath.split(path.sep);
  return (
    UI_EXTENSIONS[path.extname(filePath).toLowerCase()] === true &&
    !segments.some((segment) => IGNORED_SEGMENTS[segment] === true)
  );
}

function formatFindings(filePath: string, findings: Finding[]): string {
  const shown = findings.slice(0, MAX_FINDINGS).map((finding) => {
    const severity = finding.severity ? `${finding.severity}: ` : "";
    const name = finding.name ?? "Design issue";
    const snippet = finding.snippet ? ` (${finding.snippet})` : "";
    return `- ${severity}${name}${snippet}`;
  });

  const remaining = findings.length - shown.length;
  const suffix = remaining > 0 ? `\n- ...and ${remaining} more finding(s)` : "";

  return [
    `[Impeccable] ${findings.length} design finding(s) in ${filePath}`,
    ...shown,
    suffix,
    "Review the findings before changing the UI; do not auto-fix them.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseFindings(stdout: string): Finding[] | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter(
      (item): item is Finding => typeof item === "object" && item !== null,
    );
  } catch {
    return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  // The impeccable skill ships in the same ext: ext/frontend/{extensions,skills}.
  const scanner = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "skills",
    "impeccable",
    "scripts",
    "impeccable",
  );
  const inFlight = new Set<string>();

  pi.on("tool_result", async (event: ToolResultEvent, ctx) => {
    if (event.toolName !== "edit" && event.toolName !== "write") return;
    if (event.isError || typeof event.input.path !== "string") return;

    const filePath = path.resolve(ctx.cwd, event.input.path);
    if (!isUiPath(filePath) || inFlight.has(filePath)) return;

    inFlight.add(filePath);
    try {
      const result = await pi.exec(
        scanner,
        ["detect", "--json", filePath],
        {
          cwd: ctx.cwd,
          signal: ctx.signal,
          timeout: SCAN_TIMEOUT_MS,
        },
      );

      const findings = result.code === 0 ? [] : parseFindings(result.stdout);
      if (!findings?.length) return;

      return {
        content: [
          ...event.content,
          { type: "text" as const, text: formatFindings(filePath, findings) },
        ],
      };
    } finally {
      inFlight.delete(filePath);
    }
  });
}
