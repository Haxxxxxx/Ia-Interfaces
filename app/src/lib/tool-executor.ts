/**
 * Server-side tool execution with security sandboxing
 * Implements Claude Code-like tools for agentic file operations
 * Supports multi-agent system with per-agent tool permissions
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "glob";
import { validateToolAccess, getToolsForAgent, type AgentInfo } from "./agents";

const execAsync = promisify(exec);

// Probe for ripgrep once per process, not on every Grep call (each probe is a
// child_process spawn — in an agentic loop that greps 5-10x it adds up).
let _hasRg: boolean | null = null;
async function hasRipgrep(): Promise<boolean> {
  if (_hasRg !== null) return _hasRg;
  try { await execAsync("which rg"); _hasRg = true; }
  catch { _hasRg = false; }
  return _hasRg;
}

// ============================================================================
// Types
// ============================================================================

export interface ToolExecutionContext {
  userId: string;
  instanceId: string;
  projectRoot: string; // Sandbox boundary
  sessionId?: string;
  agentName?: string; // Current agent (build, plan, explore, general)
  model?: string; // Model to use for spawned subagents (Task tool)
  taskDepth?: number; // Nesting depth of Task subagents (recursion guard)
  onFileChange?: (change: FileChange) => void;
}

// A Task subagent may itself call tools, but it must not spawn Tasks without
// bound — cap the nesting depth to avoid N×M (or runaway) LLM fan-out.
const MAX_TASK_DEPTH = 2;

export interface FileChange {
  type: "create" | "edit" | "delete";
  path: string;
  timestamp: Date;
  backup?: string; // Original content for undo
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Security Constants
// ============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const BASH_TIMEOUT = 60000; // 60 seconds
const MAX_OUTPUT_LENGTH = 100000; // 100KB output limit

// Dangerous bash commands to block
const BASH_BLOCKLIST = [
  /\brm\s+-rf\s+[\/~]/i,           // rm -rf with root or home
  /\brm\s+--no-preserve-root/i,    // rm with no-preserve-root
  /\bsudo\b/i,                      // sudo
  /\bmkfs\b/i,                      // mkfs (format disk)
  /\bdd\s+if=/i,                    // dd with input file (disk operations)
  /\b(halt|shutdown|reboot)\b/i,   // system shutdown
  /\bchmod\s+777/i,                // overly permissive chmod
  /\bchown\s+-R\s+root/i,          // recursive chown to root
  /\b:(){ :|:& };:/,               // fork bomb
  /\bwget\b.*\|\s*bash/i,          // piping wget to bash
  /\bcurl\b.*\|\s*bash/i,          // piping curl to bash
  /\beval\s*\(/i,                  // eval with parentheses
  /\b\/dev\/(sda|hda|nvme)/i,      // direct disk access
  /\biptables\s+-F/i,              // flushing firewall rules
  /\bufw\s+disable/i,              // disabling firewall
];

// Track which files have been read this session (for read-before-edit validation)
const readFilesCache = new Map<string, Set<string>>();

// ============================================================================
// Path Security
// ============================================================================

/**
 * Validate that a path is within the sandbox boundary
 */
function validatePath(filePath: string, projectRoot: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(projectRoot, filePath);
  const normalized = path.normalize(resolved);

  // Check if path is within project root
  if (!normalized.startsWith(path.normalize(projectRoot))) {
    throw new Error(`Path "${filePath}" is outside sandbox boundary`);
  }

  // Block access to sensitive files
  const sensitivePatterns = [
    /\.env$/i,
    /\.env\.\w+$/i,
    /credentials/i,
    /secrets/i,
    /private.*key/i,
    /\.ssh\//i,
    /\.gnupg\//i,
  ];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(normalized)) {
      throw new Error(`Access to sensitive file "${path.basename(filePath)}" is restricted`);
    }
  }

  return normalized;
}

/**
 * Validate bash command is safe to execute
 */
function validateBashCommand(command: string): void {
  for (const pattern of BASH_BLOCKLIST) {
    if (pattern.test(command)) {
      throw new Error(`Command blocked for security: matches pattern "${pattern.toString()}"`);
    }
  }
}

// ============================================================================
// Read Files Tracking
// ============================================================================

