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
    const stored = localStorage.getItem("sadary-api-key");
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
      localStorage.setItem("sadary-api-key", key);
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
        <div className="w-full max-w-sm p-6">
          <h1 className="text-2xl font-bold mb-6 text-center">
            <span className="mr-2">⚡</span>Sadary Hub
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-terminal-muted mb-2">
                API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sadary-xxx-xxxx"
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
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-semibold">Sadary Hub</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-terminal-muted">{data.user.name}</span>
            <button
              onClick={() => {
                localStorage.removeItem("sadary-api-key");
                setData(null);
                setApiKey("");
              }}
              className="text-sm text-terminal-muted hover:text-terminal-text"
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
            className="py-3 border-b-2 border-terminal-accent text-terminal-accent"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/instances"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Instances
          </Link>
          <Link
            href="/dashboard/usage"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Usage
          </Link>
          <Link
            href="/dashboard/team"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Team
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Budget Card */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {data.byModel.map((model) => (
              <div
                key={model.model}
                className="bg-terminal-surface border border-terminal-border rounded-lg p-4"
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
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6">
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
    </div>
  );
}
