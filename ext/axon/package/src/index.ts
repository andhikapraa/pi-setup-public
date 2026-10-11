import { z } from "zod/v4";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { copySecretToClipboard } from "./clipboard.ts";
import {
  API_KEY_ENV,
  BASE_URL_ENV,
  configuredBaseUrl,
  describeKeyResolver,
  healthUrl,
  loadAxonConfig,
  providerBaseUrl,
  resolveAxonCredential,
  saveAxonBaseUrl,
  saveAxonConfig,
  saveProjectAxonConfig,
  SERVICE_ACCOUNT_KEY_ENV,
  type AxonConfig,
} from "./config.ts";
import { storeSecretInMacOSKeychain } from "./keychain.ts";
import {
  createAxonModelClient,
  type AxonDiscoveryStats,
  type AxonModelClient,
} from "./models.ts";
import {
  isAxonApiKeyNotFoundError,
  createAxonOpenApiClient,
  type AxonKeyIdentifier,
  type AxonKeyMetadata,
  type AxonOpenApiClient,
  type AxonProfileInput,
  type AxonQuotaUsage,
  type AxonUsageIdentifier,
} from "./openapi.ts";

const PROVIDER_ID = "axon";
const STATUS_TIMEOUT_MS = 12_000;
const PROJECT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function projectKeyName(slug: string): string {
  return `project:${slug}`;
}

function projectKeychainService(slug: string): string {
  return `omp-axon-project-${slug}`;
}

interface StatusSnapshot {
  readonly baseUrl: string;
  readonly health: { readonly ok: boolean; readonly status?: number; readonly error?: string };
  readonly memberKeyResolved: boolean;
  readonly memberKeySource: string;
  readonly serviceAccountKeySource: string;
  readonly connection: {
    readonly ok: boolean;
    readonly modelCount: number;
    readonly durationMs: number;
    readonly error?: string;
  };
  readonly stats: AxonDiscoveryStats;
  readonly registeredModelIds: readonly string[];
}

