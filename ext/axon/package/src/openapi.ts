import { z } from "zod/v4";
import { openApiUrl, type AxonConfig } from "./config.ts";

const OPENAPI_TIMEOUT_MS = 20_000;
const IdentifierSchema = z.union([
  z.object({ id: z.string().trim().min(1) }).strict(),
  z.object({ name: z.string().trim().min(1) }).strict(),
]);
const UsageIdentifierSchema = z.union([
  z.object({ id: z.string().trim().min(1) }).strict(),
  z.object({ name: z.string().trim().min(1) }).strict(),
  z.object({ memberKey: z.string().trim().min(1) }).strict(),
]);

const ModelMappingSchema = z.object({ from: z.string(), to: z.string() }).strict();
const QuotaPeriodSchema = z.object({
  type: z.enum(["all_time", "past_duration", "calendar_duration"]),
  pastDuration: z.object({ value: z.number().int().positive(), unit: z.enum(["minute", "hour", "day"]) }).strict().optional(),
  calendarDuration: z.object({ unit: z.enum(["day", "month"]) }).strict().optional(),
}).strict();
const QuotaSchema = z.object({
  requests: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  cost: z.union([z.number().nonnegative(), z.string()]).optional(),
  period: QuotaPeriodSchema,
}).strict();
const ProfileInputSchema = z.object({
  name: z.string().trim().min(1),
  modelMappings: z.array(ModelMappingSchema).optional(),
  channelIDs: z.array(z.number().int().positive()).optional(),
  channelTags: z.array(z.string()).optional(),
  channelTagsMatchMode: z.enum(["any", "all", "none"]).optional(),
  modelIDs: z.array(z.string()).optional(),
  quota: QuotaSchema.optional(),
  loadBalanceStrategy: z.string().optional(),
  traceStickyMode: z.string().optional(),
}).strict();

export type AxonKeyIdentifier = z.infer<typeof IdentifierSchema>;
export type AxonUsageIdentifier = z.infer<typeof UsageIdentifierSchema>;
export type AxonProfileInput = z.infer<typeof ProfileInputSchema>;

const ProfileSchema = z.object({
  name: z.string(),
  modelMappings: z.array(ModelMappingSchema).nullish(),
  channelIDs: z.array(z.number().int()).nullish(),
  channelTags: z.array(z.string()).nullish(),
  channelTagsMatchMode: z.string().nullish(),
  modelIDs: z.array(z.string()).nullish(),
  quota: z.unknown().nullish(),
  loadBalanceStrategy: z.string().nullish(),
  traceStickyMode: z.string().nullish(),
}).passthrough();
const KeyMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.string()).nullish(),
  profiles: z.object({ activeProfile: z.string(), profiles: z.array(ProfileSchema).nullish() }).passthrough().nullish(),
}).passthrough();
const SecretKeySchema = KeyMetadataSchema.extend({ key: z.string().min(1) });
const QuotaUsageSchema = z.object({
  profileName: z.string(),
  quota: z.unknown(),
  window: z.object({ start: z.string().nullish(), end: z.string().nullish() }).passthrough(),
  usage: z.object({
    requestCount: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    totalCost: z.union([z.number(), z.string()]),
  }).passthrough(),
}).passthrough();

export type AxonKeyMetadata = z.infer<typeof KeyMetadataSchema>;
export type AxonQuotaUsage = z.infer<typeof QuotaUsageSchema>;
export type AxonSecretKey = z.infer<typeof SecretKeySchema>;

const GraphQLErrorSchema = z.object({ message: z.string() }).passthrough();
const GraphQLResponseSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(GraphQLErrorSchema).optional(),
}).passthrough();

export interface AxonOpenApiClient {
  findApiKey(identifier: AxonKeyIdentifier, serviceAccountKey: string | undefined, signal?: AbortSignal): Promise<AxonKeyMetadata | null>;
  getApiKey(identifier: AxonKeyIdentifier, serviceAccountKey: string | undefined, signal?: AbortSignal): Promise<AxonKeyMetadata>;
  getApiKeyQuotaUsages(identifier: AxonUsageIdentifier, serviceAccountKey: string | undefined, signal?: AbortSignal): Promise<readonly AxonQuotaUsage[]>;
  createLLMAPIKey(name: string, serviceAccountKey: string | undefined, signal?: AbortSignal): Promise<AxonSecretKey>;
  replaceAPIKeyProfiles(
    identifier: AxonKeyIdentifier,
    input: { readonly activeProfile: string; readonly profiles: readonly AxonProfileInput[] },
    serviceAccountKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<AxonKeyMetadata>;
  loadApiKeyProfileTemplate(
    input: { readonly templateID?: string; readonly templateName?: string; readonly apiKeyID?: string; readonly apiKeyName?: string },
    serviceAccountKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<AxonKeyMetadata>;
  getSecretKeyForClipboard(identifier: AxonKeyIdentifier, serviceAccountKey: string | undefined, signal?: AbortSignal): Promise<AxonSecretKey>;
}

class AxonOpenApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AxonOpenApiError";
  }
}

