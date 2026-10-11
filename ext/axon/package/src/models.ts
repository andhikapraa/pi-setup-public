import type {
  Api,
  Credential,
  Model,
  RefreshModelsContext,
} from "@earendil-works/pi-ai";
import { z } from "zod/v4";
import { providerBaseUrl, type AxonConfig } from "./config.ts";

const PROVIDER_ID = "axon";
const PROVIDER_API = "openai-responses" as const;
const DISCOVERY_TIMEOUT_MS = 10_000;
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 32_768;
const GENERATION_TYPES = new Set(["chat"]);
const NON_GENERATION_TYPES = new Set(["embedding", "image", "rerank", "moderation", "tts", "stt", "video"]);
const LONG_CONTEXT_INPUT_THRESHOLD = 272_000;
const LONG_CONTEXT_MODEL_IDS: Record<string, true> = {
  "gpt-5.6-luna": true,
  "gpt-5.6-sol": true,
  "gpt-5.6-terra": true,
  "gpt-6-astra": true,
  "gpt-6-luna": true,
  "gpt-6-sol": true,
};

/** Request-shape quirks that Axon's catalog cannot express. Sizes and capabilities come from Axon. */
const KNOWN_MODEL_METADATA: Record<string, {
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
}> = {
  // Axon rejects disabled thinking for these models, so Pi must never send "off".
  // Pi only sends effort "xhigh"/"max" when the map names them; without these
  // entries it silently clamps a requested xhigh to high.
  "claude-sonnet-5-5": { thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" } },
  "claude-fable-5-1": { thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" } },
  "claude-opus-5-5": { thinkingLevelMap: { xhigh: "xhigh", max: "max" } },
  // Axon's catalog marks Haiku as non-reasoning, so Pi sent no thinking at all,
  // but Axon accepts adaptive thinking with effort up to xhigh (verified 2026-10-10).
  "claude-haiku-5-5": { reasoning: true, thinkingLevelMap: { xhigh: "xhigh", max: "max" } },
};

/**
 * Claude goes through Axon's native Anthropic endpoint. Over openai-responses, Axon collapses
 * Anthropic's `stop_reason: "refusal"` into an opaque `content_filter`, which drops the
 * explanation and rules out server-side refusal fallback.
 */
const CLAUDE_FALLBACKS: Record<string, string[]> = {
  "claude-opus-5-5": ["claude-sonnet-5-5"],
  "claude-fable-5-1": ["claude-opus-5-5"],
};

function claudeTransport(modelId: string, baseUrl: string): Pick<AxonProviderModelConfig, "api" | "baseUrl" | "compat"> | undefined {
  if (!modelId.startsWith("claude-")) return undefined;
  const fallbacks = CLAUDE_FALLBACKS[modelId] ?? [];
  return {
    api: "anthropic-messages",
    // The Anthropic SDK appends /v1 itself.
    baseUrl: baseUrl.replace(/\/v1\/?$/, ""),
    compat: {
      forceAdaptiveThinking: true,
      supportsTemperature: false,
      ...(fallbacks.length > 0
        ? { allowedFallbackModels: fallbacks.map((model) => ({ provider: PROVIDER_ID, model, cost: { ...ZERO_COST } })) }
        : {}),
    },
  };
}

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const NullableNumber = z.number().finite().nullable().optional();
const AxonModelRecordSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).nullable().optional(),
  context_length: NullableNumber,
  max_output_tokens: NullableNumber,
  modalities: z.object({
    input: z.array(z.string()).nullable().optional(),
    output: z.array(z.string()).nullable().optional(),
  }).passthrough().nullable().optional(),
  capabilities: z.object({
    vision: z.boolean().nullable().optional(),
    tool_call: z.boolean().nullable().optional(),
    reasoning: z.boolean().nullable().optional(),
  }).passthrough().nullable().optional(),
  pricing: z.object({
    input: NullableNumber,
    output: NullableNumber,
    cache_read: NullableNumber,
    cache_write: NullableNumber,
  }).passthrough().nullable().optional(),
  type: z.string().trim().toLowerCase().nullable().optional(),
}).passthrough();
const AxonModelsResponseSchema = z.object({ data: z.array(AxonModelRecordSchema) }).passthrough();
type AxonModelRecord = z.infer<typeof AxonModelRecordSchema>;

