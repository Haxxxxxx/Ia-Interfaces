import { NextRequest } from "next/server";
import { chat } from "@/lib/llm-client";
import { validateApiKey, logUsage, checkBudget } from "@/lib/auth";
import { checkRateLimit, getRateLimitForModel } from "@/lib/rate-limit";
import { TOOLS } from "@/lib/tools-schema";
import { executeTool, getSandboxPath, FileChange, getToolsForAgent } from "@/lib/tool-executor";
import { trackChange, isPlanMode } from "@/lib/session-state";
import { getProjectMemory, formatMemoryForPrompt } from "@/lib/project-memory";
import { getAgent, AGENTS } from "@/lib/agents";
import { generateSystemPrompt } from "@/lib/agent-prompts";
import type OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default model based on provider
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "qwen2.5:7b";

// Agentic loop configuration
const MAX_ITERATIONS = 8;

// ============================================================================
// Types
// ============================================================================

interface AgenticEvent {
  type: "content" | "tool_start" | "tool_result" | "tool_error" | "iteration" | "done" | "error" | "agent_suggest" | "plan_complete";
  content?: string;
  tool?: string;
  toolCallId?: string;
  result?: {
    success: boolean;
    output: string;
    error?: string;
  };
  current?: number;
  max?: number;
  error?: string;
  suggestedAgent?: string;
  reason?: string;
}

// ============================================================================
// Complex Task Detection
// ============================================================================

const COMPLEX_TASK_PATTERNS = [
  /\b(implement|build|create|develop|design)\s+(a|an|the)?\s*(new|complete|full|entire)?\s*(system|feature|module|service|api|application)\b/i,
  /\b(refactor|rewrite|redesign|restructure|overhaul)\s+(the|entire|whole|complete)?\s*(codebase|project|system|architecture)\b/i,
  /\b(add|integrate)\s+(authentication|authorization|auth|payment|database|caching|logging|monitoring)\b/i,
  /\b(across|throughout|all)\s+(files|modules|components|services)\b/i,
  /\b(multiple|several|many)\s+(files|changes|modifications|updates)\b/i,
  /\bmigrate\s+(to|from)\b/i,
  /\b(architecture|infrastructure|ci\/?cd|deployment|pipeline)\b/i,
  /\b(entire|whole|complete|full|comprehensive)\s+(rewrite|refactor|redesign|implementation)\b/i,
  /\bfrom\s+scratch\b/i,
];

const SIMPLE_TASK_PATTERNS = [
  /\b(fix|correct|update|change)\s+(a|the|this)?\s*(typo|bug|error|issue)\b/i,
  /\badd\s+(a|an)?\s*(comment|log|console\.log)\b/i,
  /\b(rename|move)\s+(a|the|this)?\s*(file|variable|function)\b/i,
  /\b(show|display|list|find|search|grep|read)\b/i,
  /\bexplain\b/i,
  /\bwhat\s+(is|are|does)\b/i,
];

function detectComplexTask(messages: OpenAI.Chat.ChatCompletionMessageParam[]): { isComplex: boolean; reason?: string } {
  // Find the last user message
  const userMessages = messages.filter(m => m.role === "user");
  if (userMessages.length === 0) return { isComplex: false };

  const lastUserMessage = userMessages[userMessages.length - 1];
  const content = typeof lastUserMessage.content === "string" ? lastUserMessage.content : "";

  // Check simple patterns first
  for (const pattern of SIMPLE_TASK_PATTERNS) {
    if (pattern.test(content)) {
      return { isComplex: false };
    }
  }

  // Check complex patterns
  for (const pattern of COMPLEX_TASK_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      return { isComplex: true, reason: `Complex task: "${match[0]}"` };
    }
  }

  return { isComplex: false };
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatAgenticEvent(event: AgenticEvent): string {
  return `data: ${JSON.stringify({ agenticEvent: event })}\n\n`;
}