function getSessionReadFiles(sessionId: string): Set<string> {
  if (!readFilesCache.has(sessionId)) {
    readFilesCache.set(sessionId, new Set());
  }
  return readFilesCache.get(sessionId)!;
}

function markFileAsRead(sessionId: string, filePath: string): void {
  getSessionReadFiles(sessionId).add(filePath);
}

function hasFileBeenRead(sessionId: string, filePath: string): boolean {
  return getSessionReadFiles(sessionId).has(filePath);
}

export function clearSessionReadFiles(sessionId: string): void {
  readFilesCache.delete(sessionId);
}

// ============================================================================
// Edit core (shared by Edit / MultiEdit) — exact first, then whitespace-fuzzy
// ============================================================================

interface StringEdit { old_string: string; new_string: string; replace_all?: boolean }

/**
 * Apply a single string edit to content. Tries an exact match first, then a
 * whitespace-tolerant fuzzy match (matches a contiguous block by trimmed lines
 * and re-indents the replacement). Returns the new content or an error.
 */
function applyStringEdit(content: string, edit: StringEdit): { content: string; replacements: number; error?: string } {
  const { old_string, new_string, replace_all } = edit;

  if (old_string === new_string) {
    return { content, replacements: 0, error: "old_string and new_string are identical" };
  }

  const occurrences = content.split(old_string).length - 1;
  if (occurrences > 0) {
    if (occurrences > 1 && !replace_all) {
      return { content, replacements: 0, error: `Found ${occurrences} occurrences. Add more context to make it unique, or use replace_all: true.` };
    }
    const next = replace_all ? content.split(old_string).join(new_string) : content.replace(old_string, new_string);
    return { content: next, replacements: replace_all ? occurrences : 1 };
  }

  // Fuzzy: match a contiguous run of lines by trimmed content.
  const fileLines = content.split("\n");
  const oldLines = old_string.split("\n");
  const oldTrim = oldLines.map((l) => l.trim());
  for (let i = 0; i + oldLines.length <= fileLines.length; i++) {
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (fileLines[i + j].trim() !== oldTrim[j]) { match = false; break; }
    }
    if (!match) continue;
    const indent = fileLines[i].match(/^\s*/)?.[0] ?? "";
    const replacement = indent + new_string.replace(/^\s+/, "");
    const out = [...fileLines.slice(0, i), ...replacement.split("\n"), ...fileLines.slice(i + oldLines.length)];
    return { content: out.join("\n"), replacements: 1 };
  }

  return { content, replacements: 0, error: "old_string not found in file. Re-read the file and copy the exact text (including whitespace)." };
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * Read file contents with line numbers
 */
