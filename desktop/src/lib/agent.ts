/**
 * The offline coding agent loop.
 *
 * Streams from local Ollama, accumulates tool calls, gates mutating tools
 * through an approval callback (with diff preview for edits), executes them
 * via the Tauri-native executor, feeds results back, and iterates until the
 * model stops calling tools — same shape as a Claude Code turn.
 */
import { streamOllamaChat, NUM_CTX, type ChatMessage, type ToolCall } from "./ollama";
import { TOOL_SCHEMAS } from "./tools";
import { executeTool, isReadOnly, describeTool, computeEdit, makeDiff } from "./tool-executor";

const MAX_ITERATIONS = 12;

// ---------------------------------------------------------------------------
// Tolerate models that emit tool calls as TEXT instead of native tool_calls
// (qwen2.5-coder and friends do this under Ollama). Parse them out and run them.
// ---------------------------------------------------------------------------
function extractJsonObjects(text: string): any[] {
  const objs: any[] = [];
  let pos = 0;
  while (pos < text.length) {
    const start = text.indexOf("{", pos);
    if (start === -1) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\" && inStr) { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr) {
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
    }
    if (end === -1) break;
    try { objs.push(JSON.parse(text.slice(start, end + 1))); } catch { /* not valid JSON */ }
    pos = end + 1;
  }
  return objs;
}

// Known tool names (lowercased) — reject prose JSON that merely looks tool-shaped.
const KNOWN_TOOL_NAMES = new Set(TOOL_SCHEMAS.map((t) => t.function.name.toLowerCase()));

/**
 * Keep the history within num_ctx so a deep task doesn't overflow the window and
 * silently evict the system prompt + tool defs (which makes the model stop
 * calling tools). Elides the content of OLD tool results in place (escalating
 * how few it keeps full), never dropping messages, so the assistant↔tool pairing
 * stays valid. Mutates `messages` directly (the loop owns the array).
 */
function trimHistoryInPlace(messages: ChatMessage[]): void {
  const budgetChars = NUM_CTX * 0.65 * 4; // ~65% of the window for history
  const size = () => messages.reduce((n, m) =>
    n + (typeof m.content === "string" ? m.content.length : 0) +
    (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);
  if (size() <= budgetChars) return;

  for (const keepFull of [8, 4, 2, 0]) {
    const toolPos: number[] = [];
    messages.forEach((m, i) => { if (m.role === "tool") toolPos.push(i); });
    const stale = new Set(toolPos.slice(0, Math.max(0, toolPos.length - keepFull)));
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!stale.has(i) || m.role !== "tool" || typeof m.content !== "string") continue;
      if (m.content.length <= 400 || m.content.startsWith("[elided")) continue;
      m.content = `[elided — ${m.content.length} chars; re-run the tool if you need this again]`;
    }
    if (size() <= budgetChars) break;
  }
}

// A request to EXPLAIN/understand (not act) — don't force a tool turn just
// because it contains a verb like "build" or "update".
function isExplanatoryQuery(text: string): boolean {
  return /^\s*(explain|how\b|why\b|what\b|where\b|when\b|which\b|who\b|describe|show me|tell me|walk me through|can you explain|could you explain|is it|are there|does\b|do you)\b/i.test(text || "");
}

// Is the assistant genuinely asking the USER something (so we stop and let them
// answer)? A stray "?" mid-explanation must NOT count.
function looksLikeUserQuestion(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const lastLine = t.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
  if (/\?\s*$/.test(lastLine)) return true;
  return /\b(which (file|one|option|approach|of these)|do you want|would you like|should i\b|shall i\b|let me know|please (confirm|clarify|specify)|can you clarify|to confirm[:,])/i.test(t);
}

