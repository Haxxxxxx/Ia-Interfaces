import { useStore } from "../lib/store";
import { modelSupportsTools } from "../lib/ollama";

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

function prettySize(name: string): string {
  const m = name.match(/(\d+)b/i);
  return m ? `${m[1]}B params` : "";
}

export function ModelSelector({ isOpen, onClose }: ModelSelectorProps) {
  const { ollamaModels, ollamaUp, localModel, setLocalModel, activeInstanceId, instances } = useStore();
  if (!isOpen) return null;

  const models = ollamaModels.length > 0 ? ollamaModels : ["qwen2.5-coder:7b", "qwen2.5:7b", "qwen2.5:14b", "qwen2.5:32b"];

  function select(modelId: string) {
    setLocalModel(modelId);
    // keep the active instance's label in sync
    if (activeInstanceId) {
      const updated = instances.map((i) => (i.id === activeInstanceId ? { ...i, model: modelId } : i));
      useStore.setState({ instances: updated });
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Local Model</h2>
            <p className="text-xs text-terminal-green mt-1">
              {ollamaUp ? "Installed via Ollama — runs offline, free" : "Ollama offline — showing common models"}
            </p>
          </div>
          <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text">×</button>
        </div>

        <div className="p-2 max-h-80 overflow-auto">
          {models.map((id) => {
            // -coder variants emit tool calls as text under Ollama → unreliable for the agent loop.
            const tools = modelSupportsTools(id) && !/coder/i.test(id);
            return (
              <button
                key={id}
                onClick={() => select(id)}
                className={`w-full text-left px-3 py-3 rounded transition-colors ${
                  localModel === id ? "bg-terminal-accent/20 border border-terminal-accent" : "hover:bg-terminal-bg"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{id}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 bg-terminal-green/20 text-terminal-green rounded">FREE</span>
                    {tools ? (
                      <span className="text-xs px-2 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded">tools</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-terminal-red/20 text-terminal-red rounded">no tools</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-terminal-muted mt-1">
                  {prettySize(id)}{!tools && " · can't code (no tool calling)"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 bg-terminal-bg text-sm text-terminal-muted">
          Current: <span className="text-terminal-text">{localModel}</span>
        </div>
      </div>
    </div>
  );
}
