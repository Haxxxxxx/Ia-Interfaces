import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatPanel } from "./components/ChatPanel";
import { StatusBar } from "./components/StatusBar";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { ModelSelector } from "./components/ModelSelector";
import { useStore } from "./lib/store";

function App() {
  const { apiKey, apiUrl, setConnected, setShowSettings, createInstance } = useStore();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);

  // Check connection on mount and when apiKey/apiUrl changes
  useEffect(() => {
    async function checkConnection() {
      if (!apiKey) {
        setConnected(false);
        return;
      }

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

  // Show settings on first launch if no API key
  useEffect(() => {
    if (!apiKey) {
      setShowSettings(true);
    }
  }, [apiKey, setShowSettings]);

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
        <span className="text-xs text-terminal-muted">Sadary Hub</span>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <ChatPanel />
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
