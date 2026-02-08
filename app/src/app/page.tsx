"use client";

import { useState } from "react";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("kimi-k2.5");
  const [thinking, setThinking] = useState(true);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !apiKey.trim()) return;

    setLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: message }],
          stream: true,
          thinking,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setResponse(`Error: ${error.error}`);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      let reasoningContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices?.[0]?.delta;

              if (delta?.reasoning_content) {
                reasoningContent += delta.reasoning_content;
              }
              if (delta?.content) {
                fullResponse += delta.content;
              }

              setResponse(
                reasoningContent
                  ? `<thinking>\n${reasoningContent}\n</thinking>\n\n${fullResponse}`
                  : fullResponse
              );
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      setResponse(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-terminal-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-semibold">Sadary LLM Hub</h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-terminal-muted">
            <span className="flex items-center gap-2">
              <span className="status-dot connected"></span>
              llm.sadary.xyz
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-64 border-r border-terminal-border p-4 hidden md:block">
          <div className="space-y-6">
            {/* API Key Input */}
            <div>
              <label className="block text-sm text-terminal-muted mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sadary-xxx-xxxx"
                className="input text-sm"
              />
            </div>

            {/* Model Select */}
            <div>
              <label className="block text-sm text-terminal-muted mb-2">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="input text-sm"
              >
                <option value="kimi-k2.5">kimi-k2.5 (flagship)</option>
                <option value="kimi-k2-0905">kimi-k2-0905 (fast)</option>
                <option value="kimi-k2-thinking">kimi-k2-thinking</option>
              </select>
            </div>

            {/* Thinking Toggle */}
            <div className="flex items-center justify-between">
              <label className="text-sm text-terminal-muted">Thinking Mode</label>
              <button
                onClick={() => setThinking(!thinking)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  thinking ? "bg-terminal-accent" : "bg-terminal-border"
                }`}
              >
                <span
                  className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${
                    thinking ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Quick Links */}
            <div className="pt-4 border-t border-terminal-border">
              <nav className="space-y-2">
                <a
                  href="/dashboard"
                  className="block px-3 py-2 rounded text-sm hover:bg-terminal-surface"
                >
                  📊 Dashboard
                </a>
                <a
                  href="/dashboard/instances"
                  className="block px-3 py-2 rounded text-sm hover:bg-terminal-surface"
                >
                  🗂️ Instances
                </a>
                <a
                  href="/dashboard/usage"
                  className="block px-3 py-2 rounded text-sm hover:bg-terminal-surface"
                >
                  📈 Usage
                </a>
              </nav>
            </div>
          </div>
        </aside>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Response Area */}
          <div className="flex-1 p-6 overflow-auto">
            {response ? (
              <div className="max-w-3xl mx-auto">
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                  {response}
                </pre>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-terminal-muted">
                  <p className="text-4xl mb-4">⚡</p>
                  <p className="text-lg">Kimi K2.5</p>
                  <p className="text-sm mt-2">
                    1T params · 256K context · $0.60/$2.50 per M tokens
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={sendMessage} className="border-t border-terminal-border p-4">
            <div className="max-w-3xl mx-auto flex gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="input flex-1"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !apiKey}
                className="btn btn-primary disabled:opacity-50"
              >
                {loading ? "..." : "Send"}
              </button>
            </div>
          </form>

          {/* Status Bar */}
          <div className="border-t border-terminal-border px-4 py-2 text-xs text-terminal-muted flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span>{model}</span>
              <span>{thinking ? "thinking" : "instant"}</span>
            </div>
            <div>
              <a
                href="https://github.com/sadary-dev/llm-hub"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-terminal-accent"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
