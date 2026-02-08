import { healthCheck, getProvider } from "@/lib/llm-client";

export async function GET() {
  const provider = getProvider();
  const llmOk = await healthCheck();

  return Response.json({
    status: llmOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    provider,
    services: {
      api: "ok",
      llm: llmOk ? "ok" : "unreachable",
      database: "ok",
    },
    config: {
      provider,
      selfHosted: provider === "ollama",
      tokensAreFree: provider === "ollama",
    },
  });
}