async function executeRead(
  args: { file_path: string; offset?: number; limit?: number },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const sessionId = ctx.sessionId || ctx.instanceId;
    const filePath = validatePath(args.file_path, ctx.projectRoot);

    // Check file exists
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      return { success: false, output: "", error: `"${args.file_path}" is not a file` };
    }

    // Check file size
    if (stats.size > MAX_FILE_SIZE) {
      return {
        success: false,
        output: "",
        error: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`
      };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const offset = args.offset ?? 1;
    const limit = args.limit ?? 2000;
    const startIdx = Math.max(0, offset - 1);
    const endIdx = Math.min(lines.length, startIdx + limit);

    const selectedLines = lines.slice(startIdx, endIdx);
    const numberedLines = selectedLines.map((line, i) => {
      const lineNum = startIdx + i + 1;
      const padding = String(lineNum).padStart(6, " ");
      // Truncate long lines
      const truncatedLine = line.length > 2000 ? line.slice(0, 2000) + "..." : line;
      return `${padding}\t${truncatedLine}`;
    });

    // Mark file as read for edit validation
    markFileAsRead(sessionId, filePath);

    return {
      success: true,
      output: numberedLines.join("\n"),
      metadata: {
        totalLines: lines.length,
        linesReturned: selectedLines.length,
        startLine: offset,
        endLine: startIdx + selectedLines.length,
      },
    };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { success: false, output: "", error: `File not found: ${args.file_path}` };
    }
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Edit file with find/replace
 */
async function executeEdit(
  args: { file_path: string; old_string: string; new_string: string; replace_all?: boolean },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const sessionId = ctx.sessionId || ctx.instanceId;
    const filePath = validatePath(args.file_path, ctx.projectRoot);

    // Check if file was read first
    if (!hasFileBeenRead(sessionId, filePath)) {
      return {
        success: false,
        output: "",
        error: "You must read the file before editing it. Use the Read tool first.",
      };
    }

    // Check old_string !== new_string
    if (args.old_string === args.new_string) {
      return {
        success: false,
        output: "",
        error: "old_string and new_string are identical. No changes needed.",
      };
    }

    // Read current content
    const content = await fs.readFile(filePath, "utf-8");
    const backup = content;

    const { content: newContent, replacements, error } = applyStringEdit(content, args);
    if (error) {
      return { success: false, output: "", error };
    }

    // Write new content
    await fs.writeFile(filePath, newContent, "utf-8");

    // Track change for undo
    if (ctx.onFileChange) {
      ctx.onFileChange({ type: "edit", path: filePath, timestamp: new Date(), backup });
    }

    return {
      success: true,
      output: replacements > 1
        ? `Replaced ${replacements} occurrences in ${args.file_path}`
        : `Successfully edited ${args.file_path}`,
      metadata: { replacements, filePath },
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Apply several edits to one file atomically (all-or-nothing).
 */
async function executeMultiEdit(
  args: { file_path: string; edits: StringEdit[] },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const sessionId = ctx.sessionId || ctx.instanceId;
    const filePath = validatePath(args.file_path, ctx.projectRoot);

    if (!hasFileBeenRead(sessionId, filePath)) {
      return { success: false, output: "", error: "You must read the file before editing it. Use the Read tool first." };
    }
    if (!Array.isArray(args.edits) || args.edits.length === 0) {
      return { success: false, output: "", error: "edits must be a non-empty array." };
    }

    const backup = await fs.readFile(filePath, "utf-8");
    let working = backup;
    for (let i = 0; i < args.edits.length; i++) {
      const { content, error } = applyStringEdit(working, args.edits[i]);
      if (error) {
        return { success: false, output: "", error: `Edit ${i + 1}/${args.edits.length} failed: ${error}. No changes were written.` };
      }
      working = content;
    }

    await fs.writeFile(filePath, working, "utf-8");
    if (ctx.onFileChange) {
      ctx.onFileChange({ type: "edit", path: filePath, timestamp: new Date(), backup });
    }

    return {
      success: true,
      output: `Applied ${args.edits.length} edits to ${args.file_path}`,
      metadata: { edits: args.edits.length, filePath },
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Write file (create or overwrite)
 */
async function executeWrite(
  args: { file_path: string; content: string },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const sessionId = ctx.sessionId || ctx.instanceId;
    const filePath = validatePath(args.file_path, ctx.projectRoot);

    // Check if file exists
    let backup: string | undefined;
    let exists = false;
    try {
      backup = await fs.readFile(filePath, "utf-8");
      exists = true;

      // If file exists, it must have been read first
      if (!hasFileBeenRead(sessionId, filePath)) {
        return {
          success: false,
          output: "",
          error: "File exists. You must read the file before overwriting it. Use the Read tool first.",
        };
      }
    } catch {
      // File doesn't exist, OK to create
    }

    // Check content size
    if (args.content.length > MAX_FILE_SIZE) {
      return {
        success: false,
        output: "",
        error: `Content too large (${(args.content.length / 1024 / 1024).toFixed(2)}MB). Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      };
    }

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(filePath, args.content, "utf-8");

    // Mark as read so it can be edited
    markFileAsRead(sessionId, filePath);

    // Track change for undo
    if (ctx.onFileChange) {
      ctx.onFileChange({
        type: exists ? "edit" : "create",
        path: filePath,
        timestamp: new Date(),
        backup,
      });
    }

    return {
      success: true,
      output: exists
        ? `Overwrote ${args.file_path}`
        : `Created ${args.file_path}`,
      metadata: {
        created: !exists,
        filePath,
        size: args.content.length,
      },
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Execute bash command with timeout
 */
async function executeBash(
  args: { command: string; timeout?: number },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    validateBashCommand(args.command);

    const timeout = Math.min(args.timeout || BASH_TIMEOUT, BASH_TIMEOUT);

    const { stdout, stderr } = await execAsync(args.command, {
      cwd: ctx.projectRoot,
      timeout,
      maxBuffer: MAX_OUTPUT_LENGTH,
      env: {
        ...process.env,
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
    });

    let output = stdout || "";
    if (stderr) {
      output += (output ? "\n" : "") + "STDERR:\n" + stderr;
    }

    // Truncate if too long
    if (output.length > MAX_OUTPUT_LENGTH) {
      output = output.slice(0, MAX_OUTPUT_LENGTH) + "\n... (output truncated)";
    }

    return {
      success: true,
      output: output || "(no output)",
    };
  } catch (err: any) {
    if (err.killed) {
      return {
        success: false,
        output: "",
        error: `Command timed out after ${BASH_TIMEOUT / 1000} seconds`,
      };
    }

    let output = "";
    if (err.stdout) output += err.stdout;
    if (err.stderr) output += (output ? "\n" : "") + err.stderr;

    return {
      success: false,
      output: output || "",
      error: err.message,
      metadata: { exitCode: err.code },
    };
  }
}

/**
 * Glob file pattern matching
 */
async function executeGlob(
  args: { pattern: string; path?: string },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const searchPath = args.path
      ? validatePath(args.path, ctx.projectRoot)
      : ctx.projectRoot;

    const matches = await glob(args.pattern, {
      cwd: searchPath,
      absolute: false,
      nodir: false,
      ignore: [
        "**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**",
        "**/.next/**", "**/__pycache__/**", "**/.venv/**", "**/venv/**",
        "**/target/**", "**/.cache/**", "**/coverage/**", "**/.turbo/**"
      ],
    });

    // Sort by modification time (newest first)
    const withStats = await Promise.all(
      matches.map(async (file) => {
        try {
          const fullPath = path.join(searchPath, file);
          const stats = await fs.stat(fullPath);
          return { file, mtime: stats.mtime.getTime() };
        } catch {
          return { file, mtime: 0 };
        }
      })
    );

    withStats.sort((a, b) => b.mtime - a.mtime);
    const sorted = withStats.map((item) => item.file);

    // Limit results - increased for large codebases
    const limited = sorted.slice(0, 1000);

    return {
      success: true,
      output: limited.join("\n") || "(no matches)",
      metadata: {
        totalMatches: matches.length,
        returned: limited.length,
        truncated: matches.length > 500,
      },
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Grep for pattern in files
 */
async function executeGrep(
  args: { pattern: string; path?: string; include?: string },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const searchPath = args.path
      ? validatePath(args.path, ctx.projectRoot)
      : ctx.projectRoot;

    // Build grep command using ripgrep if available, otherwise grep
    // Exclude common large directories
    const excludeDirs = "--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=target --exclude-dir=vendor";

    let command = `grep -rn ${excludeDirs}`;
    if (args.include) {
      command += ` --include="${args.include}"`;
    }
    command += ` "${args.pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
    command += ` 2>/dev/null || true`;

    // Try ripgrep first (much faster and respects .gitignore) — probe cached.
    const useRipgrep = await hasRipgrep();

    if (useRipgrep) {
      command = `rg -n --max-count=500`;
      if (args.include) {
        command += ` --glob "${args.include}"`;
      }
      command += ` "${args.pattern.replace(/"/g, '\\"')}" "${searchPath}"`;
      command += ` 2>/dev/null || true`;
    }

    const { stdout } = await execAsync(command, {
      cwd: ctx.projectRoot,
      timeout: 30000,
      maxBuffer: MAX_OUTPUT_LENGTH,
    });

    // Limit output lines - increased for large codebases
    const lines = stdout.split("\n").filter(Boolean);
    const limited = lines.slice(0, 500);

    return {
      success: true,
      output: limited.join("\n") || "(no matches)",
      metadata: {
        totalMatches: lines.length,
        returned: limited.length,
        truncated: lines.length > 500,
      },
    };
  } catch (err: any) {
    return { success: false, output: "", error: err.message };
  }
}