/** Structural equivalent of Pi's registerProvider model configuration. */
export interface AxonProviderModelConfig {
  id: string;
  name: string;
  api?: Api;
  baseUrl?: string;
  reasoning: boolean;
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
  input: ("text" | "image")[];
  inputLimits?: Model<Api>["inputLimits"];
  cost: Model<Api>["cost"];
  promptCache?: Model<Api>["promptCache"];
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  compat?: Model<Api>["compat"];
}

export interface AxonDiscoveryStats {
  readonly status: "idle" | "ok" | "unauthenticated" | "http_error" | "invalid_response" | "timeout" | "cancelled" | "error";
  readonly requestedAt?: number;
  readonly fetchedAt?: number;
  readonly durationMs?: number;
  readonly modelCount: number;
  readonly filteredCount: number;
  readonly duplicateCount: number;
  readonly modelIds: readonly string[];
  readonly error?: string;
}

export interface AxonModelClient {
  /** Compatibility entry point for the former OMP provider registration API. */
  fetchDynamicModels(apiKey: string | undefined, signal?: AbortSignal): Promise<readonly AxonProviderModelConfig[]>;
  /** Pi 0.87.1 registerProvider({ refreshModels }) callback. */
  refreshModels(context: RefreshModelsContext): Promise<AxonProviderModelConfig[]>;
  testConnection(apiKey: string | undefined, signal?: AbortSignal): Promise<{
    readonly ok: boolean;
    readonly modelCount: number;
    readonly durationMs: number;
    readonly error?: string;
  }>;
  getStats(): AxonDiscoveryStats;
}

export interface AxonModelRegistryView {
  getAll(): readonly Model<Api>[];
  hasConfiguredAuth(model: Model<Api>): boolean;
}

export function listConfiguredAxonModels(registry: AxonModelRegistryView): Model<Api>[] {
  return registry.getAll()
    .filter((model) => model.provider === PROVIDER_ID && registry.hasConfiguredAuth(model))
    .sort((left, right) => left.id.localeCompare(right.id));
}

class AxonUnauthenticatedError extends Error {
  constructor() {
    super("Axon member API key is not configured");
    this.name = "AxonUnauthenticatedError";
  }
}

class AxonHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "AxonHttpError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}

async function withBoundedSignal<T>(
  timeoutMs: number,
  parentSignal: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeout]) : timeout;
  return await run(signal);
}

async function fetchAxonModels(
  baseUrl: string,
  apiKey: string | undefined,
  signal: AbortSignal | undefined,
): Promise<readonly AxonModelRecord[]> {
  const bearerToken = apiKey?.trim();
  if (!bearerToken) throw new AxonUnauthenticatedError();
  return await withBoundedSignal(DISCOVERY_TIMEOUT_MS, signal, async (boundedSignal) => {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models?include=all`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${bearerToken}` },
      signal: boundedSignal,
    });
    if (!response.ok) {
      const status = response.statusText.trim() ? `${response.status} ${response.statusText.trim()}` : String(response.status);
      throw new AxonHttpError(response.status, `Axon models request failed with HTTP ${status}`);
    }
    const payload: unknown = await response.json();
    const parsed = AxonModelsResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error(`Axon models response did not match schema: ${parsed.error.message}`);
    return parsed.data.data;
  });
}

function positiveInteger(value: number | null | undefined): number | undefined {
  return value !== undefined && value !== null && Number.isInteger(value) && value > 0 ? value : undefined;
}

function nonNegative(value: number | null | undefined): number | undefined {
  return value !== undefined && value !== null && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function scalePrice(value: number, multiplier: number): number {
  return Math.round(value * multiplier * 1_000_000_000) / 1_000_000_000;
}

function resolveReference(_modelId: string): Model<Api> | undefined {
  return undefined;
}

function displayName(record: AxonModelRecord, reference: Model<Api> | undefined): string {
  if (record.name) return record.name;
  if (reference?.name) return reference.name;
  return record.id.replace(/^\[[^\]]+\]\s*/, "").replace(/\s*\[[^\]]+\]$/, "") || record.id;
}

