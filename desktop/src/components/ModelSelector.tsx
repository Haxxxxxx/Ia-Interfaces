import { useStore } from "../lib/store";

// Self-hosted models (FREE tokens!)
const MODELS = [
  {
    id: "qwen2.5:72b",
    name: "Qwen 2.5 72B",
    description: "Best quality — 48GB VRAM, 32K ctx",
    badge: "recommended",
    free: true,
  },
  {
    id: "llama3.3:70b",
    name: "Llama 3.3 70B",
    description: "Long context — 48GB VRAM, 128K ctx",
    badge: null,
    free: true,
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen 2.5 32B",
    description: "Fast & good — 24GB VRAM",
    badge: "fast",
    free: true,
  },
  {
    id: "deepseek-coder-v2:16b",
    name: "DeepSeek Coder V2",
    description: "Code specialist — 12GB VRAM",
    badge: "code",
    free: true,
  },
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 7B",
    description: "Lightweight — 8GB VRAM",
    badge: null,
    free: true,
  },
];

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModelSelector({ isOpen, onClose }: ModelSelectorProps) {
  const { instances, activeInstanceId } = useStore();
  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  if (!isOpen || !activeInstance) return null;

  function handleSelectModel(modelId: string) {
    const store = useStore.getState();
    const updatedInstances = store.instances.map((instance) =>
      instance.id === activeInstanceId
        ? { ...instance, model: modelId }
        : instance
    );
    useStore.setState({ instances: updatedInstances });
    onClose();
  }

  function handleToggleThinking() {
    const store = useStore.getState();
    const updatedInstances = store.instances.map((instance) =>
      instance.id === activeInstanceId
        ? { ...instance, thinking: !instance.thinking }
        : instance
    );
    useStore.setState({ instances: updatedInstances });
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Select Model</h2>
            <p className="text-xs text-terminal-green mt-1">
              Self-hosted — FREE tokens!
            </p>
          </div>
          <button onClick={onClose} className="text-terminal-muted hover:text-terminal-text">
            ×
          </button>
        </div>

        {/* Models List */}
        <div className="p-2 max-h-80 overflow-auto">
          {MODELS.map((model) => (
            <button
              key={model.id}
              onClick={() => handleSelectModel(model.id)}
              className={`w-full text-left px-3 py-3 rounded transition-colors ${
                activeInstance.model === model.id
                  ? "bg-terminal-accent/20 border border-terminal-accent"
                  : "hover:bg-terminal-bg"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{model.name}</span>
                <div className="flex items-center gap-2">
                  {model.free && (
                    <span className="text-xs px-2 py-0.5 bg-terminal-green/20 text-terminal-green rounded">
                      FREE
                    </span>
                  )}
                  {model.badge && model.badge !== "recommended" && (
                    <span className="text-xs px-2 py-0.5 bg-terminal-purple/20 text-terminal-purple rounded">
                      {model.badge}
                    </span>
                  )}
                  {model.badge === "recommended" && (
                    <span className="text-xs px-2 py-0.5 bg-terminal-accent/20 text-terminal-accent rounded">
                      best
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm text-terminal-muted mt-1">{model.description}</div>
            </button>
          ))}
        </div>

        {/* Thinking Toggle */}
        <div className="px-4 py-3 border-t border-terminal-border">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Extended Thinking</div>
              <div className="text-sm text-terminal-muted">
                More reasoning steps (slower)
              </div>
            </div>
            <button
              onClick={handleToggleThinking}
              className={`w-12 h-6 rounded-full transition-colors ${
                activeInstance.thinking ? "bg-terminal-accent" : "bg-terminal-border"
              }`}
            >
              <span
                className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${
                  activeInstance.thinking ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Current Selection */}
        <div className="px-4 py-3 bg-terminal-bg text-sm text-terminal-muted">
          Current: <span className="text-terminal-text">{activeInstance.model}</span>
          {activeInstance.thinking && (
            <span className="ml-2 text-terminal-purple">+ thinking</span>
          )}
        </div>
      </div>
    </div>
  );
}
