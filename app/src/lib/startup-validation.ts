/**
 * Startup validation for Rodeo / Sadary LLM Hub
 * Checks LLM connectivity and configuration on app start
 */

import { getConfig, hasMoonshot, hasDeepseek } from "./config";

interface ValidationResult {
  ollama: "ok" | "unreachable" | "error";
  moonshot: "ok" | "unreachable" | "disabled" | "missing_key";
  deepseek: "ok" | "unreachable" | "disabled" | "missing_key";
  warnings: string[];
  errors: string[];
}

/**
 * Validate startup configuration and connectivity
 * Call this at app start to fail fast on misconfigurations
 */
export async function validateStartup(): Promise<ValidationResult> {
  const config = getConfig();
  const result: ValidationResult = {
    ollama: "unreachable",
    moonshot: "disabled",
    deepseek: "disabled",
    warnings: [],
    errors: [],
  };

  // Check Ollama connectivity
  try {
    const ollamaBase = config.ollamaUrl.replace("/v1", "");
    const response = await fetch(`${ollamaBase}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      result.ollama = "ok";
      console.log("\x1b[32m✓\x1b[0m Ollama connected at", config.ollamaUrl);
    } else {
      result.ollama = "error";
      result.errors.push(`Ollama returned ${response.status} at ${ollamaBase}`);
      console.error("\x1b[31m✗\x1b[0m Ollama error:", response.status, "at", ollamaBase);
    }
  } catch (err: any) {
    result.ollama = "unreachable";
    result.errors.push(`Ollama unreachable at ${config.ollamaUrl}: ${err.message}`);
    console.error("\x1b[31m✗\x1b[0m Ollama unreachable at", config.ollamaUrl);
  }

  // Check Moonshot API key
  if (config.moonshotApiKey) {
    if (hasMoonshot()) {
      result.moonshot = "ok";
      console.log("\x1b[32m✓\x1b[0m Moonshot API key configured");
    } else {
      result.moonshot = "missing_key";
      result.warnings.push("MOONSHOT_API_KEY is set but appears invalid (too short or placeholder)");
      console.warn("\x1b[33m⚠\x1b[0m Moonshot API key appears invalid");
    }
  } else {
    result.moonshot = "disabled";
    console.log("\x1b[90m○\x1b[0m Moonshot disabled (no API key)");
  }

  // Check DeepSeek API key
  if (config.deepseekApiKey) {
    if (hasDeepseek()) {
      result.deepseek = "ok";
      console.log("\x1b[32m✓\x1b[0m DeepSeek API key configured");
    } else {
      result.deepseek = "missing_key";
      result.warnings.push("DEEPSEEK_API_KEY is set but appears invalid (too short or placeholder)");
      console.warn("\x1b[33m⚠\x1b[0m DeepSeek API key appears invalid");
    }
  } else {
    result.deepseek = "disabled";
    console.log("\x1b[90m○\x1b[0m DeepSeek disabled (no API key)");
  }

  // Warn if no LLM backends are available
  if (result.ollama !== "ok" && result.moonshot !== "ok" && result.deepseek !== "ok") {
    result.errors.push("No LLM backends available. Chat will fail.");
    console.error("\x1b[31m✗\x1b[0m No LLM backends available - chat will not work");
  }

  // Log summary
  console.log(`\x1b[90m─── Startup validation complete: ${result.errors.length} errors, ${result.warnings.length} warnings ───\x1b[0m`);

  return result;
}

/**
 * Run validation and log results (for use in server startup)
 */
export async function runStartupValidation(): Promise<void> {
  console.log("\x1b[90m─── Rodeo Startup Validation ───\x1b[0m");
  await validateStartup();
}