function inputModalities(record: AxonModelRecord, reference: Model<Api> | undefined): ("text" | "image")[] {
  const reported = record.modalities?.input;
  const hasImage = record.capabilities?.vision === true || reported?.includes("image") === true;
  if (hasImage || reference?.input.includes("image")) return ["text", "image"];
  return ["text"];
}

function modelCost(record: AxonModelRecord): Model<Api>["cost"] {
  const pricing = record.pricing;
  if (!pricing) return { ...ZERO_COST };
  const cost = {
    input: nonNegative(pricing.input) ?? 0,
    output: nonNegative(pricing.output) ?? 0,
    cacheRead: nonNegative(pricing.cache_read) ?? 0,
    cacheWrite: nonNegative(pricing.cache_write) ?? 0,
  };
  if (LONG_CONTEXT_MODEL_IDS[record.id] !== true) return cost;
  return {
    ...cost,
    tiers: [{
      inputTokensAbove: LONG_CONTEXT_INPUT_THRESHOLD,
      input: scalePrice(cost.input, 2),
      output: scalePrice(cost.output, 1.5),
      cacheRead: scalePrice(cost.cacheRead, 2),
      cacheWrite: scalePrice(cost.cacheWrite, 2),
    }],
  };
}

function compat(reference: Model<Api> | undefined): Model<Api>["compat"] {
  const referenceCompat = reference?.compat;
  return {
    ...(referenceCompat && "supportsReasoningEffort" in referenceCompat && referenceCompat.supportsReasoningEffort !== undefined
      ? { supportsReasoningEffort: referenceCompat.supportsReasoningEffort }
      : {}),
    ...(referenceCompat && "reasoningEffortMap" in referenceCompat && referenceCompat.reasoningEffortMap
      ? { reasoningEffortMap: referenceCompat.reasoningEffortMap }
      : {}),
    supportsDeveloperRole: false,
  } as Model<Api>["compat"];
}

function isGenerationModel(record: AxonModelRecord, reference: Model<Api> | undefined): boolean {
  if (record.type && NON_GENERATION_TYPES.has(record.type)) return false;
  if (record.type && GENERATION_TYPES.has(record.type)) return true;
  return record.type == null || reference !== undefined;
}

function modelConfig(record: AxonModelRecord, baseUrl: string): AxonProviderModelConfig {
  const reference = resolveReference(record.id);
  const knownMetadata = KNOWN_MODEL_METADATA[record.id];
  const contextWindow = knownMetadata?.contextWindow
    ?? positiveInteger(record.context_length)
    ?? positiveInteger(reference?.contextWindow)
    ?? DEFAULT_CONTEXT_WINDOW;
  const maxTokens = Math.min(
    knownMetadata?.maxTokens
      ?? positiveInteger(record.max_output_tokens)
      ?? positiveInteger(reference?.maxTokens)
      ?? DEFAULT_MAX_TOKENS,
    contextWindow,
  );
  const input = knownMetadata?.input ?? inputModalities(record, reference);
  const reasoning = knownMetadata?.reasoning ?? record.capabilities?.reasoning ?? reference?.reasoning ?? false;
  return {
    id: record.id,
    name: displayName(record, reference),
    api: PROVIDER_API,
    baseUrl,
    reasoning,
    ...((knownMetadata?.thinkingLevelMap ?? reference?.thinkingLevelMap)
      ? { thinkingLevelMap: knownMetadata?.thinkingLevelMap ?? reference?.thinkingLevelMap }
      : {}),
    input,
    cost: modelCost(record),
    contextWindow,
    maxTokens,
    compat: compat(reference),
    ...claudeTransport(record.id, baseUrl),
  };
}

export interface AxonDiscoveryResult {
  readonly models: readonly AxonProviderModelConfig[];
  readonly filteredCount: number;
  readonly duplicateCount: number;
}