export function isAxonApiKeyNotFoundError(error: unknown): boolean {
  return error instanceof AxonOpenApiError
    && /(?:^|: )api_key not found$/.test(error.message);
}

function serviceAccountBearer(key: string | undefined): string {
  const value = key?.trim();
  if (!value) throw new AxonOpenApiError("Axon service-account key is not configured");
  return value;
}

function variablesForIdentifier(identifier: AxonKeyIdentifier): { id?: string; name?: string } {
  const parsed = IdentifierSchema.parse(identifier);
  return "id" in parsed ? { id: parsed.id } : { name: parsed.name };
}

function variablesForUsageIdentifier(identifier: AxonUsageIdentifier): { apiKeyId?: string; key?: string; name?: string } {
  const parsed = UsageIdentifierSchema.parse(identifier);
  if ("id" in parsed) return { apiKeyId: parsed.id };
  if ("name" in parsed) return { name: parsed.name };
  return { key: parsed.memberKey };
}

function validateTemplateInput(input: {
  readonly templateID?: string;
  readonly templateName?: string;
  readonly apiKeyID?: string;
  readonly apiKeyName?: string;
}): Record<string, string> {
  const template = [input.templateID?.trim(), input.templateName?.trim()].filter(Boolean);
  const apiKey = [input.apiKeyID?.trim(), input.apiKeyName?.trim()].filter(Boolean);
  if (template.length !== 1 || apiKey.length !== 1) {
    throw new AxonOpenApiError("Provide exactly one template identifier and exactly one API key identifier");
  }
  return {
    ...(input.templateID?.trim() ? { templateID: input.templateID.trim() } : {}),
    ...(input.templateName?.trim() ? { templateName: input.templateName.trim() } : {}),
    ...(input.apiKeyID?.trim() ? { apiKeyID: input.apiKeyID.trim() } : {}),
    ...(input.apiKeyName?.trim() ? { apiKeyName: input.apiKeyName.trim() } : {}),
  };
}

