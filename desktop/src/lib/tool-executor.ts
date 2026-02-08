import { invoke } from "@tauri-apps/api/core";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: "tool";
  content: string;
}

export interface ShellOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

/**
 * Execute a tool call locally via Tauri
 * Returns the result to send back to the LLM
 */
export async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
  const args = JSON.parse(toolCall.function.arguments);
  let content: string;

  try {
    switch (toolCall.function.name) {
      case "read_file":
        content = await invoke<string>("read_file", { path: args.path });
        break;

      case "write_file":
        await invoke("write_file", { path: args.path, content: args.content });
        content = `Successfully wrote ${args.content.length} bytes to ${args.path}`;
        break;

      case "edit_file":
        const fileContent = await invoke<string>("read_file", { path: args.path });
        if (!fileContent.includes(args.old_string)) {
          throw new Error(`String not found in file: "${args.old_string.slice(0, 50)}..."`);
        }
        const occurrences = fileContent.split(args.old_string).length - 1;
        if (occurrences > 1) {
          throw new Error(`String found ${occurrences} times, must be unique`);
        }
        const newContent = fileContent.replace(args.old_string, args.new_string);
        await invoke("write_file", { path: args.path, content: newContent });
        content = `Successfully edited ${args.path}`;
        break;

      case "shell_exec":
        const output = await invoke<ShellOutput>("exec_shell", {
          command: args.command,
          cwd: args.cwd,
        });
        if (output.exit_code !== 0) {
          content = `Exit code: ${output.exit_code}\nStderr: ${output.stderr}\nStdout: ${output.stdout}`;
        } else {
          content = output.stdout || "(no output)";
        }
        break;

      case "search_files":
        const files = await invoke<string[]>("search_files", {
          pattern: args.pattern,
          cwd: args.cwd || ".",
        });
        content = files.length > 0 ? files.join("\n") : "No files found matching pattern";
        break;

      case "list_directory":
        const entries = await invoke<FileEntry[]>("list_directory", {
          path: args.path,
        });
        content = entries
          .map((e) => `${e.is_dir ? "[DIR]" : "[FILE]"} ${e.name}${e.is_dir ? "/" : ""} (${e.size} bytes)`)
          .join("\n");
        break;

      default:
        throw new Error(`Unknown tool: ${toolCall.function.name}`);
    }
  } catch (error) {
    content = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    tool_call_id: toolCall.id,
    role: "tool",
    content,
  };
}

/**
 * Check if a tool call requires user confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  const dangerousTools = ["write_file", "edit_file", "shell_exec"];
  return dangerousTools.includes(toolName);
}

/**
 * Get a human-readable description of a tool call
 */
export function describeToolCall(toolCall: ToolCall): string {
  const args = JSON.parse(toolCall.function.arguments);

  switch (toolCall.function.name) {
    case "read_file":
      return `Read file: ${args.path}`;
    case "write_file":
      return `Write ${args.content.length} bytes to: ${args.path}`;
    case "edit_file":
      return `Edit file: ${args.path}`;
    case "shell_exec":
      return `Execute: ${args.command}`;
    case "search_files":
      return `Search: ${args.pattern} in ${args.cwd || "."}`;
    case "list_directory":
      return `List: ${args.path}`;
    default:
      return `${toolCall.function.name}(${toolCall.function.arguments})`;
  }
}
