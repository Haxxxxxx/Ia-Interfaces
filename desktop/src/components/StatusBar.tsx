import { useStore } from "../lib/store";

export function StatusBar() {
  const { instances, activeInstanceId, mode, localModel, ollamaUp, isConnected, setOllama } = useStore();
  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  async function launchOllama() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("start_ollama");
      // Give it a moment, then re-probe.
      setTimeout(async () => {
        const { isOllamaUp, listLocalModels } = await import("../lib/ollama");
        if (await isOllamaUp()) {
          const models = await listLocalModels().catch(() => []);
          setOllama({ up: true, models: models.map((m) => m.name) });
        }
      }, 1500);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="h-6 border-t border-terminal-border px-4 flex items-center justify-between text-xs text-terminal-muted bg-terminal-surface/50">
      {/* Left */}
      <div className="flex items-center gap-4">
        {activeInstance && (
          <>
            <span>{mode === "local" ? localModel : activeInstance.model}</span>
            <span>{activeInstance.messages.length} messages</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        {mode === "local" ? (
          ollamaUp ? (
            <span className="flex items-center gap-2 text-terminal-green">
              <span className="status-dot connected" /> ollama ready (offline)
            </span>
          ) : (
            <button onClick={launchOllama} className="flex items-center gap-2 text-terminal-red hover:text-terminal-yellow">
              <span className="status-dot disconnected" /> ollama offline — click to start
            </button>
          )
        ) : (
          <span className="flex items-center gap-2">
            <span className={`status-dot ${isConnected ? "connected" : "disconnected"}`} />
            <span>{isConnected ? "connected" : "disconnected"}</span>
          </span>
        )}
      </div>
    </div>
  );
}
