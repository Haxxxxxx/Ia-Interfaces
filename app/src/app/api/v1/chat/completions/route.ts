import { NextRequest } from "next/server";
import { chat, getProvider } from "@/lib/llm-client";
import { validateApiKey, logUsage, checkBudget } from "@/lib/auth";
import { TOOLS } from "@/lib/tools-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default model based on provider
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "qwen2.5:72b";

export async function POST(req: NextRequest) {
  // 1. Auth
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Budget check (skip for self-hosted - tokens are FREE)
  const provider = getProvider();
  const budget = await checkBudget(user.id);
  if (provider !== "ollama" && budget.exceeded) {
    return Response.json(
      {
        error: "Monthly budget exceeded",
        usage: budget,
      },
      { status: 429 }
    );
  }

  // 3. Parse request
  const body = await req.json();
  const {
    model = DEFAULT_MODEL,
    messages,
    tools: clientTools,
    stream = true,
    temperature,
    max_tokens,
  } = body;

  // 4. Use client-provided tools or default
  const tools = clientTools || TOOLS;

  // 5. Proxy to LLM (Ollama or Moonshot)
  const response = await chat({
    model,
    messages,
    tools,
    stream,
    temperature,
    maxTokens: max_tokens,
  });

  if (stream) {
    // Stream SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;

        try {
          for await (const chunk of response as AsyncIterable<unknown>) {
            const data = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(data));

            // Track usage from final chunk
            const chunkData = chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number } };
            if (chunkData.usage) {
              inputTokens = chunkData.usage.prompt_tokens || 0;
              outputTokens = chunkData.usage.completion_tokens || 0;
              cachedTokens = chunkData.usage.cached_tokens || 0;
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // Log usage async
          if (inputTokens > 0 || outputTokens > 0) {
            await logUsage(user.id, model, inputTokens, outputTokens, cachedTokens);
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-User-Id": user.id,
        "X-Budget-Remaining": String(budget.remaining.toFixed(2)),
      },
    });
  } else {
    // Non-streaming
    const result = response as unknown as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number };
    };
    await logUsage(
      user.id,
      model,
      result.usage?.prompt_tokens || 0,
      result.usage?.completion_tokens || 0,
      result.usage?.cached_tokens || 0
    );
    return Response.json(result);
  }
}
