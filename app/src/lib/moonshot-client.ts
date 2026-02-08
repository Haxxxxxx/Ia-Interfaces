import OpenAI from "openai";

const moonshot = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.ai/v1",
});

export interface ChatParams {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  stream?: boolean;
  thinking?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export async function chat(params: ChatParams) {
  const {
    model,
    messages,
    tools,
    stream = true,
    thinking = true,
    temperature,
    maxTokens = 8192,
  } = params;

  const extra: Record<string, unknown> = {};
  if (!thinking) {
    extra.extra_body = { thinking: { type: "disabled" } };
  }

  return moonshot.chat.completions.create({
    model,
    messages,
    tools,
    stream,
    max_tokens: maxTokens,
    temperature: temperature ?? (thinking ? 1.0 : 0.6),
    top_p: 0.95,
    ...extra,
  });
}

export async function listModels() {
  return moonshot.models.list();
}

export async function healthCheck(): Promise<boolean> {
  try {
    await moonshot.models.list();
    return true;
  } catch {
    return false;
  }
}

// Model pricing (per 1M tokens)
export const MODEL_PRICING = {
  "kimi-k2.5": { input: 0.6, output: 2.5, cached: 0.15 },
  "kimi-k2-0905": { input: 0.6, output: 2.5, cached: 0.15 },
  "kimi-k2-thinking": { input: 0.6, output: 2.5, cached: 0.15 },
  "kimi-k2-thinking-turbo": { input: 1.15, output: 8.0, cached: 0.15 },
} as const;

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model as keyof typeof MODEL_PRICING] || MODEL_PRICING["kimi-k2.5"];
  const nonCachedInput = inputTokens - cachedTokens;

  return (
    (nonCachedInput / 1_000_000) * pricing.input +
    (cachedTokens / 1_000_000) * pricing.cached +
    (outputTokens / 1_000_000) * pricing.output
  );
}
