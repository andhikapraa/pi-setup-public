import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod/v4";

// These service names are part of the existing OMP installation and must not change.
export const DEFAULT_API_KEY_RESOLVER = "!security find-generic-password -s omp-axon-api -w";
export const DEFAULT_SERVICE_ACCOUNT_KEY_RESOLVER = "!security find-generic-password -s omp-axon-sa -w";

export const BASE_URL_ENV = "AXON_BASE_URL";
export const API_KEY_ENV = "AXONAPI";
export const SERVICE_ACCOUNT_KEY_ENV = "AXONSA";

const CONFIG_FILE_NAME = "axon-config.json";
const PROJECT_CONFIG_RELATIVE_PATH = path.join(".pi", CONFIG_FILE_NAME);
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BASE_URL_ERROR = "Expected an http(s) base URL without credentials, query, or fragment";
const KEY_RESOLVER_ERROR = "Expected an environment variable identifier or a leading !command";

function agentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR?.trim();
  return configured ? path.resolve(configured.replace(/^~(?=$|[\\/])/, os.homedir())) : path.join(os.homedir(), ".pi", "agent");
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function hasRawUserinfoDelimiter(value: string): boolean {
  const schemeEnd = value.indexOf(":");
  if (schemeEnd === -1) return false;
  let authorityStart = schemeEnd + 1;
  while (value[authorityStart] === "/" || value[authorityStart] === "\\") authorityStart += 1;
  const authorityTail = value.slice(authorityStart);
  const authorityEnd = authorityTail.search(/[\\/?#]/);
  const authority = authorityEnd === -1 ? authorityTail : authorityTail.slice(0, authorityEnd);
  return authority.includes("@");
}

function normalizeRootBaseUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.includes("?") || trimmed.includes("#") || hasRawUserinfoDelimiter(trimmed)) return undefined;
  let url: URL;
  try { url = new URL(trimmed); } catch { return undefined; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password || url.search || url.hash) return undefined;
  let pathname = url.pathname.replace(/\/+$/, "");
  while (pathname.endsWith("/v1")) pathname = pathname.slice(0, -3).replace(/\/+$/, "");
  return pathname ? `${url.origin}${pathname}` : url.origin;
}

const BaseUrlSchema = z.string().trim().min(1).transform((value, context) => {
  const normalized = normalizeRootBaseUrl(value);
  if (!normalized) { context.addIssue({ code: "custom", message: BASE_URL_ERROR }); return z.NEVER; }
  return normalized;
});
const KeyResolverSchema = z.string().trim().min(1).refine(
  (value) => ENV_NAME_PATTERN.test(value) || (value.startsWith("!") && value.slice(1).trim().length > 0),
  { message: KEY_RESOLVER_ERROR },
);
const PersistedAxonConfigSchema = z.object({
  baseUrl: BaseUrlSchema.optional(), apiKeyResolver: KeyResolverSchema.optional(),
  serviceAccountKeyResolver: KeyResolverSchema.optional(), notifyOnStartup: z.boolean().optional(),
}).strict();
const ProjectAxonConfigSchema = z.object({ apiKeyResolver: KeyResolverSchema }).strict();
const AxonConfigSchema = z.object({
  baseUrl: BaseUrlSchema, apiKeyResolver: KeyResolverSchema,
  serviceAccountKeyResolver: KeyResolverSchema, notifyOnStartup: z.boolean(),
}).strict();

export type AxonConfig = z.infer<typeof AxonConfigSchema>;
type PersistedAxonConfig = z.infer<typeof PersistedAxonConfigSchema>;
type ResolverField = "apiKeyResolver" | "serviceAccountKeyResolver";

function agentConfigPath(): string { return path.join(agentDir(), CONFIG_FILE_NAME); }
export function projectConfigPath(): string { return path.join(process.cwd(), PROJECT_CONFIG_RELATIVE_PATH); }

export function findProjectConfigPath(startDirectory: string = process.cwd()): string | undefined {
  let directory = path.resolve(startDirectory);
  for (;;) {
    const candidate = path.join(directory, PROJECT_CONFIG_RELATIVE_PATH);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function loadConfigFile<T>(filePath: string, schema: z.ZodType<T>, options: { warn?: boolean } = {}): T | undefined {
  if (!fs.existsSync(filePath)) return undefined;
  try { return schema.parse(JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown); }
  catch { if (options.warn !== false) console.warn(`Axon config is invalid or unreadable: ${filePath}`); return undefined; }
}
function loadPersistedConfig(options: { warn?: boolean } = {}): PersistedAxonConfig {
  return loadConfigFile(agentConfigPath(), PersistedAxonConfigSchema, options) ?? {};
}
function loadProjectConfig(options: { warn?: boolean } = {}): z.infer<typeof ProjectAxonConfigSchema> | undefined {
  const filePath = findProjectConfigPath();
  return filePath ? loadConfigFile(filePath, ProjectAxonConfigSchema, options) : undefined;
}
function safePersistedResolver(field: ResolverField, environmentName: string, fallback: string): string {
  const resolver = loadPersistedConfig({ warn: false })[field]?.trim();
  return resolver && resolver !== environmentName ? resolver : fallback;
}
function resolverForPersistence(resolver: string, environmentName: string, fallback: string, field: ResolverField): string {
  const environmentSecret = nonEmptyEnv(environmentName);
  const trimmed = resolver.trim();
  if (trimmed === environmentName || (environmentSecret && trimmed === environmentSecret)) return safePersistedResolver(field, environmentName, fallback);
  return trimmed;
}
function fsyncDirectoryBestEffort(directory: string): void {
  let handle: number | undefined;
  try { handle = fs.openSync(directory, "r"); fs.fsyncSync(handle); }
  catch { /* Some filesystems do not allow directory fsync. */ }
  finally { if (handle !== undefined) try { fs.closeSync(handle); } catch { /* best effort */ } }
}
function writeConfigFileAtomically(filePath: string, content: string): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let renamed = false;
  try {
    const handle = fs.openSync(tempPath, "wx", 0o600);
    try { fs.writeFileSync(handle, content, { encoding: "utf8" }); fs.fchmodSync(handle, 0o600); fs.fsyncSync(handle); }
    finally { fs.closeSync(handle); }
    fs.renameSync(tempPath, filePath); renamed = true; fs.chmodSync(filePath, 0o600); fsyncDirectoryBestEffort(directory);
  } finally { if (!renamed) try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ } }
}