export function createAxonOpenApiClient(config: AxonConfig): AxonOpenApiClient {
  const endpoint = openApiUrl(config);

  const request = async <T>(
    query: string,
    variables: Record<string, unknown>,
    dataSchema: z.ZodType<T>,
    serviceAccountKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<T> => {
    const bearer = serviceAccountBearer(serviceAccountKey);
    const timeout = AbortSignal.timeout(OPENAPI_TIMEOUT_MS);
    const boundedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: boundedSignal,
    });
    if (!response.ok) {
      const status = response.statusText.trim() ? `${response.status} ${response.statusText.trim()}` : String(response.status);
      throw new AxonOpenApiError(`Axon OpenAPI request failed with HTTP ${status}`, response.status);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AxonOpenApiError("Axon OpenAPI returned invalid JSON");
    }
    const envelope = GraphQLResponseSchema.safeParse(payload);
    if (!envelope.success) throw new AxonOpenApiError("Axon OpenAPI response did not match the GraphQL envelope");
    if (envelope.data.errors?.length) {
      throw new AxonOpenApiError(`Axon OpenAPI error: ${envelope.data.errors.map((error) => error.message).join("; ")}`);
    }
    const parsed = dataSchema.safeParse(envelope.data.data);
    if (!parsed.success) throw new AxonOpenApiError(`Axon OpenAPI data did not match the expected operation schema: ${parsed.error.message}`);
    return parsed.data;
  };

  const secretKeyQuery = async (
    identifier: AxonKeyIdentifier,
    serviceAccountKey: string | undefined,
    signal?: AbortSignal,
  ): Promise<AxonSecretKey> => {
    const data = await request(
      `query AxonSecretKey($id: ID, $name: String) { apiKey(id: $id, name: $name) { id key name scopes profiles { activeProfile profiles { name modelMappings { from to } channelIDs channelTags channelTagsMatchMode modelIDs quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } loadBalanceStrategy traceStickyMode } } } }`,
      variablesForIdentifier(identifier),
      z.object({ apiKey: SecretKeySchema }),
      serviceAccountKey,
      signal,
    );
    return data.apiKey;
  };

  return {
    async findApiKey(identifier, serviceAccountKey, signal) {
      try {
        const data = await request(
          `query AxonFindAPIKey($id: ID, $name: String) { apiKey(id: $id, name: $name) { id name scopes profiles { activeProfile profiles { name modelMappings { from to } channelIDs channelTags channelTagsMatchMode modelIDs quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } loadBalanceStrategy traceStickyMode } } } }`,
          variablesForIdentifier(identifier),
          z.object({ apiKey: KeyMetadataSchema.nullable() }),
          serviceAccountKey,
          signal,
        );
        return data.apiKey;
      } catch (error) {
        if (isAxonApiKeyNotFoundError(error)) return null;
        throw error;
      }
    },
    async getApiKey(identifier, serviceAccountKey, signal) {
      const data = await request(
        `query AxonAPIKey($id: ID, $name: String) { apiKey(id: $id, name: $name) { id name scopes profiles { activeProfile profiles { name modelMappings { from to } channelIDs channelTags channelTagsMatchMode modelIDs quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } loadBalanceStrategy traceStickyMode } } } }`,
        variablesForIdentifier(identifier),
        z.object({ apiKey: KeyMetadataSchema }),
        serviceAccountKey,
        signal,
      );
      return data.apiKey;
    },
    async getApiKeyQuotaUsages(identifier, serviceAccountKey, signal) {
      const data = await request(
        `query AxonAPIKeyQuota($apiKeyId: ID, $key: String, $name: String) { apiKeyQuotaUsages(apiKeyId: $apiKeyId, key: $key, name: $name) { profileName quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } window { start end } usage { requestCount totalTokens totalCost } } }`,
        variablesForUsageIdentifier(identifier),
        z.object({ apiKeyQuotaUsages: z.array(QuotaUsageSchema) }),
        serviceAccountKey,
        signal,
      );
      return data.apiKeyQuotaUsages;
    },
    async createLLMAPIKey(name, serviceAccountKey, signal) {
      const normalizedName = z.string().trim().min(1).parse(name);
      const data = await request(
        `mutation AxonCreateKey($name: String!) { createLLMAPIKey(name: $name) { id key name scopes profiles { activeProfile profiles { name } } } }`,
        { name: normalizedName },
        z.object({ createLLMAPIKey: SecretKeySchema }),
        serviceAccountKey,
        signal,
      );
      return data.createLLMAPIKey;
    },
    async replaceAPIKeyProfiles(identifier, input, serviceAccountKey, signal) {
      const parsedInput = z.object({
        activeProfile: z.string().trim().min(1),
        profiles: z.array(ProfileInputSchema).min(1),
      }).strict().parse(input);
      if (!parsedInput.profiles.some((profile) => profile.name === parsedInput.activeProfile)) {
        throw new AxonOpenApiError("activeProfile must name one of the replacement profiles");
      }
      const data = await request(
        `mutation AxonReplaceProfiles($id: ID, $name: String, $input: UpdateAPIKeyProfilesInput!) { updateAPIKeyProfiles(id: $id, name: $name, input: $input) { id name scopes profiles { activeProfile profiles { name modelMappings { from to } channelIDs channelTags channelTagsMatchMode modelIDs quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } loadBalanceStrategy traceStickyMode } } } }`,
        { ...variablesForIdentifier(identifier), input: parsedInput },
        z.object({ updateAPIKeyProfiles: KeyMetadataSchema }),
        serviceAccountKey,
        signal,
      );
      return data.updateAPIKeyProfiles;
    },
    async loadApiKeyProfileTemplate(input, serviceAccountKey, signal) {
      const data = await request(
        `mutation AxonLoadTemplate($input: LoadApiKeyProfileTemplateInput!) { loadApiKeyProfileTemplate(input: $input) { id name scopes profiles { activeProfile profiles { name modelMappings { from to } channelIDs channelTags channelTagsMatchMode modelIDs quota { requests totalTokens cost period { type pastDuration { value unit } calendarDuration { unit } } } loadBalanceStrategy traceStickyMode } } } }`,
        { input: validateTemplateInput(input) },
        z.object({ loadApiKeyProfileTemplate: KeyMetadataSchema }),
        serviceAccountKey,
        signal,
      );
      return data.loadApiKeyProfileTemplate;
    },
    getSecretKeyForClipboard: secretKeyQuery,
  };
}
