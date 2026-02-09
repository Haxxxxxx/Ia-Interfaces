/**
 * Unified model configuration for Rodeo
 * Used by API, webapp, and CLI
 */

export type ModelProvider = "ollama" | "moonshot" | "deepseek";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  provider: ModelProvider;
  contextWindow: number;
  capabilities: string[];
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
    cachedPerMillion?: number;
  };
  badge: "local" | "gpu" | "api";
  badgeColor: "green" | "yellow" | "purple";
  vram?: string;
  speed?: string;
}

// Self-hosted models (FREE - pay only for GPU)
const OLLAMA_MODELS: ModelInfo[] = [
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B",
    description: "Fast local model, good for quick tasks",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["chat", "code"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "local",
    badgeColor: "green",
    vram: "8GB",
    speed: "~80-100 tok/s",
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder 7B",
    description: "Optimized for coding",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["chat", "code"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "local",
    badgeColor: "green",
    vram: "8GB",
    speed: "~80 tok/s",
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 14B",
    description: "Balanced local model",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["chat", "code"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "local",
    badgeColor: "green",
    vram: "16GB",
    speed: "~50 tok/s",
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen 2.5 32B",
    description: "Powerful local model",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["chat", "code", "reasoning"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "24GB",
    speed: "~40-50 tok/s on A100",
  },
  {
    id: "deepseek-coder-v2:16b",
    name: "DeepSeek Coder V2",
    description: "Strong coding model",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["code", "reasoning"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "12GB",
    speed: "~60-80 tok/s",
  },
  {
    id: "llama3.3:70b",
    name: "Llama 3.3 70B",
    description: "Large reasoning model",
    provider: "ollama",
    contextWindow: 128000,
    capabilities: ["chat", "code", "reasoning"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "48GB",
    speed: "~25-35 tok/s on A100",
  },
  {
    id: "qwen2.5:72b",
    name: "Qwen 2.5 72B",
    description: "Flagship self-hosted model",
    provider: "ollama",
    contextWindow: 32768,
    capabilities: ["chat", "code", "reasoning"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "48GB",
    speed: "~20-30 tok/s on A100",
  },
  // Vision / multimodal (images, video frames)
  {
    id: "llava:13b",
    name: "LLaVA 13B",
    description: "Vision + chat — images, screenshots, diagrams",
    provider: "ollama",
    contextWindow: 2048,
    capabilities: ["chat", "vision"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "16GB",
    speed: "~30 tok/s",
  },
  {
    id: "llava-llama3:8b",
    name: "LLaVA Llama 3 8B",
    description: "Vision + code — lighter multimodal",
    provider: "ollama",
    contextWindow: 8192,
    capabilities: ["chat", "code", "vision"],
    pricing: { inputPerMillion: 0, outputPerMillion: 0, cachedPerMillion: 0 },
    badge: "gpu",
    badgeColor: "yellow",
    vram: "12GB",
    speed: "~50 tok/s",
  },
];

// Moonshot API models (paid per token)
const MOONSHOT_MODELS: ModelInfo[] = [
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    description: "Flagship model — 1T params, 256K context, multimodal",
    provider: "moonshot",
    contextWindow: 256000,
    capabilities: ["chat", "code", "vision", "tool_calling", "thinking"],
    pricing: {
      inputPerMillion: 0.6,
      outputPerMillion: 2.5,
      cachedPerMillion: 0.15,
    },
    badge: "api",
    badgeColor: "purple",
  },
  {
    id: "kimi-k2-0905",
    name: "Kimi K2 (Fast)",
    description: "Faster variant for quick interactions",
    provider: "moonshot",
    contextWindow: 128000,
    capabilities: ["chat", "code", "tool_calling"],
    pricing: {
      inputPerMillion: 0.6,
      outputPerMillion: 2.5,
      cachedPerMillion: 0.15,
    },
    badge: "api",
    badgeColor: "purple",
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    description: "Optimized for deep reasoning and analysis",
    provider: "moonshot",
    contextWindow: 128000,
    capabilities: ["chat", "code", "thinking", "tool_calling"],
    pricing: {
      inputPerMillion: 0.6,
      outputPerMillion: 2.5,
      cachedPerMillion: 0.15,
    },
    badge: "api",
    badgeColor: "purple",
  },
  {
    id: "kimi-k2-thinking-turbo",
    name: "Kimi K2 Thinking Turbo",
    description: "Fast reasoning with higher throughput",
    provider: "moonshot",
    contextWindow: 128000,
    capabilities: ["chat", "code", "thinking", "tool_calling"],
    pricing: {
      inputPerMillion: 1.15,
      outputPerMillion: 8.0,
      cachedPerMillion: 0.15,
    },
    badge: "api",
    badgeColor: "purple",
  },
];

// DeepSeek API models (paid per token - very low cost)
const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    description: "General conversation and tasks (V3.2)",
    provider: "deepseek",
    contextWindow: 128000,
    capabilities: ["chat", "code", "reasoning"],
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
      cachedPerMillion: 0.014,
    },
    badge: "api",
    badgeColor: "purple",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    description: "Step-by-step reasoning and complex problem-solving",
    provider: "deepseek",
    contextWindow: 128000,
    capabilities: ["chat", "code", "reasoning", "thinking"],
    pricing: {
      inputPerMillion: 0.55,
      outputPerMillion: 2.19,
      cachedPerMillion: 0.14,
    },
    badge: "api",
    badgeColor: "purple",
  },
  {
    id: "deepseek-coder",
    name: "DeepSeek Coder",
    description: "Specialized for code generation and programming",
    provider: "deepseek",
    contextWindow: 128000,
    capabilities: ["chat", "code"],
    pricing: {
      inputPerMillion: 0.14,
      outputPerMillion: 0.28,
      cachedPerMillion: 0.014,
    },
    badge: "api",
    badgeColor: "purple",
  },
];

import { hasMoonshot, hasDeepseek } from "./config";

export function getAllModels(includeMoonshot: boolean = true, includeDeepseek: boolean = true): ModelInfo[] {
  const moonshotEnabled = includeMoonshot && hasMoonshot();
  const deepseekEnabled = includeDeepseek && hasDeepseek();
  return [
    ...OLLAMA_MODELS,
    ...(moonshotEnabled ? MOONSHOT_MODELS : []),
    ...(deepseekEnabled ? DEEPSEEK_MODELS : []),
  ];
}

export function getModelById(id: string): ModelInfo | undefined {
  return getAllModels(true, true).find((m) => m.id === id);
}

export function getRecommendedModel(provider: ModelProvider): string {
  if (provider === "moonshot") return "kimi-k2.5";
  if (provider === "deepseek") return "deepseek-coder";
  return "qwen2.5:7b";
}

export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const model = getModelById(modelId);
  if (!model || model.pricing.inputPerMillion === 0) return 0;

  const nonCachedInput = inputTokens - cachedTokens;
  return (
    (nonCachedInput / 1_000_000) * model.pricing.inputPerMillion +
    (cachedTokens / 1_000_000) * (model.pricing.cachedPerMillion ?? model.pricing.inputPerMillion) +
    (outputTokens / 1_000_000) * model.pricing.outputPerMillion
  );
}

// For API response format
export function getModelsForApi(includeMoonshot: boolean, includeDeepseek: boolean = true) {
  return getAllModels(includeMoonshot, includeDeepseek).map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    provider: m.provider,
    context_window: m.contextWindow,
    capabilities: m.capabilities,
    badge: m.badge,
    badgeColor: m.badgeColor,
    vram: m.vram,
    speed: m.speed,
    pricing: {
      input_per_million: m.pricing.inputPerMillion,
      output_per_million: m.pricing.outputPerMillion,
      cached_per_million: m.pricing.cachedPerMillion ?? m.pricing.inputPerMillion,
      note:
        m.provider === "ollama"
          ? "Self-hosted - pay only for GPU/VPS"
          : "Paid per token",
    },
  }));
}
