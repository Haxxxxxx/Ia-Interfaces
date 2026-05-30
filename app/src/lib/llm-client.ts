import OpenAI from "openai";
import { getConfig, hasMoonshot, hasDeepseek } from "./config";

export type Provider = "ollama" | "moonshot" | "deepseek";

const RETRY_ATTEMPTS = 2;

let _ollama: OpenAI | null = null;
let _moonshot: OpenAI | null = null;
let _deepseek: OpenAI | null = null;

function getOllamaClient(): OpenAI {
  if (!_ollama) {
    const { ollamaUrl } = getConfig();
    _ollama = new OpenAI({
      apiKey: "ollama",
      baseURL: ollamaUrl,
    });
  }
  return _ollama;
}

function getMoonshotClient(): OpenAI {
  if (!_moonshot) {
    const { moonshotApiKey } = getConfig();
    if (!moonshotApiKey) {
      throw new Error("MOONSHOT_API_KEY not configured. Set it in .env or environment variables.");
    }
    _moonshot = new OpenAI({
      apiKey: moonshotApiKey,
      baseURL: "https://api.moonshot.ai/v1",
    });
  }
  return _moonshot;
}

function getDeepseekClient(): OpenAI {
  if (!_deepseek) {
    const { deepseekApiKey } = getConfig();
    if (!deepseekApiKey) {
      throw new Error("DEEPSEEK_API_KEY not configured. Set it in .env or environment variables.");
    }
    _deepseek = new OpenAI({
      apiKey: deepseekApiKey,
      baseURL: "https://api.deepseek.com",
    });
  }
  return _deepseek;
}

export interface ChatParams {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Route model to provider based on prefix:
 * - kimi-* → Moonshot (Kimi K2.5 for chat)
 * - deepseek-* → DeepSeek (DeepSeek Coder for code)
 * - else → Ollama (local models)
 */
function getClientForModel(model: string): OpenAI {
  if (model.startsWith("kimi-") && hasMoonshot()) {
    return getMoonshotClient();
  }
  if (model.startsWith("deepseek-") && hasDeepseek()) {
    return getDeepseekClient();
  }
  return getOllamaClient();
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

  const client = getClientForModel(model);
  const isOllama = !model.startsWith("kimi-") && !model.startsWith("deepseek-");

  const run = async (attempt: number): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> | OpenAI.Chat.Completions.ChatCompletion> => {
    try {
      // keep_alive isn't in the OpenAI types but Ollama honors it — keeps the
      // model resident across the (up to 8) agentic iterations on a cold/shared
      // box. Build as `any` so it doesn't disturb the stream overload typing.
      const createParams: any = { model, messages, tools, stream, max_tokens: maxTokens, temperature };
      if (isOllama) createParams.keep_alive = "30m";
      return await client.chat.completions.create(createParams);
    } catch (err: any) {
      const retryable = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(err?.code);
      if (attempt < RETRY_ATTEMPTS && retryable) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        return run(attempt + 1);
      }
      throw err;
    }
  };

  return run(0);
}

export async function listModels() {
  return getOllamaClient().models.list();
}

export async function healthCheck(): Promise<boolean> {
  try {
    await getOllamaClient().models.list();
    return true;
  } catch {}
  if (hasMoonshot()) {
    try {
      await getMoonshotClient().models.list();
      return true;
    } catch {}
  }
  if (hasDeepseek()) {
    try {
      await getDeepseekClient().models.list();
      return true;
    } catch {}
  }
  return false;
}

/**
 * Detailed health for each backend (VPS/GPU readiness)
 */
export async function healthCheckDetailed(): Promise<{
  ollama: "ok" | "unreachable";
  moonshot: "ok" | "unreachable" | "disabled";
  deepseek: "ok" | "unreachable" | "disabled";
}> {
  let ollama: "ok" | "unreachable" = "unreachable";
  let moonshot: "ok" | "unreachable" | "disabled" = hasMoonshot() ? "unreachable" : "disabled";
  let deepseek: "ok" | "unreachable" | "disabled" = hasDeepseek() ? "unreachable" : "disabled";

  try {
    await getOllamaClient().models.list();
    ollama = "ok";
  } catch {}

  if (hasMoonshot()) {
    try {
      await getMoonshotClient().models.list();
      moonshot = "ok";
    } catch {}
  }

  if (hasDeepseek()) {
    try {
      await getDeepseekClient().models.list();
      deepseek = "ok";
    } catch {}
  }

  return { ollama, moonshot, deepseek };
}

export function getProvider(): Provider {
  return getConfig().llmProvider;
}
