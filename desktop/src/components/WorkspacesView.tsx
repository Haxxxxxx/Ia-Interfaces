import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { readProjectMemory, writeProjectMemory, buildProjectKnowledge } from "../lib/memory";
import { Markdown } from "./Markdown";

export function WorkspacesView() {
  const {
    workspaces, activeWorkspaceId, addWorkspace, removeWorkspace, switchWorkspace, updateWorkspace,
    localModel, ollamaModels, ollamaUp,
  } = useStore();

  const active = workspaces.find((w) => w.id === activeWorkspaceId);
  const [memory, setMemory] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [building, setBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState("");

  async function loadMemory(path: string) {
    setMemory(await readProjectMemory(path));
  }
  useEffect(() => { if (active) loadMemory(active.path); else setMemory(""); }, [active?.id, active?.path]);

  async function newWorkspace() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") {
        const name = dir.split("/").filter(Boolean).pop() || "project";
        addWorkspace(name, dir, localModel);
      }
    } catch { /* ignore */ }
  }

  async function build() {
    if (!active) return;
    setBuilding(true); setBuildStatus("Exploring codebase…");
    try {
      const result = await buildProjectKnowledge(active.path, active.model || localModel, (d) => setBuildStatus(`▸ ${d}`));
      setMemory(result || (await readProjectMemory(active.path)));
      setBuildStatus("Done.");
    } catch (e: any) {
      setBuildStatus(`Error: ${e?.message || e}`);
    } finally {
      setBuilding(false);
    }
  }

  async function saveEdit() {
    if (!active) return;
    await writeProjectMemory(active.path, draft);
    setMemory(draft); setEditing(false);
  }

  const models = ollamaModels.length ? ollamaModels : ["qwen2.5:14b", "qwen2.5:7b", "qwen2.5:32b"];

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Workspaces</h1>
            <p className="text-sm text-terminal-muted">Each project keeps its own folder, model, and memory Rodeo writes & grows as you work.</p>
          </div>
          <button onClick={newWorkspace} className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80">+ New</button>
        </div>

        {/* Workspace list */}
        <div className="grid sm:grid-cols-2 gap-2">
          {workspaces.length === 0 && <div className="text-sm text-terminal-muted col-span-full text-center py-6">No workspaces yet — add a project folder.</div>}
          {workspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => switchWorkspace(w.id)}
              className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${
                w.id === activeWorkspaceId ? "border-terminal-accent bg-terminal-accent/10" : "border-terminal-border bg-terminal-surface hover:border-terminal-accent/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">{w.id === activeWorkspaceId ? "▸ " : ""}{w.name}</span>
                <button onClick={(e) => { e.stopPropagation(); removeWorkspace(w.id); }} className="opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-red text-sm">×</button>
              </div>
              <div className="text-xs text-terminal-muted truncate mt-0.5" title={w.path}>{w.path}</div>
              <div className="text-xs text-terminal-muted/80 mt-1">{w.model}</div>
            </div>
          ))}
        </div>

        {/* Active workspace detail */}
        {active && (
          <div className="space-y-4">
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{active.name}</div>
                <select
                  value={active.model}
                  onChange={(e) => { updateWorkspace(active.id, { model: e.target.value }); switchWorkspace(active.id); useStore.setState({ localModel: e.target.value }); }}
                  className="px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded focus:outline-none focus:ring-1 focus:ring-terminal-accent"
                >
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Memory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase tracking-wide text-terminal-muted">Project memory · .rodeo/memory.md</span>
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={build} disabled={building || !ollamaUp} className="text-terminal-accent hover:opacity-80 disabled:opacity-40">
                      {building ? "building…" : memory ? "rebuild" : "build knowledge"}
                    </button>
                    {memory && !editing && <button onClick={() => { setDraft(memory); setEditing(true); }} className="text-terminal-muted hover:text-terminal-text">edit</button>}
                    {memory && <button onClick={() => loadMemory(active.path)} className="text-terminal-muted hover:text-terminal-text">refresh</button>}
                  </div>
                </div>
                {building && <div className="text-xs text-terminal-accent mb-2 truncate"><span className="thinking-pulse">●</span> {buildStatus}</div>}
                {editing ? (
                  <div className="space-y-2">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={16}
                      className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-terminal-accent resize-y" />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditing(false)} className="text-xs text-terminal-muted hover:text-terminal-text px-3 py-1">cancel</button>
                      <button onClick={saveEdit} className="text-xs bg-terminal-accent text-terminal-bg rounded px-3 py-1">save</button>
                    </div>
                  </div>
                ) : memory ? (
                  <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 max-h-96 overflow-y-auto">
                    <Markdown content={memory} />
                  </div>
                ) : (
                  <div className="text-sm text-terminal-muted py-4 text-center">
                    No memory yet. Hit <span className="text-terminal-accent">build knowledge</span> and Rodeo will scan the codebase and write it.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
