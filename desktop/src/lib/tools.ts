/**
 * Tool schemas (OpenAI function-calling format) for the offline coding brain.
 * Names mirror Claude Code / the Rodeo CLI (PascalCase) so behaviour is
 * consistent across every Rodeo surface.
 */

export const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "Read",
      description:
        "Read a file's contents. You MUST read a file before editing it. Returns content with line numbers.",
      parameters: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: { type: "string", description: "Path to the file (absolute, or relative to the working directory)" },
          offset: { type: "number", description: "1-indexed line to start from (optional)" },
          limit: { type: "number", description: "Max lines to read (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Write",
      description: "Create a new file or overwrite an existing one. Read an existing file before overwriting it.",
      parameters: {
        type: "object",
        required: ["file_path", "content"],
        properties: {
          file_path: { type: "string", description: "Path to write" },
          content: { type: "string", description: "Full file content" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description:
        "Replace an exact string in a file. Read the file first. old_string must match the file content exactly (including whitespace). The editor is whitespace-tolerant and will retry on minor indentation differences. Use replace_all to replace every occurrence.",
      parameters: {
        type: "object",
        required: ["file_path", "old_string", "new_string"],
        properties: {
          file_path: { type: "string", description: "Path to the file" },
          old_string: { type: "string", description: "Exact text to replace" },
          new_string: { type: "string", description: "Replacement text" },
          replace_all: { type: "boolean", description: "Replace all occurrences (default false)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "MultiEdit",
      description:
        "Apply several Edit operations to ONE file in a single atomic call. Edits are applied in order; if any fails, none are written. Prefer this over many sequential Edits on the same file.",
      parameters: {
        type: "object",
        required: ["file_path", "edits"],
        properties: {
          file_path: { type: "string", description: "Path to the file" },
          edits: {
            type: "array",
            description: "Ordered list of edits",
            items: {
              type: "object",
              required: ["old_string", "new_string"],
              properties: {
                old_string: { type: "string" },
                new_string: { type: "string" },
                replace_all: { type: "boolean" },
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
      name: "Bash",
      description: "Run a shell command (git, npm, cargo, tests, etc.) in the working directory. Returns stdout/stderr.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "The command to run" },
          description: { type: "string", description: "Short description of what it does" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: "Find files by glob pattern, e.g. **/*.ts or src/**/*.tsx.",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Glob pattern" },
          path: { type: "string", description: "Directory to search (default: working directory)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Grep",
      description: "Search file contents with a regex (ripgrep). Use to locate code.",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Regex to search for" },
          path: { type: "string", description: "File or directory (default: working directory)" },
          glob: { type: "string", description: "Filter files, e.g. *.ts" },
          case_insensitive: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "List",
      description: "List files and directories at a path.",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Directory to list" },
        },
      },
    },
  },
];

/** Tools that only read state — safe to auto-run without approval. */
export const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "List"]);

/** Tools that change the filesystem or run commands — gated by approval. */
export const MUTATING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

export function buildSystemPrompt(projectContext: string, workingDir: string): string {
  return `You are Rodeo, an autonomous AI coding assistant running locally and offline. You write, edit, and run code directly on the user's machine using tools.

Working directory: ${workingDir || "(not set — ask the user to set one)"}

## How you work
- You have real tools. USE THEM. Never claim you "can't access files" or ask the user to paste code — read it yourself with Read/Glob/Grep.
- Before editing a file, Read it. Edits fail if you haven't seen the current content.
- Prefer Grep/Glob to locate code instead of guessing paths.
- For multiple edits to the same file, use MultiEdit (one atomic call).
- After changing code, VERIFY: run the project's typecheck/lint/tests with Bash (e.g. npx tsc --noEmit, npm run lint, npm test) and fix what you broke.
- Make the smallest change that solves the problem. Match the surrounding code style.
- Work step by step: explore → plan → edit → verify. Keep going until the task is truly done.

## Output
- Be concise. Lead with what you did. Show diffs/snippets, not whole files.
- Don't narrate every tool call; just do the work and summarize the result.

## Project context
${projectContext || "(no project context gathered yet)"}`;
}
