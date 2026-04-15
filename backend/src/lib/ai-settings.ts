import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

const AI_CONFIGURATION_KEY = "ai_configuration";

export type AiProvider = "ollama" | "openai" | "claude" | "gemini";

type ProviderSettingInput = {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  apiKeyEncrypted?: string | null;
};

type AiConfigurationSettingValue = {
  enabled?: boolean;
  activeProvider?: AiProvider;
  showProviderToUsers?: boolean;
  providers?: Partial<Record<AiProvider, ProviderSettingInput>>;
};

type ProviderSummary = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: {
    baseUrl: "env" | "admin";
    model: "env" | "admin";
    apiKey: "env" | "admin" | "none";
  };
};

type EffectiveProviderConfig = ProviderSummary & {
  apiKey: string;
};

function getEncryptionKey() {
  if (!config.aiConfigEncryptionKey.trim()) {
    return null;
  }

  return createHash("sha256").update(config.aiConfigEncryptionKey, "utf8").digest();
}

function encryptSecret(value: string) {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("AI_CONFIG_ENCRYPTION_KEY is required to store AI provider secrets");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    content: encrypted.toString("base64")
  });
}

function decryptSecret(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const key = getEncryptionKey();
  if (!key) {
    return "";
  }

  try {
    const parsed = JSON.parse(value) as { iv: string; tag: string; content: string };
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(parsed.content, "base64")),
      decipher.final()
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function readConfigValue(setting: unknown) {
  if (!setting || typeof setting !== "object") {
    return {} satisfies AiConfigurationSettingValue;
  }

  return setting as AiConfigurationSettingValue;
}

function getEnvProviderDefaults() {
  return {
    ollama: {
      enabled: true,
      baseUrl: normalizeUrl(config.ai.ollama.baseUrl),
      model: config.ai.ollama.model.trim(),
      apiKey: ""
    },
    openai: {
      enabled: false,
      baseUrl: normalizeUrl(config.ai.openai.baseUrl),
      model: config.ai.openai.model.trim(),
      apiKey: config.ai.openai.apiKey.trim()
    },
    claude: {
      enabled: false,
      baseUrl: normalizeUrl(config.ai.claude.baseUrl),
      model: config.ai.claude.model.trim(),
      apiKey: config.ai.claude.apiKey.trim()
    },
    gemini: {
      enabled: false,
      baseUrl: normalizeUrl(config.ai.gemini.baseUrl),
      model: config.ai.gemini.model.trim(),
      apiKey: config.ai.gemini.apiKey.trim()
    }
  } satisfies Record<AiProvider, { enabled: boolean; baseUrl: string; model: string; apiKey: string }>;
}

async function getStoredAiConfiguration() {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: AI_CONFIGURATION_KEY }
  });

  return readConfigValue(setting?.value);
}

function buildEffectiveProviderConfig(
  provider: AiProvider,
  stored: AiConfigurationSettingValue
): EffectiveProviderConfig {
  const summary = buildProviderSummary(provider, stored);
  const storedApiKey = decryptSecret(stored.providers?.[provider]?.apiKeyEncrypted);
  const envApiKey = getEnvProviderDefaults()[provider].apiKey;

  return {
    ...summary,
    apiKey: storedApiKey || envApiKey
  };
}

function buildProviderSummary(
  provider: AiProvider,
  stored: AiConfigurationSettingValue
): ProviderSummary {
  const envDefaults = getEnvProviderDefaults()[provider];
  const storedProvider = stored.providers?.[provider];
  const baseUrl = normalizeUrl(storedProvider?.baseUrl?.trim() || envDefaults.baseUrl);
  const model = storedProvider?.model?.trim() || envDefaults.model;
  const storedApiKey = decryptSecret(storedProvider?.apiKeyEncrypted);
  const apiKey = storedApiKey || envDefaults.apiKey;

  return {
    enabled: storedProvider?.enabled ?? envDefaults.enabled,
    baseUrl,
    model,
    hasApiKey: Boolean(apiKey),
    source: {
      baseUrl: storedProvider?.baseUrl?.trim() ? "admin" : "env",
      model: storedProvider?.model?.trim() ? "admin" : "env",
      apiKey: storedApiKey ? "admin" : envDefaults.apiKey ? "env" : "none"
    }
  };
}