/**
 * List directory contents
 */
async function executeList(
  args: { path: string },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    const dirPath = validatePath(args.path, ctx.projectRoot);

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    // Sort: directories first, then files
    const sorted = entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const output = sorted.map((entry) => {
      const indicator = entry.isDirectory() ? "/" : "";
      return entry.name + indicator;
    });

    return {
      success: true,
      output: output.join("\n") || "(empty directory)",
      metadata: {
        totalEntries: entries.length,
        directories: entries.filter((e) => e.isDirectory()).length,
        files: entries.filter((e) => e.isFile()).length,
      },
    };
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { success: false, output: "", error: `Directory not found: ${args.path}` };
    }
    return { success: false, output: "", error: err.message };
  }
}

/**
 * Web search (best-effort). Uses DuckDuckGo's HTML endpoint and extracts the
 * top results. Requires network access; degrades gracefully when offline.
 */
async function executeWebSearch(args: { query: string }): Promise<ToolResult> {
  if (!args.query?.trim()) {
    return { success: false, output: "", error: "query is required" };
  }
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RodeoBot/1.0)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`search returned ${res.status}`);
    const html = await res.text();

    const results: string[] = [];
    const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    const snippets: string[] = [];
    let s: RegExpExecArray | null;
    while ((s = snippetRe.exec(html)) && snippets.length < 8) snippets.push(strip(s[1]));
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = linkRe.exec(html)) && results.length < 8) {
      const url = decodeURIComponent((m[1].match(/uddg=([^&]+)/)?.[1]) || m[1]);
      results.push(`${results.length + 1}. ${strip(m[2])}\n   ${url}${snippets[i] ? `\n   ${snippets[i]}` : ""}`);
      i++;
    }
    return {
      success: true,
      output: results.length ? results.join("\n\n") : "No results found.",
    };
  } catch (err: any) {
    return {
      success: false,
      output: "",
      error: `Web search unavailable (${err.message}). You may be offline — answer from your own knowledge or use local files.`,
    };
  }
}

