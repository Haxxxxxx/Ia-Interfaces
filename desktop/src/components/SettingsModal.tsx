import { useStore } from "../lib/store";

export function SettingsModal() {
  const {
    apiKey,
    setApiKey,
    apiUrl,
    setApiUrl,
    workingDirectory,
    setWorkingDirectory,
    showSettings,
    setShowSettings,
  } = useStore();

  if (!showSettings) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => setShowSettings(false)}
    >
      <div
        className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={() => setShowSettings(false)}
            className="text-terminal-muted hover:text-terminal-text"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          {/* API Key */}
          <div>
            <label className="block text-sm text-terminal-muted mb-2">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sadary-xxx-xxxx"
              className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
            />
            <p className="mt-1 text-xs text-terminal-muted">
              Get your API key from your team admin
            </p>
          </div>

          {/* API URL */}
          <div>
            <label className="block text-sm text-terminal-muted mb-2">
              API URL
            </label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://llm.sadary.xyz"
              className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
            />
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-sm text-terminal-muted mb-2">
              Working Directory
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/project"
              className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text placeholder-terminal-muted focus:outline-none focus:ring-2 focus:ring-terminal-accent"
            />
            <p className="mt-1 text-xs text-terminal-muted">
              Default directory for file operations
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 text-sm text-terminal-muted hover:text-terminal-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded hover:bg-opacity-80 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
