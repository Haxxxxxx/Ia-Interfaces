import { useState, useRef, useEffect } from "react";
import { useStore } from "../lib/store";
import { streamChat } from "../lib/api-client";
import { runAgent, type ApprovalRequest } from "../lib/agent";
import { buildSystemPrompt } from "../lib/tools";
import { gatherProjectContext } from "../lib/project-context";
import type { ChatMessage } from "../lib/ollama";
import { ThinkingBlock } from "./ThinkingBlock";
import { CodeBlock } from "./CodeBlock";
import { ToolApproval } from "./ToolCallUI";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<ApprovalRequest | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const approvalResolver = useRef<((v: boolean) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ctxCache = useRef<{ dir: string; ctx: string } | null>(null);

  const {
    apiKey, mode, localModel, autoApprove, ollamaUp, learnedProfile,
    workingDirectory, setWorkingDirectory,
    instances, activeInstanceId, addMessage, updateLastMessage, addMetric,
  } = useStore();

  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeInstance?.messages, pending]);

  function requestApproval(req: ApprovalRequest): Promise<boolean> {
    return new Promise((resolve) => {
      setPending(req);
      approvalResolver.current = resolve;
    });
  }
  function resolveApproval(v: boolean) {
    setPending(null);
    approvalResolver.current?.(v);
    approvalResolver.current = null;
  }

  async function pickWorkingDir() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") { setWorkingDirectory(dir); ctxCache.current = null; }
    } catch (e) {
      setStatus(`Could not open folder picker: ${e}`);
    }
  }

  async function getContext(): Promise<string> {
    if (ctxCache.current?.dir === workingDirectory) return ctxCache.current.ctx;
    const ctx = await gatherProjectContext(workingDirectory);
    ctxCache.current = { dir: workingDirectory, ctx };
    return ctx;
  }

  // Build OpenAI-format history from the stored transcript.
  function buildHistory(systemPrompt: string, userText: string): ChatMessage[] {
    const history: ChatMessage[] = [{ role: "system", content: systemPrompt }];
    for (const m of activeInstance!.messages) {
      if (m.role === "assistant") {
        history.push({ role: "assistant", content: m.content || null, ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}) });
      } else if (m.role === "tool") {
        history.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId });
      } else if (m.role === "user") {
        history.push({ role: "user", content: m.content });
      }
    }
    history.push({ role: "user", content: userText });
    return history;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !activeInstance || isStreaming) return;
    if (mode === "remote" && !apiKey) { setStatus("Set an API key in Settings for remote mode."); return; }

    const userText = input.trim();
    setInput("");
    setIsStreaming(true);
    setStatus("");
    addMessage(activeInstance.id, { role: "user", content: userText });

    try {
      if (mode === "local") {
        await runLocal(userText);
      } else {
        await runRemote(userText);
      }
    } catch (error) {
      addMessage(activeInstance.id, {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsStreaming(false);
      setStatus("");
    }
  }

  async function runLocal(userText: string) {
    if (!ollamaUp) {
      addMessage(activeInstance!.id, {
        role: "assistant",
        content: "Ollama isn't running. Start it (the status bar can launch it) or switch to remote mode in Settings.",
      });
      return;
    }
    const ctx = await getContext();
    const system = buildSystemPrompt(ctx, workingDirectory, { learned: learnedProfile });
    const history = buildHistory(system, userText);

    const abort = new AbortController();
    abortRef.current = abort;

    // Streaming bookkeeping: keep one open assistant bubble per model turn.
    let assistantOpen = false;
    let content = "";
    let reasoning = "";
    const id = activeInstance!.id;

    await runAgent(history, { model: localModel, cwd: workingDirectory, autoApprove, signal: abort.signal }, {
      onIteration: (n) => setStatus(`Working… (step ${n})`),
      onContent: (delta) => {
        content += delta;
        if (!assistantOpen) { addMessage(id, { role: "assistant", content, reasoningContent: reasoning }); assistantOpen = true; }
        else updateLastMessage(id, { content });
      },
      onReasoning: (delta) => {
        reasoning += delta;
        if (!assistantOpen) { addMessage(id, { role: "assistant", content, reasoningContent: reasoning }); assistantOpen = true; }
        else updateLastMessage(id, { reasoningContent: reasoning });
      },
      onAssistantTurn: (text, toolCalls) => {
        if (!assistantOpen && (toolCalls.length || text)) {
          addMessage(id, { role: "assistant", content: text, toolCalls });
        } else if (assistantOpen && toolCalls.length) {
          updateLastMessage(id, { toolCalls });
        }
        assistantOpen = false; content = ""; reasoning = "";
      },
      onToolStart: (_tc, description) => setStatus(`▸ ${description}`),
      onTurnMetric: (m) => addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "turn", ...m }),
      onToolMetric: (m) => addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "tool", ...m }),
      onToolResult: (tc, result) => {
        addMessage(id, {
          role: "tool",
          content: result.length > 4000 ? result.slice(0, 4000) + "\n… (truncated)" : result,
          toolCallId: tc.id,
        });
      },
      requestApproval,
    });
  }

  async function runRemote(userText: string) {
    const id = activeInstance!.id;
    const messages = [
      ...(activeInstance!.systemPrompt ? [{ role: "system" as const, content: activeInstance!.systemPrompt }] : []),
      ...activeInstance!.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userText },
    ];
    addMessage(id, { role: "assistant", content: "", reasoningContent: "" });
    let full = "", reason = "";
    for await (const chunk of streamChat(apiKey, messages, { model: activeInstance!.model, thinking: activeInstance!.thinking })) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) full += delta.content;
      if (delta?.reasoning_content) reason += delta.reasoning_content;
      updateLastMessage(id, { content: full, reasoningContent: reason });
    }
  }

  function stop() {
    abortRef.current?.abort();
    resolveApproval(false);
    setIsStreaming(false);
  }

  if (!activeInstance) {
    return (
      <div className="flex-1 flex items-center justify-center text-terminal-muted">
        <div className="text-center">
          <p className="text-4xl mb-4">⚡</p>
          <p className="text-lg">No instance selected</p>
          <p className="text-sm mt-2">Create or select an instance to start</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Context bar */}
      <div className="border-b border-terminal-border px-4 py-2 flex items-center gap-3 text-xs text-terminal-muted">
        <span className={mode === "local" ? (ollamaUp ? "text-terminal-green" : "text-terminal-red") : "text-terminal-accent"}>
          {mode === "local" ? (ollamaUp ? `● local · ${localModel}` : "● ollama offline") : "● remote"}
        </span>
        <span className="opacity-40">|</span>
        <button onClick={pickWorkingDir} className="hover:text-terminal-text truncate max-w-md" title={workingDirectory}>
          📁 {workingDirectory || "set working directory"}
        </button>
        {autoApprove && <span className="text-terminal-yellow">· auto-approve on</span>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-5">
          {activeInstance.messages.length === 0 && !isStreaming && (
            <Welcome hasDir={!!workingDirectory} onPick={setInput} onSetDir={pickWorkingDir} />
          )}

          {activeInstance.messages.map((message) => {
            // User → right-aligned bubble
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end animate-fadeIn">
                  <div className="max-w-[85%] bg-terminal-accent/15 border border-terminal-accent/30 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed selectable whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              );
            }
            // Tool result → compact collapsible card
            if (message.role === "tool") {
              return (
                <details key={message.id} className="ml-11 animate-fadeIn group">
                  <summary className="cursor-pointer text-xs text-terminal-muted hover:text-terminal-text select-none">
                    ⚙ tool result <span className="opacity-60">({message.content.split("\n").length} lines)</span>
                  </summary>
                  <pre className="mt-1 text-xs bg-terminal-surface border border-terminal-border rounded-lg p-2.5 overflow-x-auto max-h-56 overflow-y-auto text-terminal-muted">
                    {message.content}
                  </pre>
                </details>
              );
            }
            // Assistant → avatar + content
            return (
              <div key={message.id} className="flex gap-3 animate-fadeIn">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-terminal-accent/15 text-terminal-accent flex items-center justify-center text-sm font-bold">▸</div>
                <div className="flex-1 min-w-0 pt-0.5">
                  {message.reasoningContent && <ThinkingBlock content={message.reasoningContent} />}
                  {message.content && (
                    <div className="selectable whitespace-pre-wrap text-sm leading-relaxed">{renderContent(message.content)}</div>
                  )}
                  {message.toolCalls?.map((tc) => (
                    <div key={tc.id} className="mt-2 inline-flex items-center gap-2 text-xs bg-terminal-surface border border-terminal-border rounded-md px-2.5 py-1 text-terminal-muted">
                      <span className="text-terminal-accent">⚙</span> {tc.function.name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {pending && (
            <ToolApproval
              description={pending.description}
              args={safeParse(pending.toolCall.function.arguments)}
              diff={pending.diff}
              onApprove={() => resolveApproval(true)}
              onDeny={() => resolveApproval(false)}
            />
          )}

          {isStreaming && !pending && (
            <div className="flex items-center gap-2 text-terminal-muted text-sm">
              <span className="thinking-pulse">●</span>
              <span>{status || "Thinking…"}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-terminal-border p-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "local" ? "Ask Rodeo to code… (he reads/edits files in your working dir)" : "Type a message…"}
            className="flex-1 bg-terminal-surface border border-terminal-border rounded px-4 py-3 text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent focus:border-transparent"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button type="button" onClick={stop} className="px-6 py-3 bg-terminal-red text-terminal-bg rounded font-medium hover:bg-opacity-80 transition-colors">
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="px-6 py-3 bg-terminal-accent text-terminal-bg rounded font-medium hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Welcome({ hasDir, onPick, onSetDir }: { hasDir: boolean; onPick: (t: string) => void; onSetDir: () => void }) {
  const examples = [
    "Explain this project's structure",
    "Find and fix any TODO comments",
    "Add error handling to the main entry file",
    "Write a unit test for the newest function",
  ];
  return (
    <div className="flex flex-col items-center text-center py-16 animate-fadeIn">
      <div className="w-14 h-14 rounded-2xl bg-terminal-accent/15 text-terminal-accent flex items-center justify-center text-2xl font-bold mb-4">▸_</div>
      <h2 className="text-lg font-semibold">Rodeo — offline coding agent</h2>
      <p className="text-sm text-terminal-muted mt-1 max-w-md">
        Runs on your local model. He reads, edits, and runs code right in your working directory.
      </p>
      {!hasDir && (
        <button onClick={onSetDir} className="mt-4 text-sm px-4 py-2 bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80 transition-colors">
          📁 Set working directory to start
        </button>
      )}
      <div className="mt-6 grid sm:grid-cols-2 gap-2 w-full max-w-lg">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onPick(ex)}
            className="text-left text-sm px-3 py-2.5 bg-terminal-surface border border-terminal-border rounded-lg text-terminal-muted hover:text-terminal-text hover:border-terminal-accent/40 transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function renderContent(content: string): React.ReactNode {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, index) => {
    if (part.startsWith("```")) {
      const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
      if (match) {
        const [, language, code] = match;
        return <CodeBlock key={index} code={code.trim()} language={language} />;
      }
    }
    return <span key={index}>{part}</span>;
  });
}