export async function getAiSettingsSummary() {
  const stored = await getStoredAiConfiguration();

  return {
    enabled: stored.enabled ?? false,
    activeProvider: stored.activeProvider ?? "ollama",
    showProviderToUsers: stored.showProviderToUsers ?? false,
    providers: {
      ollama: buildProviderSummary("ollama", stored),
      openai: buildProviderSummary("openai", stored),
      claude: buildProviderSummary("claude", stored),
      gemini: buildProviderSummary("gemini", stored)
    }
  };
}

export async function getActiveAiProviderConfig() {
  const stored = await getStoredAiConfiguration();
  const enabled = stored.enabled ?? false;
  const activeProvider = stored.activeProvider ?? "ollama";
  const providerConfig = buildEffectiveProviderConfig(activeProvider, stored);

  return {
    enabled,
    activeProvider,
    showProviderToUsers: stored.showProviderToUsers ?? false,
    providerConfig
  };
}

export async function getAiStatusForUser() {
  const summary = await getAiSettingsSummary();
  const active = summary.providers[summary.activeProvider];

  return {
    enabled: summary.enabled,
    activeProvider: summary.activeProvider,
    activeModel: active.model,
    showProviderToUsers: summary.showProviderToUsers,
    visibleProviderLabel:
      summary.enabled && summary.showProviderToUsers
        ? `${summary.activeProvider} · ${active.model || "model not set"}`
        : null
  };
}

export async function assertAiEnabled() {
  const summary = await getActiveAiProviderConfig();
  if (!summary.enabled) {
    throw new Error("AI features are disabled by the administrator");
  }
  if (!summary.providerConfig.enabled) {
    throw new Error("The active AI provider is disabled by the administrator");
  }

  return summary;
}

export async function updateAiSettings(input: {
  enabled: boolean;
  activeProvider: AiProvider;
  showProviderToUsers: boolean;
  providers: Record<
    AiProvider,
    {
      enabled: boolean;
      baseUrl: string;
      model: string;
      apiKey?: string;
      clearApiKey?: boolean;
    }
  >;
}) {
  const existing = await getStoredAiConfiguration();

  if (input.enabled && !input.providers[input.activeProvider]?.enabled) {
    throw new Error("The active AI provider must be enabled before AI can be turned on");
  }

  const providerEntries = (Object.keys(input.providers) as AiProvider[]).map((provider) => {
    const current = input.providers[provider];
    const previousEncrypted = existing.providers?.[provider]?.apiKeyEncrypted ?? null;
    const nextApiKey =
      current.clearApiKey
        ? null
        : current.apiKey?.trim()
          ? encryptSecret(current.apiKey.trim())
          : previousEncrypted;

    return [
      provider,
      {
        enabled: current.enabled,
        baseUrl: normalizeUrl(current.baseUrl),
        model: current.model.trim(),
        apiKeyEncrypted: nextApiKey
      } satisfies ProviderSettingInput
    ] as const;
  });

  const value = {
    enabled: input.enabled,
    activeProvider: input.activeProvider,
    showProviderToUsers: input.showProviderToUsers,
    providers: Object.fromEntries(providerEntries)
  } satisfies AiConfigurationSettingValue;

  await prisma.platformSetting.upsert({
    where: { key: AI_CONFIGURATION_KEY },
    create: {
      key: AI_CONFIGURATION_KEY,
      value: value as Prisma.InputJsonValue
    },
    update: {
      value: value as Prisma.InputJsonValue
    }
  });

  return getAiSettingsSummary();
}

