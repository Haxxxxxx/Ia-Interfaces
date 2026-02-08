const API_BASE = import.meta.env.VITE_API_URL || "https://llm.sadary.xyz";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionChunk {
  id: string;
  choices: {
    delta: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    cached_tokens?: number;
  };
}

export async function* streamChat(
  apiKey: string,
  messages: ChatMessage[],
  options: {
    model?: string;
    thinking?: boolean;
    tools?: unknown[];
  } = {}
): AsyncGenerator<ChatCompletionChunk> {
  const { model = "kimi-k2.5", thinking = true, tools } = options;

  const response = await fetch(`${API_BASE}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      thinking,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "API request failed");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const data = JSON.parse(line.slice(6));
          yield data;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

export async function getUsage(apiKey: string) {
  const response = await fetch(`${API_BASE}/api/usage`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("Failed to fetch usage");
  return response.json();
}

export async function getInstances(apiKey: string) {
  const response = await fetch(`${API_BASE}/api/instances`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("Failed to fetch instances");
  return response.json();
}

export async function createInstance(
  apiKey: string,
  name: string,
  options: { model?: string; systemPrompt?: string; thinking?: boolean } = {}
) {
  const response = await fetch(`${API_BASE}/api/instances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ name, ...options }),
  });
  if (!response.ok) throw new Error("Failed to create instance");
  return response.json();
}

export async function getModels(apiKey: string) {
  const response = await fetch(`${API_BASE}/api/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("Failed to fetch models");
  return response.json();
}
