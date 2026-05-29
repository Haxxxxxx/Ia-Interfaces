import type OpenAI from "openai";

/**
 * Tool definitions matching Claude Code's behavior exactly.
 * These tools enable the model to read, edit, and manage code files.
 */
export const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "Read",
      description: `Read the contents of a file from the local filesystem.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit for long files
- Results are returned with line numbers starting at 1
- You MUST read a file before editing it

Always read files to understand their content before making changes.`,
      parameters: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: {
            type: "string",
            description: "The absolute path to the file to read",
          },
          offset: {
            type: "number",
            description: "The line number to start reading from (1-indexed). Only provide if the file is too large.",
          },
          limit: {
            type: "number",
            description: "The number of lines to read. Only provide if the file is too large.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description: `Performs exact string replacements in files.

Usage:
- You must read the file first before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read output, preserve the exact indentation (tabs/spaces) as it appears in the file.
- The old_string must match EXACTLY what's in the file, including whitespace and indentation.
- NEVER include line numbers in old_string or new_string.
- The edit will FAIL if old_string is not unique in the file. Provide more surrounding context to make it unique, or use replace_all to change every instance.
- Use replace_all for replacing and renaming strings across the file (e.g., renaming a variable).
- Prefer editing existing files over creating new ones.
- Keep changes minimal and focused.`,
      parameters: {
        type: "object",
        required: ["file_path", "old_string", "new_string"],
        properties: {
          file_path: {
            type: "string",
            description: "The absolute path to the file to modify",
          },
          old_string: {
            type: "string",
            description: "The exact text to replace (must match exactly including whitespace)",
          },
          new_string: {
            type: "string",
            description: "The text to replace it with (must be different from old_string)",
          },
          replace_all: {
            type: "boolean",
            default: false,
            description: "Replace all occurrences of old_string (default false)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "MultiEdit",
      description: `Apply multiple exact string replacements to a SINGLE file in one atomic call.

Usage:
- You must read the file first.
- Edits apply in order; if any edit fails, NONE are written (atomic).
- Prefer this over several sequential Edit calls on the same file.`,
      parameters: {
        type: "object",
        required: ["file_path", "edits"],
        properties: {
          file_path: { type: "string", description: "The absolute path to the file to modify" },
          edits: {
            type: "array",
            description: "Ordered list of edits to apply",
            items: {
              type: "object",
              required: ["old_string", "new_string"],
              properties: {
                old_string: { type: "string", description: "Exact text to replace" },
                new_string: { type: "string", description: "Replacement text" },
                replace_all: { type: "boolean", description: "Replace all occurrences (default false)" },
              },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Write",
      description: `Write a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files over writing new files.
- Creates parent directories automatically if they don't exist.`,
      parameters: {
        type: "object",
        required: ["file_path", "content"],
        properties: {
          file_path: {
            type: "string",
            description: "The absolute path to the file to write (must be absolute, not relative)",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Bash",
      description: `Execute a bash command with optional timeout.

Usage:
- Use for git, npm, cargo, python, and other CLI tools.
- Commands timeout after 60 seconds by default.
- Avoid using for file operations (reading, writing, editing) - use the dedicated tools instead.
- Always quote file paths that contain spaces.
- Capture command output for verification.

Important:
- NEVER run destructive commands (rm -rf /, etc.) without explicit user permission
- NEVER update git config
- When committing, include descriptive commit messages`,
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
          timeout: {
            type: "number",
            description: "Optional timeout in milliseconds (max 60000)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: `Fast file pattern matching tool.

Usage:
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use to find files by name patterns
- More efficient than shell find commands`,
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: {
            type: "string",
            description: 'The glob pattern to match files against (e.g., "**/*.ts", "src/**/*.tsx")',
          },
          path: {
            type: "string",
            description: "The directory to search in. Defaults to current working directory.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Grep",
      description: `Search for patterns in file contents.

Usage:
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Returns file paths and line numbers with matching content
- Use to find code by content, not by file name
- More efficient than shell grep for codebase searches`,
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: {
            type: "string",
            description: "The regular expression pattern to search for in file contents",
          },
          path: {
            type: "string",
            description: "File or directory to search in. Defaults to current working directory.",
          },
          include: {
            type: "string",
            description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "List",
      description: `List files and directories at a given path.

Usage:
- Shows files and directories with type indicators
- Directories are listed first, then files
- Use to explore directory structure`,
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: {
            type: "string",
            description: "The directory path to list",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "WebSearch",
      description: `Search the web for information.

Usage:
- Use for documentation, API references, error solutions, best practices
- Returns top search results with titles, snippets, and URLs
- Great for finding up-to-date information beyond your training data
- Use when you need current information or external resources`,
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Task",
      description: `Launch a subagent to handle complex tasks autonomously.

Usage:
- Use to spawn specialized subagents for research or multi-step tasks
- Subagents run independently and return results when complete
- Available subagent types:
  - explore: Fast codebase exploration (read-only, Glob/Grep/Read/List)
  - general: General purpose with full tool access

When to use:
- Complex research requiring multiple file reads
- Tasks that benefit from parallel execution
- Delegating focused subtasks while continuing main work

When NOT to use:
- Simple file reads (use Read directly)
- Quick searches (use Glob/Grep directly)
- Tasks requiring immediate results`,
      parameters: {
        type: "object",
        required: ["description", "prompt", "subagent_type"],
        properties: {
          description: {
            type: "string",
            description: "A short (3-5 words) description of the task",
          },
          prompt: {
            type: "string",
            description: "The detailed task for the subagent to perform",
          },
          subagent_type: {
            type: "string",
            enum: ["explore", "general"],
            description: "The type of subagent: 'explore' for read-only research, 'general' for full capabilities",
          },
          task_id: {
            type: "string",
            description: "Optional task ID to resume a previous task session",
          },
        },
      },
    },
  },
];

// Mapping from Claude Code-style tool names to CLI tool names for compatibility
export const TOOL_NAME_MAP: Record<string, string> = {
  Read: "read_file",
  Edit: "edit_file",
  Write: "write_file",
  Bash: "shell_exec",
  Glob: "search_files",
  Grep: "grep",
  List: "list_directory",
  WebSearch: "web_search",
  Task: "spawn_task",
  // Also support lowercase versions
  read: "read_file",
  edit: "edit_file",
  write: "write_file",
  bash: "shell_exec",
  glob: "search_files",
  grep: "grep",
  list: "list_directory",
  websearch: "web_search",
  task: "spawn_task",
};
