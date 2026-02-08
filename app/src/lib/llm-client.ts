import OpenAI from "openai";

// Support both Ollama (self-hosted) and Moonshot (API)
type Provider = "ollama" | "moonshot";

const PROVIDER: Provider = (process.env.LLM_PROVIDER as Provider) || "ollama";

// Ollama (self-hosted, FREE tokens)
const ollama = new OpenAI({
  apiKey: "ollama", // Ollama doesn't need a real key
  baseURL: process.env.OLLAMA_URL || "http://localhost:11434/v1",
});

// Moonshot (paid API, fallback)
const moonshot = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY || "",
  baseURL: "https://api.moonshot.ai/v1",
});

function getClient() {
  return PROVIDER === "ollama" ? ollama : moonshot;
}

export interface ChatParams {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function chat(params: ChatParams) {
  const {
    model,
    messages,
    tools,
    stream = true,
    temperature = 0.7,
    maxTokens = 8192,
  } = params;

  const client = getClient();

  return client.chat.completions.create({
    model,
    messages,
    tools,
    stream,
    max_tokens: maxTokens,
    temperature,
  });
}

export async function listModels() {
  const client = getClient();
  return client.models.list();
}

export async function healthCheck(): Promise<boolean> {
  try {
    const client = getClient();
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}

// Self-hosted models (FREE - pay only GPU)
export const SELF_HOSTED_MODELS = {
  // Best quality-to-size ratio
  "qwen2.5:72b": {
    name: "Qwen 2.5 72B",
    size: "72B",
    vram: "48GB",
    speed: "~20-30 tok/s on A100",
    context: 32768,
    capabilities: ["chat", "code", "reasoning"],
  },
  "llama3.3:70b": {
    name: "Llama 3.3 70B",
    size: "70B",
    vram: "48GB",
    speed: "~25-35 tok/s on A100",
    context: 128000,
    capabilities: ["chat", "code", "reasoning"],
  },
  // Faster alternatives
  "qwen2.5:32b": {
    name: "Qwen 2.5 32B",
    size: "32B",
    vram: "24GB",
    speed: "~40-50 tok/s on A100",
    context: 32768,
    capabilities: ["chat", "code"],
  },
  "deepseek-coder-v2:16b": {
    name: "DeepSeek Coder V2",
    size: "16B",
    vram: "12GB",
    speed: "~60-80 tok/s",
    context: 32768,
    capabilities: ["code", "reasoning"],
  },
  // Lightweight
  "qwen2.5:7b": {
    name: "Qwen 2.5 7B",
    size: "7B",
    vram: "8GB",
    speed: "~80-100 tok/s",
    context: 32768,
    capabilities: ["chat", "code"],
  },
} as const;

// Cost: $0 per token! Only pay for GPU
export const MODEL_PRICING = {
  // Self-hosted = FREE tokens
  "qwen2.5:72b": { input: 0, output: 0, cached: 0 },
  "llama3.3:70b": { input: 0, output: 0, cached: 0 },
  "qwen2.5:32b": { input: 0, output: 0, cached: 0 },
  "deepseek-coder-v2:16b": { input: 0, output: 0, cached: 0 },
  "qwen2.5:7b": { input: 0, output: 0, cached: 0 },
  // Moonshot fallback (if needed)
  "kimi-k2.5": { input: 0.6, output: 2.5, cached: 0.15 },
} as const;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING];
  if (!pricing) return 0; // Self-hosted = free

  const nonCachedInput = inputTokens - cachedTokens;
  return (
    (nonCachedInput / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cached +
    (outputTokens / 1_000_000) * pricing.output
  );
}

export function getProvider(): Provider {
  return PROVIDER;
}
