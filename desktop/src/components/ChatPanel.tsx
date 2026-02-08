import { useState, useRef, useEffect } from "react";
import { useStore } from "../lib/store";
import { streamChat } from "../lib/api-client";
import { ThinkingBlock } from "./ThinkingBlock";
import { CodeBlock } from "./CodeBlock";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    apiKey,
    instances,
    activeInstanceId,
    addMessage,
    updateLastMessage,
  } = useStore();

  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeInstance?.messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !apiKey || !activeInstance || isStreaming) return;

    const userMessage = input.trim();
    setInput("");
    setIsStreaming(true);

    // Add user message
    addMessage(activeInstance.id, {
      role: "user",
      content: userMessage,
    });

    // Add placeholder for assistant message
    addMessage(activeInstance.id, {
      role: "assistant",
      content: "",
      reasoningContent: "",
    });

    try {
      const messages = [
        ...(activeInstance.systemPrompt
          ? [{ role: "system" as const, content: activeInstance.systemPrompt }]
          : []),
        ...activeInstance.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      let fullContent = "";
      let fullReasoning = "";

      for await (const chunk of streamChat(apiKey, messages, {
        model: activeInstance.model,
        thinking: activeInstance.thinking,
      })) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
        }
        if (delta?.reasoning_content) {
          fullReasoning += delta.reasoning_content;
        }

        updateLastMessage(activeInstance.id, {
          content: fullContent,
          reasoningContent: fullReasoning,
        });
      }
    } catch (error) {
      updateLastMessage(activeInstance.id, {
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsStreaming(false);
    }
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
      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {activeInstance.messages.map((message) => (
            <div
              key={message.id}
              className={`animate-fadeIn ${
                message.role === "user" ? "text-terminal-accent" : ""
              }`}
            >
              {/* Role indicator */}
              <div className="text-xs text-terminal-muted mb-1">
                {message.role === "user" ? "you" : "kimi"}
              </div>

              {/* Thinking block */}
              {message.reasoningContent && (
                <ThinkingBlock content={message.reasoningContent} />
              )}

              {/* Content */}
              <div className="selectable whitespace-pre-wrap text-sm leading-relaxed">
                {renderContent(message.content)}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex items-center gap-2 text-terminal-muted text-sm">
              <span className="thinking-pulse">●</span>
              <span>Thinking...</span>
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
            placeholder="Type a message... (⌘ + Enter to send)"
            className="flex-1 bg-terminal-surface border border-terminal-border rounded px-4 py-3 text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent focus:border-transparent"
            disabled={isStreaming || !apiKey}
          />
          <button
            type="submit"
            disabled={isStreaming || !apiKey || !input.trim()}
            className="px-6 py-3 bg-terminal-accent text-terminal-bg rounded font-medium hover:bg-opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function renderContent(content: string): React.ReactNode {
  // Simple markdown-like rendering for code blocks
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
