/**
 * The offline coding agent loop.
 *
 * Streams from local Ollama, accumulates tool calls, gates mutating tools
 * through an approval callback (with diff preview for edits), executes them
 * via the Tauri-native executor, feeds results back, and iterates until the
 * model stops calling tools — same shape as a Claude Code turn.
 */
import { streamOllamaChat, type ChatMessage, type ToolCall } from "./ollama";
import { TOOL_SCHEMAS } from "./tools";
import { executeTool, isReadOnly, describeTool, computeEdit, makeDiff } from "./tool-executor";

const MAX_ITERATIONS = 12;

export interface ApprovalRequest {
  toolCall: ToolCall;
  description: string;
  diff?: string; // present for Edit/MultiEdit/Write
}

export interface AgentCallbacks {
  onContent?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  /** Called when the assistant finishes a text turn (before tools run). */
  onAssistantTurn?: (content: string, toolCalls: ToolCall[]) => void;
  onToolStart?: (toolCall: ToolCall, description: string) => void;
  onToolResult?: (toolCall: ToolCall, result: string) => void;
  onIteration?: (n: number) => void;
  /** Resolve true to run a mutating tool, false to deny. */
  requestApproval?: (req: ApprovalRequest) => Promise<boolean>;
  /** Perf telemetry for the dashboard. */
  onTurnMetric?: (m: { model: string; ttftMs: number; durationMs: number; tokens: number; tokPerSec: number }) => void;
  onToolMetric?: (m: { toolName: string; durationMs: number; ok: boolean }) => void;
}

export interface AgentOptions {
  model: string;
  cwd: string;
  autoApprove: boolean;
  guarded?: boolean;       // enforce destructive-command + working-dir guardrails
  maxIterations?: number;  // override the default step cap (autonomous runs go higher)
  signal?: AbortSignal;
}