function strip(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Task: spawn a server-side subagent that runs its own short agentic loop with
 * a restricted toolset, then returns a synthesized result to the parent.
 */
async function executeTask(
  args: { description: string; prompt: string; subagent_type: string },
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  const subType = args.subagent_type === "explore" ? "explore" : "general";
  if (!args.prompt?.trim()) {
    return { success: false, output: "", error: "prompt is required" };
  }

  const depth = ctx.taskDepth ?? 0;
  if (depth >= MAX_TASK_DEPTH) {
    return { success: false, output: "", error: `Task subagents cannot nest deeper than ${MAX_TASK_DEPTH}. Do this work directly with your own tools.` };
  }

  try {
    const { chat } = await import("./llm-client");
    const { TOOLS } = await import("./tools-schema");
    const subTools = getToolsForAgent(subType, TOOLS);
    const model = ctx.model || process.env.DEFAULT_MODEL || "qwen2.5:7b";

    const messages: any[] = [
      {
        role: "system",
        content: `You are a ${subType} subagent. Complete this focused task using your tools, then return a concise result. Working directory: ${ctx.projectRoot}. Do not ask questions — gather what you need with tools.`,
      },
      { role: "user", content: args.prompt },
    ];

    const MAX = subType === "explore" ? 6 : 8;
    let final = "";
    for (let iter = 0; iter < MAX; iter++) {
      const completion: any = await chat({ model, messages, tools: subTools, stream: false, maxTokens: 4096 });
      const msg = completion?.choices?.[0]?.message;
      if (!msg) break;
      messages.push(msg);
      if (msg.content) final = msg.content;

      const calls = msg.tool_calls || [];
      if (calls.length === 0) break;

      for (const call of calls) {
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(call.function.arguments || "{}"); } catch {}
        const r = await executeTool(call.function.name, toolArgs, { ...ctx, agentName: subType, taskDepth: depth + 1 });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: r.success ? r.output : `Error: ${r.error}`,
        });
      }
    }

    return { success: true, output: final || "(subagent finished without a summary)" };
  } catch (err: any) {
    return { success: false, output: "", error: `Task subagent failed: ${err.message}` };
  }
}

// ============================================================================
// Main Executor
// ============================================================================

