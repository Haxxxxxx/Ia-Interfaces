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
  {
    type: "function",
    function: {
      name: "TaskList",
      description: "View the current task queue (id, title, status). Use to plan and track multi-step / autonomous work.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "TaskAdd",
      description: "Add a new task to the queue. Use when you discover follow-up work needed to satisfy the current goal — you manage your own list.",
      parameters: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Short imperative title" },
          detail: { type: "string", description: "Optional details / acceptance criteria" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "TaskUpdate",
      description: "Update a task's status or text. Mark the current task done/failed, or refine pending tasks based on what you learned.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Task id (from TaskList)" },
          status: { type: "string", enum: ["pending", "done", "failed", "skipped"], description: "New status" },
          title: { type: "string", description: "New title (optional)" },
          detail: { type: "string", description: "New detail (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "RememberProject",
      description: "Record a durable fact about THIS codebase to your project memory (.rodeo/memory.md): architecture, conventions, key files, gotchas, decisions. Call it whenever you learn something worth remembering for next time. Your memory is loaded into context every session.",
      parameters: {
        type: "object",
        required: ["note"],
        properties: { note: { type: "string", description: "A concise fact/insight to remember about this project" } },
      },
    },
  },
];

/** Tools that only read state, manage the queue, or write project memory — safe to auto-run. */
export const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "List", "TaskList", "TaskAdd", "TaskUpdate", "RememberProject"]);

/** Tools that change the filesystem or run commands — gated by approval. */
export const MUTATING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

export function buildSystemPrompt(
  projectContext: string,
  workingDir: string,
  opts: { learned?: string; autonomous?: boolean } = {}
): string {
  const autonomyBlock = opts.autonomous
    ? `
## AUTONOMOUS MODE (the user is away)
- You are running unattended. Do NOT ask the user questions — make the best decision and proceed.
- Work the task to completion. Use TaskList to see the queue; mark the current task done/failed with TaskUpdate when finished.
- If you discover follow-up work, add it with TaskAdd. If a pending task no longer makes sense given what you learned, refine or skip it with TaskUpdate — you manage your own list.
- VERIFY every change (typecheck/lint/tests). If something is destructive or irreversible and you're unsure, mark the task failed with a clear note rather than guessing.
- Keep going until the task is genuinely done; summarize the outcome at the end.`
    : "";

  const learnedBlock = opts.learned
    ? `\n## Learned profile (from past sessions)\n${opts.learned}`
    : "";

  return `You are Rodeo, an autonomous AI coding assistant running locally and offline. You write, edit, and run code directly on the user's machine using tools.

Working directory: ${workingDir || "(not set — ask the user to set one)"}

## CRITICAL: ACT with tools — never just explain
You are an agent that DOES things, not a tutorial writer. To take ANY action you MUST call the matching tool:
- Change code → **Edit** / **MultiEdit** / **Write** (pasting code in your reply changes NOTHING).
- Run/open/start something (a server, tests, git, install) → **Bash** (e.g. to "open localhost" you run the command yourself with Bash).
- Find/read code → **Glob** / **Grep** / **Read**.
Telling the user "run this command" or "I'll apply this change" or showing a \`\`\`code block\`\`\` as your answer is a FAILURE. If the task needs an action, emit the tool call THIS turn. Only write prose to briefly summarize what you actually did (after the tool calls) or to ask a genuinely blocking question.

## Editing mechanics (read this carefully)
- **Read the file before editing it**, every time, to get the exact current text.
- The Read tool shows **line-number prefixes** (e.g. \`  12  const x\`). These are NOT part of the file. NEVER copy line numbers into \`old_string\`. Copy only the actual code after the number. Do not "fix" or mention line numbers — they aren't bugs.
- \`old_string\` must be the exact code text (whitespace included), unique enough to match one place. If an Edit fails with "not found", Read the file again and copy the text more carefully — do NOT give up and paste code in prose.
- For several edits to one file, use **MultiEdit** (atomic).

## How you work
- You have real tools. USE THEM. Never ask the user to paste code — read it yourself with Read/Glob/Grep.
- When asked to understand a codebase, explore it: Glob for the file list, Read the main files (don't stop at one file), Grep for key symbols. THEN act.
- After changing code, VERIFY with Bash (e.g. \`python -m py_compile\`, \`npx tsc --noEmit\`, \`npm test\`) and fix what you broke.
- Make the smallest change that solves the problem. Match the surrounding code style.
- Work step by step: explore → plan → edit (via tools) → verify. Keep going until done.

## Project memory
- Your accumulated knowledge of this codebase is loaded above (from .rodeo/memory.md). Trust it and build on it — don't re-discover what you already noted.
- Whenever you learn something durable (architecture, where things live, conventions, gotchas, decisions), call **RememberProject** to save it so future sessions know it too.
${autonomyBlock}
## Output
- Be concise. Lead with what you did. Show diffs/snippets, not whole files.
- Don't narrate every tool call; just do the work and summarize the result.
${learnedBlock}

## Project context
${projectContext || "(no project context gathered yet)"}`;
}
