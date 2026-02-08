import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolCallUIProps {
  toolCall: ToolCall;
  onResult: (result: string) => void;
  onCancel: () => void;
}

export function ToolCallUI({ toolCall, onResult, onCancel }: ToolCallUIProps) {
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const args = JSON.parse(toolCall.function.arguments);
  const toolName = toolCall.function.name;

  async function handleApprove() {
    setExecuting(true);
    setError(null);

    try {
      let result: string;

      switch (toolName) {
        case "read_file":
          result = await invoke<string>("read_file", { path: args.path });
          break;
        case "write_file":
          await invoke("write_file", { path: args.path, content: args.content });
          result = `File written: ${args.path}`;
          break;
        case "edit_file":
          const content = await invoke<string>("read_file", { path: args.path });
          const newContent = content.replace(args.old_string, args.new_string);
          await invoke("write_file", { path: args.path, content: newContent });
          result = `File edited: ${args.path}`;
          break;
        case "shell_exec":
          const output = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
            "exec_shell",
            { command: args.command, cwd: args.cwd }
          );
          result = output.stdout || output.stderr || `Exit code: ${output.exit_code}`;
          break;
        case "search_files":
          const files = await invoke<string[]>("search_files", {
            pattern: args.pattern,
            cwd: args.cwd || ".",
          });
          result = files.join("\n") || "No files found";
          break;
        case "list_directory":
          const entries = await invoke<Array<{ name: string; is_dir: boolean }>>(
            "list_directory",
            { path: args.path }
          );
          result = entries.map((e) => `${e.is_dir ? "📁" : "📄"} ${e.name}`).join("\n");
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      onResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  }

  function getToolIcon() {
    switch (toolName) {
      case "read_file":
        return "📖";
      case "write_file":
        return "✏️";
      case "edit_file":
        return "🔧";
      case "shell_exec":
        return "⚡";
      case "search_files":
        return "🔍";
      case "list_directory":
        return "📂";
      default:
        return "🔨";
    }
  }

  function getToolDescription() {
    switch (toolName) {
      case "read_file":
        return `Read file: ${args.path}`;
      case "write_file":
        return `Write to: ${args.path}`;
      case "edit_file":
        return `Edit file: ${args.path}`;
      case "shell_exec":
        return `Execute: ${args.command}`;
      case "search_files":
        return `Search: ${args.pattern}`;
      case "list_directory":
        return `List: ${args.path}`;
      default:
        return toolName;
    }
  }

  return (
    <div className="my-3 border border-terminal-yellow/50 rounded bg-terminal-surface animate-fadeIn">
      {/* Header */}
      <div className="px-4 py-3 border-b border-terminal-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{getToolIcon()}</span>
          <div>
            <div className="font-medium text-terminal-yellow">Tool Request</div>
            <div className="text-sm text-terminal-muted">{getToolDescription()}</div>
          </div>
        </div>
      </div>

      {/* Arguments */}
      <div className="px-4 py-3">
        <div className="text-xs text-terminal-muted mb-2">Arguments:</div>
        <pre className="text-sm bg-terminal-bg rounded p-2 overflow-x-auto">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-sm text-terminal-red bg-terminal-red/10">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-3 border-t border-terminal-border flex items-center justify-end gap-3">
        <button
          onClick={onCancel}
          disabled={executing}
          className="px-4 py-2 text-sm text-terminal-muted hover:text-terminal-text transition-colors"
        >
          Deny
        </button>
        <button
          onClick={handleApprove}
          disabled={executing}
          className="px-4 py-2 text-sm bg-terminal-green text-terminal-bg rounded hover:bg-opacity-80 transition-colors disabled:opacity-50"
        >
          {executing ? "Executing..." : "Approve"}
        </button>
      </div>
    </div>
  );
}
