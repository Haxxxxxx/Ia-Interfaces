import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { modelSupportsTools, listLocalModels, isOllamaUp, getTotalRamBytes, modelFits, type OllamaModel } from "../lib/ollama";

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

function fmtSize(bytes: number): string {
  if (!bytes) return "";
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

export function ModelSelector({ isOpen, onClose }: ModelSelectorProps) {
  const { ollamaUp, localModel, setLocalModel, activeWorkspaceId, workspaces, updateWorkspace, setOllama } = useStore();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [pullName, setPullName] = useState("");
  const [busy, setBusy] = useState("");
  const [ram, setRam] = useState(0);

  async function refresh() {
    try {
      const m = await listLocalModels();
      setModels(m.sort((a, b) => a.name.localeCompare(b.name)));
      setOllama({ up: true, models: m.map((x) => x.name) });
    } catch { setModels([]); }
  }
  useEffect(() => { if (isOpen && ollamaUp) { refresh(); getTotalRamBytes().then(setRam); } }, [isOpen, ollamaUp]);

  if (!isOpen) return null;

  async function sh(command: string): Promise<{ stdout: string; stderr: string; exit_code: number }> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke("exec_shell", { command, cwd: "" });
  }

  function select(id: string) {
    setLocalModel(id);
    if (activeWorkspaceId && workspaces.some((w) => w.id === activeWorkspaceId)) updateWorkspace(activeWorkspaceId, { model: id });
    onClose();
  }

  async function pull() {
    const name = pullName.trim();
    if (!name) return;
    setBusy(`Pulling ${name}… (this can take a while)`);
    await sh(`ollama pull ${name}`);
    setBusy("");
    setPullName("");
    if (await isOllamaUp()) refresh();
  }

  async function remove(name: string) {
    setBusy(`Removing ${name}…`);
    await sh(`ollama rm ${name}`);
    setBusy("");
    refresh();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Models</h2>
            <p className="text-xs text-terminal-green mt-1">{ollamaUp ? "Local via Ollama — offline, free" : "Ollama offline"}</p>
          </div>
          <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text">×</button>
        </div>

        {busy && <div className="px-4 py-2 text-xs text-terminal-accent border-b border-terminal-border"><span className="thinking-pulse">●</span> {busy}</div>}

        <div className="p-2 max-h-80 overflow-auto">
          {models.length === 0 && <div className="text-sm text-terminal-muted text-center py-6">No models found.</div>}
          {models.map((m) => {
            const tools = modelSupportsTools(m.name); // coder models now work via the text-parse fallback
            const fits = modelFits(m.size, ram);
            return (
              <div key={m.name} className={`group w-full flex items-center gap-2 px-3 py-2.5 rounded ${localModel === m.name ? "bg-terminal-accent/15" : "hover:bg-terminal-bg"} ${!fits ? "opacity-60" : ""}`}>
                <button onClick={() => select(m.name)} className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm truncate ${localModel === m.name ? "text-terminal-accent" : ""}`}>{localModel === m.name ? "▸ " : ""}{m.name}</span>
                  </div>
                  <div className="text-xs text-terminal-muted mt-0.5">
                    {fmtSize(m.size)}{m.parameterSize ? ` · ${m.parameterSize}` : ""}
                    {!tools && " · no tool-calling"}
                    {!fits && <span className="text-terminal-red"> · too big for your RAM (will swap)</span>}
                  </div>
                </button>
                {!fits
                  ? <span className="text-xs px-2 py-0.5 bg-terminal-red/20 text-terminal-red rounded shrink-0">won't fit</span>
                  : tools
                    ? <span className="text-xs px-2 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded shrink-0">tools</span>
                    : <span className="text-xs px-2 py-0.5 bg-terminal-yellow/20 text-terminal-yellow rounded shrink-0">chat</span>}
                <button onClick={() => remove(m.name)} className="opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-red text-sm shrink-0" title="Delete model">🗑</button>
              </div>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-terminal-border flex gap-2">
          <input value={pullName} onChange={(e) => setPullName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pull()}
            placeholder="pull a model (e.g. qwen2.5:32b)"
            className="flex-1 px-3 py-1.5 text-sm bg-terminal-bg border border-terminal-border rounded focus:outline-none focus:ring-2 focus:ring-terminal-accent" />
          <button onClick={pull} disabled={!pullName.trim() || !!busy} className="px-3 py-1.5 text-sm bg-terminal-accent text-terminal-bg rounded disabled:opacity-40">Pull</button>
        </div>
      </div>
    </div>
  );
}
