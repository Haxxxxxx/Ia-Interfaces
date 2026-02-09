"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UsageData {
  user: { id: string; name: string };
  budget: {
    used: number;
    limit: number;
    remaining: number;
    percentUsed: number;
  };
  daily: Array<{
    date: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    requests: number;
  }>;
  byModel: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    requests: number;
  }>;
}

export default function DashboardPage() {
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("rodeo-api-key");
    if (stored) {
      setApiKey(stored);
      fetchData(stored);
    }
  }, []);

  async function fetchData(key: string) {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${key}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch data");
      }

      const usage = await res.json();
      setData(usage);
      localStorage.setItem("rodeo-api-key", key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (apiKey) fetchData(apiKey);
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="w-full max-w-sm p-6 animate-fadeIn">
          <div className="text-center mb-6">
            <svg className="w-12 h-12 text-terminal-accent mx-auto mb-3 animate-float" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" opacity="0.2"/>
              <circle cx="12" cy="12" r="6"/>
            </svg>
            <h1 className="text-2xl font-bold gradient-text">Rodeo</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-terminal-muted mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="rodeo-xxx-xxxx"
                className="w-full px-4 py-3 bg-terminal-surface border border-terminal-border rounded text-terminal-text"
              />
            </div>

            {error && (
              <div className="text-sm text-terminal-red">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !apiKey}
              className="w-full py-3 bg-terminal-accent text-terminal-bg rounded font-medium hover:bg-opacity-80 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-terminal-bg">
      {/* Header */}
      <header className="border-b border-terminal-border px-6 py-4">
        <div className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 hover-lift">
            <svg className="w-6 h-6 text-terminal-accent" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" opacity="0.3"/>
              <circle cx="12" cy="12" r="6"/>
            </svg>
            <span className="text-xl font-semibold text-terminal-accent">Rodeo</span>
          </a>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="px-3 py-1.5 bg-terminal-accent text-terminal-bg rounded text-sm font-medium hover:bg-opacity-80 transition-colors btn-glow"
            >
              Open Chat
            </Link>
            <span className="text-terminal-muted">{data.user.name}</span>
            <button
              onClick={() => {
                localStorage.removeItem("rodeo-api-key");
                setData(null);
                setApiKey("");
              }}
              className="text-sm text-terminal-muted hover:text-terminal-red transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-terminal-border px-6">
        <div className="flex gap-6">
          <Link
            href="/dashboard"
            className="py-3 border-b-2 border-terminal-accent text-terminal-accent transition-colors"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/instances"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text transition-colors"
          >
            Instances
          </Link>
          <Link
            href="/dashboard/usage"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text transition-colors"
          >
            Usage
          </Link>
          <Link
            href="/dashboard/team"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text transition-colors"
          >
            Team
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Budget Card */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6 card-hover animate-slideUp">
            <h2 className="text-lg font-semibold mb-4">Monthly Budget</h2>
            <div className="flex items-end gap-4">
              <div className="text-4xl font-bold text-terminal-accent">
                ${data.budget.used.toFixed(2)}
              </div>
              <div className="text-terminal-muted pb-1">
                / ${data.budget.limit.toFixed(2)}
              </div>
            </div>
            <div className="mt-4 h-2 bg-terminal-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-terminal-accent rounded-full transition-all"
                style={{ width: `${Math.min(100, data.budget.percentUsed)}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-terminal-muted">
              ${data.budget.remaining.toFixed(2)} remaining
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 stagger-children">
            {data.byModel.map((model) => (
              <div
                key={model.model}
                className="bg-terminal-surface border border-terminal-border rounded-lg p-4 card-hover hover-lift"
              >
                <div className="text-sm text-terminal-muted mb-1">
                  {model.model}
                </div>
                <div className="text-2xl font-bold">{model.requests}</div>
                <div className="text-sm text-terminal-muted">
                  requests · ${model.costUsd.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Daily Usage */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 card-hover animate-slideUp" style={{ animationDelay: "0.2s" }}>
            <h2 className="text-lg font-semibold mb-4">Daily Usage</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-terminal-muted border-b border-terminal-border">
                    <th className="text-left py-2">Date</th>
                    <th className="text-right py-2">Requests</th>
                    <th className="text-right py-2">Input Tokens</th>
                    <th className="text-right py-2">Output Tokens</th>
                    <th className="text-right py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr key={day.date} className="border-b border-terminal-border/50">
                      <td className="py-2">{day.date}</td>
                      <td className="text-right py-2">{day.requests}</td>
                      <td className="text-right py-2">
                        {day.inputTokens.toLocaleString()}
                      </td>
                      <td className="text-right py-2">
                        {day.outputTokens.toLocaleString()}
                      </td>
                      <td className="text-right py-2 text-terminal-green">
                        ${day.costUsd.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-terminal-border px-6 py-4 mt-8">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-terminal-muted text-sm">
            <span>Rodeo v1.0</span>
            <span className="text-terminal-border">·</span>
            <span>Self-hosted AI coding assistant</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/anthropics/rodeo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-muted hover:text-terminal-accent transition-colors"
              title="GitHub"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
            <a
              href="https://twitter.com/rodeo_ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-muted hover:text-terminal-accent transition-colors"
              title="Twitter/X"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a
              href="https://discord.gg/rodeo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-muted hover:text-terminal-accent transition-colors"
              title="Discord"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