function parseToolCallsFromText(content: string): ToolCall[] {
  if (!content) return [];
  const calls: ToolCall[] = [];
  const add = (obj: any) => {
    // Tolerate the key shapes weak models emit for the name and the args.
    const name = obj?.name ?? obj?.tool ?? obj?.function ?? obj?.action;
    const args = obj?.arguments ?? obj?.parameters ?? obj?.args ?? obj?.input ?? obj?.tool_input;
    if (typeof name === "string" && KNOWN_TOOL_NAMES.has(name.toLowerCase()) && args && typeof args === "object") {
      calls.push({ id: `parsed_${calls.length}_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
    }
  };
  const blockRe = /```(?:json|tool_code|tool)?\s*\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content))) for (const o of extractJsonObjects(m[1])) add(o);
  if (calls.length === 0) for (const o of extractJsonObjects(content)) add(o);
  return calls;
}

export interface ApprovalRequest {
  toolCall: ToolCall;
  description: string;
  diff?: string; // present for Edit/MultiEdit/Write
}

export interface AgentCallbacks {
  onContent?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  /** Replace the streamed assistant text (used after stripping text-emitted tool calls). */
  onCleanContent?: (text: string) => void;
  /** Called when the assistant finishes a text turn (before tools run). */
  onAssistantTurn?: (content: string, toolCalls: ToolCall[]) => void;
  onToolStart?: (toolCall: ToolCall, description: string) => void;
  onToolResult?: (toolCall: ToolCall, result: string) => void;
  onIteration?: (n: number) => void;
  /** Resolve true to run a mutating tool, false to deny. */
  requestApproval?: (req: ApprovalRequest) => Promise<boolean>;
  /** Answer an AskUser choice-question. Resolve with the user's selection. */
  requestChoice?: (q: { question: string; options: string[]; header?: string; allowMultiple?: boolean }) => Promise<string>;
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
  const actionRequested = !isExplanatoryQuery(lastUser) && (
    /\b(add|edit|implement|fix|create|write|change|update|build|refactor|rename|remove|delete|enhance|make|wire|set up|integrate)\b/i.test(lastUser) ||
    /\b(yourself|edit the code|do it|implement it|edit the actual|go ahead|proceed)\b/i.test(lastUser)
  );

  for (let iter = 0; iter < maxIter; iter++) {
    cb.onIteration?.(iter + 1);

    // Keep history within the context window before each turn.
    trimHistoryInPlace(messages);

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

    let toolCalls = Object.values(toolAcc).filter((t) => t.function.name);

    // Recover tool calls the model emitted as text (coder models, etc.).
    if (toolCalls.length === 0 && content) {
      const parsed = parseToolCallsFromText(content);
      if (parsed.length) {
        toolCalls = parsed;
        content = content.replace(/```[\s\S]*?```/g, "").trim(); // drop the raw JSON from the bubble
        cb.onCleanContent?.(content);
      }
    }

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
      // If the model is asking the user a clarifying question, STOP so they can
      // answer — never keep looping/nudging on a question.
      const isQuestion = looksLikeUserQuestion(content);
      // Otherwise force EXPLORATION (a read), not a write: if the model just
      // narrated without looking at the code, make it use a read tool first.
      const shouldExploreFirst = actionRequested && !toolsUsed && !isQuestion;
      if (shouldExploreFirst && nudges < 2 && !opts.signal?.aborted) {
        nudges++;
        messages.push({
          role: "system",
          content:
            "You responded without looking at the code. First USE A READ TOOL — Read / Glob / Grep — to see the actual files (don't answer or ask from assumptions). After exploring, you may make the change with Edit/Write if you're sure, or ask the user ONE specific question if you still need details. Use a tool now.",
        });
        continue;
      }
      // Empty response → tell the user instead of silently showing nothing.
      if (!toolsUsed && !content.trim() && !reasoning.trim() && !proposedCode && !opts.signal?.aborted) {
        const note = `⚠️ ${opts.model} returned an empty response. It may have failed to load, run low on memory (try a smaller model via ⌘M), or struggled with this request. Try again, or switch models.`;
        assistantMsg.content = note;
        cb.onContent?.(note);
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

    // Fast path: a batch of only read-only tools (Read/Glob/Grep/List, no
    // AskUser, no mutations) — run them CONCURRENTLY instead of one Tauri
    // round-trip at a time. Results are still pushed in the original order
    // (native /api/chat matches tool results to calls by order).
    if (toolCalls.length > 1 && toolCalls.every((t) => t.function.name !== "AskUser" && isReadOnly(t.function.name))) {
      const settled = await Promise.all(
        toolCalls.map(async (tc) => {
          cb.onToolStart?.(tc, describeTool(tc));
          const tt0 = performance.now();
          const result = await executeTool(tc, opts.cwd, opts.guarded);
          cb.onToolMetric?.({ toolName: tc.function.name, durationMs: Math.round(performance.now() - tt0), ok: !result.startsWith("Error") });
          cb.onToolResult?.(tc, result);
          return { tc, result };
        })
      );
      for (const { tc, result } of settled) {
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: result });
      }
      if (opts.signal?.aborted) return messages;
      continue;
    }

    // Execute each tool call (read-only auto-runs; mutations need approval).
    for (const tc of toolCalls) {
      if (opts.signal?.aborted) return messages;

      // AskUser → surface a choice prompt to the user (auto-answer when unattended).
      if (tc.function.name === "AskUser") {
        let qa: any = {};
        try { qa = JSON.parse(tc.function.arguments || "{}"); } catch {}
        cb.onToolStart?.(tc, `Question: ${qa.question || ""}`);
        const opt0 = Array.isArray(qa.options) && qa.options.length ? String(qa.options[0]) : "";
        const answer = cb.requestChoice
          ? await cb.requestChoice({
              question: String(qa.question || "?"),
              options: Array.isArray(qa.options) ? qa.options.map(String) : [],
              header: qa.header ? String(qa.header) : undefined,
              allowMultiple: !!qa.allowMultiple,
            })
          // Unattended: hand back a CONCRETE decision (the first option) rather
          // than a meta-instruction the model tends to re-ask about or stall on.
          : opt0
            ? `Running autonomously — proceeding with: ${opt0}`
            : "Running autonomously — make the best decision and proceed without asking.";
        cb.onToolResult?.(tc, answer);
        messages.push({ role: "tool", tool_call_id: tc.id, name: "AskUser", content: answer });
        if (opts.signal?.aborted) return messages;
        continue;
      }

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