function buildSystemPrompt(
  projectRoot: string,
  memory: string | null,
  planMode: boolean
): string {
  let prompt = `You are an AI assistant with access to tools for reading, editing, and managing files.

Working directory: ${projectRoot}

## Tool Usage Guidelines:
- Use Read before Edit or Write on existing files
- Use absolute paths or paths relative to working directory
- Use Bash for git, npm, and system commands
- Use Glob to find files by pattern
- Use Grep to search file contents
- Use List to explore directories

## Best Practices:
- Read files before editing to understand context
- Make minimal, focused changes
- Use tools (Glob, Grep, List, Read) to gather context instead of asking
- Only ask for clarification when tools cannot help
`;

  if (planMode) {
    prompt += `
## PLAN MODE ACTIVE
You are in planning mode. Describe your approach step-by-step before executing.
Outline what files you'll read, what changes you'll make, and why.
`;
  }

  if (memory) {
    prompt += `\n${memory}`;
  }

  return prompt;
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(req: NextRequest) {
  // 1. Auth
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request body with error handling
  let body: any;
  try {
    const text = await req.text();
    if (!text || text.trim().length === 0) {
      return Response.json({ error: "Request body is required" }, { status: 400 });
    }
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid JSON in request body", details: error.message },
        { status: 400 }
      );
    }
    return Response.json(
      { error: "Failed to parse request body", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
  const {
    model: requestedModel = DEFAULT_MODEL,
    messages: clientMessages,
    tools: clientTools,
    stream = true,
    temperature,
    max_tokens,
    instance_id: instanceId,
    agentic = true, // Enable agentic loop by default
    project_root: clientProjectRoot,
    agent: agentName = "build", // Multi-agent support: build, plan, explore, general
  } = body;

  const model = requestedModel;
  const isPaidModel = model.startsWith("kimi-") || model.startsWith("deepseek-");
  const budget = await checkBudget(user.id);
  if (isPaidModel && budget.exceeded) {
    return Response.json(
      {
        error: "Monthly budget exceeded",
        usage: budget,
      },
      { status: 429 }
    );
  }

  // 2b. Rate limit (per user, per model)
  const rateLimitConfig = getRateLimitForModel(model);
  const rateLimit = checkRateLimit(user.id, rateLimitConfig);
  if (!rateLimit.allowed) {
    return Response.json(
      {
        error: "Rate limit exceeded",
        retryAfter: Math.ceil(rateLimit.resetIn / 1000),
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rateLimit.resetIn / 1000)) },
      }
    );
  }

  // 3. Set up sandbox and context
  const projectRoot = clientProjectRoot || await getSandboxPath(user.id, instanceId || "default");

  // Get agent configuration and filter tools accordingly
  const agent = getAgent(agentName);
  if (!agent) {
    return Response.json(
      { error: `Unknown agent: ${agentName}. Available: ${Object.keys(AGENTS).join(", ")}` },
      { status: 400 }
    );
  }

  // Filter tools based on agent permissions (unless client explicitly provides tools)
  const tools = clientTools || getToolsForAgent(agentName, TOOLS);

  // Get project memory if available
  let memoryContext: string | null = null;
  try {
    const memory = await getProjectMemory(instanceId || "default", projectRoot);
    if (memory) {
      memoryContext = formatMemoryForPrompt(memory);
    }
  } catch {
    // Memory not available, continue without it
  }

  // Check plan mode
  const planMode = isPlanMode(instanceId || "default", user.id);

  // 4. Build messages - use client's system prompt if provided
  const hasClientSystem = clientMessages?.[0]?.role === "system";

  // Build agent-aware system prompt
  const agentSystemPrompt = generateSystemPrompt(agentName, {
    projectInfo: `Working directory: ${projectRoot}`,
    customInstructions: memoryContext || undefined,
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = hasClientSystem
    ? clientMessages  // CLI case: use client prompt (proactive, detailed)
    : [
        { role: "system", content: planMode ? buildSystemPrompt(projectRoot, memoryContext, planMode) : agentSystemPrompt },
        ...clientMessages,
      ];

  // 5. Non-agentic mode: simple proxy
  if (!agentic || !stream) {
    try {
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

                const chunkData = chunk as { usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number } };
                if (chunkData.usage) {
                  inputTokens = chunkData.usage.prompt_tokens || 0;
                  outputTokens = chunkData.usage.completion_tokens || 0;
                  cachedTokens = chunkData.usage.cached_tokens || 0;
                }
              }

              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();

              if (inputTokens > 0 || outputTokens > 0) {
                // Fire-and-forget: the stream is already closed; don't make the
                // client wait on a usage-log DB write.
                void logUsage(user.id, model, inputTokens, outputTokens, cachedTokens, instanceId)
                  .catch((e) => console.error("logUsage failed:", e));
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
            "X-Budget-Remaining": String((budget.remaining ?? 0).toFixed(2)),
          },
        });
      } else {
        const result = response as unknown as {
          usage?: { prompt_tokens?: number; completion_tokens?: number; cached_tokens?: number };
        };
        void logUsage(
          user.id,
          model,
          result.usage?.prompt_tokens || 0,
          result.usage?.completion_tokens || 0,
          result.usage?.cached_tokens || 0,
          instanceId
        ).catch((e) => console.error("logUsage failed:", e));
        return Response.json(result);
      }
    } catch (error: any) {
      console.error("LLM connection error:", error.message);
      const isOllama = !model.startsWith("kimi-") && !model.startsWith("deepseek-");
      return Response.json(
        {
          error: "LLM backend unreachable",
          details: error.message,
          hint: isOllama
            ? "Make sure Ollama is running (ollama serve) with the model pulled (ollama pull " + model + ")"
            : "Check your API key and network connection",
        },
        { status: 503 }
      );
    }
  }

  // 6. Agentic mode with streaming
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let iteration = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCachedTokens = 0;
      let agenticMessages = [...messages];
      let hasToolCalls = true;
      // Loop detection: count consecutive identical tool-call signatures rather
      // than comparing only to the previous iteration. Tolerates a legitimate
      // re-read after an edit (the verify pattern) and catches it on the 3rd
      // identical repeat instead of the 1st.
      let lastSignature = "";
      let repeatCount = 0;

      // File change handler for undo tracking
      const onFileChange = (change: FileChange) => {
        trackChange(instanceId || "default", user.id, projectRoot, {
          type: change.type,
          path: change.path,
          backup: change.backup || null,
        });
      };

      try {
        // Agentic loop
        while (hasToolCalls && iteration < MAX_ITERATIONS) {
          iteration++;

          // Send iteration event
          controller.enqueue(
            encoder.encode(formatAgenticEvent({
              type: "iteration",
              current: iteration,
              max: MAX_ITERATIONS,
            }))
          );

          // On first iteration, check for complex task and suggest plan mode
          if (iteration === 1 && agentName === "build") {
            const complexity = detectComplexTask(agenticMessages);
            if (complexity.isComplex) {
              controller.enqueue(
                encoder.encode(formatAgenticEvent({
                  type: "agent_suggest",
                  suggestedAgent: "plan",
                  reason: complexity.reason,
                }))
              );
            }
          }

          // Make LLM call
          let response;
          try {
            response = await chat({
              model,
              messages: agenticMessages,
              tools,
              stream: true,
              temperature,
              maxTokens: max_tokens,
            });
          } catch (error: any) {
            controller.enqueue(
              encoder.encode(formatAgenticEvent({
                type: "error",
                error: `LLM error: ${error.message}`,
              }))
            );
            break;
          }

          // Process streaming response
          let contentAccumulator = "";
          const toolCallAccumulators: Map<number, ToolCallAccumulator> = new Map();
          let finishReason: string | null = null;

          for await (const chunk of response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
            // Track usage
            if (chunk.usage) {
              totalInputTokens += chunk.usage.prompt_tokens || 0;
              totalOutputTokens += chunk.usage.completion_tokens || 0;
              // @ts-ignore - cached_tokens might exist
              totalCachedTokens += chunk.usage.cached_tokens || 0;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;

            finishReason = choice.finish_reason || finishReason;
            const delta = choice.delta;

            // Stream content
            if (delta?.content) {
              contentAccumulator += delta.content;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }

            // Accumulate tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccumulators.has(idx)) {
                  toolCallAccumulators.set(idx, {
                    id: tc.id || `call_${idx}`,
                    name: "",
                    arguments: "",
                  });
                }
                const acc = toolCallAccumulators.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
              }

              // Also forward raw chunk so client can display tool calls
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
              );
            }
          }

          // Add assistant message to history
          const toolCalls = Array.from(toolCallAccumulators.values()).filter(tc => tc.name);
          const assistantMessage: OpenAI.Chat.ChatCompletionMessageParam = {
            role: "assistant",
            content: contentAccumulator || null,
          };

          if (toolCalls.length > 0) {
            (assistantMessage as any).tool_calls = toolCalls.map(tc => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            }));
          }

          agenticMessages.push(assistantMessage);

          // Check for tool calls to execute
          if (toolCalls.length === 0 || finishReason === "stop") {
            // Detect plan completion for plan agent
            if (agentName === "plan" && contentAccumulator) {
              const planComplete = /ready to implement|plan (is )?complete|proceed with implementation/i.test(contentAccumulator);
              if (planComplete) {
                controller.enqueue(
                  encoder.encode(formatAgenticEvent({
                    type: "plan_complete",
                    content: "Plan is ready. Switch to build agent to implement.",
                  }))
                );
              }
            }
            hasToolCalls = false;
            break;
          }

          // Loop detection - break only after the SAME batch repeats 3x in a
          // row (an order-independent signature of the tool calls).
          const signature = toolCalls
            .map(tc => `${tc.name}:${tc.arguments}`)
            .sort()
            .join("|");
          repeatCount = signature && signature === lastSignature ? repeatCount + 1 : 0;
          lastSignature = signature;
          if (repeatCount >= 2) {
            // 3rd identical batch — genuinely stuck.
            controller.enqueue(
              encoder.encode(formatAgenticEvent({
                type: "error",
                error: "Detected potential loop - same tool calls repeated 3x",
              }))
            );
            break;
          }

          // Execute tool calls (can be parallel for independent tools)
          const toolResults = await Promise.all(
            toolCalls.map(async (tc) => {
              // Send tool start event
              controller.enqueue(
                encoder.encode(formatAgenticEvent({
                  type: "tool_start",
                  tool: tc.name,
                  toolCallId: tc.id,
                }))
              );

              // Parse arguments
              let args: Record<string, unknown>;
              try {
                args = JSON.parse(tc.arguments || "{}");
              } catch {
                return {
                  toolCallId: tc.id,
                  success: false,
                  output: "",
                  error: `Invalid JSON arguments: ${tc.arguments}`,
                };
              }

              // Execute tool (with agent permissions check)
              const result = await executeTool(tc.name, args, {
                userId: user.id,
                instanceId: instanceId || "default",
                projectRoot,
                sessionId: instanceId || "default",
                agentName, // Pass agent for permission validation
                model, // Used by the Task tool to spawn subagents
                onFileChange,
              });

              // Send tool result event
              controller.enqueue(
                encoder.encode(formatAgenticEvent({
                  type: result.success ? "tool_result" : "tool_error",
                  tool: tc.name,
                  toolCallId: tc.id,
                  result: {
                    success: result.success,
                    output: result.output,
                    error: result.error,
                  },
                }))
              );

              return {
                toolCallId: tc.id,
                ...result,
              };
            })
          );

          // Add tool results to messages
          for (const result of toolResults) {
            agenticMessages.push({
              role: "tool",
              tool_call_id: result.toolCallId,
              content: result.success
                ? result.output
                : `Error: ${result.error}\n${result.output}`,
            } as OpenAI.Chat.ChatCompletionToolMessageParam);
          }

          // Check if any tool had an error that should stop the loop.
          // NOTE: && binds tighter than ||, so the guard MUST be parenthesized —
          // otherwise a *successful* tool whose output contained "blocked" would
          // break the loop, and failed-sandbox errors wouldn't reliably stop it.
          const criticalError = toolResults.find(r =>
            !r.success && (r.error?.includes("sandbox") || r.error?.includes("blocked"))
          );
          if (criticalError) {
            break;
          }
        }

        // Send done event
        controller.enqueue(
          encoder.encode(formatAgenticEvent({ type: "done" }))
        );

        // Send final done marker
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();

        // Log total usage — fire-and-forget, stream already closed.
        if (totalInputTokens > 0 || totalOutputTokens > 0) {
          void logUsage(
            user.id,
            model,
            totalInputTokens,
            totalOutputTokens,
            totalCachedTokens,
            instanceId
          ).catch((e) => console.error("logUsage failed:", e));
        }
      } catch (error: any) {
        controller.enqueue(
          encoder.encode(formatAgenticEvent({
            type: "error",
            error: error.message,
          }))
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-User-Id": user.id,
      "X-Budget-Remaining": String((budget.remaining ?? 0).toFixed(2)),
      "X-Agentic": "true",
      "X-Agent": agentName,
    },
  });
}
