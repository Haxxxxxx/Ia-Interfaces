/**
 * Direct Ollama client — talks straight to the local Ollama daemon.
 * No Next.js server, no wifi. This is the offline brain's transport.
 *
 * Chat runs over Ollama's NATIVE /api/chat endpoint (newline-delimited JSON),
 * translated to/from the OpenAI shape the agent loop consumes — so we can set
 * num_ctx + keep_alive in options (the OpenAI-compat endpoint ignores num_ctx).
 * Model discovery uses /api/tags.
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

/** Total system RAM in bytes (via sysctl); 0 if unavailable. Memoized — RAM
 *  never changes within a session, so we don't re-spawn a shell per Audit/click. */
let _ramBytes: number | null = null;
export async function getTotalRamBytes(): Promise<number> {
  if (_ramBytes !== null) return _ramBytes;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const o = await invoke<{ stdout: string }>("exec_shell", { command: "sysctl -n hw.memsize", cwd: "" });
    _ramBytes = parseInt((o.stdout || "").trim()) || 0;
  } catch { _ramBytes = 0; }
  return _ramBytes;
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

// Context window for the native endpoint. The OpenAI-compat endpoint IGNORES
// num_ctx (confirmed empirically — it caps at Ollama's small default), so we use
// the native /api/chat endpoint, which honors it. 8192 gives the agent loop real
// headroom for the system prompt + tools + a multi-turn conversation.
export const NUM_CTX = 8192;

/**
 * Convert our OpenAI-shaped history into native /api/chat messages.
 * Native differs in two ways that matter for the tool round-trip:
 *  - tool-call arguments must be an OBJECT (the OpenAI shape carries a string),
 *  - tool results are matched to calls by ORDER (no tool_call_id) and carry an
 *    optional `tool_name` instead.
 */
function toNativeMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((m) => {
    const out: Record<string, unknown> = { role: m.role, content: m.content ?? "" };
    if (m.reasoning_content) out.thinking = m.reasoning_content;
    if (m.tool_calls?.length) {
      out.tool_calls = m.tool_calls.map((tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* leave {} */ }
        return { function: { name: tc.function.name, arguments: args } };
      });
    }
    if (m.role === "tool" && m.name) out.tool_name = m.name;
    return out;
  });
}

/**
 * Translate one native /api/chat stream object into the OpenAI ChatChunk shape
 * the agent loop already consumes — so nothing downstream changes. Native sends
 * each tool call complete in a single chunk (arguments as an object), which we
 * stringify back to the OpenAI delta form.
 */
function nativeToChatChunk(native: any): ChatChunk | null {
  const msg = native?.message;
  if (!msg && !native?.done) return null;
  const delta: ChatChunk["choices"][0]["delta"] = {};
  if (msg?.content) delta.content = msg.content;
  if (msg?.thinking) delta.reasoning_content = msg.thinking;
  if (Array.isArray(msg?.tool_calls) && msg.tool_calls.length) {
    delta.tool_calls = msg.tool_calls.map((tc: any, i: number) => ({
      index: i,
      id: `call_${i}`,
      type: "function" as const,
      function: {
        name: tc.function?.name,
        arguments: typeof tc.function?.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments ?? {}),
      },
    }));
  }
  const finish_reason = native?.done
    ? (delta.tool_calls ? "tool_calls" : (native.done_reason || "stop"))
    : null;
  const chunk: ChatChunk = { choices: [{ delta, finish_reason }] };
  if (native?.done) {
    chunk.usage = { prompt_tokens: native.prompt_eval_count || 0, completion_tokens: native.eval_count || 0 };
  }
  return chunk;
}

/** Non-streaming completion — used by the nightly self-update distiller. */
export async function ollamaComplete(messages: ChatMessage[], model: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: toNativeMessages(messages),
      stream: false,
      keep_alive: "30m",
      options: { temperature: 0.2, num_ctx: NUM_CTX },
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return data.message?.content || "";
}

/**
 * Stream a chat completion directly from Ollama's NATIVE /api/chat endpoint.
 * Yields OpenAI-compatible ChatChunks (content + tool_call deltas) so the agent
 * loop is unchanged, while letting us set num_ctx + keep_alive in options.
 */
export async function* streamOllamaChat(
  messages: ChatMessage[],
  options: { model: string; tools?: unknown[]; temperature?: number; signal?: AbortSignal } = { model: "qwen2.5-coder:7b" }
): AsyncGenerator<ChatChunk> {
  const { model, tools, temperature = 0.2, signal } = options;

  const body: Record<string, unknown> = {
    model,
    messages: toNativeMessages(messages),
    stream: true,
    keep_alive: "30m",
    options: { temperature, num_ctx: NUM_CTX },
  };
  // Only attach tools to models that can actually use them — avoids
  // confusing models that ignore the field and emit JSON in content.
  if (tools && tools.length > 0 && modelSupportsTools(model)) {
    body.tools = tools;
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
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

  // Native /api/chat streams newline-delimited JSON (one full object per line),
  // not SSE `data:` frames.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let native: any;
      try { native = JSON.parse(trimmed); } catch { continue; }
      const chunk = nativeToChatChunk(native);
      if (chunk) yield chunk;
      if (native.done) return;
    }
  }
}
