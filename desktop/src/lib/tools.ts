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
      name: "AskUser",
      description: "Ask the user a clarifying question WITH a few concrete options when you genuinely need a decision only they can make (which approach, which file, naming, scope, etc.). Always prefer this over an open-ended prose question. Do NOT use it for things you can find yourself with Read/Glob/Grep.",
      parameters: {
        type: "object",
        required: ["question", "options"],
        properties: {
          question: { type: "string", description: "The question to ask" },
          options: { type: "array", items: { type: "string" }, description: "2-4 concrete answer choices" },
          header: { type: "string", description: "Short label for the question (optional)" },
          allowMultiple: { type: "boolean", description: "Allow selecting more than one option" },
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
  {
    type: "function",
    function: {
      name: "WebSearch",
      description:
        "Search the web (DuckDuckGo) for up-to-date info, docs, error messages, or library usage. Returns ranked title/url/snippet results. Use when local files don't have the answer and you need current external information. Degrades gracefully when offline.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "The search query" },
          num: { type: "number", description: "Max results (default 6, max 10)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "WebFetch",
      description:
        "Fetch a URL and return its readable text content (HTML stripped). Use to read a doc page, a GitHub README, an issue, or any link — including ones surfaced by WebSearch. Only http(s) URLs.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "The http(s) URL to fetch" },
          prompt: { type: "string", description: "What you're looking for on the page (optional, advisory)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "IndexProject",
      description:
        "Build (or rebuild) the semantic code index for this project so SemanticSearch works. Run this once per project, or after large changes. Requires the local embedding model; it will tell you how to install it if missing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "SemanticSearch",
      description:
        "Find code by MEANING (semantic search over an embedded index) when you don't know the exact symbol or string. Pass a short natural-language description, derived from the CURRENT task, of the code or behavior you want; it returns the most relevant file ranges. For an exact token or regex use Grep instead. Requires an index — run IndexProject first if there isn't one.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Natural-language description of the code you want" },
          k: { type: "number", description: "How many results (default 6, max 12)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Task",
      description:
        "Delegate a self-contained sub-investigation to a fresh sub-agent that can Read/Glob/Grep/SemanticSearch/WebSearch/Bash and reports back a concise answer. Use it to explore a question or area in parallel WITHOUT cluttering your own context (e.g. \"find every place X is configured\", \"summarize how auth works\"). The sub-agent is read-only (it cannot edit files) and cannot spawn further sub-agents. Emit multiple Task calls in one turn to run them concurrently.",
      parameters: {
        type: "object",
        required: ["description", "prompt"],
        properties: {
          description: { type: "string", description: "Short (3-6 word) label for the sub-task" },
          prompt: { type: "string", description: "The full, self-contained instruction for the sub-agent — it does not see this conversation, so include all needed context" },
        },
      },
    },
  },
];

/** Tools that only read state, manage the queue, or write project memory — safe to auto-run. */
export const READ_ONLY_TOOLS = new Set([
  "Read", "Glob", "Grep", "List", "TaskList", "TaskAdd", "TaskUpdate", "RememberProject",
  // Network reads + the explore-only sub-agent + the (project-local) index build.
  "WebSearch", "WebFetch", "SemanticSearch", "IndexProject", "Task",
]);

/** Tools that change the filesystem or run commands — gated by approval. */
export const MUTATING_TOOLS = new Set(["Write", "Edit", "MultiEdit", "Bash"]);

export function buildSystemPrompt(
  projectContext: string,
  workingDir: string,
  opts: { learned?: string; autonomous?: boolean; audit?: boolean } = {}
): string {
  // The structured-report scaffold is only relevant when an audit/enhance is
  // actually requested — including it on every "rename this var" turn just
  // dilutes the prompt (and eats context on a small local model).
  const auditBlock = opts.audit
    ? `
## When asked to AUDIT, REVIEW, or PROPOSE enhancements
- First EXPLORE broadly: Glob the file tree, then Read the important files — entry points, core modules, configs (5-10+ files, NOT one). A report based on a single file is worthless; read enough to actually understand it.
- Then produce a STRUCTURED report (not vague advice):
  1. **Summary** — 2-3 sentences: what the project does and its overall state.
  2. **Findings** — each one concrete: the file (and the function/rough line), what's wrong or improvable, WHY it matters, and the SPECIFIC fix. Reference real code you read.
  3. **Prioritized next steps** — an ordered list of concrete actions, highest impact first.
- Be specific to THIS codebase. Ban generic filler like "add error handling" or "improve docs" unless you point to the exact place and show the change. Name files and the concrete edit.
`
    : "";

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
- When you need a decision from the user, call **AskUser** with concrete options instead of asking an open-ended question in prose. Only ask about things tools can't resolve.
- When asked to understand a codebase, explore it: Glob for the file list, Read the main files (don't stop at one file), Grep for key symbols. THEN act.
- After changing code, VERIFY with Bash (e.g. \`python -m py_compile\`, \`npx tsc --noEmit\`, \`npm test\`) and fix what you broke.
- Make the smallest change that solves the problem. Match the surrounding code style.
- Work step by step: explore → plan → edit (via tools) → verify. Keep going until done.

## Project memory
- Your accumulated knowledge of this codebase is loaded above (from .rodeo/memory.md). Trust it and build on it — don't re-discover what you already noted.
- Whenever you learn something durable (architecture, where things live, conventions, gotchas, decisions), call **RememberProject** to save it so future sessions know it too.

## Finding code & the web
- To locate code by MEANING (you don't know the exact symbol), use **SemanticSearch**; for an exact string/regex use **Grep**. If SemanticSearch says there's no index, run **IndexProject** once.
- For current external info, library docs, or an unfamiliar error, use **WebSearch** then **WebFetch** the best link. These degrade gracefully offline — if a web tool reports you're offline, just continue with local tools.
- To explore a side-question without bloating your own context, delegate it with **Task** (a read-only sub-agent). Fire several Task calls in one turn to investigate in parallel.
${auditBlock}${autonomyBlock}
## Output
- Be concise. Lead with what you did. Show diffs/snippets, not whole files.
- Don't narrate every tool call; just do the work and summarize the result.
${learnedBlock}

## Project context
${projectContext || "(no project context gathered yet)"}`;
}
