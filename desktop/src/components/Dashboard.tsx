import { useStore } from "../lib/store";
import type { PerfEvent } from "../lib/store";

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-terminal-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-terminal-accent" : "text-terminal-text"}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-terminal-muted">{sub}</div>}
    </div>
  );
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function Dashboard() {
  const { metrics, ollamaUp, ollamaModels, localModel, instances, clearMetrics } = useStore();

  const turns = metrics.filter((m): m is PerfEvent => m.kind === "turn");
  const tools = metrics.filter((m): m is PerfEvent => m.kind === "tool");

  const tokPerSecs = turns.map((t) => t.tokPerSec || 0).filter((n) => n > 0);
  const avgTps = avg(tokPerSecs);
  const lastTps = tokPerSecs[tokPerSecs.length - 1] || 0;
  const avgTtft = avg(turns.map((t) => t.ttftMs || 0));
  const totalTokens = turns.reduce((a, t) => a + (t.tokens || 0), 0);
  const totalMessages = instances.reduce((a, i) => a + i.messages.length, 0);

  // Tool breakdown
  const byTool = new Map<string, { count: number; totalMs: number; ok: number }>();
  for (const t of tools) {
    const k = t.toolName || "?";
    const e = byTool.get(k) || { count: 0, totalMs: 0, ok: 0 };
    e.count++; e.totalMs += t.durationMs; if (t.ok) e.ok++;
    byTool.set(k, e);
  }
  const toolRows = [...byTool.entries()].sort((a, b) => b[1].count - a[1].count);

  // Throughput sparkline (last 24 turns)
  const spark = tokPerSecs.slice(-24);
  const sparkMax = Math.max(1, ...spark);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Performance</h1>
            <p className="text-sm text-terminal-muted">Local inference & tool metrics for this session</p>
          </div>
          <button
            onClick={clearMetrics}
            className="text-xs px-3 py-1.5 border border-terminal-border rounded hover:bg-terminal-surface text-terminal-muted hover:text-terminal-text"
          >
            Reset
          </button>
        </div>

        {/* Top stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Throughput" value={`${avgTps.toFixed(1)}`} sub={`tok/s avg · ${lastTps.toFixed(1)} last`} accent />
          <StatCard label="Time to first token" value={avgTtft >= 1000 ? `${(avgTtft / 1000).toFixed(1)}s` : `${Math.round(avgTtft)}ms`} sub="avg latency" />
          <StatCard label="Tokens generated" value={totalTokens.toLocaleString()} sub={`${turns.length} model turns`} />
          <StatCard label="Tool calls" value={String(tools.length)} sub={`${totalMessages} messages`} />
        </div>

        {/* Throughput sparkline */}
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Throughput (last {spark.length || 0} turns)</div>
          {spark.length === 0 ? (
            <div className="text-sm text-terminal-muted py-6 text-center">No turns yet — chat with Rodeo to see live metrics.</div>
          ) : (
            <div className="flex items-end gap-1 h-28">
              {spark.map((v, i) => (
                <div key={i} className="flex-1 bg-terminal-accent/70 rounded-t hover:bg-terminal-accent transition-colors"
                  style={{ height: `${Math.max(4, (v / sparkMax) * 100)}%` }} title={`${v.toFixed(1)} tok/s`} />
              ))}
            </div>
          )}
        </div>

        {/* Tools + Models */}
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Tool usage</div>
            {toolRows.length === 0 ? (
              <div className="text-sm text-terminal-muted">No tools run yet.</div>
            ) : (
              <div className="space-y-2">
                {toolRows.map(([name, e]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="text-terminal-muted">
                      {e.count}× · {Math.round(e.totalMs / e.count)}ms avg
                      {e.ok < e.count && <span className="text-terminal-red"> · {e.count - e.ok} failed</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-3">Ollama</div>
            <div className="flex items-center gap-2 text-sm mb-3">
              <span className={`status-dot ${ollamaUp ? "connected" : "disconnected"}`} />
              <span>{ollamaUp ? "running (offline-ready)" : "not running"}</span>
            </div>
            <div className="text-xs uppercase tracking-wide text-terminal-muted mb-2">Installed models</div>
            <div className="space-y-1">
              {(ollamaModels.length ? ollamaModels : ["(none detected)"]).map((m) => (
                <div key={m} className={`text-sm flex items-center gap-2 ${m === localModel ? "text-terminal-accent" : "text-terminal-muted"}`}>
                  {m === localModel && <span>▸</span>}
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
