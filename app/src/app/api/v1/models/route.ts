import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { SELF_HOSTED_MODELS, MODEL_PRICING, getProvider } from "@/lib/llm-client";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getProvider();

  // Self-hosted models (FREE tokens)
  const selfHostedModels = Object.entries(SELF_HOSTED_MODELS).map(([id, info]) => ({
    id,
    object: "model",
    created: Date.now(),
    owned_by: "self-hosted",
    name: info.name,
    size: info.size,
    vram_required: info.vram,
    speed: info.speed,
    context_window: info.context,
    capabilities: info.capabilities,
    pricing: {
      input_per_million: 0, // FREE!
      output_per_million: 0, // FREE!
      note: "Self-hosted - pay only for GPU/VPS",
    },
  }));

  // Add Moonshot models if API key is configured
  const moonshotModels = process.env.MOONSHOT_API_KEY
    ? [
        {
          id: "kimi-k2.5",
          object: "model",
          created: Date.now(),
          owned_by: "moonshot",
          name: "Kimi K2.5",
          context_window: 256000,
          capabilities: ["chat", "code", "vision", "thinking", "tool_calling"],
          pricing: MODEL_PRICING["kimi-k2.5"],
        },
      ]
    : [];

  return Response.json({
    object: "list",
    provider,
    data: [...selfHostedModels, ...moonshotModels],
    recommended: provider === "ollama" ? "qwen2.5:72b" : "kimi-k2.5",
  });
}