function mergeProviderForTest(
  provider: AiProvider,
  stored: AiConfigurationSettingValue,
  override: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKey?: string;
    clearApiKey?: boolean;
  }
) {
  const summary = buildProviderSummary(provider, stored);
  const apiKey =
    override.clearApiKey ? "" : override.apiKey?.trim() || decryptSecret(stored.providers?.[provider]?.apiKeyEncrypted) || getEnvProviderDefaults()[provider].apiKey;

  return {
    ...summary,
    enabled: override.enabled,
    baseUrl: normalizeUrl(override.baseUrl || summary.baseUrl),
    model: override.model.trim() || summary.model,
    apiKey
  } satisfies EffectiveProviderConfig;
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function testOllama(configToTest: EffectiveProviderConfig) {
  const { response, body } = await fetchJson(`${configToTest.baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}`);
  }

  const models = Array.isArray((body as { models?: Array<{ name?: string }> }).models)
    ? ((body as { models?: Array<{ name?: string }> }).models ?? []).map((entry) => entry.name).filter(Boolean)
    : [];

  if (configToTest.model && models.length && !models.includes(configToTest.model)) {
    throw new Error(`Model ${configToTest.model} was not found in Ollama`);
  }

  return {
    ok: true,
    message: models.length
      ? `Connected to Ollama. ${models.length} model(s) reported.`
      : "Connected to Ollama."
  };
}

async function testOpenAiCompatible(configToTest: EffectiveProviderConfig, providerName: string) {
  if (!configToTest.apiKey) {
    throw new Error(`${providerName} API key is required`);
  }
  if (!configToTest.model) {
    throw new Error(`${providerName} model is required`);
  }

  const { response } = await fetchJson(`${configToTest.baseUrl}/models/${encodeURIComponent(configToTest.model)}`, {
    headers: {
      Authorization: `Bearer ${configToTest.apiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`${providerName} responded with ${response.status}`);
  }

  return {
    ok: true,
    message: `Connected to ${providerName} and confirmed access to ${configToTest.model}.`
  };
}

async function testClaude(configToTest: EffectiveProviderConfig) {
  if (!configToTest.apiKey) {
    throw new Error("Claude API key is required");
  }

  const { response, body } = await fetchJson(`${configToTest.baseUrl}/v1/models`, {
    headers: {
      "x-api-key": configToTest.apiKey,
      "anthropic-version": "2023-06-01"
    }
  });

  if (!response.ok) {
    throw new Error(`Claude responded with ${response.status}`);
  }

  const models = Array.isArray((body as { data?: Array<{ id?: string }> }).data)
    ? ((body as { data?: Array<{ id?: string }> }).data ?? []).map((entry) => entry.id).filter(Boolean)
    : [];

  if (configToTest.model && models.length && !models.includes(configToTest.model)) {
    throw new Error(`Model ${configToTest.model} was not found in Claude`);
  }

  return {
    ok: true,
    message: configToTest.model
      ? `Connected to Claude and found ${configToTest.model}.`
      : "Connected to Claude."
  };
}

async function testGemini(configToTest: EffectiveProviderConfig) {
  if (!configToTest.apiKey) {
    throw new Error("Gemini API key is required");
  }
  if (!configToTest.model) {
    throw new Error("Gemini model is required");
  }

  const normalizedModel = configToTest.model.startsWith("models/") ? configToTest.model : `models/${configToTest.model}`;
  const { response } = await fetchJson(
    `${configToTest.baseUrl}/${normalizedModel}?key=${encodeURIComponent(configToTest.apiKey)}`
  );

  if (!response.ok) {
    throw new Error(`Gemini responded with ${response.status}`);
  }

  return {
    ok: true,
    message: `Connected to Gemini and confirmed access to ${configToTest.model}.`
  };
}

export async function testAiProviderConnection(input: {
  provider: AiProvider;
  config: {
    enabled: boolean;
    baseUrl: string;
    model: string;
    apiKey?: string;
    clearApiKey?: boolean;
  };
}) {
  const stored = await getStoredAiConfiguration();
  const merged = mergeProviderForTest(input.provider, stored, input.config);

  if (!merged.enabled) {
    throw new Error(`Enable ${input.provider} before testing the connection`);
  }

  switch (input.provider) {
    case "ollama":
      return testOllama(merged);
    case "openai":
      return testOpenAiCompatible(merged, "OpenAI");
    case "claude":
      return testClaude(merged);
    case "gemini":
      return testGemini(merged);
  }
}
