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
    const apiKey = localStorage.getItem("rodeo-api-key");
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
  const totalRequests = data.daily.reduce((sum, d) => sum + d.requests, 0);

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
          <Link
            href="/"
            className="px-3 py-1.5 bg-terminal-accent text-terminal-bg rounded text-sm font-medium hover:bg-opacity-80 transition-colors"
          >
            Open Chat
          </Link>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 stagger-children">
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 card-hover hover-lift">
              <div className="text-sm text-terminal-muted">Total Requests</div>
              <div className="text-2xl font-bold text-terminal-accent">
                {totalRequests}
              </div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 card-hover hover-lift">
              <div className="text-sm text-terminal-muted">Total Tokens</div>
              <div className="text-2xl font-bold">
                {(totalTokens / 1000).toFixed(0)}K
              </div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 card-hover hover-lift">
              <div className="text-sm text-terminal-muted">Token Cost</div>
              <div className="text-2xl font-bold text-terminal-green">
                $0.00
              </div>
              <div className="text-xs text-terminal-muted">Self-hosted = FREE</div>
            </div>
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 card-hover hover-lift">
              <div className="text-sm text-terminal-muted">GPU Hours</div>
              <div className="text-2xl font-bold text-terminal-purple">
                ~{(totalTokens / 50000).toFixed(1)}h
              </div>
              <div className="text-xs text-terminal-muted">Estimated</div>
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Usage by Model</h2>
            {data.byModel.length === 0 ? (
              <p className="text-terminal-muted">No usage data yet</p>
            ) : (
              <div className="space-y-4">
                {data.byModel.map((model) => {
                  const modelTokens = model.inputTokens + model.outputTokens;
                  const percentage = totalTokens > 0 ? (modelTokens / totalTokens) * 100 : 0;
                  return (
                    <div key={model.model}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{model.model}</span>
                        <span className="text-terminal-muted">
                          {(modelTokens / 1000).toFixed(0)}K tokens ({model.requests} requests)
                        </span>
                      </div>
                      <div className="h-2 bg-terminal-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-terminal-accent rounded-full"
                          style={{ width: `${Math.max(2, percentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Breakdown */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Daily Breakdown</h2>
            {data.daily.length === 0 ? (
              <p className="text-terminal-muted">No usage data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-terminal-muted border-b border-terminal-border">
                      <th className="text-left py-2">Date</th>
                      <th className="text-right py-2">Requests</th>
                      <th className="text-right py-2">Input Tokens</th>
                      <th className="text-right py-2">Output Tokens</th>
                      <th className="text-right py-2">Total</th>
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
                        <td className="text-right py-2 text-terminal-accent">
                          {((day.inputTokens + day.outputTokens) / 1000).toFixed(1)}K
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pricing Note */}
          <div className="mt-6 p-4 bg-terminal-accent/10 border border-terminal-accent/30 rounded-lg">
            <div className="flex items-center gap-2 text-terminal-accent font-medium mb-2">
              <span>&#9889;</span> Self-Hosted Benefits
            </div>
            <ul className="text-sm text-terminal-muted space-y-1">
              <li>&#10003; Unlimited tokens - pay only for GPU compute</li>
              <li>&#10003; Data stays on your infrastructure</li>
              <li>&#10003; No rate limits from external APIs</li>
              <li>&#10003; Full control over model selection</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
