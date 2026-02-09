"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getCommandSuggestions, type SlashCommand } from "@/lib/slash-commands";

interface SlashCommandMenuProps {
  input: string;
  cursorPosition: number;
  onSelect: (command: string) => void;
  onClose: () => void;
  visible: boolean;
}

/**
 * Autocomplete menu for slash commands
 * Triggered when user types "/" at the start of input
 */
export function SlashCommandMenu({
  input,
  cursorPosition,
  onSelect,
  onClose,
  visible,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<SlashCommand[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Update suggestions when input changes
  useEffect(() => {
    if (!visible || !input.startsWith("/")) {
      setSuggestions([]);
      return;
    }

    // Get the command portion (everything after / until space or end)
    const partialCommand = input.slice(0, cursorPosition).split(" ")[0];
    const matches = getCommandSuggestions(partialCommand);
    setSuggestions(matches);
    setSelectedIndex(0);
  }, [input, cursorPosition, visible]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;

        case "Tab":
        case "Enter":
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            onSelect(`/${suggestions[selectedIndex].name} `);
          }
          break;

        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [visible, suggestions, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current && suggestions.length > 0) {
      const selectedEl = menuRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedEl?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, suggestions.length]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bottom-full left-0 mb-2 w-80 max-h-64 overflow-y-auto bg-terminal-surface border border-terminal-border rounded-lg shadow-xl z-50"
    >
      <div className="p-2 border-b border-terminal-border">
        <span className="text-xs text-terminal-muted">Commands</span>
      </div>

      <div className="py-1">
        {suggestions.map((cmd, index) => (
          <button
            key={cmd.name}
            data-index={index}
            onClick={() => onSelect(`/${cmd.name} `)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={`w-full text-left px-3 py-2 flex items-start gap-3 transition-colors ${
              index === selectedIndex
                ? "bg-terminal-accent/20"
                : "hover:bg-terminal-bg"
            }`}
          >
            {/* Command name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium text-terminal-accent">
                  /{cmd.name}
                </span>
                <CategoryBadge category={cmd.category} />
                {cmd.type === "server" && (
                  <span className="text-xs px-1 py-0.5 rounded bg-terminal-purple/20 text-terminal-purple">
                    server
                  </span>
                )}
              </div>
              <p className="text-sm text-terminal-muted mt-0.5 truncate">
                {cmd.description}
              </p>
              {cmd.usage && (
                <p className="text-xs text-terminal-muted/70 mt-0.5 font-mono">
                  {cmd.usage}
                </p>
              )}
            </div>

            {/* Keyboard hint */}
            {index === selectedIndex && (
              <div className="flex gap-1 text-xs text-terminal-muted shrink-0">
                <kbd className="px-1 py-0.5 rounded bg-terminal-bg border border-terminal-border">
                  Tab
                </kbd>
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-terminal-border flex items-center justify-between text-xs text-terminal-muted">
        <div className="flex gap-2">
          <span>↑↓ navigate</span>
          <span>Tab select</span>
          <span>Esc close</span>
        </div>
        <span>{suggestions.length} commands</span>
      </div>
    </div>
  );
}

// ============================================================================
// Category Badge
// ============================================================================

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    navigation: "bg-terminal-accent/20 text-terminal-accent",
    git: "bg-orange-500/20 text-orange-400",
    memory: "bg-blue-500/20 text-blue-400",
    session: "bg-green-500/20 text-green-400",
    tools: "bg-purple-500/20 text-purple-400",
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[category] || "bg-terminal-muted/20 text-terminal-muted"}`}>
      {category}
    </span>
  );
}

// ============================================================================
// Command Preview
// ============================================================================

interface CommandPreviewProps {
  command: string;
  className?: string;
}

/**
 * Shows a preview of what the command will do
 */
export function CommandPreview({ command, className = "" }: CommandPreviewProps) {
  const suggestions = getCommandSuggestions(command);
  const match = suggestions[0];

  if (!match) return null;

  return (
    <div className={`text-sm text-terminal-muted ${className}`}>
      <span className="font-mono text-terminal-accent">/{match.name}</span>
      <span className="ml-2">{match.description}</span>
    </div>
  );
}

// ============================================================================
// Inline Command Chip
// ============================================================================

interface CommandChipProps {
  command: SlashCommand;
  onClick?: () => void;
}

/**
 * Small clickable chip to insert a command
 */
export function CommandChip({ command, onClick }: CommandChipProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-terminal-surface border border-terminal-border text-sm hover:border-terminal-accent hover:text-terminal-accent transition-colors"
    >
      <span className="font-mono">/{command.name}</span>
      <span className="text-terminal-muted text-xs hidden sm:inline">
        {command.description}
      </span>
    </button>
  );
}

// ============================================================================
// Quick Commands Bar
// ============================================================================

interface QuickCommandsProps {
  onCommand: (command: string) => void;
  className?: string;
}

/**
 * Bar showing common commands for quick access
 */
export function QuickCommands({ onCommand, className = "" }: QuickCommandsProps) {
  const quickCommands = [
    { name: "help", icon: "?" },
    { name: "git", icon: "⎇" },
    { name: "explore", icon: "🔍" },
    { name: "memory", icon: "🧠" },
    { name: "undo", icon: "↩" },
  ];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {quickCommands.map((cmd) => (
        <button
          key={cmd.name}
          onClick={() => onCommand(`/${cmd.name}`)}
          className="px-2 py-1 rounded text-sm font-mono text-terminal-muted hover:text-terminal-accent hover:bg-terminal-surface transition-colors"
          title={`/${cmd.name}`}
        >
          {cmd.icon} /{cmd.name}
        </button>
      ))}
    </div>
  );
}
