import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { Dashboard } from "./components/Dashboard";
import { TasksView } from "./components/TasksView";
import { MonitorsView } from "./components/MonitorsView";
import { WorkspacesView } from "./components/WorkspacesView";
import { shouldSelfUpdate, runSelfUpdate } from "./lib/learning";
import { refreshWorkspaceMemories } from "./lib/memory";
import { tickMonitors } from "./lib/monitors";
import { StatusBar } from "./components/StatusBar";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { ModelSelector } from "./components/ModelSelector";
import { useStore } from "./lib/store";
import { isOllamaUp, listLocalModels } from "./lib/ollama";

function App() {
  const { apiKey, apiUrl, mode, view, activeWorkspaceId, setConnected, setShowSettings, createInstance, setOllama } = useStore();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Poll local Ollama (offline brain) — health + installed models.
  useEffect(() => {
    let cancelled = false;
    async function checkOllama() {
      const up = await isOllamaUp();
      if (cancelled) return;
      if (up) {
        try {
          const models = await listLocalModels();
          setOllama({ up: true, models: models.map((m) => m.name) });
        } catch {
          setOllama({ up: true });
        }
      } else {
        setOllama({ up: false });
      }
    }
    checkOllama();
    const interval = setInterval(checkOllama, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [setOllama]);

  // Check remote connection (only relevant in remote mode)
  useEffect(() => {
    async function checkConnection() {
      if (!apiKey) { setConnected(false); return; }
      try {
        const res = await fetch(`${apiUrl}/api/health`);
        setConnected(res.ok);
      } catch {
        setConnected(false);
      }
    }
    checkConnection();
    const interval = setInterval(checkConnection, 30000);
    return () => clearInterval(interval);
  }, [apiKey, apiUrl, setConnected]);

  // First-launch: open Settings only if remote mode lacks a key.
  useEffect(() => {
    if (mode === "remote" && !apiKey) setShowSettings(true);
  }, [apiKey, mode, setShowSettings]);

  // Ensure the active workspace (or no-workspace) always has a chat, and that
  // activeInstanceId points at one of its chats.
  useEffect(() => {
    const s = useStore.getState();
    const ws = s.activeWorkspaceId ?? null;
    const chats = s.instances.filter((i) => (i.workspaceId ?? null) === ws);
    if (chats.length === 0) createInstance("Chat", s.localModel);
    else if (!chats.some((i) => i.id === s.activeInstanceId)) useStore.setState({ activeInstanceId: chats[chats.length - 1].id });
  }, [activeWorkspaceId, createInstance]);

  // Nightly self-update scheduler: catch-up shortly after launch, then hourly check.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (cancelled) return;
      if (shouldSelfUpdate()) { try { await runSelfUpdate(); } catch { /* logged in store */ } }
      // Keep each project's memory current (gated per-workspace: 24h + git change).
      try { await refreshWorkspaceMemories(); } catch { /* skip */ }
    }
    const t = setTimeout(tick, 15000);
    const iv = setInterval(tick, 60 * 60 * 1000);
    return () => { cancelled = true; clearTimeout(t); clearInterval(iv); };
  }, []);

  // Monitoring scheduler: check due monitors on launch + every 30s.
  useEffect(() => {
    const t = setTimeout(() => { tickMonitors(); }, 8000);
    const iv = setInterval(() => { tickMonitors(); }, 30_000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd/Ctrl + K = Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      // Cmd/Ctrl + N = New instance
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createInstance(`Instance ${Date.now()}`);
      }
      // Cmd/Ctrl + M = Model selector
      if ((e.metaKey || e.ctrlKey) && e.key === "m") {
        e.preventDefault();
        setShowModelSelector(true);
      }
      // Cmd/Ctrl + , = Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
      // Escape = Close modals
      if (e.key === "Escape") {
        setShowCommandPalette(false);
        setShowModelSelector(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowSettings, createInstance]);

  return (
    <div className="h-screen flex flex-col bg-terminal-bg">
      {/* Titlebar (macOS traffic lights spacing) */}
      <div className="h-8 titlebar-drag flex items-center px-20 border-b border-terminal-border bg-terminal-surface/50">
        <span className="text-xs text-terminal-muted">Rodeo</span>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        {view === "dashboard" ? <Dashboard /> : view === "workspaces" ? <WorkspacesView /> : view === "tasks" ? <TasksView /> : view === "monitors" ? <MonitorsView /> : <ChatPanel />}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Modals */}
      <SettingsModal />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />
      <ModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
      />
    </div>
  );
}

export default App;