function mapModels(records: readonly AxonModelRecord[], baseUrl: string): AxonDiscoveryResult {
  const modelsById = new Map<string, AxonProviderModelConfig>();
  let filteredCount = 0;
  let duplicateCount = 0;
  for (const record of records) {
    const reference = resolveReference(record.id);
    if (!isGenerationModel(record, reference)) {
      filteredCount += 1;
      continue;
    }
    if (modelsById.has(record.id)) {
      duplicateCount += 1;
      continue;
    }
    modelsById.set(record.id, modelConfig(record, baseUrl));
  }
  return {
    models: [...modelsById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    filteredCount,
    duplicateCount,
  };
}

function failureStatus(error: unknown): AxonDiscoveryStats["status"] {
  if (error instanceof AxonUnauthenticatedError) return "unauthenticated";
  if (error instanceof AxonHttpError) return "http_error";
  if (error instanceof z.ZodError || error instanceof SyntaxError) return "invalid_response";
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
  if (error instanceof Error && error.message.includes("did not match schema")) return "invalid_response";
  return "error";
}

function configFromModel(model: Model<Api>): AxonProviderModelConfig {
  return {
    id: model.id,
    name: model.name,
    api: model.api,
    baseUrl: model.baseUrl,
    reasoning: model.reasoning,
    ...(model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
    input: model.input,
    ...(model.inputLimits ? { inputLimits: model.inputLimits } : {}),
    cost: model.cost,
    ...(model.promptCache ? { promptCache: model.promptCache } : {}),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(model.headers ? { headers: model.headers } : {}),
    ...(model.compat ? { compat: model.compat } : {}),
  };
}

export function createAxonModelClient(config: AxonConfig): AxonModelClient {
  const baseUrl = providerBaseUrl(config);
  let stats: AxonDiscoveryStats = { status: "idle", modelCount: 0, filteredCount: 0, duplicateCount: 0, modelIds: [] };

  const discover = async (apiKey: string | undefined, signal?: AbortSignal) => {
    const records = await fetchAxonModels(baseUrl, apiKey, signal);
    return mapModels(records, baseUrl);
  };

  const updateSuccess = (startedAt: number, result: AxonDiscoveryResult): void => {
    const fetchedAt = Date.now();
    stats = {
      status: "ok",
      requestedAt: startedAt,
      fetchedAt,
      durationMs: fetchedAt - startedAt,
      modelCount: result.models.length,
      filteredCount: result.filteredCount,
      duplicateCount: result.duplicateCount,
      modelIds: result.models.map((model) => model.id),
    };
  };

  const updateFailure = (startedAt: number, error: unknown): void => {
    const fetchedAt = Date.now();
    stats = {
      status: failureStatus(error),
      requestedAt: startedAt,
      fetchedAt,
      durationMs: fetchedAt - startedAt,
      modelCount: 0,
      filteredCount: 0,
      duplicateCount: 0,
      modelIds: [],
      error: errorMessage(error),
    };
  };

  const fetchDynamicModels = async (apiKey: string | undefined, signal?: AbortSignal): Promise<readonly AxonProviderModelConfig[]> => {
    const startedAt = Date.now();
    try {
      const result = await discover(apiKey, signal);
      updateSuccess(startedAt, result);
      return result.models;
    } catch (error) {
      updateFailure(startedAt, error);
      throw error;
    }
  };

  return {
    fetchDynamicModels,
    async refreshModels(context) {
      if (!context.allowNetwork) {
        return context.stored?.models.map((model) => configFromModel(model as Model<Api>)) ?? [];
      }
      const models = [...await fetchDynamicModels(context.credential?.type === "api_key" ? context.credential.key : undefined, context.signal)];
      // Persist so offline startup and `pi --list-models` see the last live catalog.
      await context.publish({
        persist: { models: models.map((model) => ({ ...model, provider: PROVIDER_ID, api: model.api ?? PROVIDER_API })) as Model<Api>[], checkedAt: Date.now() },
      });
      return models;
    },
    async testConnection(apiKey, signal) {
      const startedAt = Date.now();
      try {
        const result = await discover(apiKey, signal);
        updateSuccess(startedAt, result);
        return { ok: true, modelCount: result.models.length, durationMs: stats.durationMs ?? 0 };
      } catch (error) {
        updateFailure(startedAt, error);
        return { ok: false, modelCount: 0, durationMs: stats.durationMs ?? 0, error: errorMessage(error) };
      }
    },
    getStats() { return stats; },
  };
}
