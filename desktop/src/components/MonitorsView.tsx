import { useState } from "react";
import { useStore } from "../lib/store";
import { runMonitor } from "../lib/monitors";

const STATUS_STYLE: Record<string, string> = {
  ok: "text-terminal-green",
  alert: "text-terminal-red",
  error: "text-terminal-yellow",
  never: "text-terminal-muted",
};

const INTERVALS: [number, string][] = [
  [5, "5 min"], [15, "15 min"], [30, "30 min"], [60, "hourly"],
  [180, "every 3h"], [360, "every 6h"], [720, "every 12h"], [1440, "daily"],
];

function fmtAgo(ts: number): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function MonitorsView() {
  const { monitors, addMonitor, updateMonitor, removeMonitor, monitorBusy, workingDirectory, ollamaUp } = useStore();
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [every, setEvery] = useState(60);
  const [expanded, setExpanded] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    addMonitor({ title: title.trim(), prompt: prompt.trim(), everyMinutes: every });
    setTitle(""); setPrompt("");
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Monitors</h1>
            <p className="text-sm text-terminal-muted">
              Scheduled checks Rodeo runs on a timer. He investigates, then verdicts OK / ALERT — you get notified on alerts.
            </p>
          </div>
          {monitorBusy && <span className="text-xs text-terminal-accent flex items-center gap-2"><span className="thinking-pulse">●</span> checking…</span>}
        </div>

        {(!workingDirectory || !ollamaUp) && (
          <div className="text-xs text-terminal-yellow bg-terminal-yellow/10 border border-terminal-yellow/30 rounded-lg px-3 py-2">
            {!ollamaUp ? "Ollama is offline — monitors are paused." : "Tip: set a working directory (Chat tab) so monitors can inspect your project."}
            {" "}Monitors only run while the app is open.
          </div>
        )}

        {/* New monitor */}
        <form onSubmit={add} className="space-y-2 bg-terminal-surface border border-terminal-border rounded-lg p-4">
          <div className="text-xs uppercase tracking-wide text-terminal-muted">New monitor</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (e.g. Typecheck stays green)"
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent" />
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2}
            placeholder="What to check each run (e.g. Run `npx tsc --noEmit` and report if there are any type errors)"
            className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent resize-none" />
          <div className="flex items-center gap-2">
            <select value={every} onChange={(e) => setEvery(Number(e.target.value))}
              className="px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent">
              {INTERVALS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <button type="submit" className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80">+ Add monitor</button>
          </div>
        </form>

        {/* Monitor list */}
        <div className="space-y-2">
          {monitors.length === 0 && <div className="text-sm text-terminal-muted text-center py-6">No monitors yet.</div>}
          {monitors.map((m) => (
            <div key={m.id} className="bg-terminal-surface border border-terminal-border rounded-lg">
              <div className="px-4 py-3 flex items-start gap-3">
                <span className={`text-lg leading-none mt-0.5 ${STATUS_STYLE[m.lastStatus]}`}>●</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{m.title}</span>
                    <span className="text-xs text-terminal-muted">· {INTERVALS.find(([v]) => v === m.everyMinutes)?.[1] || `${m.everyMinutes}m`} · {fmtAgo(m.lastRunAt)}</span>
                  </div>
                  <div className="text-xs text-terminal-muted mt-0.5 truncate">{m.prompt}</div>
                  {m.lastSummary && (
                    <div className={`text-xs mt-1 ${STATUS_STYLE[m.lastStatus]}`}>{m.lastStatus.toUpperCase()} — {m.lastSummary}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => runMonitor(m.id)} disabled={monitorBusy || !ollamaUp} title="Run now"
                    className="text-terminal-muted hover:text-terminal-accent disabled:opacity-30 text-sm">▶</button>
                  <button onClick={() => updateMonitor(m.id, { enabled: !m.enabled })} title={m.enabled ? "Pause" : "Enable"}
                    className={`w-9 h-5 rounded-full transition-colors ${m.enabled ? "bg-terminal-accent" : "bg-terminal-border"}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white transform transition-transform ${m.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                  <button onClick={() => removeMonitor(m.id)} className="text-terminal-muted hover:text-terminal-red text-sm">×</button>
                </div>
              </div>
              {m.runs.length > 0 && (
                <div className="px-4 pb-2">
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} className="text-xs text-terminal-muted hover:text-terminal-text">
                    {expanded === m.id ? "hide" : "show"} history ({m.runs.length})
                  </button>
                  {expanded === m.id && (
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {m.runs.slice().reverse().map((r, i) => (
                        <div key={i} className="text-xs flex gap-2">
                          <span className="text-terminal-muted shrink-0 w-20">{new Date(r.ts).toLocaleTimeString()}</span>
                          <span className={`shrink-0 w-12 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                          <span className="text-terminal-muted truncate">{r.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
