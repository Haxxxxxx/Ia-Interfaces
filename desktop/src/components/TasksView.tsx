import { useState } from "react";
import { useStore } from "../lib/store";
import { runAutonomousQueue, stopAutonomous } from "../lib/autonomous";
import { runSelfUpdate } from "../lib/learning";

const STATUS_STYLE: Record<string, string> = {
  pending: "text-terminal-muted",
  running: "text-terminal-accent",
  done: "text-terminal-green",
  failed: "text-terminal-red",
  skipped: "text-terminal-muted line-through",
};

export function TasksView() {
  const {
    tasks, addTask, updateTask, removeTask, clearTasks, reorderTask,
    autonomousRunning, autonomousLog, clearAutonomousLog,
    workingDirectory, ollamaUp,
    learnedProfile, lastLearnedAt, selfUpdateEnabled, setSelfUpdateEnabled,
  } = useStore();

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const pending = tasks.filter((t) => t.status === "pending").length;
  const canRun = !!workingDirectory && ollamaUp && pending > 0;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask(title.trim(), detail.trim() || undefined);
    setTitle(""); setDetail("");
  }

  async function updateNow() {
    setUpdating(true); setUpdateMsg("");
    try { setUpdateMsg(await runSelfUpdate()); }
    catch (e: any) { setUpdateMsg(`Error: ${e?.message || e}`); }
    finally { setUpdating(false); }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header + run control */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Autonomous Tasks</h1>
            <p className="text-sm text-terminal-muted">Queue work and let Rodeo run it while you rest. He manages his own list.</p>
          </div>
          {autonomousRunning ? (
            <button onClick={stopAutonomous} className="px-4 py-2 text-sm bg-terminal-red text-terminal-bg rounded-lg font-medium hover:bg-opacity-80">
              ■ Stop
            </button>
          ) : (
            <button onClick={runAutonomousQueue} disabled={!canRun}
              className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80 disabled:opacity-40 disabled:cursor-not-allowed">
              ▶ Run queue
            </button>
          )}
        </div>

        {/* Guardrail / readiness notice */}
        {!canRun && !autonomousRunning && (
          <div className="text-xs text-terminal-yellow bg-terminal-yellow/10 border border-terminal-yellow/30 rounded-lg px-3 py-2">
            {!workingDirectory ? "Set a working directory (Chat tab) before running." : !ollamaUp ? "Ollama is offline." : "Add at least one task to run."}
            {" "}Autonomous runs are guardrailed: confined to the working dir, destructive commands blocked.
          </div>
        )}

        {/* Add task */}
        <form onSubmit={add} className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title (e.g. Add tests for auth.ts)"
            className="w-full px-3 py-2 bg-terminal-surface border border-terminal-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent" />
          <div className="flex gap-2">
            <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Optional detail / acceptance criteria"
              className="flex-1 px-3 py-2 bg-terminal-surface border border-terminal-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-terminal-accent" />
            <button type="submit" className="px-4 py-2 text-sm bg-terminal-surface border border-terminal-border rounded-lg hover:border-terminal-accent/50">+ Add</button>
          </div>
        </form>

        {/* Task list */}
        <div className="space-y-2">
          {tasks.length === 0 && <div className="text-sm text-terminal-muted text-center py-6">No tasks yet.</div>}
          {tasks.map((t, i) => (
            <div key={t.id} className="group bg-terminal-surface border border-terminal-border rounded-lg px-3 py-2.5 flex items-start gap-3">
              <span className={`text-xs mt-0.5 w-16 shrink-0 ${STATUS_STYLE[t.status]}`}>{t.status}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{t.title}</div>
                {t.detail && <div className="text-xs text-terminal-muted mt-0.5">{t.detail}</div>}
                {t.result && <div className="text-xs text-terminal-muted/80 mt-1 italic line-clamp-2">↳ {t.result}</div>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => reorderTask(t.id, "up")} disabled={i === 0} className="text-terminal-muted hover:text-terminal-text disabled:opacity-30 px-1">↑</button>
                <button onClick={() => reorderTask(t.id, "down")} disabled={i === tasks.length - 1} className="text-terminal-muted hover:text-terminal-text disabled:opacity-30 px-1">↓</button>
                {t.status !== "pending" && <button onClick={() => updateTask(t.id, { status: "pending", result: undefined })} className="text-terminal-muted hover:text-terminal-accent px-1" title="Requeue">↺</button>}
                <button onClick={() => removeTask(t.id)} className="text-terminal-muted hover:text-terminal-red px-1">×</button>
              </div>
            </div>
          ))}
          {tasks.some((t) => t.status === "done" || t.status === "skipped") && (
            <button onClick={() => clearTasks("done")} className="text-xs text-terminal-muted hover:text-terminal-text">clear completed</button>
          )}
        </div>

        {/* Live log */}
        {autonomousLog.length > 0 && (
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-terminal-muted">Activity log</span>
              <button onClick={clearAutonomousLog} className="text-xs text-terminal-muted hover:text-terminal-text">clear</button>
            </div>
            <pre className="text-xs text-terminal-muted max-h-56 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {autonomousLog.slice(-80).join("\n")}
            </pre>
          </div>
        )}

        {/* Learning / self-update */}
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Nightly self-update</div>
              <div className="text-xs text-terminal-muted">
                Distills your sessions into a learned profile + bakes a <span className="text-terminal-accent">rodeo:tuned</span> model every 24h.
                {lastLearnedAt > 0 ? ` Last: ${new Date(lastLearnedAt).toLocaleString()}` : " Never run yet."}
              </div>
            </div>
            <button onClick={() => setSelfUpdateEnabled(!selfUpdateEnabled)}
              className={`w-12 h-6 rounded-full transition-colors shrink-0 ${selfUpdateEnabled ? "bg-terminal-accent" : "bg-terminal-border"}`}>
              <span className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${selfUpdateEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={updateNow} disabled={updating || !ollamaUp}
              className="text-sm px-3 py-1.5 bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80 disabled:opacity-40">
              {updating ? "Learning…" : "Update now"}
            </button>
            {learnedProfile && (
              <button onClick={() => setShowProfile((v) => !v)} className="text-sm text-terminal-muted hover:text-terminal-text">
                {showProfile ? "Hide" : "View"} learned profile
              </button>
            )}
            {updateMsg && <span className="text-xs text-terminal-muted">{updateMsg}</span>}
          </div>
          {showProfile && learnedProfile && (
            <pre className="text-xs bg-terminal-bg border border-terminal-border rounded p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">{learnedProfile}</pre>
          )}
        </div>
      </div>
    </div>
  );
}
