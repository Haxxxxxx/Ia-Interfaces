import { useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    createInstance,
    instances,
    setActiveInstance,
    setShowSettings,
    toggleSidebar,
  } = useStore();

  const commands: Command[] = [
    // Instances
    {
      id: "new-instance",
      label: "New Instance",
      shortcut: "⌘N",
      category: "Instances",
      action: () => {
        const name = `Instance ${instances.length + 1}`;
        createInstance(name);
        onClose();
      },
    },
    ...instances.map((instance) => ({
      id: `switch-${instance.id}`,
      label: `Switch to: ${instance.name}`,
      category: "Instances",
      action: () => {
        setActiveInstance(instance.id);
        onClose();
      },
    })),

    // Settings
    {
      id: "settings",
      label: "Open Settings",
      shortcut: "⌘,",
      category: "Settings",
      action: () => {
        setShowSettings(true);
        onClose();
      },
    },
    {
      id: "toggle-sidebar",
      label: "Toggle Sidebar",
      shortcut: "⌘B",
      category: "View",
      action: () => {
        toggleSidebar();
        onClose();
      },
    },

    // Quick Actions
    {
      id: "clear-chat",
      label: "Clear Current Chat",
      category: "Actions",
      action: () => {
        // Would clear messages in active instance
        onClose();
      },
    },
    {
      id: "export-md",
      label: "Export as Markdown",
      category: "Actions",
      action: () => {
        // Would export conversation
        onClose();
      },
    },
  ];

  const filteredCommands = commands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
        break;
      case "Escape":
        onClose();
        break;
    }
  }

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands: Record<string, Command[]> = {};
  filteredCommands.forEach((cmd) => {
    if (!groupedCommands[cmd.category]) {
      groupedCommands[cmd.category] = [];
    }
    groupedCommands[cmd.category].push(cmd);
  });

  let flatIndex = 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center pt-[20vh] z-50"
      onClick={onClose}
    >
      <div
        className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="px-4 py-3 border-b border-terminal-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="w-full bg-transparent text-terminal-text placeholder-terminal-muted focus:outline-none"
          />
        </div>

        {/* Commands List */}
        <div className="max-h-80 overflow-auto">
          {Object.entries(groupedCommands).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-4 py-2 text-xs text-terminal-muted uppercase tracking-wider">
                {category}
              </div>
              {cmds.map((cmd) => {
                const isSelected = flatIndex === selectedIndex;
                flatIndex++;
                return (
                  <button
                    key={cmd.id}
                    onClick={cmd.action}
                    className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
                      isSelected
                        ? "bg-terminal-accent text-terminal-bg"
                        : "hover:bg-terminal-bg"
                    }`}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <span
                        className={`text-xs ${
                          isSelected ? "text-terminal-bg/70" : "text-terminal-muted"
                        }`}
                      >
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center text-terminal-muted">
              No commands found
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-terminal-border text-xs text-terminal-muted flex items-center gap-4">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
