import { useStore } from "../lib/store";

export function StatusBar() {
  const { instances, activeInstanceId, isConnected, apiKey } = useStore();

  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  return (
    <div className="h-6 border-t border-terminal-border px-4 flex items-center justify-between text-xs text-terminal-muted bg-terminal-surface/50">
      {/* Left */}
      <div className="flex items-center gap-4">
        {activeInstance && (
          <>
            <span>{activeInstance.model}</span>
            <span>{activeInstance.thinking ? "thinking" : "instant"}</span>
            <span>{activeInstance.messages.length} messages</span>
          </>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2">
          <span
            className={`status-dot ${isConnected ? "connected" : "disconnected"}`}
          />
          <span>{isConnected ? "connected" : "disconnected"}</span>
        </span>
        {apiKey && (
          <span className="text-terminal-green">
            ● {apiKey.slice(0, 12)}...
          </span>
        )}
      </div>
    </div>
  );
}
