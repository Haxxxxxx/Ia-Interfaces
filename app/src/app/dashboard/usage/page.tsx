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
    cachedTokens: number;
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

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage();
  }, []);

  async function fetchUsage() {
    const apiKey = localStorage.getItem("sadary-api-key");
    if (!apiKey) {
      window.location.href = "/dashboard";
      return;
    }

    try {
      const res = await fetch("/api/usage", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const usage = await res.json();
      setData(usage);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-muted">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-muted">Failed to load usage data</div>
      </div>
    );
  }

  const totalTokens = data.daily.reduce(
    (sum, d) => sum + d.inputTokens + d.outputTokens,
    0
  );
  const totalCached = data.daily.reduce((sum, d) => sum + (d.cachedTokens || 0), 0);
  const cacheRate = totalTokens > 0 ? (totalCached / totalTokens) * 100 : 0;

  return (
    <div className="min-h-screen bg-terminal-bg">
      {/* Header */}
      <header className="border-b border-terminal-border px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <h1 className="text-xl font-semibold">Sadary Hub</h1>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-terminal-border px-6">
        <div className="flex gap-6">
          <Link href="/dashboard" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Overview
          </Link>
          <Link href="/dashboard/instances" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Instances
          </Link>
          <Link href="/dashboard/usage" className="py-3 border-b-2 border-terminal-accent text-terminal-accent">
            Usage
          </Link>
          <Link href="/dashboard/team" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Team
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
              <div className="text-sm text-terminal-muted">Total Cost</div>
              <div className="text-2xl font-bold text-terminal-accent">
                ${data.budget.used.toFixed(2)}
              </div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
              <div className="text-sm text-terminal-muted">Budget Remaining</div>
              <div className="text-2xl font-bold text-terminal-green">
                ${data.budget.remaining.toFixed(2)}
              </div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
              <div className="text-sm text-terminal-muted">Total Tokens</div>
              <div className="text-2xl font-bold">
                {(totalTokens / 1000).toFixed(0)}K
              </div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
              <div className="text-sm text-terminal-muted">Cache Hit Rate</div>
              <div className="text-2xl font-bold text-terminal-purple">
                {cacheRate.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Usage by Model</h2>
            <div className="space-y-4">
              {data.byModel.map((model) => {
                const percentage =
                  data.budget.used > 0
                    ? (model.costUsd / data.budget.used) * 100
                    : 0;
                return (
                  <div key={model.model}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{model.model}</span>
                      <span className="text-terminal-muted">
                        ${model.costUsd.toFixed(2)} ({model.requests} requests)
                      </span>
                    </div>
                    <div className="h-2 bg-terminal-bg rounded-full overflow-hidden">
                      <div
                        className="h-full bg-terminal-accent rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Breakdown */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Daily Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-terminal-muted border-b border-terminal-border">
                    <th className="text-left py-2">Date</th>
                    <th className="text-right py-2">Requests</th>
                    <th className="text-right py-2">Input</th>
                    <th className="text-right py-2">Output</th>
                    <th className="text-right py-2">Cached</th>
                    <th className="text-right py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((day) => (
                    <tr key={day.date} className="border-b border-terminal-border/50">
                      <td className="py-2">{day.date}</td>
                      <td className="text-right py-2">{day.requests}</td>
                      <td className="text-right py-2">
                        {(day.inputTokens / 1000).toFixed(1)}K
                      </td>
                      <td className="text-right py-2">
                        {(day.outputTokens / 1000).toFixed(1)}K
                      </td>
                      <td className="text-right py-2 text-terminal-purple">
                        {((day.cachedTokens || 0) / 1000).toFixed(1)}K
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

          {/* Pricing Reference */}
          <div className="mt-6 text-sm text-terminal-muted">
            <p className="mb-2">Pricing (Kimi K2.5 via Moonshot API):</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Input: $0.60 / million tokens</li>
              <li>Output: $2.50 / million tokens</li>
              <li>Cached input: $0.15 / million tokens (75% discount)</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
