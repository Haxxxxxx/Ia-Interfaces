import { useState } from "react";
import { useStore } from "../lib/store";

export function Sidebar() {
  const [newInstanceName, setNewInstanceName] = useState("");
  const [showNewInstance, setShowNewInstance] = useState(false);

  const {
    instances,
    activeInstanceId,
    setActiveInstance,
    createInstance,
    deleteInstance,
    sidebarCollapsed,
    toggleSidebar,
    setShowSettings,
    view,
    setView,
    monitors,
  } = useStore();

  const alertCount = monitors.filter((m) => m.lastStatus === "alert").length;

  function handleCreateInstance(e: React.FormEvent) {
    e.preventDefault();
    if (!newInstanceName.trim()) return;
    createInstance(newInstanceName.trim());
    setNewInstanceName("");
    setShowNewInstance(false);
  }

  if (sidebarCollapsed) {
    return (
      <div className="w-12 border-r border-terminal-border flex flex-col items-center py-4">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-terminal-surface rounded"
          title="Expand sidebar"
        >
          ☰
        </button>
      </div>
    );
  }

  return (
    <aside className="w-64 border-r border-terminal-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border flex items-center justify-between">
        <span className="font-semibold flex items-center gap-2">
          <span className="text-terminal-accent">▸</span>
          <span>Rodeo</span>
        </span>
        <button
          onClick={toggleSidebar}
          className="p-1 hover:bg-terminal-surface rounded text-terminal-muted hover:text-terminal-text"
        >
          ◀
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2 py-2 border-b border-terminal-border space-y-1">
        {([["chat", "▸", "Chat"], ["tasks", "◷", "Tasks"], ["monitors", "◎", "Monitors"], ["dashboard", "▦", "Performance"]] as const).map(([v, icon, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
              view === v ? "bg-terminal-accent/15 text-terminal-accent" : "text-terminal-muted hover:bg-terminal-surface hover:text-terminal-text"
            }`}
          >
            <span>{icon}</span>
            <span className="flex-1 text-left">{label}</span>
            {v === "monitors" && alertCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-terminal-red text-terminal-bg font-semibold">{alertCount}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Instances */}
      <div className="flex-1 overflow-auto p-2">
        <div className="flex items-center justify-between px-2 py-1 text-xs text-terminal-muted">
          <span>INSTANCES</span>
          <button
            onClick={() => setShowNewInstance(true)}
            className="hover:text-terminal-accent"
          >
            +
          </button>
        </div>

        {showNewInstance && (
          <form onSubmit={handleCreateInstance} className="px-2 py-2">
            <input
              type="text"
              value={newInstanceName}
              onChange={(e) => setNewInstanceName(e.target.value)}
              placeholder="Instance name..."
              className="w-full px-2 py-1 text-sm bg-terminal-surface border border-terminal-border rounded focus:outline-none focus:ring-1 focus:ring-terminal-accent"
              autoFocus
              onBlur={() => {
                if (!newInstanceName.trim()) setShowNewInstance(false);
              }}
            />
          </form>
        )}

        <div className="space-y-1 mt-2">
          {instances.map((instance) => (
            <div
              key={instance.id}
              className={`group flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                instance.id === activeInstanceId
                  ? "bg-terminal-surface text-terminal-text"
                  : "text-terminal-muted hover:bg-terminal-surface/50 hover:text-terminal-text"
              }`}
              onClick={() => setActiveInstance(instance.id)}
            >
              <span className="text-sm truncate">{instance.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteInstance(instance.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-red transition-opacity"
              >
                ×
              </button>
            </div>
          ))}

          {instances.length === 0 && !showNewInstance && (
            <div className="px-3 py-4 text-center text-sm text-terminal-muted">
              <p>No instances yet</p>
              <button
                onClick={() => setShowNewInstance(true)}
                className="mt-2 text-terminal-accent hover:underline"
              >
                Create one
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-terminal-border">
        <button
          onClick={() => setShowSettings(true)}
          className="w-full px-3 py-2 text-left text-sm text-terminal-muted hover:bg-terminal-surface hover:text-terminal-text rounded transition-colors"
        >
          ⚙ Settings
        </button>
      </div>
    </aside>
  );
}
