/**
 * Slash command definitions for Rodeo
 * Provides both client-side and server-side command handling
 */

// ============================================================================
// Types
// ============================================================================

export interface SlashCommand {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  examples?: string[];
  type: "client" | "server";
  category: "navigation" | "git" | "memory" | "session" | "tools";
}

export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  action?: "clear" | "model_change" | "toggle_plan" | "toggle_compact";
  payload?: unknown;
}

// ============================================================================
// Command Definitions
// ============================================================================

export const SLASH_COMMANDS: SlashCommand[] = [
  // Client-side commands
  {
    name: "help",
    description: "Show available commands",
    type: "client",
    category: "navigation",
  },
  {
    name: "clear",
    description: "Clear conversation history",
    type: "client",
    category: "navigation",
  },
  {
    name: "model",
    aliases: ["m"],
    description: "Switch to a different model",
    usage: "/model <model-id>",
    examples: ["/model qwen2.5:32b", "/model kimi-k2.5"],
    type: "client",
    category: "navigation",
  },
  {
    name: "plan",
    description: "Toggle planning mode",
    type: "client",
    category: "session",
  },
  {
    name: "compact",
    description: "Toggle compact message display",
    type: "client",
    category: "navigation",
  },

  // Server-side commands
  {
    name: "git",
    aliases: ["status"],
    description: "Show git status for current project",
    type: "server",
    category: "git",
  },
  {
    name: "diff",
    description: "Show git diff for staged and unstaged changes",
    type: "server",
    category: "git",
  },
  {
    name: "commit",
    description: "Generate a commit message based on changes",
    usage: "/commit [--push]",
    type: "server",
    category: "git",
  },
  {
    name: "explore",
    description: "Get an overview of the current codebase",
    type: "server",
    category: "tools",
  },
  {
    name: "memory",
    description: "Show saved project memory/insights",
    type: "server",
    category: "memory",
  },
  {
    name: "remember",
    aliases: ["rem"],
    description: "Save an insight or pattern to project memory",
    usage: "/remember <text>",
    examples: ["/remember use TypeScript strict mode", "/remember prefer functional components"],
    type: "server",
    category: "memory",
  },
  {
    name: "forget",
    description: "Remove an insight from project memory",
    usage: "/forget <index>",
    type: "server",
    category: "memory",
  },
  {
    name: "undo",
    aliases: ["u"],
    description: "Undo the last file change",
    type: "server",
    category: "session",
  },
  {
    name: "rollback",
    description: "Undo all changes in current session",
    type: "server",
    category: "session",
  },
  {
    name: "changes",
    description: "List all file changes in current session",
    type: "server",
    category: "session",
  },
  {
    name: "search",
    aliases: ["web"],
    description: "Search the web for information",
    usage: "/search <query>",
    examples: ["/search TypeScript best practices 2024"],
    type: "server",
    category: "tools",
  },
  {
    name: "imagine",
    description: "Generate an image from a text prompt",
    usage: "/imagine <prompt>",
    examples: ["/imagine a sunset over mountains"],
    type: "server",
    category: "tools",
  },
];

// ============================================================================
// Command Parsing
// ============================================================================

export interface ParsedCommand {
  name: string;
  args: string[];
  rawArgs: string;
  flags: Record<string, boolean | string>;
}

/**
 * Parse a slash command from input
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;

  const rawArgs = trimmed.slice(name.length + 2).trim();
  const args: string[] = [];
  const flags: Record<string, boolean | string> = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith("--")) {
      const [key, value] = part.slice(2).split("=");
      flags[key] = value ?? true;
    } else if (part.startsWith("-") && part.length === 2) {
      flags[part.slice(1)] = true;
    } else {
      args.push(part);
    }
  }

  return { name, args, rawArgs, flags };
}

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): SlashCommand | null {
  const lower = name.toLowerCase();
  return (
    SLASH_COMMANDS.find(
      (cmd) => cmd.name === lower || cmd.aliases?.includes(lower)
    ) || null
  );
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith("/");
}

// ============================================================================
// Client-Side Command Handlers
// ============================================================================

export function handleClientCommand(
  parsed: ParsedCommand,
  context: {
    setModel?: (model: string) => void;
    clearMessages?: () => void;
    togglePlanMode?: () => void;
    toggleCompact?: () => void;
  }
): CommandResult {
  const command = findCommand(parsed.name);
  if (!command) {
    return {
      success: false,
      error: `Unknown command: /${parsed.name}. Type /help for available commands.`,
    };
  }

  if (command.type !== "client") {
    // This is a server command, let the server handle it
    return {
      success: false,
      error: "server_command",
    };
  }

  switch (command.name) {
    case "help":
      return {
        success: true,
        output: formatHelpOutput(),
      };

    case "clear":
      context.clearMessages?.();
      return {
        success: true,
        action: "clear",
        output: "Conversation cleared",
      };

    case "model":
      if (!parsed.rawArgs) {
        return {
          success: false,
          error: "Usage: /model <model-id>",
        };
      }
      context.setModel?.(parsed.rawArgs);
      return {
        success: true,
        action: "model_change",
        output: `Switched to model: ${parsed.rawArgs}`,
        payload: parsed.rawArgs,
      };

    case "plan":
      context.togglePlanMode?.();
      return {
        success: true,
        action: "toggle_plan",
        output: "Planning mode toggled",
      };

    case "compact":
      context.toggleCompact?.();
      return {
        success: true,
        action: "toggle_compact",
        output: "Compact mode toggled",
      };

    default:
      return {
        success: false,
        error: `Command /${command.name} is not implemented`,
      };
  }
}

// ============================================================================
// Help Formatting
// ============================================================================

function formatHelpOutput(): string {
  const categories: Record<string, SlashCommand[]> = {};

  for (const cmd of SLASH_COMMANDS) {
    if (!categories[cmd.category]) {
      categories[cmd.category] = [];
    }
    categories[cmd.category].push(cmd);
  }

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    git: "Git",
    memory: "Memory",
    session: "Session",
    tools: "Tools",
  };

  let output = "# Available Commands\n\n";

  for (const [category, commands] of Object.entries(categories)) {
    output += `## ${categoryLabels[category] || category}\n\n`;

    for (const cmd of commands) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map(a => `/${a}`).join(", ")})` : "";
      output += `**/${cmd.name}**${aliases} - ${cmd.description}\n`;
      if (cmd.usage) {
        output += `  Usage: \`${cmd.usage}\`\n`;
      }
    }
    output += "\n";
  }

  return output;
}

/**
 * Get autocomplete suggestions for partial command input
 */
export function getCommandSuggestions(partial: string): SlashCommand[] {
  if (!partial.startsWith("/")) return [];

  const search = partial.slice(1).toLowerCase();
  if (!search) return SLASH_COMMANDS.slice(0, 8);

  return SLASH_COMMANDS.filter(
    (cmd) =>
      cmd.name.startsWith(search) ||
      cmd.aliases?.some((a) => a.startsWith(search)) ||
      cmd.description.toLowerCase().includes(search)
  ).slice(0, 8);
}

/**
 * Format command for display in autocomplete
 */
export function formatCommandForDisplay(cmd: SlashCommand): {
  name: string;
  description: string;
  category: string;
  type: "client" | "server";
} {
  return {
    name: `/${cmd.name}`,
    description: cmd.description,
    category: cmd.category,
    type: cmd.type,
  };
}