/** The AxonHub root URL from AXON_BASE_URL or axon-config.json. There is no built-in default. */
export function configuredBaseUrl(): string | undefined {
  return nonEmptyEnv(BASE_URL_ENV) ?? loadPersistedConfig().baseUrl;
}
/** Persist only the base URL, keeping the rest of axon-config.json. */
export function saveAxonBaseUrl(baseUrl: string): void {
  const persisted = PersistedAxonConfigSchema.parse({ ...loadPersistedConfig({ warn: false }), baseUrl });
  writeConfigFileAtomically(agentConfigPath(), `${JSON.stringify(persisted, null, 2)}\n`);
}

/** Call only when configuredBaseUrl() is set; the schema rejects a missing base URL. */
export function loadAxonConfig(): AxonConfig {
  const persisted = loadPersistedConfig();
  const project = loadProjectConfig();
  return AxonConfigSchema.parse({
    baseUrl: configuredBaseUrl(),
    apiKeyResolver: nonEmptyEnv(API_KEY_ENV) ? API_KEY_ENV : (project?.apiKeyResolver ?? persisted.apiKeyResolver ?? DEFAULT_API_KEY_RESOLVER),
    serviceAccountKeyResolver: nonEmptyEnv(SERVICE_ACCOUNT_KEY_ENV) ? SERVICE_ACCOUNT_KEY_ENV : (persisted.serviceAccountKeyResolver ?? DEFAULT_SERVICE_ACCOUNT_KEY_RESOLVER),
    notifyOnStartup: persisted.notifyOnStartup ?? true,
  });
}
export function saveAxonConfig(config: AxonConfig): void {
  const parsed = AxonConfigSchema.parse(config);
  const persisted = {
    baseUrl: parsed.baseUrl,
    apiKeyResolver: resolverForPersistence(parsed.apiKeyResolver, API_KEY_ENV, DEFAULT_API_KEY_RESOLVER, "apiKeyResolver"),
    serviceAccountKeyResolver: resolverForPersistence(parsed.serviceAccountKeyResolver, SERVICE_ACCOUNT_KEY_ENV, DEFAULT_SERVICE_ACCOUNT_KEY_RESOLVER, "serviceAccountKeyResolver"),
    notifyOnStartup: parsed.notifyOnStartup,
  } satisfies PersistedAxonConfig;
  writeConfigFileAtomically(agentConfigPath(), `${JSON.stringify(persisted, null, 2)}\n`);
}
export function saveProjectAxonConfig(apiKeyResolver: string): string {
  const parsed = ProjectAxonConfigSchema.parse({ apiKeyResolver });
  const filePath = projectConfigPath();
  writeConfigFileAtomically(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
  return filePath;
}
function effectiveRoot(config: AxonConfig): string { return AxonConfigSchema.shape.baseUrl.parse(nonEmptyEnv(BASE_URL_ENV) ?? config.baseUrl); }
export function providerBaseUrl(config: AxonConfig): string { return `${effectiveRoot(config)}/v1`; }
export function openApiUrl(config: AxonConfig): string { return `${effectiveRoot(config)}/openapi/v1/graphql`; }
export function healthUrl(config: AxonConfig): string { return `${effectiveRoot(config)}/health`; }
export function describeKeyResolver(resolver: string): string {
  const trimmed = resolver.trim();
  if (!trimmed) return "not configured";
  if (trimmed.startsWith("!")) return "command";
  if (ENV_NAME_PATTERN.test(trimmed)) return nonEmptyEnv(trimmed) ? `environment variable: ${trimmed}` : "environment variable";
  return "invalid resolver";
}

/** Resolve an environment-variable name or a configured !command without exposing its output. */
export async function resolveAxonCredential(resolver: string): Promise<string | undefined> {
  const trimmed = resolver.trim();
  if (ENV_NAME_PATTERN.test(trimmed)) return nonEmptyEnv(trimmed);
  if (!trimmed.startsWith("!")) return undefined;
  const command = trimmed.slice(1).trim();
  if (!command) return undefined;
  return await new Promise<string | undefined>((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { stdio: ["ignore", "pipe", "ignore"], env: process.env });
    let stdout = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); resolve(undefined); }, 15_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.once("error", () => { clearTimeout(timer); resolve(undefined); });
    child.once("close", (code) => { clearTimeout(timer); resolve(code === 0 ? (stdout.trim() || undefined) : undefined); });
  });
}
