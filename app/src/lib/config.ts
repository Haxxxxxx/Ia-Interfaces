/**
 * Centralized configuration for Rodeo / Sadary LLM Hub
 * Single source for env parsing; use this instead of raw process.env in business logic
 */

export type DeploymentMode = "local" | "docker" | "vps";

export interface AppConfig {
  /** ollama | moonshot | deepseek */
  llmProvider: "ollama" | "moonshot" | "deepseek";
  /** Ollama API base URL (OpenAI-compatible) */
  ollamaUrl: string;
  /** Default model when none specified */
  defaultModel: string;
  /** Moonshot API key (optional, for Kimi models) */
  moonshotApiKey: string | null;
  /** DeepSeek API key (optional, for code models) */
  deepseekApiKey: string | null;
  /** Database path */
  databaseUrl: string;
  /** Deployment context */
  deploymentMode: DeploymentMode;
}

function parseDeploymentMode(): DeploymentMode {
  const v = process.env.DEPLOYMENT_MODE?.toLowerCase();
  if (v === "docker" || v === "vps") return v;
  if (process.env.DOCKER === "1" || process.env.OTEL_RESOURCE_ATTRIBUTES) return "docker";
  return "local";
}

function getOllamaUrl(): string {
  const raw =
    process.env.OLLAMA_URL ||
    process.env.OLLAMA_BASE_URL ||
    (process.env.NODE_ENV === "production" ? "http://ollama:11434/v1" : "http://localhost:11434/v1");
  const base = raw.replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

let cachedConfig: AppConfig | null = null;

/**
 * Get app config (cached)
 */
export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {
    llmProvider: (process.env.LLM_PROVIDER as "ollama" | "moonshot" | "deepseek") || "ollama",
    ollamaUrl: getOllamaUrl(),
    defaultModel: process.env.DEFAULT_MODEL || "qwen2.5:7b",
    moonshotApiKey: process.env.MOONSHOT_API_KEY || null,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || null,
    databaseUrl: process.env.DATABASE_URL || "file:./llmhub.db",
    deploymentMode: parseDeploymentMode(),
  };

  return cachedConfig;
}

/**
 * Check if Moonshot API is available
 */
export function hasMoonshot(): boolean {
  const key = getConfig().moonshotApiKey;
  return !!key && key.length > 10 && key !== "placeholder";
}

/**
 * Check if DeepSeek API is available
 */
export function hasDeepseek(): boolean {
  const key = getConfig().deepseekApiKey;
  return !!key && key.length > 10 && key !== "placeholder";
}

/**
 * Check if we're in a containerized/VPS environment
 */
export function isVpsOrDocker(): boolean {
  const mode = getConfig().deploymentMode;
  return mode === "docker" || mode === "vps";
}
