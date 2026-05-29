import { useStore } from "../lib/store";

export function SettingsModal() {
  const {
    apiKey, setApiKey, apiUrl, setApiUrl,
    workingDirectory, setWorkingDirectory,
    mode, setMode, autoApprove, setAutoApprove,
    showSettings, setShowSettings,
  } = useStore();

  if (!showSettings) return null;

  async function pickDir() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ directory: true, multiple: false });
      if (typeof dir === "string") setWorkingDirectory(dir);
    } catch { /* ignore */ }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSettings(false)}>
      <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={() => setShowSettings(false)} className="text-terminal-muted hover:text-terminal-text">×</button>
        </div>

        <div className="space-y-5">
          {/* Mode */}
          <div>
            <label className="block text-sm text-terminal-muted mb-2">Brain</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("local")}
                className={`flex-1 px-3 py-2 rounded text-sm border ${mode === "local" ? "border-terminal-accent bg-terminal-accent/20 text-terminal-text" : "border-terminal-border text-terminal-muted"}`}
              >
                Local · offline
              </button>
              <button
                onClick={() => setMode("remote")}
                className={`flex-1 px-3 py-2 rounded text-sm border ${mode === "remote" ? "border-terminal-accent bg-terminal-accent/20 text-terminal-text" : "border-terminal-border text-terminal-muted"}`}
              >
                Remote · server
              </button>
            </div>
            <p className="mt-1 text-xs text-terminal-muted">
              {mode === "local" ? "Talks directly to Ollama on this Mac. No wifi needed." : "Uses the hosted Rodeo server (needs API key + connection)."}
            </p>
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm text-terminal-muted mb-2">Working Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
              />
              <button onClick={pickDir} className="px-3 py-2 text-sm border border-terminal-border rounded hover:bg-terminal-bg">Browse…</button>
            </div>
            <p className="mt-1 text-xs text-terminal-muted">Where Rodeo reads, edits, and runs code.</p>
          </div>

          {/* Auto-approve */}
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Auto-approve edits & commands</div>
              <div className="text-xs text-terminal-muted">Skip the approval prompt (faster, less safe)</div>
            </div>
            <button
              onClick={() => setAutoApprove(!autoApprove)}
              className={`w-12 h-6 rounded-full transition-colors ${autoApprove ? "bg-terminal-accent" : "bg-terminal-border"}`}
            >
              <span className={`block w-5 h-5 rounded-full bg-white transform transition-transform ${autoApprove ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Remote-only settings */}
          {mode === "remote" && (
            <>
              <div>
                <label className="block text-sm text-terminal-muted mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="rodeo-xxx-xxxx"
                  className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-terminal-muted mb-2">API URL</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="http://localhost:3000"
                  className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded hover:bg-opacity-80 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}