export type ToolName = "Read" | "Edit" | "Write" | "MultiEdit" | "Bash" | "Glob" | "Grep" | "List" | "WebSearch" | "Task";

// Canonical tool names keyed by lowercase, so multi-word names survive.
// Keyed by the name with all non-alphanumerics stripped + lowercased, so every
// casing/shape a model emits resolves: Read / read / read_file / Read_File /
// readFile all collapse to "readfile". Includes the snake_case aliases the
// schema's TOOL_NAME_MAP produces (read_file, shell_exec, search_files, …).
const CANONICAL_TOOLS: Record<string, string> = {
  read: "Read", readfile: "Read",
  edit: "Edit", editfile: "Edit",
  write: "Write", writefile: "Write",
  multiedit: "MultiEdit", multiedits: "MultiEdit",
  bash: "Bash", shell: "Bash", shellexec: "Bash", run: "Bash", runcommand: "Bash",
  glob: "Glob", searchfiles: "Glob",
  grep: "Grep",
  list: "List", listdirectory: "List", ls: "List",
  websearch: "WebSearch", websearchtool: "WebSearch",
  task: "Task", spawntask: "Task",
};
const canonicalKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function executeTool(
  name: ToolName | string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  // Resolve to a canonical tool name (tolerates snake_case / odd casing).
  const normalizedName = CANONICAL_TOOLS[canonicalKey(name)] || name;

  // Validate agent permissions if agent is specified
  if (ctx.agentName) {
    try {
      validateToolAccess(ctx.agentName, normalizedName);
    } catch (error: any) {
      return {
        success: false,
        output: "",
        error: error.message,
      };
    }
  }

  switch (normalizedName) {
    case "Read":
      return executeRead(args as { file_path: string; offset?: number; limit?: number }, ctx);

    case "Edit":
      return executeEdit(
        args as { file_path: string; old_string: string; new_string: string; replace_all?: boolean },
        ctx
      );

    case "MultiEdit":
      return executeMultiEdit(args as { file_path: string; edits: StringEdit[] }, ctx);

    case "Write":
      return executeWrite(args as { file_path: string; content: string }, ctx);

    case "Bash":
      return executeBash(args as { command: string; timeout?: number }, ctx);

    case "Glob":
      return executeGlob(args as { pattern: string; path?: string }, ctx);

    case "Grep":
      return executeGrep(args as { pattern: string; path?: string; include?: string }, ctx);

    case "List":
      return executeList(args as { path: string }, ctx);

    case "WebSearch":
      return executeWebSearch(args as { query: string });

    case "Task":
      return executeTask(args as { description: string; prompt: string; subagent_type: string }, ctx);

    default:
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${name}. Available tools: Read, Edit, Write, MultiEdit, Bash, Glob, Grep, List, WebSearch, Task`,
      };
  }
}

/**
 * Get or create user sandbox directory
 */
export async function getSandboxPath(userId: string, instanceId: string): Promise<string> {
  const sandboxBase = process.env.SANDBOX_PATH || "/tmp/rodeo";
  const sandboxPath = path.join(sandboxBase, userId, instanceId);

  await fs.mkdir(sandboxPath, { recursive: true });

  return sandboxPath;
}

/**
 * Clean up old sandbox directories (> 24h)
 */
export async function cleanupSandboxes(): Promise<void> {
  const sandboxBase = process.env.SANDBOX_PATH || "/tmp/rodeo";
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  try {
    const users = await fs.readdir(sandboxBase);

    for (const userId of users) {
      const userPath = path.join(sandboxBase, userId);
      const instances = await fs.readdir(userPath);

      for (const instanceId of instances) {
        const instancePath = path.join(userPath, instanceId);
        const stats = await fs.stat(instancePath);

        if (Date.now() - stats.mtime.getTime() > maxAge) {
          await fs.rm(instancePath, { recursive: true, force: true });
        }
      }

      // Remove empty user directories
      const remaining = await fs.readdir(userPath);
      if (remaining.length === 0) {
        await fs.rmdir(userPath);
      }
    }
  } catch {
    // Sandbox base doesn't exist yet, nothing to clean
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { getToolsForAgent, validateToolAccess } from "./agents";
