/**
 * Direct Ollama client — talks straight to the local Ollama daemon.
 * No Next.js server, no wifi. This is the offline brain's transport.
 *
 * Ollama exposes an OpenAI-compatible endpoint at /v1/chat/completions
 * (supports tool calling for qwen2.5, llama3.1+, mistral, etc.) and a
 * native API at /api/tags for model discovery.
 */

export const OLLAMA_URL = "http://localhost:11434";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatChunk {
  choices: {
    delta: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface OllamaModel {
  name: string;
  size: number;
  family?: string;
  parameterSize?: string;
}

/** Is the local Ollama daemon reachable? */
export async function isOllamaUp(timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/** List locally installed models (works fully offline). */
export async function listLocalModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m: any) => ({
    name: m.name,
    size: m.size ?? 0,
    family: m.details?.family,
    parameterSize: m.details?.parameter_size,
  }));
}

// Models known to handle OpenAI-style function calling well under Ollama.
const TOOL_CAPABLE = [
  "qwen2.5", "qwen2", "qwq", "llama3.1", "llama3.2", "llama3.3",
  "mistral", "mixtral", "command-r", "firefunction", "hermes", "granite",
  "rodeo", // our baked model (always FROM a tool-capable base)
];

export function modelSupportsTools(model: string): boolean {
  const lower = model.toLowerCase();
  return TOOL_CAPABLE.some((m) => lower.includes(m));
}

function nameScore(name: string): number {
  const sz = name.match(/(\d+)\s*b/i);
  if (sz) return parseInt(sz[1]);     // param count in billions
  if (/rodeo/i.test(name)) return 15; // tuned model — decent middle
  return 8;
}

/** Pick the most capable installed tool-using model (biggest param count). */
export function pickStrongestModel(models: string[]): string {
  const usable = models.filter((m) => modelSupportsTools(m) && !/coder/i.test(m));
  const pool = usable.length ? usable : models;
  return [...pool].sort((a, b) => nameScore(b) - nameScore(a))[0] || models[0] || "qwen2.5:14b";
}

/** Total system RAM in bytes (via sysctl); 0 if unavailable. */
export async function getTotalRamBytes(): Promise<number> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const o = await invoke<{ stdout: string }>("exec_shell", { command: "sysctl -n hw.memsize", cwd: "" });
    return parseInt((o.stdout || "").trim()) || 0;
  } catch { return 0; }
}

/** Does a model's on-disk size fit in RAM with headroom for the OS + app? */
export function modelFits(sizeBytes: number, ramBytes: number): boolean {
  if (!ramBytes) return true; // unknown RAM → don't block
  return sizeBytes <= ramBytes * 0.65;
}

/** Strongest installed tool-model that actually FITS in the given RAM. */
export function pickBestFittingModel(models: OllamaModel[], ramBytes: number): string {
  const usable = models.filter((m) => modelSupportsTools(m.name) && !/coder/i.test(m.name) && modelFits(m.size, ramBytes));
  const pool = usable.length ? usable : models.filter((m) => modelFits(m.size, ramBytes));
  if (!pool.length) return models[0]?.name || "qwen2.5:7b";
  return [...pool].sort((a, b) => nameScore(b.name) - nameScore(a.name))[0].name;
}

/** Non-streaming completion — used by the nightly self-update distiller. */
export async function ollamaComplete(messages: ChatMessage[], model: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.2 }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Stream a chat completion directly from Ollama.
 * Yields OpenAI-compatible chunks (content + tool_call deltas).
 */
export async function* streamOllamaChat(
  messages: ChatMessage[],
  options: { model: string; tools?: unknown[]; temperature?: number; signal?: AbortSignal } = { model: "qwen2.5-coder:7b" }
): AsyncGenerator<ChatChunk> {
  const { model, tools, temperature = 0.3, signal } = options;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature,
  };
  // Only attach tools to models that can actually use them — avoids
  // confusing models that ignore the field and emit JSON in content.
  if (tools && tools.length > 0 && modelSupportsTools(model)) {
    body.tools = tools;
  }

  const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${txt.slice(0, 300)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from Ollama");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        yield JSON.parse(payload) as ChatChunk;
      } catch {
        // partial/keepalive line — ignore
      }
    }
  }
}
