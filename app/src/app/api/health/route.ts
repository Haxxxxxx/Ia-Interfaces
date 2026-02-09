import { healthCheck, healthCheckDetailed, getProvider } from "@/lib/llm-client";
import { getConfig } from "@/lib/config";

export async function GET() {
  const provider = getProvider();
  const config = getConfig();
  const llmOk = await healthCheck();
  const backends = await healthCheckDetailed();

  // For self-hosted mode, Ollama must be connected
  const isSelfHosted = provider === "ollama";
  const localModelsAvailable = backends.ollama === "ok";
  const apiModelsAvailable = backends.moonshot === "ok" || backends.deepseek === "ok";

  // Status logic: unhealthy if self-hosted and Ollama down
  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  let statusMessage = "All systems operational";

  if (isSelfHosted && !localModelsAvailable) {
    status = "unhealthy";
    statusMessage = "Ollama is unreachable - local models will not work. Run: ollama serve";
  } else if (!localModelsAvailable && !apiModelsAvailable) {
    status = "unhealthy";
    statusMessage = "No LLM backends available";
  } else if (!localModelsAvailable) {
    status = "degraded";
    statusMessage = "Ollama offline - using API models only (paid tokens)";
  }

  return Response.json({
    status,
    statusMessage,
    timestamp: new Date().toISOString(),
    provider,
    services: {
      api: "ok",
      llm: llmOk ? "ok" : "unreachable",
      database: "ok",
    },
    backends: {
      ollama: backends.ollama,
      moonshot: backends.moonshot,
      deepseek: backends.deepseek,
    },
    config: {
      provider,
      deploymentMode: config.deploymentMode,
      ollamaUrl: config.ollamaUrl,
      ollamaConnected: localModelsAvailable,
      moonshotEnabled: backends.moonshot !== "disabled",
      deepseekEnabled: backends.deepseek !== "disabled",
      selfHosted: localModelsAvailable,
      tokensAreFree: localModelsAvailable,
    },
    hints: !localModelsAvailable
      ? [
          "Start Ollama: ollama serve",
          "Pull a model: ollama pull qwen2.5:7b",
          "Check URL: " + config.ollamaUrl,
        ]
      : [],
  });
}