export async function runAgent(
  messages: ChatMessage[],
  opts: AgentOptions,
  cb: AgentCallbacks = {}
): Promise<ChatMessage[]> {
  let lastSignature = "";
  let nudges = 0;        // times we've forced "stop narrating, use a tool"
  let toolsUsed = false; // whether any tool ran this task
  const maxIter = opts.maxIterations ?? MAX_ITERATIONS;

  // Did the latest user turn ask Rodeo to actually DO something (vs. explain)?
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && typeof m.content === "string")?.content as string || "";
  const actionRequested =
    /\b(add|edit|implement|fix|create|write|change|update|build|refactor|rename|remove|delete|enhance|make|wire|set up|integrate)\b/i.test(lastUser) ||
    /\b(yourself|edit the code|do it|implement it|edit the actual|go ahead|proceed)\b/i.test(lastUser);

  for (let iter = 0; iter < maxIter; iter++) {
    cb.onIteration?.(iter + 1);

    let content = "";
    let reasoning = "";
    const toolAcc: Record<number, ToolCall> = {};
    let finishReason: string | null = null;

    // Perf timing for this turn
    const t0 = performance.now();
    let ttftMs = 0;
    let tokenChunks = 0;

    for await (const chunk of streamOllamaChat(messages, {
      model: opts.model,
      tools: TOOL_SCHEMAS,
      signal: opts.signal,
    })) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (delta.content) {
        if (ttftMs === 0) ttftMs = performance.now() - t0;
        tokenChunks++;
        content += delta.content; cb.onContent?.(delta.content);
      }
      if (delta.reasoning_content) {
        if (ttftMs === 0) ttftMs = performance.now() - t0;
        tokenChunks++;
        reasoning += delta.reasoning_content; cb.onReasoning?.(delta.reasoning_content);
      }

      for (const tc of delta.tool_calls || []) {
        const idx = tc.index ?? 0;
        if (!toolAcc[idx]) {
          toolAcc[idx] = { id: tc.id || `call_${idx}`, type: "function", function: { name: "", arguments: "" } };
        }
        if (tc.id) toolAcc[idx].id = tc.id;
        if (tc.function?.name) toolAcc[idx].function.name = tc.function.name;
        if (tc.function?.arguments) toolAcc[idx].function.arguments += tc.function.arguments;
      }
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    // Emit turn perf metric (token counts are chunk-approximate).
    const durationMs = performance.now() - t0;
    if (tokenChunks > 0) {
      cb.onTurnMetric?.({
        model: opts.model,
        ttftMs: Math.round(ttftMs),
        durationMs: Math.round(durationMs),
        tokens: tokenChunks,
        tokPerSec: durationMs > 0 ? Math.round((tokenChunks / durationMs) * 1000 * 10) / 10 : 0,
      });
    }

    const toolCalls = Object.values(toolAcc).filter((t) => t.function.name);

    // Record the assistant turn.
    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: content || null,
      ...(reasoning ? { reasoning_content: reasoning } : {}),
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
    messages.push(assistantMsg);
    cb.onAssistantTurn?.(content, toolCalls);

    // No tools this turn. If the user asked for an action and the model just
    // narrated/proposed code instead of editing, force it to actually act.
    if (toolCalls.length === 0 || finishReason === "stop") {
      const proposedCode = /```/.test(content);
      const shouldHaveActed = actionRequested && (proposedCode || !toolsUsed);
      if (shouldHaveActed && nudges < 2 && !opts.signal?.aborted) {
        nudges++;
        messages.push({
          role: "system",
          content:
            "STOP — you did not call any tool, so NOTHING changed. Writing code or steps in your message does not edit files. The user asked you to make the change. Right now: Read the target file if you haven't, then call Edit / MultiEdit / Write (or Bash) with the ACTUAL change. Do not explain, propose, apologize, or show code in prose — emit the tool call this turn.",
        });
        continue;
      }
      return messages;
    }

    // Loop guard: identical tool batch twice in a row.
    const signature = toolCalls.map((t) => `${t.function.name}:${t.function.arguments}`).join("|");
    if (signature === lastSignature) {
      messages.push({
        role: "tool",
        tool_call_id: toolCalls[0].id,
        content: "Detected a repeated identical tool call. Stopping to avoid a loop — try a different approach or summarize for the user.",
      });
      return messages;
    }
    lastSignature = signature;
    toolsUsed = true;

    // Execute each tool call (read-only auto-runs; mutations need approval).
    for (const tc of toolCalls) {
      if (opts.signal?.aborted) return messages;

      const description = describeTool(tc);
      cb.onToolStart?.(tc, description);

      let approved = true;
      if (!isReadOnly(tc.function.name) && !opts.autoApprove) {
        const diff = await previewDiff(tc, opts.cwd);
        approved = (await cb.requestApproval?.({ toolCall: tc, description, diff })) ?? false;
      }

      let result: string;
      if (!approved) {
        result = "User denied this action. Stop and ask the user how to proceed.";
      } else {
        const tt0 = performance.now();
        result = await executeTool(tc, opts.cwd, opts.guarded);
        cb.onToolMetric?.({
          toolName: tc.function.name,
          durationMs: Math.round(performance.now() - tt0),
          ok: !result.startsWith("Error"),
        });
      }

      cb.onToolResult?.(tc, result);
      messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result });

      if (!approved) return messages;
    }
  }

  messages.push({
    role: "assistant",
    content: `(Reached the ${maxIter}-step limit. Pausing here.)`,
  });
  return messages;
}

/** Build a diff preview for edit/write tools so the user sees the change before approving. */
async function previewDiff(tc: ToolCall, cwd: string): Promise<string | undefined> {
  let a: any = {};
  try { a = JSON.parse(tc.function.arguments || "{}"); } catch { return undefined; }
  try {
    if (tc.function.name === "Edit") {
      const r = await computeEdit(a.file_path, [{ old_string: a.old_string, new_string: a.new_string, replace_all: a.replace_all }], cwd);
      return r.error ? `⚠ ${r.error}` : makeDiff(r.before, r.after);
    }
    if (tc.function.name === "MultiEdit") {
      const r = await computeEdit(a.file_path, a.edits || [], cwd);
      return r.error ? `⚠ ${r.error}` : makeDiff(r.before, r.after);
    }
    if (tc.function.name === "Write") {
      return makeDiff("", a.content ?? "");
    }
  } catch { /* preview is best-effort */ }
  return undefined;
}