function requireCommandUI(ctx: ExtensionCommandContext, command: string, fallbackTool = "axon_status"): void {
  if (!ctx.hasUI) {
    throw new Error(`${command} requires an interactive UI. Use the ${fallbackTool} tool for noninteractive access.`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

function axonModels(ctx: ExtensionContext) {
  return ctx.modelRegistry.getAll()
    .filter((model) => model.provider === PROVIDER_ID)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function resolveMemberKey(_ctx: ExtensionContext, config: AxonConfig, _signal?: AbortSignal): Promise<string | undefined> {
  return await resolveAxonCredential(config.apiKeyResolver);
}

async function resolveServiceAccountKey(config: AxonConfig): Promise<string | undefined> {
  return await resolveAxonCredential(config.serviceAccountKeyResolver);
}

async function collectStatus(
  ctx: ExtensionContext,
  config: AxonConfig,
  modelClient: AxonModelClient,
  signal?: AbortSignal,
): Promise<StatusSnapshot> {
  const boundedSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(STATUS_TIMEOUT_MS)])
    : AbortSignal.timeout(STATUS_TIMEOUT_MS);
  const healthPromise = fetch(healthUrl(config), { method: "GET", signal: boundedSignal })
    .then((response) => ({ ok: response.ok, status: response.status }))
    .catch((error: unknown) => ({ ok: false, error: errorMessage(error) }));

  let memberKey: string | undefined;
  let connection: StatusSnapshot["connection"];
  try {
    memberKey = await resolveMemberKey(ctx, config, boundedSignal);
    connection = await modelClient.testConnection(memberKey, boundedSignal);
  } catch (error) {
    connection = { ok: false, modelCount: 0, durationMs: 0, error: errorMessage(error) };
  }

  return {
    baseUrl: providerBaseUrl(config),
    health: await healthPromise,
    memberKeyResolved: Boolean(memberKey?.trim()),
    memberKeySource: describeKeyResolver(config.apiKeyResolver),
    serviceAccountKeySource: describeKeyResolver(config.serviceAccountKeyResolver),
    connection,
    stats: modelClient.getStats(),
    registeredModelIds: axonModels(ctx).map((model) => model.id),
  };
}

function formatStatus(snapshot: StatusSnapshot): string {
  const health = snapshot.health.ok
    ? `ok${snapshot.health.status ? ` (HTTP ${snapshot.health.status})` : ""}`
    : `failed${snapshot.health.error ? `: ${snapshot.health.error}` : ""}`;
  const connection = snapshot.connection.ok
    ? `ok (${snapshot.connection.modelCount} models, ${snapshot.connection.durationMs} ms)`
    : `failed: ${snapshot.connection.error ?? "unknown error"}`;
  return [
    "Axon status",
    `Base URL: ${snapshot.baseUrl}`,
    `Health: ${health}`,
    `Member key: ${snapshot.memberKeyResolved ? "resolved" : "not resolved"} (${snapshot.memberKeySource})`,
    `Service account: ${snapshot.serviceAccountKeySource}`,
    `Model discovery: ${connection}`,
    `Registered models: ${snapshot.registeredModelIds.length ? snapshot.registeredModelIds.join(", ") : "none"}`,
  ].join("\n");
}

function keyIdentifier(id: string | undefined, name: string | undefined): AxonKeyIdentifier {
  const normalizedId = id?.trim();
  const normalizedName = name?.trim();
  if (Boolean(normalizedId) === Boolean(normalizedName)) throw new Error("Provide exactly one of id or name");
  return normalizedId ? { id: normalizedId } : { name: normalizedName! };
}

function usageIdentifier(
  id: string | undefined,
  name: string | undefined,
  memberKey: string | undefined,
): AxonUsageIdentifier {
  const entries = [id?.trim(), name?.trim(), memberKey?.trim()].filter(Boolean);
  if (entries.length !== 1) throw new Error("Provide exactly one of id, name, or memberKey");
  if (id?.trim()) return { id: id.trim() };
  if (name?.trim()) return { name: name.trim() };
  return { memberKey: memberKey!.trim() };
}

function safeKeyDetails(key: AxonKeyMetadata): AxonKeyMetadata {
  return key;
}

function formatKey(key: AxonKeyMetadata): string {
  const profiles = key.profiles?.profiles?.map((profile) => profile.name).join(", ") || "none";
  return [
    `Axon key: ${key.name}`,
    `ID: ${key.id}`,
    `Scopes: ${key.scopes?.join(", ") || "none"}`,
    `Active profile: ${key.profiles?.activeProfile || "none"}`,
    `Profiles: ${profiles}`,
  ].join("\n");
}

function formatQuota(usages: readonly AxonQuotaUsage[]): string {
  if (usages.length === 0) return "Axon quota usage: no quota-enabled profiles.";
  const lines = ["Axon quota usage"];
  for (const item of usages) {
    const window = item.window.end ? `, window ends ${item.window.end}` : "";
    lines.push(
      `${item.profileName}: ${item.usage.requestCount} requests, ${item.usage.totalTokens} tokens, ${String(item.usage.totalCost)} cost${window}`,
    );
  }
  return lines.join("\n");
}

interface CurrentMemberUsageResult {
  readonly tracked: boolean;
  readonly usages: readonly AxonQuotaUsage[];
  readonly message?: string;
}

const UNTRACKED_GLOBAL_USAGE_MESSAGE = [
  "Axon usage is not tracked for the current global member key.",
  "Inference still works. Start OMP inside a project with a project-scoped Axon resolver, or query a tracked key explicitly by name.",
].join(" ");

async function currentMemberUsage(
  ctx: ExtensionContext,
  config: AxonConfig,
  client: AxonOpenApiClient,
  signal?: AbortSignal,
): Promise<CurrentMemberUsageResult> {
  const [memberKey, serviceAccountKey] = await Promise.all([
    resolveMemberKey(ctx, config, signal),
    resolveServiceAccountKey(config),
  ]);
  if (!memberKey?.trim()) throw new Error("Axon member API key is not configured");
  try {
    return {
      tracked: true,
      usages: await client.getApiKeyQuotaUsages({ memberKey }, serviceAccountKey, signal),
    };
  } catch (error) {
    if (isAxonApiKeyNotFoundError(error)) {
      return { tracked: false, usages: [], message: UNTRACKED_GLOBAL_USAGE_MESSAGE };
    }
    throw error;
  }
}

export interface AxonExtensionDependencies {
  readonly copySecret?: typeof copySecretToClipboard;
}

export function createAxonExtension(dependencies: AxonExtensionDependencies = {}) {
  return function axonExtension(pi: ExtensionAPI): void {
    // Without a base URL there is no server to talk to: offer only /axon-config until one is set.
    if (!configuredBaseUrl()) {
      pi.registerCommand("axon-config", {
        description: "Set the AxonHub base URL",
        handler: async (_args, ctx) => {
          if (!ctx.hasUI) throw new Error(`/axon-config requires an interactive UI. Set ${BASE_URL_ENV} instead.`);
          const baseUrl = await ctx.ui.input("AxonHub root base URL", "https://axon.example.com");
          if (!baseUrl?.trim()) return;
          try {
            saveAxonBaseUrl(baseUrl);
          } catch {
            ctx.ui.notify("Axon base URL was not saved. Expected an http(s) URL without credentials, query, or fragment.", "error");
            return;
          }
          ctx.ui.notify("Axon base URL saved. Reloading the session.", "info");
          await ctx.reload();
        },
      });
      pi.on("session_start", async (_event, ctx) => {
        if (ctx.hasUI) ctx.ui.notify(`Axon is not configured. Set your AxonHub base URL with /axon-config or ${BASE_URL_ENV}.`, "warning");
      });
      return;
    }
    const config = loadAxonConfig();
    const modelClient = createAxonModelClient(config);
    const openApiClient = createAxonOpenApiClient(config);
    const copySecret = dependencies.copySecret ?? copySecretToClipboard;

    // Own the axon provider so `/axon-reload` and startup pull the live catalog from Axon.
    pi.registerProvider(PROVIDER_ID, {
      name: "Axon",
      baseUrl: providerBaseUrl(config),
      api: "openai-responses",
      apiKey: config.apiKeyResolver.startsWith("!") ? config.apiKeyResolver : `$${config.apiKeyResolver}`,
      refreshModels: (context) => modelClient.refreshModels(context),
    });

  pi.registerCommand("axon-status", {
    description: "Show Axon health and model discovery status",
    handler: async (_args, ctx) => {
      requireCommandUI(ctx, "/axon-status");
      const snapshot = await collectStatus(ctx, config, modelClient);
      ctx.ui.notify(formatStatus(snapshot), snapshot.connection.ok && snapshot.health.ok ? "info" : "warning");
    },
  });

  pi.registerCommand("axon-usage", {
    description: "Show quota usage for the configured Axon member key",
    handler: async (_args, ctx) => {
      requireCommandUI(ctx, "/axon-usage", "axon_usage");
      try {
        const result = await currentMemberUsage(ctx, config, openApiClient);
        ctx.ui.notify(result.tracked ? formatQuota(result.usages) : result.message!, result.tracked ? "info" : "warning");
      } catch (error) {
        ctx.ui.notify(`Axon usage failed: ${errorMessage(error)}`, "error");
      }
    },
  });

  pi.registerCommand("axon-models", {
    description: "List and select an available Axon model",
    handler: async (_args, ctx) => {
      requireCommandUI(ctx, "/axon-models");
      let models = axonModels(ctx);
      if (models.length === 0) {
        await ctx.modelRegistry.refresh({ allowNetwork: true, force: true, providers: [PROVIDER_ID] });
        models = axonModels(ctx);
      }
      if (models.length === 0) {
        ctx.ui.notify("No Axon models are available. Check /axon-status.", "warning");
        return;
      }
      const choices = models.map((model) => ({ label: `${model.id} — ${model.name}`, model }));
      const selected = await ctx.ui.select("Select an Axon model", choices.map((choice) => choice.label));
      if (!selected) return;
      const choice = choices.find((candidate) => candidate.label === selected);
      if (!choice) return;
      if (!await pi.setModel(choice.model)) {
        ctx.ui.notify(`Could not switch to ${PROVIDER_ID}/${choice.model.id}: authentication is unavailable.`, "error");
        return;
      }
      ctx.ui.notify(`Using ${PROVIDER_ID}/${choice.model.id}.`, "info");
    },
  });


  pi.registerCommand("axon-config", {
    description: "Configure Axon connection and credential resolvers",
    handler: async (_args, ctx) => {
      requireCommandUI(ctx, "/axon-config");
      const activeOverrides = [BASE_URL_ENV, API_KEY_ENV, SERVICE_ACCOUNT_KEY_ENV]
        .filter((name) => Boolean(process.env[name]?.trim()));
      if (activeOverrides.length) {
        ctx.ui.notify(`Active Axon environment overrides: ${activeOverrides.join(", ")}. Saved values remain fallbacks.`, "warning");
      }
      const baseUrl = await ctx.ui.input("Axon root base URL; blank keeps current", config.baseUrl);
      if (baseUrl === undefined) return;
      const apiResolver = await ctx.ui.input(
        `Axon member key resolver (${describeKeyResolver(config.apiKeyResolver)}); blank keeps current`,
        "AXONAPI or leading !command",
      );
      if (apiResolver === undefined) return;
      const serviceResolver = await ctx.ui.input(
        `Axon service-account resolver (${describeKeyResolver(config.serviceAccountKeyResolver)}); blank keeps current`,
        "AXONSA or leading !command",
      );
      if (serviceResolver === undefined) return;
      const notification = await ctx.ui.select(
        `Startup notification is ${config.notifyOnStartup ? "enabled" : "disabled"}`,
        ["Enable startup notification", "Disable startup notification"],
      );
      if (!notification) return;
      try {
        saveAxonConfig({
          baseUrl: baseUrl.trim() || config.baseUrl,
          apiKeyResolver: apiResolver.trim() || config.apiKeyResolver,
          serviceAccountKeyResolver: serviceResolver.trim() || config.serviceAccountKeyResolver,
          notifyOnStartup: notification === "Enable startup notification",
        });
      } catch {
        ctx.ui.notify("Axon configuration was not saved. Check the URL, resolver syntax, and config permissions.", "error");
        return;
      }
      ctx.ui.notify("Axon configuration saved. Reloading the session.", "info");
      await ctx.reload();
    },
  });

  pi.registerCommand("axon-reload", {
    description: "Refresh Axon models from the live provider",
    handler: async (_args, ctx) => {
      requireCommandUI(ctx, "/axon-reload");
      try {
        const result = await ctx.modelRegistry.refresh({ allowNetwork: true, force: true, providers: [PROVIDER_ID] });
        const refreshError = result.errors.get(PROVIDER_ID);
        if (refreshError) throw refreshError;
        ctx.ui.notify(`Axon models refreshed: ${axonModels(ctx).length} registered.`, "info");
      } catch (error) {
        ctx.ui.notify(`Axon reload failed: ${errorMessage(error)}`, "error");
      }
    },
  });

  pi.registerTool({
    name: "axon_status",
    label: "Axon Status",
    description: "Check Axon health, credentials, and model discovery without returning secrets",
    approval: "read",
    parameters: z.object({}),
    async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
      const snapshot = await collectStatus(ctx, config, modelClient, signal);
      return { content: [{ type: "text", text: formatStatus(snapshot) }], details: snapshot };
    },
  });

  pi.registerTool({
    name: "axon_usage",
    label: "Axon Quota Usage",
    description: "Read Axon quota usage by member key, API-key id, name, or the configured AXONAPI key",
    approval: "read",
    parameters: z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      memberKey: z.string().optional(),
      configuredMember: z.boolean().optional(),
    }),
    async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
      const params = rawParams as { id?: string; name?: string; memberKey?: string; configuredMember?: boolean };
      if (params.configuredMember || (!params.id && !params.name && !params.memberKey)) {
        const result = await currentMemberUsage(ctx, config, openApiClient, signal);
        const text = result.tracked ? formatQuota(result.usages) : result.message!;
        return { content: [{ type: "text", text }], details: result };
      }
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const usages = await openApiClient.getApiKeyQuotaUsages(
        usageIdentifier(params.id, params.name, params.memberKey),
        serviceAccountKey,
        signal,
      );
      return { content: [{ type: "text", text: formatQuota(usages) }], details: { tracked: true, usages } };
    },
  });

  pi.registerTool({
    name: "axon_key",
    label: "Axon Key Metadata",
    description: "Read non-secret Axon API-key metadata and profiles by id or name",
    approval: "read",
    parameters: z.object({ id: z.string().optional(), name: z.string().optional() }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as { id?: string; name?: string };
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const key = await openApiClient.getApiKey(keyIdentifier(params.id, params.name), serviceAccountKey, signal);
      return { content: [{ type: "text", text: formatKey(key) }], details: safeKeyDetails(key) };
    },
  });

  pi.registerTool({
    name: "axon_copy_key",
    label: "Copy Axon Key",
    description: "Retrieve an Axon member key by id or name and copy it to macOS clipboard without returning it",
    approval: "write",
    parameters: z.object({ id: z.string().optional(), name: z.string().optional() }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as { id?: string; name?: string };
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const key = await openApiClient.getSecretKeyForClipboard(
        keyIdentifier(params.id, params.name),
        serviceAccountKey,
        signal,
      );
      await copySecret(key.key);
      const details = { id: key.id, name: key.name, scopes: key.scopes ?? [], copiedToClipboard: true };
      return { content: [{ type: "text", text: `Axon key ${key.name} copied to the macOS clipboard.` }], details };
    },
  });

  pi.registerTool({
    name: "axon_create_key",
    label: "Create Axon Key",
    description: "Create an Axon member key and copy its plaintext only to macOS clipboard",
    approval: "write",
    parameters: z.object({ name: z.string().min(1) }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as { name: string };
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const key = await openApiClient.createLLMAPIKey(params.name, serviceAccountKey, signal);
      try {
        await copySecret(key.key);
      } catch {
        const details = { id: key.id, name: key.name, scopes: key.scopes ?? [], copiedToClipboard: false };
        return {
          content: [{
            type: "text",
            text: `Axon key ${key.name} was created, but clipboard delivery failed. Use axon_copy_key with id ${key.id}.`,
          }],
          details,
        };
      }
      const details = { id: key.id, name: key.name, scopes: key.scopes ?? [], copiedToClipboard: true };
      return { content: [{ type: "text", text: `Axon key ${key.name} created and copied to the macOS clipboard.` }], details };
    },
  });

  pi.registerTool({
    name: "axon_create_project_key",
    label: "Create Axon Project Key",
    description: "Create or retrieve a project-named Axon member key, store it in macOS Keychain, and write a secret-free project resolver",
    approval: "write",
    parameters: z.object({ slug: z.string().regex(PROJECT_SLUG_PATTERN) }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as { slug: string };
      const slug = params.slug.trim();
      const name = projectKeyName(slug);
      const service = projectKeychainService(slug);
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const existing = await openApiClient.findApiKey({ name }, serviceAccountKey, signal);
      const created = existing === null;
      const secretKey = created
        ? await openApiClient.createLLMAPIKey(name, serviceAccountKey, signal)
        : await openApiClient.getSecretKeyForClipboard({ name }, serviceAccountKey, signal);
      const hasProfiles = Boolean(existing?.profiles?.profiles?.length || secretKey.profiles?.profiles?.length);
      const trackingProfileConfigured = !hasProfiles;
      const key = trackingProfileConfigured
        ? await openApiClient.replaceAPIKeyProfiles(
            { name },
            {
              activeProfile: "project-tracking",
              profiles: [{
                name: "project-tracking",
                quota: { totalTokens: Number.MAX_SAFE_INTEGER, period: { type: "all_time" } },
              }],
            },
            serviceAccountKey,
            signal,
          )
        : secretKey;
      const resolver = await storeSecretInMacOSKeychain(secretKey.key, service);
      const filePath = saveProjectAxonConfig(resolver);
      const details = {
        id: key.id,
        name: key.name,
        scopes: key.scopes ?? [],
        created,
        trackingProfileConfigured,
        keychainService: service,
        projectConfigPath: filePath,
      };
      return {
        content: [{
          type: "text",
          text: `Axon project key ${key.name} ${created ? "created" : "reused"}, ${trackingProfileConfigured ? "tracking profile configured, " : ""}stored in Keychain service ${service}, and configured at ${filePath}.`,
        }],
        details,
      };
    },
  });

  const modelMappingSchema = z.object({ from: z.string(), to: z.string() });
  const quotaPeriodSchema = z.object({
    type: z.enum(["all_time", "past_duration", "calendar_duration"]),
    pastDuration: z.object({
      value: z.number().int().positive(),
      unit: z.enum(["minute", "hour", "day"]),
    }).optional(),
    calendarDuration: z.object({ unit: z.enum(["day", "month"]) }).optional(),
  });
  const profileSchema = z.object({
    name: z.string().min(1),
    modelMappings: z.array(modelMappingSchema).optional(),
    channelIDs: z.array(z.number().int().positive()).optional(),
    channelTags: z.array(z.string()).optional(),
    channelTagsMatchMode: z.enum(["any", "all", "none"]).optional(),
    modelIDs: z.array(z.string()).optional(),
    quota: z.object({
      requests: z.number().int().nonnegative().optional(),
      totalTokens: z.number().int().nonnegative().optional(),
      cost: z.union([z.number().nonnegative(), z.string()]).optional(),
      period: quotaPeriodSchema,
    }).optional(),
    loadBalanceStrategy: z.string().optional(),
    traceStickyMode: z.string().optional(),
  });

  pi.registerTool({
    name: "axon_replace_key_profiles",
    label: "Replace Axon Key Profiles",
    description: "Replace the complete profile list and active profile for one Axon key",
    approval: "write",
    parameters: z.object({
      id: z.string().optional(),
      name: z.string().optional(),
      activeProfile: z.string().min(1),
      profiles: z.array(profileSchema).min(1),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as {
        id?: string;
        name?: string;
        activeProfile: string;
        profiles: AxonProfileInput[];
      };
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const key = await openApiClient.replaceAPIKeyProfiles(
        keyIdentifier(params.id, params.name),
        { activeProfile: params.activeProfile, profiles: params.profiles as AxonProfileInput[] },
        serviceAccountKey,
        signal,
      );
      return { content: [{ type: "text", text: `Replaced profiles for Axon key ${key.name}.\n${formatKey(key)}` }], details: safeKeyDetails(key) };
    },
  });

  pi.registerTool({
    name: "axon_load_profile_template",
    label: "Load Axon Profile Template",
    description: "Append an Axon profile template to a key; this does not activate the new profile",
    approval: "write",
    parameters: z.object({
      templateID: z.string().optional(),
      templateName: z.string().optional(),
      apiKeyID: z.string().optional(),
      apiKeyName: z.string().optional(),
    }),
    async execute(_toolCallId, rawParams, signal) {
      const params = rawParams as {
        templateID?: string;
        templateName?: string;
        apiKeyID?: string;
        apiKeyName?: string;
      };
      const serviceAccountKey = await resolveServiceAccountKey(config);
      const key = await openApiClient.loadApiKeyProfileTemplate(params, serviceAccountKey, signal);
      return {
        content: [{ type: "text", text: `Loaded profile template for Axon key ${key.name}. The active profile was not changed.\n${formatKey(key)}` }],
        details: safeKeyDetails(key),
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    try {
      const result = await ctx.modelRegistry.refresh({ allowNetwork: true, providers: [PROVIDER_ID] });
      const refreshError = result.errors.get(PROVIDER_ID);
      if (refreshError) throw refreshError;
    } catch (error) {
      if (config.notifyOnStartup) ctx.ui.notify(`Axon model discovery failed: ${errorMessage(error)}`, "warning");
    }
    if (config.notifyOnStartup) ctx.ui.notify("Axon loaded. Use /axon-status or /axon-usage.", "info");
  });
  };
}

export default createAxonExtension();
