/**
 * Public models endpoint - no auth required
 * Used by webapp model picker before/without login
 */
import { getModelsForApi, getRecommendedModel } from "@/lib/models";
import { getProvider } from "@/lib/llm-client";
import { hasMoonshot, hasDeepseek } from "@/lib/config";
import { getConfig } from "@/lib/config";

// Ollama tags live at BASE/api/tags, not BASE/v1/api/tags
function getOllamaTagsUrl(): string {
  const url = getConfig().ollamaUrl;
  const base = url.replace(/\/v1\/?$/, "") || "http://localhost:11434";
  return `${base}/api/tags`;
}

// Check which models are installed in Ollama
async function getInstalledOllamaModels(): Promise<Set<string>> {
  try {
    const url = getOllamaTagsUrl();
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    if (res.ok) {
      const data = await res.json();
      const models = new Set<string>();
      // Log raw response for debugging
      if (process.env.NODE_ENV === "development" && data.models) {
        console.log("[models] Raw Ollama response:", data.models.map((m: any) => m.name));
      }
      for (const model of data.models || []) {
        // Ollama returns names like "qwen2.5:7b" or "qwen2.5:latest"
        if (model.name) {
          models.add(model.name);
          // Also add without tag for partial matching
          const baseName = model.name.split(":")[0];
          if (baseName) models.add(baseName);
        }
      }
      return models;
    } else {
      console.warn(`[models] Ollama API returned ${res.status} from ${url}`);
    }
  } catch (error) {
    // Ollama not available or timed out
    if (process.env.NODE_ENV === "development") {
      console.warn("[models] Failed to fetch Ollama models:", error instanceof Error ? error.message : "Unknown error");
    }
  }
  return new Set();
}

export async function GET() {
  const provider = getProvider();
  const includeMoonshot = hasMoonshot();
  const includeDeepseek = hasDeepseek();
  const models = getModelsForApi(includeMoonshot, includeDeepseek);
  const recommended = getRecommendedModel(provider);

  // Check Ollama availability for self-hosted models
  const installedModels = await getInstalledOllamaModels();
  const installedArray = Array.from(installedModels).sort();
  console.log("[models] Installed from Ollama:", installedArray);

  // Add installed flag to each model
  const modelsWithStatus = models.map((m) => ({
    ...m,
    installed:
      m.provider === "moonshot" || m.provider === "deepseek"
        ? true // API models are always "available" when key is set
        : installedModels.has(m.id) || installedModels.has(m.id.split(":")[0]),
  }));

  return Response.json({
    object: "list",
    provider,
    data: modelsWithStatus,
    recommended,
    ollama_connected: installedModels.size > 0,
  });
}
