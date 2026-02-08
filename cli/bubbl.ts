#!/usr/bin/env node
/**
 * Bubbl CLI - AI coding assistant
 *
 * Usage:
 *   bubbl                  Start interactive mode
 *   bubbl "your question"  Ask a single question
 *   bubbl --init          Configure API key
 *   bubbl --help          Show help
 *   bubbl --new           Start a new named session
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import * as crypto from "crypto";

// ============================================
// CONFIGURATION
// ============================================

const CONFIG_DIR = path.join(os.homedir(), ".bubbl");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const MEMORY_DIR = path.join(CONFIG_DIR, "memory");
const SESSIONS_DIR = path.join(CONFIG_DIR, "sessions");
const MCP_CONFIG_FILE = path.join(CONFIG_DIR, "mcp.json");

// Ensure directories exist
fs.mkdirSync(MEMORY_DIR, { recursive: true });
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Session ID for this instance (allows multiple parallel sessions)
const SESSION_ID = process.env.BUBBL_SESSION || crypto.randomBytes(4).toString("hex");

// Parse --new early to set session name before it's used
const argvNewIdx = process.argv.indexOf("--new");
if (argvNewIdx !== -1 && process.argv[argvNewIdx + 1]) {
  process.env.BUBBL_SESSION_NAME = process.argv[argvNewIdx + 1];
}

const SESSION_NAME = process.env.BUBBL_SESSION_NAME || "";

interface BubblConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  timeout: number;
  quickTimeout: number;   // Shorter timeout for speed mode
  autoApprove?: boolean;
  batchAutoApprove?: boolean; // Auto-approve non-dangerous operations
  compactMode?: boolean;  // Less verbose output
  autoSave?: boolean;     // Auto-save conversation on exit
  speedMode?: boolean;    // Optimized for faster responses
  maxTokens?: number;     // Limit response length
}

// Speed mode: Faster models ranked by speed
const FAST_MODELS = [
  "llama3.2:3b",           // ~150 tok/s
  "qwen2.5:7b",            // ~100 tok/s
  "phi3:mini",             // ~120 tok/s
  "gemma2:2b",             // ~140 tok/s
  "deepseek-coder:1.3b",   // ~180 tok/s
];

// Models that support tool calling (function calling)
const TOOL_CAPABLE_MODELS = [
  "qwen2.5", "qwen2", "llama3.1", "llama3.2", "llama3.3",
  "mistral", "mixtral", "command-r", "deepseek",
  "gemma2", "phi3", "granite"
];

function modelSupportsTools(model: string): boolean {
  const lower = model.toLowerCase();
  return TOOL_CAPABLE_MODELS.some(m => lower.includes(m));
}

// Tool definitions for the LLM (OpenAI-compatible format)
const CLI_TOOLS = [
  {
    type: "function",
    function: {
      name: "Read",
      description: "Read file contents. You MUST read a file before editing it.",
      parameters: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: { type: "string", description: "Absolute or relative path to the file" },
          offset: { type: "number", description: "Line number to start reading from (1-indexed)" },
          limit: { type: "number", description: "Number of lines to read" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Edit",
      description: "Edit a file by replacing old_string with new_string. Must read the file first.",
      parameters: {
        type: "object",
        required: ["file_path", "old_string", "new_string"],
        properties: {
          file_path: { type: "string", description: "Path to the file" },
          old_string: { type: "string", description: "Exact text to replace (must match exactly)" },
          new_string: { type: "string", description: "Replacement text" },
          replace_all: { type: "boolean", description: "Replace all occurrences" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Write",
      description: "Create a new file or overwrite existing. Must read first if file exists.",
      parameters: {
        type: "object",
        required: ["file_path", "content"],
        properties: {
          file_path: { type: "string", description: "Path to write to" },
          content: { type: "string", description: "File content" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Bash",
      description: "Execute a shell command. Use for git, npm, cargo, etc.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "The command to execute" },
          timeout: { type: "number", description: "Timeout in ms (max 60000)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Glob",
      description: "Find files matching a glob pattern like **/*.ts",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g., **/*.ts, src/**/*.tsx)" },
          path: { type: "string", description: "Directory to search in" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "Grep",
      description: "Search for a pattern in file contents",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "Directory or file to search" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "List",
      description: "List files and directories at a path",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "Directory path to list" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "WebSearch",
      description: "Search the web for information",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search query" },
        },
      },
    },
  },
];

// ============================================
// GIT INTEGRATION
// ============================================

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  isRepo: boolean;
}

function getGitStatus(): GitStatus {
  const defaultStatus: GitStatus = {
    branch: "",
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    isRepo: false,
  };

  try {
    if (!fs.existsSync(".git")) return defaultStatus;

    const branch = execSync("git branch --show-current", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const status = execSync("git status --porcelain", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();

    let staged = 0, modified = 0, untracked = 0;
    for (const line of status.split("\n").filter(Boolean)) {
      const x = line[0], y = line[1];
      if (x === "?" && y === "?") untracked++;
      else if (x !== " " && x !== "?") staged++;
      else if (y !== " ") modified++;
    }

    let ahead = 0, behind = 0;
    try {
      const tracking = execSync("git rev-list --left-right --count HEAD...@{upstream}", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      const [a, b] = tracking.split("\t").map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {}

    return { branch, ahead, behind, staged, modified, untracked, isRepo: true };
  } catch {
    return defaultStatus;
  }
}

function getGitPrompt(): string {
  const git = getGitStatus();
  if (!git.isRepo) return "";

  let status = `${c.cyan}${git.branch}${c.reset}`;
  const parts: string[] = [];

  if (git.ahead > 0) parts.push(`${c.green}↑${git.ahead}${c.reset}`);
  if (git.behind > 0) parts.push(`${c.red}↓${git.behind}${c.reset}`);
  if (git.staged > 0) parts.push(`${c.green}●${git.staged}${c.reset}`);
  if (git.modified > 0) parts.push(`${c.yellow}●${git.modified}${c.reset}`);
  if (git.untracked > 0) parts.push(`${c.dim}+${git.untracked}${c.reset}`);

  if (parts.length > 0) {
    status += ` ${parts.join(" ")}`;
  }

  return status;
}

async function generateCommitMessage(): Promise<string> {
  try {
    const diff = execSync("git diff --cached --stat", { encoding: "utf-8" }).trim();
    const diffContent = execSync("git diff --cached", { encoding: "utf-8" }).slice(0, 3000);

    if (!diff) {
      return `${c.yellow}No staged changes.${c.reset} Use ${c.cyan}git add${c.reset} first.`;
    }

    // Ask the model to generate a commit message
    const prompt = `Generate a concise git commit message for these changes. Follow conventional commits format (feat:, fix:, docs:, etc.). Just output the commit message, nothing else.

Changes:
${diff}

Diff preview:
${diffContent}`;

    // This will use the current model to generate
    return prompt; // Return for the model to process
  } catch (error: any) {
    return `${c.red}Error:${c.reset} ${error.message}`;
  }
}

function showGitDiff(): string {
  try {
    const staged = execSync("git diff --cached --stat", { encoding: "utf-8" }).trim();
    const unstaged = execSync("git diff --stat", { encoding: "utf-8" }).trim();

    const result: string[] = [];

    if (staged) {
      result.push(`${c.bold}${c.green}Staged Changes${c.reset}`);
      result.push(staged);
    }

    if (unstaged) {
      if (result.length > 0) result.push("");
      result.push(`${c.bold}${c.yellow}Unstaged Changes${c.reset}`);
      result.push(unstaged);
    }

    if (result.length === 0) {
      return `${c.dim}No changes${c.reset}`;
    }

    return result.join("\n");
  } catch (error: any) {
    return `${c.red}Error:${c.reset} ${error.message}`;
  }
}

// ============================================
// SESSION TRACKING - For rollback
// ============================================

interface SessionChange {
  type: "edit" | "write" | "delete";
  file: string;
  backup?: string;  // Original content for edits
  timestamp: number;
}

const sessionChanges: SessionChange[] = [];

function trackChange(type: SessionChange["type"], file: string, backup?: string): void {
  sessionChanges.push({ type, file, backup, timestamp: Date.now() });
}

function rollbackSession(): string {
  if (sessionChanges.length === 0) {
    return `${c.dim}No changes to rollback${c.reset}`;
  }

  const results: string[] = [];
  let restored = 0, failed = 0;

  // Rollback in reverse order
  for (const change of [...sessionChanges].reverse()) {
    try {
      if (change.backup !== undefined) {
        fs.writeFileSync(change.file, change.backup, "utf-8");
        results.push(`${c.green}✓${c.reset} Restored ${path.basename(change.file)}`);
        restored++;
      } else if (change.type === "write") {
        // File was created - optionally delete it
        results.push(`${c.yellow}○${c.reset} Created file: ${path.basename(change.file)} (not deleted)`);
      }
    } catch (error: any) {
      results.push(`${c.red}✗${c.reset} Failed: ${path.basename(change.file)}`);
      failed++;
    }
  }

  sessionChanges.length = 0; // Clear changes

  results.push("");
  results.push(`${c.dim}Restored ${restored} files${failed > 0 ? `, ${failed} failed` : ""}${c.reset}`);

  return results.join("\n");
}

// ============================================
// THINKING DISPLAY - Show reasoning
// ============================================

interface ThinkingState {
  phase: "analyzing" | "planning" | "executing" | "verifying";
  files: string[];
  tools: string[];
  context: string;
}

let currentThinking: ThinkingState | null = null;

function updateThinking(phase: ThinkingState["phase"], context?: string): void {
  if (!currentThinking) {
    currentThinking = { phase, files: [], tools: [], context: context || "" };
  } else {
    currentThinking.phase = phase;
    if (context) currentThinking.context = context;
  }
}

function addThinkingFile(file: string): void {
  if (currentThinking && !currentThinking.files.includes(file)) {
    currentThinking.files.push(file);
  }
}

function addThinkingTool(tool: string): void {
  if (currentThinking && !currentThinking.tools.includes(tool)) {
    currentThinking.tools.push(tool);
  }
}

function clearThinking(): void {
  currentThinking = null;
}

function getThinkingDisplay(): string {
  if (!currentThinking) return "";

  const phases: Record<ThinkingState["phase"], string> = {
    analyzing: "Analyzing",
    planning: "Planning",
    executing: "Executing",
    verifying: "Verifying",
  };

  let display = phases[currentThinking.phase];

  if (currentThinking.files.length > 0) {
    const files = currentThinking.files.slice(-3).map(f => path.basename(f)).join(", ");
    display += ` ${c.dim}(${files})${c.reset}`;
  }

  return display;
}

// Available models with metadata
interface ModelInfo {
  id: string;
  name: string;
  provider: "ollama" | "moonshot" | "deepseek" | "openai";
  description: string;
  contextWindow?: number;
  vram?: string;
  speed?: string;
  capabilities?: string[];
}

// Fallback models when API is unavailable
// ALL FREE via Ollama on Shadow PC (16GB VRAM)
const FALLBACK_MODELS: ModelInfo[] = [
  // === CODE SPECIALISTS (FREE) ===
  { id: "qwen2.5-coder:14b", name: "Qwen 2.5 Coder 14B", provider: "ollama", description: "FREE — Best code quality", vram: "9GB", speed: "~50 tok/s" },
  { id: "qwen2.5-coder:7b", name: "Qwen 2.5 Coder 7B", provider: "ollama", description: "FREE — Fast code", vram: "5GB", speed: "~100 tok/s" },
  { id: "deepseek-coder:6.7b", name: "DeepSeek Coder 6.7B", provider: "ollama", description: "FREE — Great for code", vram: "4GB", speed: "~100 tok/s" },
  { id: "codellama:13b", name: "Code Llama 13B", provider: "ollama", description: "FREE — Meta code model", vram: "8GB", speed: "~60 tok/s" },
  { id: "starcoder2:15b", name: "StarCoder2 15B", provider: "ollama", description: "FREE — Code completion", vram: "10GB", speed: "~45 tok/s" },

  // === GENERAL / CHAT (FREE) ===
  { id: "qwen2.5:14b", name: "Qwen 2.5 14B", provider: "ollama", description: "FREE — Best all-rounder", vram: "9GB", speed: "~50 tok/s" },
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", provider: "ollama", description: "FREE — Fast chat", vram: "5GB", speed: "~100 tok/s" },
  { id: "llama3.1:8b", name: "Llama 3.1 8B", provider: "ollama", description: "FREE — Meta latest", vram: "5GB", speed: "~100 tok/s" },
  { id: "mistral:7b", name: "Mistral 7B", provider: "ollama", description: "FREE — Fast & capable", vram: "5GB", speed: "~100 tok/s" },
  { id: "gemma2:9b", name: "Gemma 2 9B", provider: "ollama", description: "FREE — Google model", vram: "6GB", speed: "~80 tok/s" },
  { id: "phi3:14b", name: "Phi-3 14B", provider: "ollama", description: "FREE — Microsoft reasoning", vram: "9GB", speed: "~50 tok/s" },

  // === FAST / LIGHTWEIGHT (FREE) ===
  { id: "llama3.2:3b", name: "Llama 3.2 3B", provider: "ollama", description: "FREE — Ultra-fast", vram: "2GB", speed: "~150 tok/s" },
  { id: "phi3:3.8b", name: "Phi-3 Mini", provider: "ollama", description: "FREE — Quick tasks", vram: "3GB", speed: "~140 tok/s" },
  { id: "qwen2.5:3b", name: "Qwen 2.5 3B", provider: "ollama", description: "FREE — Lightweight", vram: "2GB", speed: "~150 tok/s" },
];

// Cache for fetched models
let cachedModels: ModelInfo[] | null = null;
let modelsLastFetched = 0;
const MODELS_CACHE_TTL = 60000; // 1 minute

// Fetch models from API with caching
async function fetchAvailableModels(): Promise<ModelInfo[]> {
  const now = Date.now();
  if (cachedModels && now - modelsLastFetched < MODELS_CACHE_TTL) {
    return cachedModels;
  }

  try {
    const res = await fetch(`${CONFIG.apiUrl}/api/models`, {
      headers: CONFIG.apiKey ? { Authorization: `Bearer ${CONFIG.apiKey}` } : {},
    });
    if (res.ok) {
      const data = await res.json() as { data?: any[] };
      cachedModels = (data.data || []).map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.provider || "ollama",
        description: m.description || "",
        contextWindow: m.context_window,
        vram: m.vram,
        speed: m.speed,
        capabilities: m.capabilities,
        installed: m.installed,
      }));
      modelsLastFetched = now;
      return cachedModels!;
    }
  } catch {}
  return FALLBACK_MODELS;
}

// Sync getter that uses cache or fallback
function getAvailableModels(): ModelInfo[] {
  return cachedModels || FALLBACK_MODELS;
}

// Legacy constant for compatibility (use getAvailableModels() instead)
const AVAILABLE_MODELS = FALLBACK_MODELS;

// Track which files have been read (for edit safety)
const readFiles = new Set<string>();

// Undo stack - stores last edit for each file
interface FileBackup {
  path: string;
  content: string;
  timestamp: number;
}
const undoStack: FileBackup[] = [];
const MAX_UNDO_STACK = 10;

// Loop detection - prevent model from repeating failed actions
interface FailedAttempt {
  tool: string;
  argsHash: string;
  error: string;
  count: number;
}
const failedAttempts: Map<string, FailedAttempt> = new Map();
const MAX_SAME_FAILURE = 2; // Max times to retry same failed action

function hashArgs(args: Record<string, any>): string {
  return JSON.stringify(args).slice(0, 200);
}

function recordFailure(tool: string, args: Record<string, any>, error: string): void {
  const key = `${tool}:${hashArgs(args)}`;
  const existing = failedAttempts.get(key);
  if (existing) {
    existing.count++;
    existing.error = error;
  } else {
    failedAttempts.set(key, { tool, argsHash: hashArgs(args), error, count: 1 });
  }
}

function checkRepeatedFailure(tool: string, args: Record<string, any>): string | null {
  const key = `${tool}:${hashArgs(args)}`;
  const attempt = failedAttempts.get(key);
  if (attempt && attempt.count >= MAX_SAME_FAILURE) {
    return `This exact action has failed ${attempt.count} times. Previous error: ${attempt.error}\n` +
           `Please try a DIFFERENT approach or ask the user for help.`;
  }
  return null;
}

function clearFailures(): void {
  failedAttempts.clear();
}

// Track recent tool calls to detect loops
const recentToolCalls: string[] = [];
const MAX_RECENT_CALLS = 10;

function detectLoop(toolName: string, args: Record<string, any>): boolean {
  const callSignature = `${toolName}:${hashArgs(args)}`;
  recentToolCalls.push(callSignature);
  if (recentToolCalls.length > MAX_RECENT_CALLS) {
    recentToolCalls.shift();
  }

  // Check if same call appears 3+ times in recent history
  const count = recentToolCalls.filter(c => c === callSignature).length;
  return count >= 3;
}

// Backup a file before editing
function backupFile(fullPath: string): void {
  try {
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      undoStack.push({ path: fullPath, content, timestamp: Date.now() });
      // Keep stack size limited
      while (undoStack.length > MAX_UNDO_STACK) {
        undoStack.shift();
      }
    }
  } catch {}
}

// Undo last edit
function undoLastEdit(): string {
  if (undoStack.length === 0) {
    return `${c.yellow}Nothing to undo${c.reset}`;
  }

  const backup = undoStack.pop()!;
  try {
    fs.writeFileSync(backup.path, backup.content, "utf-8");
    const elapsed = ((Date.now() - backup.timestamp) / 1000).toFixed(0);
    return `${c.green}✓${c.reset} Restored ${path.basename(backup.path)}\n` +
           `${c.dim}Reverted to state from ${elapsed}s ago${c.reset}`;
  } catch (error: any) {
    return `${c.red}Error:${c.reset} ${error.message}`;
  }
}

// Format API error - detect 404/HTML and show helpful message
function formatApiError(status: number, errorText: string): string {
  const isHtml = errorText.trim().startsWith("<!") || errorText.includes("<!DOCTYPE") ||
    errorText.includes("<pre>") || errorText.includes("<script>");
  const is404 = status === 404;
  const is500 = status >= 500;
  const isNextJsError = errorText.includes("missing required error components");

  if (isNextJsError) {
    return (
      `Server error - the Bubbl API is crashing.\n\n` +
      `${c.dim}Check the server terminal for stack traces. Common causes:\n` +
      `• Ollama not running (for local models): run ${c.cyan}ollama serve${c.reset} and ${c.cyan}ollama pull qwen2.5:7b${c.reset}\n` +
      `• Database/file permissions in the app directory\n` +
      `• Missing env vars: copy ${c.cyan}app/.env.example${c.reset} to ${c.cyan}app/.env${c.reset}\n`
    );
  }

  if (is404 && isHtml) {
    return (
      `Server returned 404 - API route not found.\n\n` +
      `${c.dim}The Bubbl server at ${CONFIG.apiUrl} may not be running, or BUBBL_API_URL might be wrong.\n\n` +
      `1. Start the server: ${c.cyan}cd app && npm run dev${c.reset} (from the Bubbl project root)\n` +
      `2. Or use: ${c.cyan}./run-server.sh${c.reset} from the project root\n` +
      `3. Set BUBBL_API_URL if using a different host (default: http://localhost:3000)\n`
    );
  }

  if (is404) {
    return `API not found (404). Check BUBBL_API_URL=${CONFIG.apiUrl}`;
  }

  if (is500 && isHtml) {
    return (
      `Server error (${status}). Check the Bubbl server logs.\n` +
      `${c.dim}Ensure Ollama is running (ollama serve) if using local models.${c.reset}`
    );
  }

  // Try to parse JSON error
  try {
    const json = JSON.parse(errorText);
    if (json.error) return json.error;
    if (json.details) return `${json.error || "Error"}: ${json.details}`;
  } catch {}

  return errorText.length > 500 ? errorText.slice(0, 500) + "..." : errorText;
}

// Load config from file, env vars, or defaults
function loadConfig(): BubblConfig {
  let fileConfig: Partial<BubblConfig> = {};

  // Try to load from config file
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch {}
  }

  return {
    apiUrl: process.env.BUBBL_API_URL || fileConfig.apiUrl || "http://localhost:3000",
    apiKey: process.env.BUBBL_API_KEY || fileConfig.apiKey || "",
    model: process.env.BUBBL_MODEL || fileConfig.model || "qwen2.5-coder:14b",
    timeout: parseInt(process.env.BUBBL_TIMEOUT || "") || fileConfig.timeout || 120000,
    quickTimeout: parseInt(process.env.BUBBL_QUICK_TIMEOUT || "") || fileConfig.quickTimeout || 30000,
    autoApprove: fileConfig.autoApprove || false,
    batchAutoApprove: fileConfig.batchAutoApprove ?? true, // Default ON for faster workflow
    autoSave: fileConfig.autoSave || false,
    speedMode: fileConfig.speedMode || false,
    maxTokens: fileConfig.maxTokens || 4096,
  };
}

// Save config to file
function saveConfig(config: Partial<BubblConfig>): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = fs.existsSync(CONFIG_FILE)
    ? JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"))
    : {};
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, ...config }, null, 2));
}

// Current configuration
const CONFIG = loadConfig();

// Abort controller for cancellable requests
let currentAbortController: AbortController | null = null;

// ============================================
// SPEED OPTIMIZATIONS - Caching & parallel execution
// ============================================

// File content cache (avoids re-reading unchanged files)
interface CacheEntry {
  content: string;
  mtime: number;
  size: number;
}
const fileCache = new Map<string, CacheEntry>();
const FILE_CACHE_MAX_SIZE = 50; // Max files to cache

function getCachedFile(filePath: string): string | null {
  const cached = fileCache.get(filePath);
  if (!cached) return null;

  try {
    const stats = fs.statSync(filePath);
    if (stats.mtimeMs === cached.mtime && stats.size === cached.size) {
      return cached.content;
    }
    // File changed, invalidate cache
    fileCache.delete(filePath);
  } catch {
    fileCache.delete(filePath);
  }
  return null;
}

function cacheFile(filePath: string, content: string): void {
  try {
    const stats = fs.statSync(filePath);
    // Evict old entries if cache is full
    if (fileCache.size >= FILE_CACHE_MAX_SIZE) {
      const firstKey = fileCache.keys().next().value;
      if (firstKey) fileCache.delete(firstKey);
    }
    fileCache.set(filePath, {
      content,
      mtime: stats.mtimeMs,
      size: stats.size,
    });
  } catch {}
}

// Tool result cache for idempotent operations
const toolResultCache = new Map<string, { result: string; timestamp: number }>();
const TOOL_CACHE_TTL = 30000; // 30 seconds

function getCachedToolResult(toolName: string, args: string): string | null {
  const key = `${toolName}:${args}`;
  const cached = toolResultCache.get(key);
  if (cached && Date.now() - cached.timestamp < TOOL_CACHE_TTL) {
    return cached.result;
  }
  toolResultCache.delete(key);
  return null;
}

function cacheToolResult(toolName: string, args: string, result: string): void {
  // Only cache read-only operations
  const cacheableTools = ["Read", "Glob", "Grep", "List"];
  if (cacheableTools.includes(toolName)) {
    const key = `${toolName}:${args}`;
    toolResultCache.set(key, { result, timestamp: Date.now() });
  }
}

// Warm cache on startup with common project files
function warmCache(): void {
  const commonFiles = ["package.json", "tsconfig.json", ".env", "README.md", "Cargo.toml", "pyproject.toml", "go.mod"];
  const cwd = process.cwd();

  for (const file of commonFiles) {
    const fullPath = path.resolve(cwd, file);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        cacheFile(fullPath, content);
      } catch {}
    }
  }
}

// ============================================
// PLAN MODE - Think before acting
// ============================================

let planMode = false;
let currentPlan: string | null = null;

// ============================================
// SESSION STATS - Track performance
// ============================================

interface SessionStats {
  requestCount: number;
  totalResponseTime: number;
  fastestResponse: number;
  slowestResponse: number;
  tokensEstimated: number;
  toolCalls: number;
  errors: number;
}

const sessionStats: SessionStats = {
  requestCount: 0,
  totalResponseTime: 0,
  fastestResponse: Infinity,
  slowestResponse: 0,
  tokensEstimated: 0,
  toolCalls: 0,
  errors: 0,
};

function recordResponseTime(ms: number, estimatedTokens: number = 0): void {
  sessionStats.requestCount++;
  sessionStats.totalResponseTime += ms;
  sessionStats.tokensEstimated += estimatedTokens;
  if (ms < sessionStats.fastestResponse) sessionStats.fastestResponse = ms;
  if (ms > sessionStats.slowestResponse) sessionStats.slowestResponse = ms;
}

function getStatsDisplay(): string {
  if (sessionStats.requestCount === 0) {
    return `${c.dim}No requests yet${c.reset}`;
  }

  const avg = Math.round(sessionStats.totalResponseTime / sessionStats.requestCount);
  const fastest = sessionStats.fastestResponse === Infinity ? 0 : sessionStats.fastestResponse;

  return `
${c.bold}${c.purple}Session Stats${c.reset}

${c.bold}Performance${c.reset}
  Requests: ${sessionStats.requestCount}
  Avg response: ${c.cyan}${(avg / 1000).toFixed(1)}s${c.reset}
  Fastest: ${c.green}${(fastest / 1000).toFixed(1)}s${c.reset}
  Slowest: ${c.yellow}${(sessionStats.slowestResponse / 1000).toFixed(1)}s${c.reset}

${c.bold}Usage${c.reset}
  Tool calls: ${sessionStats.toolCalls}
  Est. tokens: ~${sessionStats.tokensEstimated}
  Errors: ${sessionStats.errors > 0 ? c.red + sessionStats.errors + c.reset : "0"}

${c.dim}Tip: Use /speed for faster responses${c.reset}
`;
}

// ============================================
// MCP (Model Context Protocol) - External integrations
// ============================================

interface MCPServerConfig {
  name: string;
  type: "figma" | "github" | "slack" | "notion" | "custom";
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  options?: Record<string, any>;
}

interface MCPConfig {
  servers: MCPServerConfig[];
}

interface MCPTool {
  name: string;
  description: string;
  server: string;
  parameters: Record<string, any>;
}

// Load MCP configuration
function loadMCPConfig(): MCPConfig {
  try {
    if (fs.existsSync(MCP_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(MCP_CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return { servers: [] };
}

// Save MCP configuration
function saveMCPConfig(config: MCPConfig): void {
  fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Get enabled MCP servers
function getEnabledMCPServers(): MCPServerConfig[] {
  const config = loadMCPConfig();
  return config.servers.filter(s => s.enabled);
}

// ============================================
// HOOKS SYSTEM - Pre/Post execution hooks
// ============================================

interface Hook {
  name: string;
  trigger: "pre_edit" | "post_edit" | "pre_write" | "post_write" | "pre_shell" | "post_shell" | "on_error";
  command: string;
  enabled: boolean;
  filePattern?: string; // Glob pattern to match files (for edit/write hooks)
}

interface HooksConfig {
  hooks: Hook[];
  customCommands: Record<string, string>; // Custom slash commands -> shell command
}

const HOOKS_CONFIG_FILE = path.join(os.homedir(), ".bubbl", "hooks.json");

function loadHooksConfig(): HooksConfig {
  try {
    if (fs.existsSync(HOOKS_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(HOOKS_CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return { hooks: [], customCommands: {} };
}

function saveHooksConfig(config: HooksConfig): void {
  const bubblDir = path.join(os.homedir(), ".bubbl");
  if (!fs.existsSync(bubblDir)) {
    fs.mkdirSync(bubblDir, { recursive: true });
  }
  fs.writeFileSync(HOOKS_CONFIG_FILE, JSON.stringify(config, null, 2));
}

function matchesPattern(filePath: string, pattern?: string): boolean {
  if (!pattern) return true;
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "DOUBLESTAR")
    .replace(/\*/g, "[^/]*")
    .replace(/DOUBLESTAR/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(regex).test(filePath);
}

async function executeHooks(trigger: Hook["trigger"], context: { file?: string; error?: string }): Promise<{ blocked: boolean; message?: string }> {
  const config = loadHooksConfig();
  const hooks = config.hooks.filter(h => h.enabled && h.trigger === trigger);

  for (const hook of hooks) {
    if (context.file && hook.filePattern && !matchesPattern(context.file, hook.filePattern)) {
      continue;
    }

    try {
      let cmd = hook.command
        .replace(/\$FILE/g, context.file || "")
        .replace(/\$ERROR/g, context.error || "");

      console.log(`${c.dim}→ Hook: ${hook.name}${c.reset}`);

      const result = execSync(cmd, {
        encoding: "utf-8",
        cwd: process.cwd(),
        timeout: 30000,
      });

      if (result.trim().startsWith("BLOCK:")) {
        return { blocked: true, message: result.trim().slice(6).trim() };
      }
    } catch (error: any) {
      console.log(`${c.yellow}Hook "${hook.name}" failed:${c.reset} ${error.message}`);
    }
  }

  return { blocked: false };
}

function getCustomCommand(name: string): string | null {
  const config = loadHooksConfig();
  return config.customCommands[name] || null;
}

// ============================================
// FIGMA MCP SERVER - Design integration
// ============================================

interface FigmaFile {
  key: string;
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
}

interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  documentationLinks?: string[];
}

class FigmaMCP {
  private apiKey: string;
  private baseUrl = "https://api.figma.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "X-Figma-Token": this.apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Figma API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Get user's files
  async getRecentFiles(): Promise<FigmaFile[]> {
    const data = await this.request("/me/files");
    return data.files || [];
  }

  // Get file metadata
  async getFile(fileKey: string): Promise<any> {
    return this.request(`/files/${fileKey}`);
  }

  // Get file nodes (components, frames, etc.)
  async getFileNodes(fileKey: string, nodeIds?: string[]): Promise<any> {
    const ids = nodeIds ? `?ids=${nodeIds.join(",")}` : "";
    return this.request(`/files/${fileKey}/nodes${ids}`);
  }

  // Get components in a file
  async getComponents(fileKey: string): Promise<FigmaComponent[]> {
    const data = await this.request(`/files/${fileKey}/components`);
    return Object.values(data.meta?.components || {}) as FigmaComponent[];
  }

  // Get component sets (variants)
  async getComponentSets(fileKey: string): Promise<any> {
    const data = await this.request(`/files/${fileKey}/component_sets`);
    return data.meta?.component_sets || {};
  }

  // Get styles (colors, text, effects)
  async getStyles(fileKey: string): Promise<any> {
    const data = await this.request(`/files/${fileKey}/styles`);
    return data.meta?.styles || {};
  }

  // Export node as image
  async exportNode(fileKey: string, nodeId: string, format: "png" | "svg" | "pdf" = "png", scale: number = 2): Promise<string> {
    const data = await this.request(`/images/${fileKey}?ids=${nodeId}&format=${format}&scale=${scale}`);
    return data.images?.[nodeId] || "";
  }

  // Get comments on a file
  async getComments(fileKey: string): Promise<any[]> {
    const data = await this.request(`/files/${fileKey}/comments`);
    return data.comments || [];
  }

  // Search for text in file
  async searchText(fileKey: string, query: string): Promise<any[]> {
    const file = await this.getFile(fileKey);
    const results: any[] = [];

    const searchNode = (node: any, path: string[] = []) => {
      if (node.characters && node.characters.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          id: node.id,
          name: node.name,
          text: node.characters,
          path: path.join(" > "),
        });
      }
      if (node.children) {
        for (const child of node.children) {
          searchNode(child, [...path, node.name]);
        }
      }
    };

    if (file.document) {
      searchNode(file.document);
    }

    return results;
  }

  // Get design tokens (colors, typography)
  async getDesignTokens(fileKey: string): Promise<any> {
    const styles = await this.getStyles(fileKey);
    const tokens: any = {
      colors: [],
      typography: [],
      effects: [],
    };

    for (const [key, style] of Object.entries(styles) as [string, any][]) {
      if (style.style_type === "FILL") {
        tokens.colors.push({
          name: style.name,
          key: key,
          description: style.description,
        });
      } else if (style.style_type === "TEXT") {
        tokens.typography.push({
          name: style.name,
          key: key,
          description: style.description,
        });
      } else if (style.style_type === "EFFECT") {
        tokens.effects.push({
          name: style.name,
          key: key,
          description: style.description,
        });
      }
    }

    return tokens;
  }

  // Generate component code suggestion
  async getComponentCode(fileKey: string, nodeId: string, framework: "react" | "vue" | "html" = "react"): Promise<string> {
    const nodes = await this.getFileNodes(fileKey, [nodeId]);
    const node = nodes.nodes?.[nodeId]?.document;

    if (!node) return "// Component not found";

    // Basic code generation based on node type
    const componentName = node.name.replace(/[^a-zA-Z0-9]/g, "");

    if (framework === "react") {
      return `// Generated from Figma: ${node.name}
import React from 'react';

interface ${componentName}Props {
  // Add props based on Figma variants
}

export const ${componentName}: React.FC<${componentName}Props> = (props) => {
  return (
    <div className="${componentName.toLowerCase()}">
      {/* TODO: Implement based on Figma design */}
      {/* Node type: ${node.type} */}
      {/* Children: ${node.children?.length || 0} */}
    </div>
  );
};
`;
    }

    return `<!-- Generated from Figma: ${node.name} -->`;
  }
}

// Global Figma client (initialized when needed)
let figmaClient: FigmaMCP | null = null;

function getFigmaClient(): FigmaMCP | null {
  if (figmaClient) return figmaClient;

  const mcpConfig = loadMCPConfig();
  const figmaServer = mcpConfig.servers.find(s => s.type === "figma" && s.enabled);

  if (figmaServer?.apiKey) {
    figmaClient = new FigmaMCP(figmaServer.apiKey);
    return figmaClient;
  }

  return null;
}

// Figma tool implementations for the AI
async function executeFigmaTool(toolName: string, args: any): Promise<string> {
  const client = getFigmaClient();

  if (!client) {
    return `${c.red}Error:${c.reset} Figma not configured. Run /mcp setup figma to connect.`;
  }

  try {
    switch (toolName) {
      case "figma_list_files": {
        const files = await client.getRecentFiles();
        if (files.length === 0) return "No recent Figma files found.";
        return files.slice(0, 10).map(f =>
          `${c.cyan}${f.name}${c.reset} (${f.key})\n  ${c.dim}Modified: ${f.lastModified}${c.reset}`
        ).join("\n\n");
      }

      case "figma_get_file": {
        const file = await client.getFile(args.file_key);
        return `${c.bold}${file.name}${c.reset}
Version: ${file.version}
Last Modified: ${file.lastModified}
Pages: ${file.document?.children?.map((p: any) => p.name).join(", ") || "None"}`;
      }

      case "figma_get_components": {
        const components = await client.getComponents(args.file_key);
        if (components.length === 0) return "No components found in this file.";
        return components.slice(0, 20).map(comp =>
          `${c.cyan}${comp.name}${c.reset}\n  ${c.dim}${comp.description || "No description"}${c.reset}`
        ).join("\n\n");
      }

      case "figma_get_styles": {
        const tokens = await client.getDesignTokens(args.file_key);
        let result = "";
        if (tokens.colors.length > 0) {
          result += `${c.bold}Colors${c.reset}\n`;
          result += tokens.colors.map((t: any) => `  ${c.cyan}${t.name}${c.reset}`).join("\n") + "\n\n";
        }
        if (tokens.typography.length > 0) {
          result += `${c.bold}Typography${c.reset}\n`;
          result += tokens.typography.map((t: any) => `  ${c.cyan}${t.name}${c.reset}`).join("\n") + "\n\n";
        }
        return result || "No styles found.";
      }

      case "figma_export_node": {
        const url = await client.exportNode(args.file_key, args.node_id, args.format || "png", args.scale || 2);
        return url ? `${c.green}✓${c.reset} Export URL: ${url}` : "Failed to export node.";
      }

      case "figma_search": {
        const results = await client.searchText(args.file_key, args.query);
        if (results.length === 0) return `No results for "${args.query}"`;
        return results.slice(0, 10).map(r =>
          `${c.cyan}${r.name}${c.reset}: "${r.text.slice(0, 50)}..."\n  ${c.dim}${r.path}${c.reset}`
        ).join("\n\n");
      }

      case "figma_generate_code": {
        const code = await client.getComponentCode(args.file_key, args.node_id, args.framework || "react");
        return code;
      }

      case "figma_get_comments": {
        const comments = await client.getComments(args.file_key);
        if (comments.length === 0) return "No comments on this file.";
        return comments.slice(0, 10).map((c: any) =>
          `${c.user?.handle || "Unknown"}: ${c.message}`
        ).join("\n\n");
      }

      default:
        return `Unknown Figma tool: ${toolName}`;
    }
  } catch (error: any) {
    return `${c.red}Figma Error:${c.reset} ${error.message}`;
  }
}

// MCP tools available to the AI
function getMCPTools(): MCPTool[] {
  const tools: MCPTool[] = [];
  const servers = getEnabledMCPServers();

  for (const server of servers) {
    if (server.type === "figma") {
      tools.push(
        {
          name: "figma_list_files",
          description: "List recent Figma files",
          server: "figma",
          parameters: {},
        },
        {
          name: "figma_get_file",
          description: "Get Figma file details including pages and structure",
          server: "figma",
          parameters: { file_key: { type: "string", description: "Figma file key from URL" } },
        },
        {
          name: "figma_get_components",
          description: "Get all components in a Figma file",
          server: "figma",
          parameters: { file_key: { type: "string", description: "Figma file key" } },
        },
        {
          name: "figma_get_styles",
          description: "Get design tokens (colors, typography, effects) from a Figma file",
          server: "figma",
          parameters: { file_key: { type: "string", description: "Figma file key" } },
        },
        {
          name: "figma_export_node",
          description: "Export a Figma node as an image",
          server: "figma",
          parameters: {
            file_key: { type: "string", description: "Figma file key" },
            node_id: { type: "string", description: "Node ID to export" },
            format: { type: "string", description: "Export format: png, svg, or pdf" },
          },
        },
        {
          name: "figma_search",
          description: "Search for text content in a Figma file",
          server: "figma",
          parameters: {
            file_key: { type: "string", description: "Figma file key" },
            query: { type: "string", description: "Search query" },
          },
        },
        {
          name: "figma_generate_code",
          description: "Generate React/Vue/HTML code from a Figma component",
          server: "figma",
          parameters: {
            file_key: { type: "string", description: "Figma file key" },
            node_id: { type: "string", description: "Component node ID" },
            framework: { type: "string", description: "Target framework: react, vue, or html" },
          },
        }
      );
    }

    // Add more server types here (GitHub, Slack, Notion)
  }

  return tools;
}

// Execute any MCP tool
async function executeMCPTool(toolName: string, args: any): Promise<string> {
  if (toolName.startsWith("figma_")) {
    return executeFigmaTool(toolName, args);
  }

  // Add more server handlers here
  return `Unknown MCP tool: ${toolName}`;
}

// Generate MCP tools section for system prompt
function getMCPToolsPrompt(): string {
  const tools = getMCPTools();
  if (tools.length === 0) return "";

  let prompt = "\n\n# MCP Integrations\n";

  const figmaTools = tools.filter(t => t.server === "figma");
  if (figmaTools.length > 0) {
    prompt += `\n## Figma - Design files and components
Available commands:
- figma_list_files: List user's recent Figma files
- figma_get_file: Get file details (pages, structure)
- figma_get_components: List all components in a file
- figma_get_styles: Get design tokens (colors, typography)
- figma_search: Search for text in a file
- figma_export_node: Export a node as PNG/SVG
- figma_generate_code: Generate React code from a component

Use when user asks about Figma designs, components, or wants to implement designs.
`;
  }

  return prompt;
}

// ============================================
// WEB SEARCH - DuckDuckGo (free, no API key)
// ============================================

async function webSearch(query: string): Promise<string> {
  try {
    // Use DuckDuckGo HTML search (no API key needed)
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Bubbl/1.0)",
      },
    });

    if (!res.ok) {
      return `${c.red}Search failed:${c.reset} ${res.status}`;
    }

    const html = await res.text();

    // Parse results from HTML (simple regex extraction)
    const results: string[] = [];
    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

    let match;
    let snippetMatch;
    const urls: string[] = [];
    const titles: string[] = [];
    const snippets: string[] = [];

    while ((match = resultRegex.exec(html)) !== null && urls.length < 5) {
      urls.push(match[1]);
      titles.push(match[2].replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    }

    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < 5) {
      snippets.push(snippetMatch[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/<[^>]+>/g, ""));
    }

    if (urls.length === 0) {
      return `${c.dim}No results for "${query}"${c.reset}`;
    }

    // Format results
    for (let i = 0; i < urls.length; i++) {
      results.push(`${c.bold}${titles[i] || "Result"}${c.reset}`);
      if (snippets[i]) {
        results.push(`${c.dim}${snippets[i].slice(0, 150)}${c.reset}`);
      }
      results.push(`${c.cyan}${urls[i]}${c.reset}`);
      results.push("");
    }

    return results.join("\n");
  } catch (error: any) {
    return `${c.red}Search error:${c.reset} ${error.message}`;
  }
}

// ============================================
// CONTEXT COMPRESSION - Extend effective context
// ============================================

const MAX_CONTEXT_MESSAGES = 20; // Keep last N messages in full
const SUMMARY_THRESHOLD = 30;   // Start summarizing after N messages

async function compressContext(msgs: Message[]): Promise<Message[]> {
  if (msgs.length <= SUMMARY_THRESHOLD) {
    return msgs;
  }

  // Keep system prompt and recent messages
  const systemPrompt = msgs[0];
  const recentMessages = msgs.slice(-MAX_CONTEXT_MESSAGES);
  const oldMessages = msgs.slice(1, -MAX_CONTEXT_MESSAGES);

  if (oldMessages.length === 0) {
    return msgs;
  }

  // Create a summary of old messages
  const summaryParts: string[] = [];
  let filesMentioned = new Set<string>();
  let actionsPerformed: string[] = [];

  for (const msg of oldMessages) {
    if (msg.role === "user" && msg.content) {
      summaryParts.push(`User asked: ${msg.content.slice(0, 100)}`);
    }
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || "{}");
        const filePath = args.file_path || args.path;
        if (filePath) filesMentioned.add(filePath);
        actionsPerformed.push(`${tc.function.name}(${filePath || "..."})`);
      }
    }
  }

  const summaryContent = `[Previous conversation summary]
Files worked on: ${[...filesMentioned].slice(0, 10).join(", ") || "none"}
Actions: ${actionsPerformed.slice(-10).join(", ") || "none"}
Topics: ${summaryParts.slice(0, 5).join("; ")}
[End summary - ${oldMessages.length} messages compressed]`;

  const summaryMessage: Message = {
    role: "system",
    content: summaryContent,
  };

  return [systemPrompt, summaryMessage, ...recentMessages];
}

// ============================================
// MEMORY - Persist context across sessions
// ============================================

interface ProjectMemory {
  projectPath: string;
  lastAccessed: number;
  files: Record<string, { summary: string; lastModified: number }>;
  patterns: string[];      // Detected code patterns
  conventions: string[];   // Coding conventions observed
  todos: string[];         // Pending items
  insights: string[];      // Key learnings about the codebase
}

function getMemoryPath(projectPath: string): string {
  const hash = crypto.createHash("md5").update(projectPath).digest("hex").slice(0, 8);
  return path.join(MEMORY_DIR, `${hash}.json`);
}

function loadProjectMemory(): ProjectMemory | null {
  const memPath = getMemoryPath(process.cwd());
  try {
    if (fs.existsSync(memPath)) {
      return JSON.parse(fs.readFileSync(memPath, "utf-8"));
    }
  } catch {}
  return null;
}

function saveProjectMemory(memory: ProjectMemory): void {
  const memPath = getMemoryPath(process.cwd());
  memory.lastAccessed = Date.now();
  fs.writeFileSync(memPath, JSON.stringify(memory, null, 2));
}

function updateMemory(key: keyof Pick<ProjectMemory, "patterns" | "conventions" | "todos" | "insights">, value: string): void {
  let memory = loadProjectMemory() || {
    projectPath: process.cwd(),
    lastAccessed: Date.now(),
    files: {},
    patterns: [],
    conventions: [],
    todos: [],
    insights: [],
  };

  if (!memory[key].includes(value)) {
    memory[key].push(value);
    // Keep lists manageable
    if (memory[key].length > 20) {
      memory[key] = memory[key].slice(-20);
    }
    saveProjectMemory(memory);
  }
}

function getMemoryContext(): string {
  const memory = loadProjectMemory();
  if (!memory) return "";

  const parts: string[] = ["[Project Memory]"];

  if (memory.conventions.length > 0) {
    parts.push(`Conventions: ${memory.conventions.slice(-5).join("; ")}`);
  }
  if (memory.patterns.length > 0) {
    parts.push(`Patterns: ${memory.patterns.slice(-5).join("; ")}`);
  }
  if (memory.insights.length > 0) {
    parts.push(`Insights: ${memory.insights.slice(-3).join("; ")}`);
  }
  if (memory.todos.length > 0) {
    parts.push(`Pending: ${memory.todos.slice(-3).join("; ")}`);
  }

  parts.push("[End Memory]");
  return parts.join("\n");
}

// ============================================
// CONVERSATION SAVE/LOAD
// ============================================

const CONVERSATIONS_DIR = path.join(CONFIG_DIR, "conversations");
fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });

interface SavedConversation {
  name: string;
  timestamp: number;
  cwd: string;
  model: string;
  messages: Message[];
  sessionChanges: SessionChange[];
}

function saveConversation(name: string, msgs: Message[]): string {
  const conv: SavedConversation = {
    name,
    timestamp: Date.now(),
    cwd: process.cwd(),
    model: CONFIG.model,
    messages: msgs,
    sessionChanges: [...sessionChanges],
  };

  const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
  const filepath = path.join(CONVERSATIONS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(conv, null, 2));

  return `${c.green}✓${c.reset} Saved conversation: ${c.cyan}${name}${c.reset}\n${c.dim}${filepath}${c.reset}`;
}

function loadConversation(name: string): { messages: Message[]; info: string } | null {
  const filename = `${name.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
  const filepath = path.join(CONVERSATIONS_DIR, filename);

  try {
    if (!fs.existsSync(filepath)) {
      // Try to find by partial match
      const files = fs.readdirSync(CONVERSATIONS_DIR);
      const match = files.find(f => f.toLowerCase().includes(name.toLowerCase()));
      if (match) {
        const conv = JSON.parse(fs.readFileSync(path.join(CONVERSATIONS_DIR, match), "utf-8")) as SavedConversation;
        const ago = Math.round((Date.now() - conv.timestamp) / 1000 / 60);
        return {
          messages: conv.messages,
          info: `${c.green}✓${c.reset} Loaded: ${c.cyan}${conv.name}${c.reset} ${c.dim}(${ago}m ago, ${conv.messages.length} messages)${c.reset}`,
        };
      }
      return null;
    }

    const conv = JSON.parse(fs.readFileSync(filepath, "utf-8")) as SavedConversation;
    const ago = Math.round((Date.now() - conv.timestamp) / 1000 / 60);
    return {
      messages: conv.messages,
      info: `${c.green}✓${c.reset} Loaded: ${c.cyan}${conv.name}${c.reset} ${c.dim}(${ago}m ago, ${conv.messages.length} messages)${c.reset}`,
    };
  } catch {
    return null;
  }
}

function listConversations(): string {
  try {
    const files = fs.readdirSync(CONVERSATIONS_DIR).filter(f => f.endsWith(".json"));
    if (files.length === 0) {
      return `${c.dim}No saved conversations${c.reset}`;
    }

    const convs: SavedConversation[] = files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(CONVERSATIONS_DIR, f), "utf-8"));
      } catch {
        return null;
      }
    }).filter(Boolean) as SavedConversation[];

    convs.sort((a, b) => b.timestamp - a.timestamp);

    const result: string[] = [`\n${c.bold}${c.purple}Saved Conversations${c.reset}\n`];

    for (const conv of convs.slice(0, 10)) {
      const ago = Math.round((Date.now() - conv.timestamp) / 1000 / 60);
      const agoStr = ago < 60 ? `${ago}m` : `${Math.round(ago / 60)}h`;
      result.push(`  ${c.cyan}${conv.name}${c.reset} ${c.dim}(${agoStr} ago, ${conv.messages.length} msgs)${c.reset}`);
    }

    result.push(`\n${c.dim}Use /load <name> to restore${c.reset}\n`);
    return result.join("\n");
  } catch {
    return `${c.dim}No saved conversations${c.reset}`;
  }
}

// ============================================
// INTERRUPT & RESUME - Save state on Ctrl+C
// ============================================

const INTERRUPTED_SESSION_FILE = path.join(CONFIG_DIR, "interrupted_session.json");

interface InterruptedSession {
  timestamp: number;
  cwd: string;
  model: string;
  messages: Message[];
  sessionChanges: SessionChange[];
  undoStack: FileBackup[];
}

function saveInterruptedSession(msgs: Message[]): void {
  try {
    const session: InterruptedSession = {
      timestamp: Date.now(),
      cwd: process.cwd(),
      model: CONFIG.model,
      messages: msgs.filter(m => m.role !== "system"), // Don't save system prompt
      sessionChanges: [...sessionChanges],
      undoStack: [...undoStack],
    };
    fs.writeFileSync(INTERRUPTED_SESSION_FILE, JSON.stringify(session, null, 2));
  } catch {}
}

function loadInterruptedSession(): InterruptedSession | null {
  try {
    if (fs.existsSync(INTERRUPTED_SESSION_FILE)) {
      const session = JSON.parse(fs.readFileSync(INTERRUPTED_SESSION_FILE, "utf-8")) as InterruptedSession;
      // Only restore if it's from the same directory and recent (within 24 hours)
      const hoursSince = (Date.now() - session.timestamp) / 1000 / 60 / 60;
      if (session.cwd === process.cwd() && hoursSince < 24) {
        return session;
      }
    }
  } catch {}
  return null;
}

function clearInterruptedSession(): void {
  try {
    if (fs.existsSync(INTERRUPTED_SESSION_FILE)) {
      fs.unlinkSync(INTERRUPTED_SESSION_FILE);
    }
  } catch {}
}

function restoreSession(session: InterruptedSession, msgs: Message[]): void {
  // Restore messages (keeping current system prompt)
  msgs.push(...session.messages);

  // Restore session changes
  sessionChanges.push(...session.sessionChanges);

  // Restore undo stack
  undoStack.push(...session.undoStack);

  // Clear the interrupted session file
  clearInterruptedSession();

  const ago = Math.round((Date.now() - session.timestamp) / 1000 / 60);
  console.log(`${c.green}✓${c.reset} Restored interrupted session ${c.dim}(${ago}m ago, ${session.messages.length} messages)${c.reset}`);
}

// ============================================
// AUTO-CONTEXT - Suggest related files
// ============================================

function findRelatedFiles(filePath: string): string[] {
  const related: string[] = [];
  const fullPath = path.resolve(process.cwd(), filePath);
  const fileName = path.basename(filePath);
  const dirName = path.dirname(fullPath);
  const baseName = fileName.replace(/\.(ts|tsx|js|jsx|py|go|rs)$/, "");

  try {
    // 1. Test files
    const testPatterns = [
      `${baseName}.test.ts`,
      `${baseName}.test.tsx`,
      `${baseName}.spec.ts`,
      `${baseName}.spec.tsx`,
      `__tests__/${baseName}.test.ts`,
      `__tests__/${baseName}.test.tsx`,
    ];

    for (const pattern of testPatterns) {
      const testPath = path.join(dirName, pattern);
      if (fs.existsSync(testPath)) {
        related.push(testPath);
      }
    }

    // 2. Type definition files
    const typesPath = path.join(dirName, `${baseName}.d.ts`);
    if (fs.existsSync(typesPath)) {
      related.push(typesPath);
    }

    // 3. Parse imports from the file
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
      let match;

      // Try to find path aliases from tsconfig
      const pathAliases: Record<string, string> = {};
      const projectRoot = process.cwd();
      const tsconfigPaths = [
        path.join(projectRoot, "tsconfig.json"),
        path.join(path.dirname(fullPath), "tsconfig.json"),
        path.join(projectRoot, "app", "tsconfig.json"),
      ];

      for (const tsconfigPath of tsconfigPaths) {
        if (fs.existsSync(tsconfigPath)) {
          try {
            const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
            const baseUrl = tsconfig.compilerOptions?.baseUrl || ".";
            const paths = tsconfig.compilerOptions?.paths || {};
            const tsconfigDir = path.dirname(tsconfigPath);

            for (const [alias, targets] of Object.entries(paths)) {
              if (Array.isArray(targets) && targets.length > 0) {
                const cleanAlias = alias.replace("/*", "");
                const cleanTarget = (targets[0] as string).replace("/*", "");
                pathAliases[cleanAlias] = path.resolve(tsconfigDir, baseUrl, cleanTarget);
              }
            }
            break;
          } catch {}
        }
      }

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Handle path aliases like @/components
        for (const [alias, resolvedBase] of Object.entries(pathAliases)) {
          if (importPath.startsWith(alias + "/") || importPath === alias) {
            const relativePart = importPath.slice(alias.length);
            const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
            for (const ext of extensions) {
              const resolvedPath = path.join(resolvedBase, relativePart + ext);
              if (fs.existsSync(resolvedPath) && !related.includes(resolvedPath)) {
                related.push(resolvedPath);
              }
              // Try /index
              const indexPath = path.join(resolvedBase, relativePart, `index${ext}`);
              if (fs.existsSync(indexPath) && !related.includes(indexPath)) {
                related.push(indexPath);
              }
            }
          }
        }

        if (importPath.startsWith(".")) {
          // Relative import
          const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
          for (const ext of extensions) {
            const resolvedPath = path.resolve(dirName, importPath + ext);
            if (fs.existsSync(resolvedPath) && !related.includes(resolvedPath)) {
              related.push(resolvedPath);
            }
            // Try /index
            const indexPath = path.resolve(dirName, importPath, `index${ext}`);
            if (fs.existsSync(indexPath) && !related.includes(indexPath)) {
              related.push(indexPath);
            }
          }
        }
      }
    }

    // 4. Same-name different extension
    const sameNamePatterns = [
      `${baseName}.css`,
      `${baseName}.scss`,
      `${baseName}.module.css`,
      `${baseName}.styles.ts`,
    ];

    for (const pattern of sameNamePatterns) {
      const stylePath = path.join(dirName, pattern);
      if (fs.existsSync(stylePath)) {
        related.push(stylePath);
      }
    }

  } catch {}

  return related.slice(0, 10); // Limit to 10 files
}

function showRelatedFiles(filePath: string): string {
  const related = findRelatedFiles(filePath);

  if (related.length === 0) {
    return `${c.dim}No related files found for ${path.basename(filePath)}${c.reset}`;
  }

  const result: string[] = [`\n${c.bold}Related Files${c.reset} ${c.dim}(${path.basename(filePath)})${c.reset}\n`];

  for (const file of related) {
    const relPath = path.relative(process.cwd(), file);
    const type = file.includes(".test.") || file.includes(".spec.") ? "test" :
                 file.includes(".d.ts") ? "types" :
                 file.includes(".css") || file.includes(".scss") ? "styles" : "import";
    result.push(`  ${c.cyan}${relPath}${c.reset} ${c.dim}(${type})${c.reset}`);
  }

  result.push("");
  return result.join("\n");
}

// ============================================
// STREAMING TOOL DISPLAY
// ============================================

let currentToolDisplay: { name: string; args: string } | null = null;

function startToolDisplay(name: string): void {
  currentToolDisplay = { name, args: "" };
  process.stdout.write(`\n${c.purple}●${c.reset} ${c.bold}${name}${c.reset} `);
}

function updateToolArgs(chunk: string): void {
  if (currentToolDisplay) {
    currentToolDisplay.args += chunk;
    // Show first part of args as they stream
    const preview = currentToolDisplay.args.slice(0, 60);
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
    process.stdout.write(`${c.purple}●${c.reset} ${c.bold}${currentToolDisplay.name}${c.reset} ${c.dim}${preview}${currentToolDisplay.args.length > 60 ? "..." : ""}${c.reset}`);
  }
}

function endToolDisplay(): void {
  if (currentToolDisplay) {
    process.stdout.write("\n");
    currentToolDisplay = null;
  }
}

// ============================================
// PARALLEL TOOL EXECUTION
// ============================================

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

async function executeToolsParallel(toolCalls: ToolCall[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Group tools by dependency
  // Independent tools: Read, List, Glob, Grep, WebSearch (can run in parallel)
  // Dependent tools: Edit, Write, Bash (must run sequentially after reads)

  const independentTools = ["read_file", "list_directory", "search_files", "grep", "web_search"];
  const independent: ToolCall[] = [];
  const dependent: ToolCall[] = [];

  for (const tc of toolCalls) {
    const normalized = normalizeToolName(tc.name);
    if (independentTools.includes(normalized)) {
      independent.push(tc);
    } else {
      dependent.push(tc);
    }
  }

  // Execute independent tools in parallel
  if (independent.length > 1) {
    console.log(`${c.dim}(running ${independent.length} tools in parallel)${c.reset}`);

    const parallelResults = await Promise.all(
      independent.map(async (tc) => {
        const result = await executeTool(tc.name, tc.args);
        return { id: tc.id, result };
      })
    );

    for (const { id, result } of parallelResults) {
      results.set(id, result);
    }
  } else {
    // Execute single independent tool normally
    for (const tc of independent) {
      const result = await executeTool(tc.name, tc.args);
      results.set(tc.id, result);
    }
  }

  // Execute dependent tools sequentially
  for (const tc of dependent) {
    const result = await executeTool(tc.name, tc.args);
    results.set(tc.id, result);
  }

  return results;
}

// ============================================
// EXPLORE AGENT - Deep codebase analysis
// ============================================

interface ProjectInfo {
  type: string;           // e.g., "Node.js", "Python", "Go", "Rust"
  framework?: string;     // e.g., "Next.js", "Express", "FastAPI"
  buildTool?: string;     // e.g., "npm", "yarn", "pnpm", "pip", "cargo"
  testRunner?: string;    // e.g., "jest", "vitest", "pytest"
  features: string[];     // e.g., ["TypeScript", "ESLint", "Docker"]
}

function detectProject(): ProjectInfo {
  const cwd = process.cwd();
  const info: ProjectInfo = { type: "Unknown", features: [] };

  // Check for package.json (Node.js)
  if (fs.existsSync(path.join(cwd, "package.json"))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
      info.type = "Node.js";

      // Detect package manager
      if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) info.buildTool = "pnpm";
      else if (fs.existsSync(path.join(cwd, "yarn.lock"))) info.buildTool = "yarn";
      else if (fs.existsSync(path.join(cwd, "bun.lockb"))) info.buildTool = "bun";
      else info.buildTool = "npm";

      // Detect framework from dependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) info.framework = "Next.js";
      else if (deps.nuxt) info.framework = "Nuxt";
      else if (deps["@remix-run/react"]) info.framework = "Remix";
      else if (deps.astro) info.framework = "Astro";
      else if (deps.svelte || deps["@sveltejs/kit"]) info.framework = "Svelte";
      else if (deps.vue) info.framework = "Vue";
      else if (deps.react) info.framework = "React";
      else if (deps.express) info.framework = "Express";
      else if (deps.fastify) info.framework = "Fastify";
      else if (deps.hono) info.framework = "Hono";
      else if (deps.koa) info.framework = "Koa";
      else if (deps.electron) info.framework = "Electron";

      // Detect test runner
      if (deps.vitest) info.testRunner = "vitest";
      else if (deps.jest) info.testRunner = "jest";
      else if (deps.mocha) info.testRunner = "mocha";
      else if (deps.ava) info.testRunner = "ava";
      else if (deps.playwright) info.testRunner = "playwright";
      else if (deps.cypress) info.testRunner = "cypress";

      // Features
      if (fs.existsSync(path.join(cwd, "tsconfig.json")) || deps.typescript) info.features.push("TypeScript");
      if (deps.eslint || deps["@eslint/js"]) info.features.push("ESLint");
      if (deps.prettier) info.features.push("Prettier");
      if (deps.tailwindcss) info.features.push("Tailwind");
      if (deps.prisma || deps["@prisma/client"]) info.features.push("Prisma");
      if (deps.drizzle) info.features.push("Drizzle");
      if (deps.trpc || deps["@trpc/server"]) info.features.push("tRPC");

    } catch {}
  }

  // Check for Python
  if (fs.existsSync(path.join(cwd, "pyproject.toml")) || fs.existsSync(path.join(cwd, "requirements.txt"))) {
    info.type = "Python";
    if (fs.existsSync(path.join(cwd, "pyproject.toml"))) {
      try {
        const content = fs.readFileSync(path.join(cwd, "pyproject.toml"), "utf-8");
        if (content.includes("fastapi")) info.framework = "FastAPI";
        else if (content.includes("django")) info.framework = "Django";
        else if (content.includes("flask")) info.framework = "Flask";
        if (content.includes("pytest")) info.testRunner = "pytest";
        if (content.includes("poetry")) info.buildTool = "poetry";
        else if (content.includes("uv")) info.buildTool = "uv";
        else info.buildTool = "pip";
      } catch {}
    }
  }

  // Check for Go
  if (fs.existsSync(path.join(cwd, "go.mod"))) {
    info.type = "Go";
    info.buildTool = "go";
    try {
      const content = fs.readFileSync(path.join(cwd, "go.mod"), "utf-8");
      if (content.includes("gin-gonic/gin")) info.framework = "Gin";
      else if (content.includes("gofiber/fiber")) info.framework = "Fiber";
      else if (content.includes("labstack/echo")) info.framework = "Echo";
    } catch {}
  }

  // Check for Rust
  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
    info.type = "Rust";
    info.buildTool = "cargo";
    try {
      const content = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf-8");
      if (content.includes("actix-web")) info.framework = "Actix";
      else if (content.includes("axum")) info.framework = "Axum";
      else if (content.includes("rocket")) info.framework = "Rocket";
    } catch {}
  }

  // Docker
  if (fs.existsSync(path.join(cwd, "Dockerfile")) || fs.existsSync(path.join(cwd, "docker-compose.yml"))) {
    info.features.push("Docker");
  }

  // Go test runner
  if (info.type === "Go") info.testRunner = "go test";

  // Rust test runner
  if (info.type === "Rust") info.testRunner = "cargo test";

  // Python test runner
  if (info.type === "Python" && !info.testRunner) {
    if (fs.existsSync(path.join(cwd, "pytest.ini")) || fs.existsSync(path.join(cwd, "pyproject.toml"))) {
      info.testRunner = "pytest";
    } else {
      info.testRunner = "python -m pytest";
    }
  }

  // CI/CD
  if (fs.existsSync(path.join(cwd, ".github/workflows"))) info.features.push("GitHub Actions");
  if (fs.existsSync(path.join(cwd, ".gitlab-ci.yml"))) info.features.push("GitLab CI");

  return info;
}

function getProjectSummary(): string {
  const info = detectProject();
  let summary = info.type;
  if (info.framework) summary += ` (${info.framework})`;
  if (info.features.length > 0) summary += ` + ${info.features.join(", ")}`;
  return summary;
}

// ============================================
// CODEBASE MAPPING - Scan project structure
// ============================================

interface CodebaseMap {
  totalFiles: number;
  totalDirs: number;
  filesByType: Record<string, number>;
  keyDirs: string[];
  entryPoints: string[];
  structure: string;
}

let cachedCodebaseMap: CodebaseMap | null = null;
let codebaseMapTimestamp = 0;

function scanCodebase(): CodebaseMap {
  // Return cached if still valid (5 min TTL)
  if (cachedCodebaseMap && Date.now() - codebaseMapTimestamp < 300000) {
    return cachedCodebaseMap;
  }

  const IGNORED = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "target", ".cache", "coverage"]);
  const cwd = process.cwd();
  const filesByType: Record<string, number> = {};
  const keyDirs: string[] = [];
  const entryPoints: string[] = [];
  let totalFiles = 0, totalDirs = 0;
  const lines: string[] = [];

  function walk(dir: string, depth: number, prefix: string): void {
    if (depth > 3 || totalFiles > 300) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith(".") && !IGNORED.has(e.name))
        .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));

      entries.forEach((e, i) => {
        const isLast = i === entries.length - 1;
        const full = path.join(dir, e.name);
        const rel = path.relative(cwd, full);

        if (e.isDirectory()) {
          totalDirs++;
          if (["src", "app", "lib", "components", "pages", "api", "routes", "tests"].includes(e.name)) keyDirs.push(rel);
          if (depth < 2) lines.push(`${prefix}${isLast ? "└── " : "├── "}${e.name}/`);
          walk(full, depth + 1, prefix + (isLast ? "    " : "│   "));
        } else {
          totalFiles++;
          const ext = path.extname(e.name).slice(1).toLowerCase() || "other";
          filesByType[ext] = (filesByType[ext] || 0) + 1;
          if (/^(index|main|app|server)\.(ts|js|tsx|py)$/.test(e.name)) entryPoints.push(rel);
          if (depth < 1) lines.push(`${prefix}${isLast ? "└── " : "├── "}${e.name}`);
        }
      });
    } catch {}
  }

  walk(cwd, 0, "");
  cachedCodebaseMap = { totalFiles, totalDirs, filesByType, keyDirs, entryPoints, structure: lines.slice(0, 20).join("\n") };
  codebaseMapTimestamp = Date.now();
  return cachedCodebaseMap;
}

function getCodebaseContext(): string {
  const m = scanCodebase();
  const types = Object.entries(m.filesByType).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([e, n]) => `${e}:${n}`).join(" ");
  let s = `\n# Codebase: ${m.totalFiles} files, ${m.totalDirs} dirs`;
  s += `\nTypes: ${types}`;
  if (m.keyDirs.length) s += `\nKey dirs: ${m.keyDirs.join(", ")}`;
  if (m.entryPoints.length) s += `\nEntry: ${m.entryPoints.join(", ")}`;
  if (m.structure) s += `\n\`\`\`\n${m.structure}\n\`\`\``;
  return s;
}

function showCodebaseMap(): void {
  const m = scanCodebase();
  console.log(`\n${c.bold}${c.purple}Codebase Map${c.reset}\n`);
  console.log(`${c.dim}Files:${c.reset} ${m.totalFiles}  ${c.dim}Dirs:${c.reset} ${m.totalDirs}\n`);

  const types = Object.entries(m.filesByType).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`${c.dim}File types:${c.reset}`);
  types.forEach(([ext, count]) => console.log(`  ${c.cyan}.${ext}${c.reset}: ${count}`));

  if (m.keyDirs.length) {
    console.log(`\n${c.dim}Key directories:${c.reset}`);
    m.keyDirs.forEach(d => console.log(`  ${c.blue}${d}/${c.reset}`));
  }

  if (m.entryPoints.length) {
    console.log(`\n${c.dim}Entry points:${c.reset}`);
    m.entryPoints.forEach(e => console.log(`  ${c.green}${e}${c.reset}`));
  }

  if (m.structure) {
    console.log(`\n${c.dim}Structure:${c.reset}`);
    console.log(m.structure);
  }
  console.log("");
}

// Get test command for current project
function getTestCommand(specificTest?: string): string | null {
  const info = detectProject();
  const cwd = process.cwd();

  if (!info.testRunner) {
    // Check package.json scripts
    if (fs.existsSync(path.join(cwd, "package.json"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
        if (pkg.scripts?.test) {
          return specificTest ? `npm test -- ${specificTest}` : "npm test";
        }
      } catch {}
    }
    return null;
  }

  // Build command based on test runner
  const runners: Record<string, string> = {
    "vitest": specificTest ? `npx vitest run ${specificTest}` : "npx vitest run",
    "jest": specificTest ? `npx jest ${specificTest}` : "npx jest",
    "mocha": specificTest ? `npx mocha ${specificTest}` : "npx mocha",
    "ava": specificTest ? `npx ava ${specificTest}` : "npx ava",
    "playwright": specificTest ? `npx playwright test ${specificTest}` : "npx playwright test",
    "cypress": "npx cypress run",
    "pytest": specificTest ? `pytest ${specificTest}` : "pytest",
    "python -m pytest": specificTest ? `python -m pytest ${specificTest}` : "python -m pytest",
    "go test": specificTest ? `go test ${specificTest}` : "go test ./...",
    "cargo test": specificTest ? `cargo test ${specificTest}` : "cargo test",
  };

  return runners[info.testRunner] || info.testRunner;
}

// Run tests and parse output
interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: string[];
  output: string;
}

function runTests(specificTest?: string): TestResult {
  const command = getTestCommand(specificTest);

  if (!command) {
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      failures: ["No test runner detected. Add a test script to package.json or install a test framework."],
      output: "",
    };
  }

  const startTime = Date.now();
  let output = "";
  let exitCode = 0;

  try {
    output = execSync(command, {
      encoding: "utf-8",
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000, // 2 minute timeout
    });
  } catch (error: any) {
    output = error.stdout || "";
    if (error.stderr) output += "\n" + error.stderr;
    exitCode = error.status || 1;
  }

  const duration = Date.now() - startTime;

  // Parse test output (basic parsing for common formats)
  let passed = 0, failed = 0, skipped = 0;
  const failures: string[] = [];

  // Jest/Vitest format: "Tests: X passed, Y failed"
  const jestMatch = output.match(/Tests?:\s*(\d+)\s*passed.*?(\d+)\s*failed/i);
  if (jestMatch) {
    passed = parseInt(jestMatch[1]) || 0;
    failed = parseInt(jestMatch[2]) || 0;
  }

  // Pytest format: "X passed, Y failed"
  const pytestMatch = output.match(/(\d+)\s*passed.*?(\d+)\s*failed/i);
  if (pytestMatch && !jestMatch) {
    passed = parseInt(pytestMatch[1]) || 0;
    failed = parseInt(pytestMatch[2]) || 0;
  }

  // Go format: "ok" or "FAIL"
  if (output.includes("FAIL") || exitCode !== 0) {
    failed = failed || 1;
    // Extract failure messages
    const failLines = output.split("\n").filter(l => l.includes("FAIL") || l.includes("Error") || l.includes("error"));
    failures.push(...failLines.slice(0, 5));
  }

  // If we couldn't parse but tests failed
  if (exitCode !== 0 && failed === 0) {
    failed = 1;
  }

  return { passed, failed, skipped, duration, failures, output };
}

async function exploreCodebase(query?: string): Promise<string> {
  const results: string[] = [];
  const cwd = process.cwd();

  results.push(`${c.bold}${c.purple}Codebase Analysis${c.reset}\n`);
  results.push(`${c.dim}${cwd}${c.reset}\n`);

  // 1. Project structure
  try {
    const structure = execSync(
      "find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' \\) 2>/dev/null | grep -v node_modules | grep -v .git | grep -v dist | grep -v build | head -50",
      { encoding: "utf-8", cwd }
    ).trim();

    if (structure) {
      // Group by directory
      const byDir: Record<string, string[]> = {};
      for (const file of structure.split("\n")) {
        const dir = path.dirname(file);
        if (!byDir[dir]) byDir[dir] = [];
        byDir[dir].push(path.basename(file));
      }

      results.push(`${c.bold}Structure${c.reset}`);
      for (const [dir, files] of Object.entries(byDir).slice(0, 10)) {
        results.push(`  ${c.blue}${dir}/${c.reset}`);
        for (const f of files.slice(0, 5)) {
          results.push(`    ${c.cyan}${f}${c.reset}`);
        }
        if (files.length > 5) {
          results.push(`    ${c.dim}... +${files.length - 5} more${c.reset}`);
        }
      }
      results.push("");
    }
  } catch {}

  // 2. Entry points
  results.push(`${c.bold}Entry Points${c.reset}`);
  const entryPoints: [string, string][] = [
    ["package.json", "Node.js"],
    ["src/index.ts", "TypeScript entry"],
    ["src/main.ts", "Main file"],
    ["app/page.tsx", "Next.js App"],
    ["pages/index.tsx", "Next.js Pages"],
    ["main.py", "Python entry"],
    ["main.go", "Go entry"],
    ["src/main.rs", "Rust entry"],
  ];

  for (const [file, desc] of entryPoints) {
    const fullPath = path.join(cwd, file);
    if (fs.existsSync(fullPath)) {
      results.push(`  ${c.green}✓${c.reset} ${desc}: ${c.cyan}${file}${c.reset}`);
    }
  }
  results.push("");

  // 3. Dependencies analysis
  if (fs.existsSync("package.json")) {
    try {
      const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});

      results.push(`${c.bold}Dependencies${c.reset} (${deps.length} + ${devDeps.length} dev)`);

      // Categorize deps
      const frameworks = deps.filter(d => ["react", "vue", "angular", "next", "nuxt", "express", "fastify", "hono", "nest"].some(f => d.includes(f)));
      const testing = [...deps, ...devDeps].filter(d => ["jest", "vitest", "mocha", "cypress", "playwright"].some(t => d.includes(t)));
      const db = deps.filter(d => ["prisma", "drizzle", "mongoose", "typeorm", "sequelize", "pg", "mysql", "sqlite"].some(t => d.includes(t)));

      if (frameworks.length) results.push(`  Frameworks: ${c.cyan}${frameworks.join(", ")}${c.reset}`);
      if (testing.length) results.push(`  Testing: ${c.cyan}${testing.join(", ")}${c.reset}`);
      if (db.length) results.push(`  Database: ${c.cyan}${db.join(", ")}${c.reset}`);
      results.push("");
    } catch {}
  }

  // 4. Key patterns (search for common patterns)
  results.push(`${c.bold}Patterns Detected${c.reset}`);
  const patterns = [
    ["API routes", "app/api/**/*.ts", "route.ts"],
    ["React components", "components/**/*.tsx", ""],
    ["Hooks", "hooks/**/*.ts", "use*.ts"],
    ["Utils", "lib/**/*.ts", "utils/**/*.ts"],
    ["Types", "types/**/*.ts", "*.d.ts"],
  ];

  for (const [name, glob1] of patterns) {
    try {
      const found = execSync(`find . -path "./${glob1}" 2>/dev/null | head -1`, { encoding: "utf-8", cwd }).trim();
      if (found) {
        results.push(`  ${c.green}✓${c.reset} ${name}`);
      }
    } catch {}
  }
  results.push("");

  // 5. If query provided, search for it
  if (query) {
    results.push(`${c.bold}Search: "${query}"${c.reset}`);
    try {
      const searchResult = execSync(
        `grep -rn --include="*.{ts,tsx,js,jsx,py,go,rs}" "${query}" . 2>/dev/null | grep -v node_modules | head -10`,
        { encoding: "utf-8", cwd }
      ).trim();

      if (searchResult) {
        for (const line of searchResult.split("\n")) {
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match) {
            results.push(`  ${c.cyan}${match[1]}${c.reset}:${c.dim}${match[2]}${c.reset}`);
            results.push(`    ${match[3].trim().slice(0, 60)}`);
          }
        }
      } else {
        results.push(`  ${c.dim}No matches found${c.reset}`);
      }
    } catch {}
  }

  // Save insights to memory
  const memory = loadProjectMemory();
  if (!memory) {
    saveProjectMemory({
      projectPath: cwd,
      lastAccessed: Date.now(),
      files: {},
      patterns: [],
      conventions: [],
      todos: [],
      insights: [`Explored on ${new Date().toISOString().split("T")[0]}`],
    });
  }

  return results.join("\n");
}

// ============================================
// REASONING HELPERS - Compensate for weaker models
// ============================================

function buildReasoningPrompt(task: string): string {
  return `Before acting, think through this step by step:

1. **Understand**: What exactly is being asked?
2. **Locate**: What files/code are involved?
3. **Plan**: What changes are needed?
4. **Verify**: How will I check it works?

Task: ${task}

Think out loud, then act.`;
}

function buildVerificationPrompt(action: string): string {
  return `You just performed: ${action}

Before continuing, verify:
1. Did the action succeed?
2. Are there any errors in the output?
3. Does the result match expectations?
4. What should happen next?

If something went wrong, explain and try a different approach.`;
}

// Session management for multiple instances
interface Session {
  id: string;
  name: string;
  created: number;
  lastActive: number;
  cwd: string;
  model: string;
}

function saveSession(): void {
  const session: Session = {
    id: SESSION_ID,
    name: SESSION_NAME || `session-${SESSION_ID}`,
    created: Date.now(),
    lastActive: Date.now(),
    cwd: process.cwd(),
    model: CONFIG.model,
  };
  fs.writeFileSync(path.join(SESSIONS_DIR, `${SESSION_ID}.json`), JSON.stringify(session, null, 2));
}

function listSessions(): Session[] {
  const sessions: Session[] = [];
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const session = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), "utf-8"));
      sessions.push(session);
    }
  } catch {}
  return sessions.sort((a, b) => b.lastActive - a.lastActive);
}

// Global readline interface for confirmations
let globalRl: readline.Interface | null = null;

// Confirmation prompt for edits (Claude Code style)
// dangerous = true for destructive operations (rm -rf, git push --force, drop table, etc.)
async function confirmAction(action: string, details: string, dangerous: boolean = false): Promise<boolean> {
  // Always require confirmation for dangerous operations
  if (CONFIG.autoApprove) return true;

  // Auto-approve non-dangerous operations in batch mode (faster workflow)
  if (CONFIG.batchAutoApprove && !dangerous) {
    console.log(`${c.dim}↳ Auto-approved: ${action}${c.reset}`);
    return true;
  }

  return new Promise((resolve) => {
    const rl = globalRl || readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prefix = dangerous ? `${c.red}⚠${c.reset}` : `${c.yellow}?${c.reset}`;
    console.log(`\n${prefix} ${c.bold}${action}${c.reset}`);
    console.log(`${c.dim}${details}${c.reset}`);

    rl.question(`${c.dim}Proceed? [Y/n/always]:${c.reset} `, (answer) => {
      const a = answer.toLowerCase().trim();
      if (a === "always" || a === "a") {
        CONFIG.autoApprove = true;
        saveConfig({ autoApprove: true });
        console.log(`${c.dim}Auto-approve enabled for this session${c.reset}`);
        resolve(true);
      } else if (a === "n" || a === "no") {
        resolve(false);
      } else {
        resolve(true); // Default yes
      }
    });
  });
}

// ANSI colors and formatting - Claude Code exact colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  strikethrough: "\x1b[9m",
  // Colors - matched to Claude Code
  purple: "\x1b[38;5;141m",    // Light purple for branding
  magenta: "\x1b[38;5;205m",   // Pink/magenta
  green: "\x1b[38;5;114m",     // Soft green for success/additions
  yellow: "\x1b[38;5;221m",    // Warm yellow for warnings
  red: "\x1b[38;5;203m",       // Soft red for errors/deletions
  blue: "\x1b[38;5;111m",      // Soft blue for info
  cyan: "\x1b[38;5;116m",      // Cyan for paths/links
  white: "\x1b[37m",
  gray: "\x1b[38;5;245m",      // Medium gray for dimmed text
  // Backgrounds
  bgPurple: "\x1b[48;5;141m",
  bgGray: "\x1b[48;5;238m",    // Dark gray background for code
  bgGreen: "\x1b[48;5;114m",
  bgRed: "\x1b[48;5;203m",
  bgYellow: "\x1b[48;5;221m",
};

// Box drawing characters for Claude Code style UI
const box = {
  topLeft: "╭",
  topRight: "╮",
  bottomLeft: "╰",
  bottomRight: "╯",
  horizontal: "─",
  vertical: "│",
  teeRight: "├",
  teeLeft: "┤",
};

// Get terminal width
function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

// Truncate text to fit width
function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  return text.slice(0, maxWidth - 1) + "…";
}

// ============================================
// RICH TEXT RENDERING
// ============================================

// Syntax highlighting for code
const syntaxColors: Record<string, string> = {
  keyword: c.purple,
  string: c.green,
  comment: c.dim,
  number: c.yellow,
  function: c.blue,
  operator: c.magenta,
  type: c.cyan,
};

const keywords = new Set([
  "const", "let", "var", "function", "async", "await", "return", "if", "else",
  "for", "while", "class", "import", "export", "from", "default", "new", "this",
  "try", "catch", "throw", "finally", "switch", "case", "break", "continue",
  "def", "self", "None", "True", "False", "elif", "except", "lambda", "yield",
  "fn", "let", "mut", "pub", "impl", "struct", "enum", "match", "use", "mod",
]);

const types = new Set([
  "string", "number", "boolean", "void", "any", "never", "unknown", "null",
  "undefined", "int", "float", "bool", "str", "list", "dict", "tuple", "set",
  "i32", "i64", "u32", "u64", "f32", "f64", "usize", "String", "Vec", "Option",
]);

function highlightCode(code: string, lang: string): string {
  // Simple tokenizer for syntax highlighting
  let result = "";
  let i = 0;

  while (i < code.length) {
    // Comments
    if (code.slice(i, i + 2) === "//" || code[i] === "#") {
      const end = code.indexOf("\n", i);
      const comment = end === -1 ? code.slice(i) : code.slice(i, end);
      result += `${syntaxColors.comment}${comment}${c.reset}`;
      i += comment.length;
      continue;
    }

    // Strings
    if (code[i] === '"' || code[i] === "'" || code[i] === "`") {
      const quote = code[i];
      let j = i + 1;
      while (j < code.length && (code[j] !== quote || code[j - 1] === "\\")) j++;
      const str = code.slice(i, j + 1);
      result += `${syntaxColors.string}${str}${c.reset}`;
      i = j + 1;
      continue;
    }

    // Numbers
    if (/\d/.test(code[i])) {
      let j = i;
      while (j < code.length && /[\d.xXa-fA-F]/.test(code[j])) j++;
      const num = code.slice(i, j);
      result += `${syntaxColors.number}${num}${c.reset}`;
      i = j;
      continue;
    }

    // Words (keywords, types, identifiers)
    if (/[a-zA-Z_]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_]/.test(code[j])) j++;
      const word = code.slice(i, j);

      if (keywords.has(word)) {
        result += `${syntaxColors.keyword}${word}${c.reset}`;
      } else if (types.has(word)) {
        result += `${syntaxColors.type}${word}${c.reset}`;
      } else if (code[j] === "(") {
        result += `${syntaxColors.function}${word}${c.reset}`;
      } else {
        result += word;
      }
      i = j;
      continue;
    }

    // Operators
    if (/[+\-*/%=<>!&|^~?:]/.test(code[i])) {
      result += `${syntaxColors.operator}${code[i]}${c.reset}`;
      i++;
      continue;
    }

    result += code[i];
    i++;
  }

  return result;
}

// Render markdown table - Claude Code exact style (simple, clean)
function renderTable(lines: string[]): string {
  const rows = lines.map(line =>
    line.split("|").slice(1, -1).map(cell => cell.trim())
  );

  if (rows.length < 2) return lines.join("\n");

  // Calculate column widths
  const colWidths = rows[0].map((_, colIdx) =>
    Math.max(...rows.map(row => (row[colIdx] || "").length))
  );

  // Skip separator row (row 1)
  const dataRows = [rows[0], ...rows.slice(2)];
  const result: string[] = [];

  // Claude Code style: simple pipe-separated with aligned columns
  dataRows.forEach((row, rowIdx) => {
    let line = "";
    row.forEach((cell, colIdx) => {
      const padded = (cell || "").padEnd(colWidths[colIdx]);
      if (rowIdx === 0) {
        line += `${c.bold}${padded}${c.reset}  `;
      } else {
        line += `${padded}  `;
      }
    });
    result.push(line.trimEnd());

    // Add separator after header
    if (rowIdx === 0) {
      let sep = "";
      colWidths.forEach(w => {
        sep += `${c.dim}${"─".repeat(w)}${c.reset}  `;
      });
      result.push(sep.trimEnd());
    }
  });

  return result.join("\n");
}

// Format markdown content for terminal
function formatMarkdown(text: string): string {
  const lines = text.split("\n");
  let result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBuffer: string[] = [];
  let tableBuffer: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks - Claude Code exact style (minimal, just syntax highlighting)
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        const code = codeBuffer.join("\n");
        const highlighted = highlightCode(code, codeBlockLang);
        // Claude Code style: no box, just indented code with highlighting
        highlighted.split("\n").forEach(codeLine => {
          result.push(`  ${codeLine}`);
        });
        result.push(""); // Blank line after code block
        inCodeBlock = false;
        codeBuffer = [];
        codeBlockLang = "";
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        if (codeBlockLang) {
          result.push(`${c.dim}${codeBlockLang}${c.reset}`);
        }
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // Tables
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) inTable = true;
      tableBuffer.push(line);
      continue;
    } else if (inTable) {
      result.push(renderTable(tableBuffer));
      tableBuffer = [];
      inTable = false;
    }

    // Headers - Claude Code style (bold, no special colors for h2/h3)
    if (line.startsWith("### ")) {
      result.push(`\n${c.bold}${line.slice(4)}${c.reset}`);
      continue;
    }
    if (line.startsWith("## ")) {
      result.push(`\n${c.bold}${line.slice(3)}${c.reset}`);
      continue;
    }
    if (line.startsWith("# ")) {
      result.push(`\n${c.bold}${c.purple}${line.slice(2)}${c.reset}`);
      continue;
    }

    // Inline formatting - Claude Code exact style
    let formatted = line
      // Bold
      .replace(/\*\*(.+?)\*\*/g, `${c.bold}$1${c.reset}`)
      .replace(/__(.+?)__/g, `${c.bold}$1${c.reset}`)
      // Italic
      .replace(/\*(.+?)\*/g, `${c.italic}$1${c.reset}`)
      .replace(/_(.+?)_/g, `${c.italic}$1${c.reset}`)
      // Inline code - Claude Code style: subtle background
      .replace(/`([^`]+)`/g, `${c.cyan}$1${c.reset}`)
      // Bullet points - Claude Code uses simple dash
      .replace(/^(\s*)[-*] /, `$1- `)
      // Numbered lists
      .replace(/^(\s*)(\d+)\. /, `$1$2. `)
      // Checkboxes
      .replace(/\[ \]/g, `☐`)
      .replace(/\[x\]/gi, `${c.green}✓${c.reset}`);

    result.push(formatted);
  }

  // Handle remaining table
  if (inTable && tableBuffer.length > 0) {
    result.push(renderTable(tableBuffer));
  }

  return result.join("\n");
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

// Read file with line numbers (Claude Code exact style)
// Maximum lines to return without explicit range (prevents token bloat)
const MAX_LINES_DEFAULT = 2000;
const MAX_FILE_SIZE_MB = 5;

function readFile(filePath: string, startLine?: number, endLine?: number): string {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);

    // Check file size before reading to prevent memory issues
    const stats = fs.statSync(fullPath);
    const fileSizeMB = stats.size / (1024 * 1024);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return `${c.yellow}Warning:${c.reset} File is ${fileSizeMB.toFixed(1)}MB (>${MAX_FILE_SIZE_MB}MB limit).\n` +
             `${c.dim}Use offset and limit parameters to read specific portions:\n` +
             `  {"file_path": "${filePath}", "offset": 1, "limit": 500}${c.reset}`;
    }

    // Try cache first for speed
    let content = getCachedFile(fullPath);
    if (!content) {
      content = fs.readFileSync(fullPath, "utf-8");
      cacheFile(fullPath, content);
    }

    const lines = content.split("\n");

    // Track that this file has been read
    readFiles.add(fullPath);

    // Apply line range if specified, otherwise limit to MAX_LINES_DEFAULT
    const start = startLine ? Math.max(0, startLine - 1) : 0;
    let end: number;
    let truncated = false;

    if (endLine) {
      end = Math.min(lines.length, endLine);
    } else if (lines.length > MAX_LINES_DEFAULT && !startLine) {
      // Auto-limit for large files when no range specified
      end = MAX_LINES_DEFAULT;
      truncated = true;
    } else {
      end = lines.length;
    }

    const selectedLines = lines.slice(start, end);

    // Detect file extension for syntax context
    const ext = path.extname(fullPath).slice(1) || "txt";
    const fileName = path.basename(fullPath);

    // Build output with Claude Code exact format
    const result: string[] = [];

    // Claude Code shows: "    1→" format for line numbers with arrow
    const maxLineNum = end;
    const lineNumWidth = Math.max(5, String(maxLineNum).length);

    for (let i = 0; i < selectedLines.length; i++) {
      const lineNum = (start + i + 1).toString().padStart(lineNumWidth, " ");
      const line = selectedLines[i];
      // Claude Code exact format: spaces + number + arrow + tab + content
      result.push(`${c.dim}${lineNum}→${c.reset}\t${line}`);
    }

    // Footer with file info (like Claude Code)
    let rangeInfo: string;
    if (truncated) {
      rangeInfo = `lines 1-${end} of ${lines.length} (truncated, use offset/limit for more)`;
    } else if (start > 0 || end < lines.length) {
      rangeInfo = `lines ${start + 1}-${end} of ${lines.length}`;
    } else {
      rangeInfo = `${lines.length} lines`;
    }
    result.push(`\n${c.dim}${fullPath} (${rangeInfo})${c.reset}`);

    return result.join("\n");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return `${c.red}Error:${c.reset} File not found: ${filePath}\n${c.dim}Use Glob or List to find the correct path.${c.reset}`;
    }
    if (error.code === "EISDIR") {
      return `${c.red}Error:${c.reset} Path is a directory, not a file: ${filePath}\n${c.dim}Use List to view directory contents.${c.reset}`;
    }
    return `${c.red}Error reading ${filePath}:${c.reset} ${error.message}`;
  }
}

// Write file (creates directories if needed) - Claude Code exact style
function writeFile(filePath: string, content: string): string {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    const existed = fs.existsSync(fullPath);
    const fileName = path.basename(fullPath);

    // Track for rollback + backup for undo
    if (existed) {
      const originalContent = fs.readFileSync(fullPath, "utf-8");
      trackChange("edit", fullPath, originalContent);
      backupFile(fullPath);
    } else {
      trackChange("write", fullPath);
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");

    const lineCount = content.split("\n").length;
    const action = existed ? "Updated" : "Created";

    // Compact mode: shorter output
    if (CONFIG.compactMode) {
      return `${c.green}✓${c.reset} ${fileName}`;
    }

    return `${c.dim}${action} ${fullPath} (${lineCount} lines)${c.reset}`;
  } catch (error: any) {
    return `${c.red}Error writing ${filePath}:${c.reset} ${error.message}`;
  }
}

// Word-level diff: highlight specific changed words/characters
function highlightWordDiff(oldLine: string, newLine: string): { oldHighlighted: string; newHighlighted: string } {
  // Simple word-based diff
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);

  let oldHighlighted = "";
  let newHighlighted = "";

  const maxLen = Math.max(oldWords.length, newWords.length);

  for (let i = 0; i < maxLen; i++) {
    const oldWord = oldWords[i] || "";
    const newWord = newWords[i] || "";

    if (oldWord === newWord) {
      oldHighlighted += oldWord;
      newHighlighted += newWord;
    } else {
      // Highlight the different words
      if (oldWord) oldHighlighted += `${c.red}${c.strikethrough}${oldWord}${c.reset}${c.red}`;
      if (newWord) newHighlighted += `${c.green}${c.underline}${newWord}${c.reset}${c.green}`;
    }
  }

  return { oldHighlighted, newHighlighted };
}

// Generate a unified diff display with context (Claude Code exact style + word-level highlighting)
function generateDiff(
  oldString: string,
  newString: string,
  lineNumber: number,
  fileContent?: string,
  lang?: string  // Language for syntax highlighting
): string {
  const oldLines = oldString.split("\n");
  const newLines = newString.split("\n");
  const result: string[] = [];

  // Helper to apply syntax highlighting to a line
  const highlightLine = (line: string): string => {
    if (!lang) return line;
    // Apply highlighting but strip outer reset codes that would interfere with diff colors
    const highlighted = highlightCode(line, lang);
    return highlighted;
  };

  // Get context lines if file content is available
  const contextLines = 2;
  let beforeContext: string[] = [];
  let afterContext: string[] = [];

  if (fileContent) {
    const allLines = fileContent.split("\n");
    const startIdx = lineNumber - 1;
    const endIdx = startIdx + oldLines.length;

    beforeContext = allLines.slice(Math.max(0, startIdx - contextLines), startIdx);
    afterContext = allLines.slice(endIdx, Math.min(allLines.length, endIdx + contextLines));
  }

  const lineNumWidth = Math.max(4, String(lineNumber + Math.max(oldLines.length, newLines.length) + afterContext.length).length);

  // Context before (dimmed, no prefix) with syntax highlighting
  for (let i = 0; i < beforeContext.length; i++) {
    const ln = (lineNumber - beforeContext.length + i).toString().padStart(lineNumWidth, " ");
    result.push(`${c.dim}  ${ln} │ ${highlightLine(beforeContext[i])}${c.reset}`);
  }

  // For single-line changes, use word-level diff
  if (oldLines.length === 1 && newLines.length === 1) {
    const { oldHighlighted, newHighlighted } = highlightWordDiff(oldLines[0], newLines[0]);
    const ln = lineNumber.toString().padStart(lineNumWidth, " ");
    result.push(`${c.red}- ${ln} │ ${oldHighlighted}${c.reset}`);
    result.push(`${c.green}+ ${ln} │ ${newHighlighted}${c.reset}`);
  } else {
    // Multi-line: show line-by-line with word highlighting where possible
    const minLen = Math.min(oldLines.length, newLines.length);

    // Lines that can be compared
    for (let i = 0; i < minLen; i++) {
      const ln = (lineNumber + i).toString().padStart(lineNumWidth, " ");
      if (oldLines[i] === newLines[i]) {
        // Unchanged line in the middle
        result.push(`${c.dim}  ${ln} │ ${oldLines[i]}${c.reset}`);
      } else {
        const { oldHighlighted, newHighlighted } = highlightWordDiff(oldLines[i], newLines[i]);
        result.push(`${c.red}- ${ln} │ ${oldHighlighted}${c.reset}`);
        result.push(`${c.green}+ ${ln} │ ${newHighlighted}${c.reset}`);
      }
    }

    // Extra removed lines
    for (let i = minLen; i < oldLines.length; i++) {
      const ln = (lineNumber + i).toString().padStart(lineNumWidth, " ");
      result.push(`${c.red}- ${ln} │ ${oldLines[i]}${c.reset}`);
    }

    // Extra added lines
    for (let i = minLen; i < newLines.length; i++) {
      const ln = (lineNumber + i).toString().padStart(lineNumWidth, " ");
      result.push(`${c.green}+ ${ln} │ ${newLines[i]}${c.reset}`);
    }
  }

  // Context after (dimmed, no prefix) with syntax highlighting
  for (let i = 0; i < afterContext.length; i++) {
    const ln = (lineNumber + oldLines.length + i).toString().padStart(lineNumWidth, " ");
    result.push(`${c.dim}  ${ln} │ ${highlightLine(afterContext[i])}${c.reset}`);
  }

  return result.join("\n");
}

// Find the line number where a string occurs
function findLineNumber(content: string, searchString: string): number {
  const index = content.indexOf(searchString);
  if (index === -1) return -1;
  return content.substring(0, index).split("\n").length;
}

// Get language from file extension for syntax highlighting
function getLangFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c", ".h": "c",
    ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".md": "markdown",
    ".css": "css", ".scss": "scss",
    ".html": "html",
    ".sql": "sql",
  };
  return langMap[ext] || "";
}

// Edit file - replace old_string with new_string (Claude Code style)
function editFile(filePath: string, oldString: string, newString: string, replaceAll: boolean = false): string {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    const lang = getLangFromPath(fullPath);

    if (!fs.existsSync(fullPath)) {
      return `${c.red}Error:${c.reset} File not found: ${fullPath}\n` +
             `${c.dim}Hint: Use Glob or List to find the correct file path.${c.reset}`;
    }

    // Check if file was read first (Claude Code behavior)
    if (!readFiles.has(fullPath)) {
      return `${c.red}Error:${c.reset} You must read the file before editing it.\n` +
             `${c.dim}Hint: Use Read tool first: {"file_path": "${fullPath}"}${c.reset}`;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    let occurrences = content.split(oldString).length - 1;

    // If exact match fails, try with normalized whitespace
    let actualOldString = oldString;
    if (occurrences === 0) {
      // Try trimming trailing whitespace from each line
      const trimmedOld = oldString.split("\n").map(l => l.trimEnd()).join("\n");
      const trimmedContent = content.split("\n").map(l => l.trimEnd()).join("\n");
      if (trimmedContent.includes(trimmedOld)) {
        // Find the actual string in content that matches when trimmed
        const lines = content.split("\n");
        const oldLines = oldString.split("\n");
        for (let i = 0; i <= lines.length - oldLines.length; i++) {
          const slice = lines.slice(i, i + oldLines.length).join("\n");
          if (slice.split("\n").map(l => l.trimEnd()).join("\n") === trimmedOld) {
            actualOldString = slice;
            occurrences = 1;
            console.log(`${c.dim}↳ Auto-fixed trailing whitespace${c.reset}`);
            break;
          }
        }
      }
    }

    if (occurrences === 0) {
      // Try to find similar content to help debug - improved fuzzy matching
      const firstLine = oldString.split("\n")[0].trim();
      const similarLines: string[] = [];

      // Try multiple matching strategies
      const searchPatterns = [
        firstLine.slice(0, 30),           // First 30 chars
        firstLine.slice(0, 20),           // First 20 chars
        firstLine.replace(/\s+/g, " "),   // Normalized whitespace
      ].filter(p => p.length > 5);

      content.split("\n").forEach((line, idx) => {
        const normalizedLine = line.replace(/\s+/g, " ");
        for (const pattern of searchPatterns) {
          if (line.includes(pattern) || normalizedLine.includes(pattern.replace(/\s+/g, " "))) {
            const preview = line.length > 70 ? line.slice(0, 70) + "..." : line;
            similarLines.push(`  ${c.cyan}Line ${idx + 1}:${c.reset} ${preview}`);
            break; // Only add each line once
          }
        }
      });

      const preview = oldString.length > 100 ? oldString.slice(0, 100) + "..." : oldString;
      let errorMsg = `${c.red}Error:${c.reset} String not found in file.\n` +
             `${c.dim}Tried to match:${c.reset}\n` +
             `${c.bgGray}${preview}${c.reset}\n\n`;

      if (similarLines.length > 0) {
        errorMsg += `${c.yellow}Similar content found:${c.reset}\n${similarLines.slice(0, 3).join("\n")}\n\n`;
      }

      // Show whitespace visualization for first line
      const firstLineOld = oldString.split("\n")[0];
      const wsViz = firstLineOld.slice(0, 20)
        .replace(/ /g, `${c.cyan}·${c.reset}`)
        .replace(/\t/g, `${c.yellow}→${c.reset}`);

      errorMsg += `${c.dim}Whitespace in your match:${c.reset} ${wsViz}\n`;
      errorMsg += `${c.dim}(· = space, → = tab)${c.reset}\n\n`;

      errorMsg += `${c.yellow}What to do:${c.reset}\n` +
             `${c.dim}1. Use Read to get fresh file content${c.reset}\n` +
             `${c.dim}2. Copy EXACT text (including spaces/tabs)${c.reset}\n` +
             `${c.dim}3. Do NOT include line numbers like "  5 │"${c.reset}`;

      return errorMsg;
    }

    if (occurrences > 1 && !replaceAll) {
      return `${c.yellow}Warning:${c.reset} Found ${occurrences} occurrences of this string.\n` +
             `${c.dim}Options:${c.reset}\n` +
             `${c.dim}● Provide more context to make match unique${c.reset}\n` +
             `${c.dim}● Use replace_all: true to replace all occurrences${c.reset}`;
    }

    // Find line number for diff display (use the actual string we'll replace)
    const lineNumber = findLineNumber(content, actualOldString);

    // Track for rollback + backup for undo
    trackChange("edit", fullPath, content);
    backupFile(fullPath);

    // Apply the replacement (use actualOldString which may have been auto-fixed)
    const newContent = replaceAll
      ? content.split(actualOldString).join(newString)
      : content.replace(actualOldString, newString);

    fs.writeFileSync(fullPath, newContent, "utf-8");

    // Generate diff display with context from original content (with syntax highlighting)
    const diff = generateDiff(oldString, newString, lineNumber, content, lang);

    // Compact mode: shorter output
    if (CONFIG.compactMode) {
      const oldLineCount = oldString.split("\n").length;
      const newLineCount = newString.split("\n").length;
      return `${c.green}✓${c.reset} ${path.basename(fullPath)} ${c.dim}(-${oldLineCount}/+${newLineCount})${c.reset}`;
    }

    // Claude Code style: brief header then diff
    const header = `${c.dim}Updated ${path.basename(fullPath)}${c.reset}`;

    return `${header}\n\n${diff}`;
  } catch (error: any) {
    return `${c.red}Error:${c.reset} ${error.message}`;
  }
}

// Execute shell command (Claude Code exact style output)
function execShell(command: string): string {
  // Safety check for dangerous commands
  const dangerous = ["rm -rf /", "rm -rf ~", "sudo rm", "> /dev/sda", "mkfs", "dd if="];
  if (dangerous.some(d => command.includes(d))) {
    return `${c.red}Blocked:${c.reset} Command blocked for safety reasons.`;
  }

  const startTime = Date.now();

  try {
    const result = execSync(command, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60000,
      cwd: process.cwd(),
    });

    const elapsed = Date.now() - startTime;
    const output = result.trim();

    if (!output) {
      return `${c.dim}(no output, ${elapsed}ms)${c.reset}`;
    }

    // Claude Code style: just output the lines directly
    return `${output}\n${c.dim}(${elapsed}ms)${c.reset}`;
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const stdout = error.stdout?.trim() || "";
    const stderr = error.stderr?.trim() || "";
    const output = [stdout, stderr].filter(Boolean).join("\n");
    const exitCode = error.status || 1;

    if (!output) {
      return `${c.red}exit ${exitCode}${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`;
    }

    return `${output}\n${c.red}exit ${exitCode}${c.reset} ${c.dim}(${elapsed}ms)${c.reset}`;
  }
}

// List directory (Claude Code exact style)
function listDir(dirPath: string): string {
  try {
    const fullPath = path.resolve(process.cwd(), dirPath);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    const sorted = entries.sort((a, b) => {
      // Directories first
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const result: string[] = [];

    // Claude Code style: simple list with / suffix for directories
    const displayEntries = sorted.slice(0, 50);
    for (const e of displayEntries) {
      if (e.isDirectory()) {
        result.push(`${c.blue}${e.name}/${c.reset}`);
      } else {
        result.push(e.name);
      }
    }

    if (entries.length > 50) {
      result.push(`${c.dim}... and ${entries.length - 50} more${c.reset}`);
    }

    result.push(`\n${c.dim}${fullPath} (${entries.length} items)${c.reset}`);

    return result.join("\n");
  } catch (error: any) {
    return `${c.red}Error listing ${dirPath}:${c.reset} ${error.message}`;
  }
}

// Search for files by name pattern (Claude Code exact style)
// Uses pure Node.js for cross-platform compatibility
function searchFiles(pattern: string, dir: string = "."): string {
  const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv", "venv", "target", ".cache"]);
  const MAX_FILES = 100;
  const MAX_DEPTH = 10;

  // Convert glob pattern to regex
  function globToRegex(glob: string): RegExp {
    // Handle brace expansion: *.{ts,tsx} -> (ts|tsx)
    let pattern = glob.replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(",").join("|")})`);
    // Escape special regex chars except * and ?
    pattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    // Convert glob wildcards to regex
    pattern = pattern.replace(/\*\*/g, "{{GLOBSTAR}}");
    pattern = pattern.replace(/\*/g, "[^/]*");
    pattern = pattern.replace(/\?/g, ".");
    pattern = pattern.replace(/\{\{GLOBSTAR\}\}/g, ".*");
    return new RegExp(`^${pattern}$`);
  }

  // Recursive file search
  function walkDir(currentDir: string, depth: number, results: string[]): void {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES) break;

        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(dir, fullPath);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
            walkDir(fullPath, depth + 1, results);
          }
        } else if (entry.isFile()) {
          results.push(relativePath);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  try {
    const fullDir = path.resolve(process.cwd(), dir);

    // Parse patterns (handle comma-separated: "*.ts,*.tsx")
    let patterns: string[] = [];
    if (pattern.includes(",") && !pattern.includes("{")) {
      patterns = pattern.split(",").map(p => p.trim());
    } else {
      patterns = [pattern];
    }

    // Remove leading **/ as we search recursively anyway
    const cleanedPatterns = patterns.map(p => p.replace(/^\*\*\//, ""));
    const regexes = cleanedPatterns.map(globToRegex);

    // Walk directory and collect all files
    const allFiles: string[] = [];
    walkDir(fullDir, 0, allFiles);

    // Filter files by pattern (match against filename, not full path for simple patterns)
    const matchedFiles = allFiles.filter(filePath => {
      const fileName = path.basename(filePath);
      return regexes.some(regex =>
        pattern.includes("/") || pattern.includes("**")
          ? regex.test(filePath)  // Match full path for path patterns
          : regex.test(fileName)   // Match filename for simple patterns
      );
    });

    if (matchedFiles.length === 0) {
      return `${c.dim}No files matching "${pattern}"${c.reset}`;
    }

    // Sort by path for consistency
    matchedFiles.sort();

    // Claude Code style: just list the files
    const output: string[] = [];
    for (const f of matchedFiles.slice(0, MAX_FILES)) {
      output.push(`${c.cyan}${f}${c.reset}`);
    }

    const truncated = matchedFiles.length > MAX_FILES ? " (truncated)" : "";
    output.push(`\n${c.dim}${Math.min(matchedFiles.length, MAX_FILES)} files found${truncated}${c.reset}`);
    return output.join("\n");
  } catch (error: any) {
    return `${c.red}Error searching:${c.reset} ${error.message}`;
  }
}

// Grep - search content in files (Claude Code exact style)
function grepSearch(pattern: string, pathOrGlob: string = "."): string {
  try {
    // File extensions to search - use multiple --include for cross-platform compatibility
    // (brace expansion like --include="*.{js,ts}" doesn't work on macOS grep)
    const extensions = ["js", "ts", "tsx", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "css", "html", "json", "md", "yaml", "yml", "sh", "sql", "vue", "svelte"];
    const includeArgs = extensions.map(ext => `--include="*.${ext}"`).join(" ");

    // Escape pattern for shell (but preserve regex special chars for grep)
    const escapedPattern = pattern.replace(/"/g, '\\"');

    const result = execSync(
      `grep -rn ${includeArgs} --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build "${escapedPattern}" "${pathOrGlob}" 2>/dev/null | head -100`,
      { encoding: "utf-8", cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 }
    ).trim();

    if (!result) return `${c.dim}No matches for "${pattern}"${c.reset}`;

    const matches = result.split("\n");
    const output: string[] = [];

    // Claude Code style: file:line content with highlighted matches
    for (const line of matches) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, content] = match;
        // Highlight the match in the content (escape regex special chars in pattern for highlighting)
        try {
          const highlighted = content.replace(
            new RegExp(`(${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi"),
            `${c.yellow}$1${c.reset}`
          );
          output.push(`${c.cyan}${file}${c.reset}:${c.dim}${lineNum}${c.reset}: ${highlighted}`);
        } catch {
          // If regex fails, just show the line
          output.push(`${c.cyan}${file}${c.reset}:${c.dim}${lineNum}${c.reset}: ${content}`);
        }
      } else {
        output.push(line);
      }
    }

    const truncated = matches.length >= 100 ? " (truncated)" : "";
    output.push(`\n${c.dim}${matches.length} matches${truncated}${c.reset}`);
    return output.join("\n");
  } catch {
    return `${c.dim}No matches found${c.reset}`;
  }
}

// Format tool arguments for display (Claude Code style)
function formatToolArgs(normalizedName: string, args: Record<string, any>): string {
  switch (normalizedName) {
    case "read_file": {
      const filePath = args.path || args.file_path || "";
      const offset = args.offset || args.start_line;
      const limit = args.limit || args.end_line;
      const range = offset ? `:${offset}${limit ? `-${offset + limit}` : ""}` : "";
      return `${c.cyan}${filePath}${range}${c.reset}`;
    }

    case "edit_file": {
      const editPath = args.path || args.file_path || "";
      return `${c.cyan}${editPath}${c.reset}`;
    }

    case "write_file": {
      const writePath = args.path || args.file_path || "";
      const lines = (args.content || "").split("\n").length;
      return `${c.cyan}${writePath}${c.reset} ${c.dim}(${lines} lines)${c.reset}`;
    }

    case "shell_exec": {
      const cmd = truncate(args.command || args.cmd || "", 60);
      return `${c.yellow}${cmd}${c.reset}`;
    }

    case "list_directory": {
      return `${c.cyan}${args.path || args.directory || "."}${c.reset}`;
    }

    case "grep": {
      return `${c.yellow}"${args.pattern || args.query}"${c.reset} ${c.dim}in${c.reset} ${args.path || "."}`;
    }

    case "search_files": {
      return `${c.yellow}"${args.pattern || args.glob}"${c.reset}`;
    }

    case "web_search": {
      return `${c.yellow}"${args.query || args.q || ""}"${c.reset}`;
    }

    default: {
      const preview = JSON.stringify(args).slice(0, 60);
      return `${c.dim}${preview}${preview.length >= 60 ? "..." : ""}${c.reset}`;
    }
  }
}

// Normalize tool name to internal name (handles Claude Code-style names)
function normalizeToolName(name: string): string {
  const map: Record<string, string> = {
    // Claude Code-style names (capitalized)
    Read: "read_file",
    Edit: "edit_file",
    Write: "write_file",
    Bash: "shell_exec",
    Glob: "search_files",
    Grep: "grep",
    List: "list_directory",
    WebSearch: "web_search",
    Search: "web_search",
    // Legacy names
    read_file: "read_file",
    write_file: "write_file",
    edit_file: "edit_file",
    str_replace_editor: "edit_file",
    shell_exec: "shell_exec",
    exec_shell: "shell_exec",
    run_command: "shell_exec",
    bash: "shell_exec",
    list_directory: "list_directory",
    list_dir: "list_directory",
    ls: "list_directory",
    search_files: "search_files",
    find_files: "search_files",
    glob: "search_files",
    grep: "grep",
    search_content: "grep",
    grep_search: "grep",
    web_search: "web_search",
    search_web: "web_search",
  };
  return map[name] || name;
}

// Get friendly tool name for display
function getToolDisplayName(name: string): string {
  const normalized = normalizeToolName(name);
  const displayNames: Record<string, string> = {
    read_file: "Read",
    write_file: "Write",
    edit_file: "Edit",
    shell_exec: "Bash",
    list_directory: "List",
    search_files: "Glob",
    grep: "Grep",
    web_search: "WebSearch",
  };
  return displayNames[normalized] || name;
}

async function executeTool(name: string, args: Record<string, any>): Promise<string> {
  // Normalize tool name to handle both Claude Code-style and legacy names
  const normalizedName = normalizeToolName(name);

  // Check for repeated failures (prevent loops)
  const repeatedError = checkRepeatedFailure(normalizedName, args);
  if (repeatedError) {
    console.log(`\n${c.yellow}⚠ Loop detected${c.reset}`);
    console.log(`${c.dim}${repeatedError}${c.reset}`);
    return `LOOP DETECTED: ${repeatedError}`;
  }

  // Check for exact same call repeated (loop detection)
  if (detectLoop(normalizedName, args)) {
    console.log(`\n${c.yellow}⚠ Repeated action detected${c.reset}`);
    const msg = `You are repeating the same action multiple times. This usually means something is wrong.\n` +
                `Please STOP and try a different approach, or ask the user for guidance.`;
    console.log(`${c.dim}${msg}${c.reset}`);
    return msg;
  }

  // Show tool being executed (Claude Code exact style)
  const displayName = getToolDisplayName(name);
  const formattedArgs = formatToolArgs(normalizedName, args);
  // Claude Code uses: ● ToolName arguments
  console.log(`\n${c.purple}●${c.reset} ${c.bold}${displayName}${c.reset} ${formattedArgs}`);

  // Validate required arguments
  const filePath = args.path || args.file_path;
  if (["read_file", "write_file", "edit_file"].includes(normalizedName) && !filePath) {
    const result = `${c.red}Error:${c.reset} Missing file_path argument. The model may need to retry.`;
    recordFailure(normalizedName, args, "Missing file_path");
    console.log(result);
    return result;
  }

  let result: string;
  switch (normalizedName) {
    case "read_file":
      result = readFile(filePath, args.offset || args.start_line, args.limit || args.end_line);
      break;

    case "write_file": {
      const content = args.content;
      if (!content && content !== "") {
        result = `${c.red}Error:${c.reset} Missing content for write. The model should provide file content.`;
        break;
      }
      const lineCount = content.split("\n").length;
      const confirmed = await confirmAction(
        `Create/overwrite file`,
        `${filePath} (${lineCount} lines)`
      );
      if (!confirmed) {
        result = `${c.yellow}Skipped:${c.reset} User declined to write file`;
        break;
      }

      // Pre-write hook
      const preWriteHook = await executeHooks("pre_write", { file: filePath });
      if (preWriteHook.blocked) {
        result = `${c.yellow}Blocked by hook:${c.reset} ${preWriteHook.message || "Write not allowed"}`;
        break;
      }

      result = writeFile(filePath, content);

      // Post-write hook (on success)
      if (!result.includes("Error:")) {
        await executeHooks("post_write", { file: filePath });
      }
      break;
    }

    case "edit_file": {
      const oldStr = args.old_string || args.old_str;
      const newStr = args.new_string || args.new_str;

      if (!oldStr) {
        result = `${c.red}Error:${c.reset} Missing old_string. The model must specify exact text to replace.`;
        recordFailure(normalizedName, args, "Missing old_string");
        break;
      }
      if (newStr === undefined) {
        result = `${c.red}Error:${c.reset} Missing new_string. The model must specify replacement text.`;
        recordFailure(normalizedName, args, "Missing new_string");
        break;
      }

      // Check for common mistakes - line numbers in old_string
      const lineNumPattern = /^\s*\d+\s*[→│|]\s*/;
      if (lineNumPattern.test(oldStr)) {
        result = `${c.red}Error:${c.reset} old_string contains line numbers.\n\n` +
                 `The format "${c.cyan}  123→${c.reset}  code" means:\n` +
                 `  - "${c.dim}123→${c.reset}" is the line number (DO NOT copy this)\n` +
                 `  - After the arrow/separator is the actual code\n\n` +
                 `${c.yellow}What to do:${c.reset}\n` +
                 `1. Re-read the file with the Read tool\n` +
                 `2. Copy ONLY the text after the → or │ separator\n` +
                 `3. Include proper indentation (spaces/tabs from the actual code)`;
        recordFailure(normalizedName, args, "Line numbers in old_string");
        break;
      }

      // Show preview and confirm
      const oldPreview = oldStr.length > 60 ? oldStr.slice(0, 60) + "..." : oldStr;
      const newPreview = newStr.length > 60 ? newStr.slice(0, 60) + "..." : newStr;
      const confirmed = await confirmAction(
        `Edit file`,
        `${filePath}\n  - "${oldPreview}"\n  + "${newPreview}"`
      );
      if (!confirmed) {
        result = `${c.yellow}Skipped:${c.reset} User declined edit. Try a different approach or ask what they want.`;
        break;
      }

      result = editFile(filePath, oldStr, newStr, args.replace_all || false);

      // Smart error recovery: if edit failed, auto-read the file and include fresh content
      if (result.includes("not found") || result.includes("String not found")) {
        recordFailure(normalizedName, args, result.slice(0, 100));

        // Auto-read the file so model has fresh content
        console.log(`\n${c.yellow}↻${c.reset} ${c.dim}Auto-reading file for recovery...${c.reset}`);
        const freshContent = readFile(filePath);
        result += `\n\n${c.cyan}[AUTO-RECOVERY]${c.reset} Here is the current file content. Find the EXACT text you want to replace:\n\n${freshContent}`;
      }
      break;
    }

    case "shell_exec": {
      const cmd = args.command || args.cmd;
      if (!cmd) {
        result = `${c.red}Error:${c.reset} Missing command. The model should specify a shell command.`;
        break;
      }

      // Confirm dangerous commands (always require confirmation, even in batch mode)
      const dangerousPatterns = ["rm ", "rm -rf", "rmdir", "mv ", "git push", "git push --force", "git reset", "drop ", "delete ", "truncate "];
      const isDangerous = dangerousPatterns.some(d => cmd.toLowerCase().includes(d));
      if (isDangerous) {
        const confirmed = await confirmAction(
          `Run potentially destructive command`,
          cmd,
          true // Mark as dangerous - always requires confirmation
        );
        if (!confirmed) {
          result = `${c.yellow}Skipped:${c.reset} User declined command`;
          break;
        }
      }

      // Pre-shell hook
      const preShellHook = await executeHooks("pre_shell", { file: cmd });
      if (preShellHook.blocked) {
        result = `${c.yellow}Blocked by hook:${c.reset} ${preShellHook.message || "Command not allowed"}`;
        break;
      }

      result = execShell(cmd);

      // Post-shell hook
      await executeHooks("post_shell", { file: cmd });
      break;
    }

    case "list_directory":
      result = listDir(args.path || args.directory || ".");
      break;

    case "search_files":
      result = searchFiles(args.pattern || args.glob, args.path || args.directory || ".");
      break;

    case "grep":
      result = grepSearch(args.pattern || args.query, args.path || args.directory || ".");
      break;

    case "web_search":
      result = await webSearch(args.query || args.q || "");
      break;

    default:
      // Check if this is an MCP tool (figma_, github_, slack_, notion_)
      if (name.startsWith("figma_")) {
        result = await executeFigmaTool(name, args);
      } else if (name.startsWith("github_") || name.startsWith("slack_") || name.startsWith("notion_")) {
        result = `${c.yellow}MCP tool not yet implemented:${c.reset} ${name}. Run /mcp to see available integrations.`;
      } else {
        result = `${c.yellow}Unknown tool:${c.reset} ${name}. Available: Read, Edit, Write, Bash, List, Glob, Grep, WebSearch`;
      }
  }

  // Show result with line limit (Claude Code style - no box, just content)
  const resultLines = result.split("\n");
  const maxLines = 40;

  if (resultLines.length > maxLines) {
    // Show first portion with truncation indicator
    console.log(resultLines.slice(0, maxLines).join("\n"));
    console.log(`${c.dim}... ${resultLines.length - maxLines} more lines${c.reset}`);
  } else {
    console.log(result);
  }

  // Add recovery instruction on errors to prevent asking user for help
  if (result.includes("Error:") || result.includes("not found")) {
    result += "\n\n[RECOVERY INSTRUCTION: Do NOT ask the user for help. Use tools to find alternatives. After 3 failed attempts at the same operation, explain what you tried and STOP.]";
  }

  return result;
}

// CLI instance ID — registered with API for dashboard visibility
let cliInstanceId: string | null = null;

// Register CLI instance with API (shows in dashboard)
async function checkApiConnectivity(): Promise<boolean> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(`${CONFIG.apiUrl}/api/health`, { signal: ac.signal });
    clearTimeout(t);
    if (res.ok) return true;
    const text = await res.text();
    if (res.status === 404 || text.trim().startsWith("<!")) {
      console.log(`\n${c.yellow}⚠ API not reachable${c.reset} - Server at ${CONFIG.apiUrl} returned 404.\n`);
      console.log(`${c.dim}Start the Bubbl server: cd app && npm run dev (from Bubbl project root)${c.reset}\n`);
      return false;
    }
    return true;
  } catch (e: any) {
    const code = e.cause?.code || e.code;
    if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ENOTFOUND") {
      console.log(`\n${c.yellow}⚠ Cannot connect to ${CONFIG.apiUrl}${c.reset}\n`);
      console.log(`${c.dim}Start the Bubbl server: cd app && npm run dev (from Bubbl project root)${c.reset}\n`);
      return false;
    }
    return true; // other errors, allow to proceed
  }
}

async function registerCliInstance(): Promise<void> {
  if (!CONFIG.apiKey || cliInstanceId) return;
  try {
    const name = `CLI ${process.cwd().split("/").pop() || "session"}`;
    const res = await fetch(`${CONFIG.apiUrl}/api/instances`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        name,
        model: CONFIG.model,
        source: "cli",
      }),
    });
    if (res.ok) {
      const data = await res.json() as { instance?: { id?: string } };
      cliInstanceId = data.instance?.id || null;
    }
  } catch {}
}

// Message history (supports multimodal content for vision models)
interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;  // Can be base64 data URL or http(s) URL
    detail?: "low" | "high" | "auto";
  };
}

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

// ============================================
// IMAGE SUPPORT - Screenshots and image analysis
// ============================================

// Supported image formats
const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

// Read image file and convert to base64 data URL
function readImageAsBase64(imagePath: string): string | null {
  try {
    const fullPath = path.resolve(process.cwd(), imagePath);

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
      return null;
    }

    const imageBuffer = fs.readFileSync(fullPath);
    const base64 = imageBuffer.toString("base64");

    // Determine MIME type
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
    };
    const mimeType = mimeTypes[ext] || "image/png";

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    return null;
  }
}

// Capture screenshot (macOS)
function captureScreenshot(): string | null {
  try {
    const tempPath = path.join(os.tmpdir(), `bubbl-screenshot-${Date.now()}.png`);

    // Use macOS screencapture command
    execSync(`screencapture -x "${tempPath}"`, { encoding: "utf-8" });

    if (fs.existsSync(tempPath)) {
      const dataUrl = readImageAsBase64(tempPath);
      // Clean up temp file
      fs.unlinkSync(tempPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Capture specific window or selection
function captureScreenshotInteractive(): string | null {
  try {
    const tempPath = path.join(os.tmpdir(), `bubbl-screenshot-${Date.now()}.png`);

    // Use macOS screencapture with interactive selection
    execSync(`screencapture -i "${tempPath}"`, { encoding: "utf-8" });

    if (fs.existsSync(tempPath)) {
      const dataUrl = readImageAsBase64(tempPath);
      fs.unlinkSync(tempPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Paste image from clipboard (macOS)
function pasteImageFromClipboard(): string | null {
  try {
    const tempPath = path.join(os.tmpdir(), `bubbl-paste-${Date.now()}.png`);

    // Use pngpaste to get image from clipboard (brew install pngpaste)
    // Fallback to osascript if pngpaste not available
    try {
      execSync(`pngpaste "${tempPath}" 2>/dev/null`, { encoding: "utf-8" });
    } catch {
      // Try osascript fallback
      const script = `
        set tempFile to POSIX file "${tempPath}"
        try
          set theImage to the clipboard as «class PNGf»
          set theFile to open for access tempFile with write permission
          write theImage to theFile
          close access theFile
          return "ok"
        on error
          return "no image"
        end try
      `;
      const result = execSync(`osascript -e '${script}'`, { encoding: "utf-8" }).trim();
      if (result === "no image") {
        return null;
      }
    }

    if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
      const dataUrl = readImageAsBase64(tempPath);
      fs.unlinkSync(tempPath);
      return dataUrl;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Create a multimodal message with image
function createImageMessage(text: string, imageDataUrl: string): Message {
  return {
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: {
          url: imageDataUrl,
          detail: "high"
        }
      },
      {
        type: "text",
        text: text
      }
    ]
  };
}

// Get image dimensions from base64 (approximate from file size)
function getImageInfo(imagePath: string): { size: string; dimensions: string } | null {
  try {
    const fullPath = path.resolve(process.cwd(), imagePath);
    const stats = fs.statSync(fullPath);
    const sizeKB = Math.round(stats.size / 1024);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    const size = stats.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

    return { size, dimensions: "unknown" };
  } catch {
    return null;
  }
}

// Compact system prompt for speed mode (much faster responses)
function buildSpeedPrompt(): string {
  const cwd = process.cwd();
  return `You are Bubbl, a fast AI coding assistant. Be concise.

CWD: ${cwd}

Tools: Read, Edit, Write, Bash, Glob, Grep, List, WebSearch

Edit rules:
- Read file FIRST (required)
- old_string must match EXACTLY (no line numbers like "5→")
- On error: re-read file, try again with fresh content

Be brief. Act fast. Ask if unclear.`;
}

// Build dynamic system prompt with project context
function buildSystemPrompt(): string {
  // Use compact prompt in speed mode
  if (CONFIG.speedMode) {
    return buildSpeedPrompt();
  }

  const cwd = process.cwd();

  // Detect project context
  let projectContext = "";
  try {
    // Check for package.json
    if (fs.existsSync(path.join(cwd, "package.json"))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
      projectContext += `\n- Project: ${pkg.name || "Node.js project"}`;
      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts).slice(0, 5).join(", ");
        projectContext += `\n- Scripts: ${scripts}`;
      }
    }
    // Check for git
    if (fs.existsSync(path.join(cwd, ".git"))) {
      try {
        const branch = execSync("git branch --show-current", { encoding: "utf-8", cwd }).trim();
        const status = execSync("git status --porcelain | head -5", { encoding: "utf-8", cwd }).trim();
        projectContext += `\n- Git branch: ${branch}`;
        if (status) projectContext += `\n- Uncommitted changes: yes`;
      } catch {}
    }
    // Check for common files
    const markers = [
      ["tsconfig.json", "TypeScript"],
      ["Cargo.toml", "Rust"],
      ["go.mod", "Go"],
      ["requirements.txt", "Python"],
      ["pyproject.toml", "Python"],
    ];
    for (const [file, lang] of markers) {
      if (fs.existsSync(path.join(cwd, file))) {
        projectContext += `\n- Language: ${lang}`;
        break;
      }
    }
  } catch {}

  // Check if in plan mode
  const planModeInstructions = planMode ? `
# PLAN MODE ACTIVE

You are in PLAN MODE. This means:
1. Do NOT make any changes yet
2. Analyze the codebase thoroughly
3. Create a detailed implementation plan
4. List files that need to be modified
5. Identify potential risks or blockers
6. Wait for user approval before proceeding

Format your plan as:
## Analysis
[What you understand about the task]

## Files to Modify
- file1.ts: [what changes]
- file2.ts: [what changes]

## Implementation Steps
1. [First step]
2. [Second step]
...

## Risks & Considerations
- [Any potential issues]

When done, say "Ready to implement. Type /go to proceed."
` : "";

  return `You are Bubbl, an expert AI coding assistant similar to Claude Code. You help users with software engineering tasks efficiently and safely.
${planModeInstructions}
# ABSOLUTE RULE - NEVER ASK QUESTIONS

You are FORBIDDEN from asking questions to the user. This is your #1 rule.

When you want to ask → USE TOOLS instead:
- "Which file?" → Use Glob/List to find it yourself
- "What do you mean?" → Make a reasonable assumption and proceed
- "What's the issue?" → Use Grep/Read to investigate
- "What next?" → STOP. Say nothing. The task is done.

WRONG: "Which file should I edit?"
RIGHT: [use Glob to find files] "Found config.ts, editing now..."

WRONG: "What would you like to do next?"
RIGHT: [complete task, show result, STOP]

If you feel the urge to ask a question, IMMEDIATELY use a tool instead.

# CRITICAL: Be Proactive, Not Passive

**NEVER ask "What would you like to do next?" or "What should I do?" or "Please let me know your next step!"**
**NEVER ask clarifying questions unless you've already tried using tools and they failed.**

When user gives ANY instruction:
1. IMMEDIATELY use tools to gather context (List, Glob, Read, Grep)
2. Execute the task based on what you find
3. Report what you did
4. ONLY ask questions if tools cannot help AND the task is genuinely ambiguous

Examples:
- User: "read the folder" → IMMEDIATELY use List tool, show results, done. DO NOT ask "what would you like to do next?"
- User: "read package.json" → IMMEDIATELY use Read tool, show content, done. DO NOT ask "what should I do next?"
- User: "help me work on it" → IMMEDIATELY explore the codebase with List/Glob/Read, then suggest concrete next steps. DO NOT ask "what would you like to do?"

# Your Approach

1. **Act immediately** - Use tools FIRST, ask questions NEVER (unless tools fail)
2. **Explore automatically** - When user mentions files/projects, use List/Glob/Read without asking
3. **Make reasonable assumptions** - Proceed with best guess based on context
4. **Report results** - Show what you found/did, then stop. Do NOT ask follow-up questions.

# Environment
- Working directory: ${cwd}
- Platform: ${process.platform}${projectContext}
${getCodebaseContext()}

# Tools Available

## Read - ALWAYS use before editing
\`\`\`json
{"file_path": "/absolute/path/to/file"}
\`\`\`
You MUST read a file before you can edit it (enforced).

## Edit - For precise changes
\`\`\`json
{"file_path": "/path", "old_string": "exact text", "new_string": "replacement"}
\`\`\`

CRITICAL EDIT RULES:
1. old_string must match EXACTLY (whitespace matters!)
2. NEVER include line numbers like "5→" in old_string
3. Copy text exactly from Read output (after the → arrow)
4. If match fails, RE-READ the file and try with fresh content

## Write - For new files only
\`\`\`json
{"file_path": "/path/to/new/file", "content": "content"}
\`\`\`

## Bash - Shell commands
\`\`\`json
{"command": "npm test"}
\`\`\`
Good for: git, npm, scripts. NOT for reading/editing files.

## Glob - Find files
\`\`\`json
{"pattern": "**/*.ts", "path": "src"}
\`\`\`

## Grep - Search content
\`\`\`json
{"pattern": "functionName", "path": "."}
\`\`\`

## List - Directory contents
\`\`\`json
{"path": "src/components"}
\`\`\`

## WebSearch - Search the web
\`\`\`json
{"query": "how to implement OAuth in Node.js"}
\`\`\`
Use for: documentation, API references, error solutions, best practices.
${getMCPToolsPrompt()}
# Error Recovery (CRITICAL)

When an edit fails with "string not found":
1. **Immediately re-read the file** - don't guess
2. Look at the ACTUAL content (not what you remember)
3. Copy the EXACT text including all whitespace
4. The line format is "  123→<tab>content" - copy only after the tab

If same error twice: STOP. Tell user what's wrong. Ask for help.

NEVER retry the exact same action. ALWAYS re-read on failure.

# Response Style
- Be concise and direct
- Show your reasoning briefly
- Use tools efficiently (don't over-explain)
- NEVER include questions in your responses like:
  * "What would you like to do next?"
  * "Please let me know your next step"
  * "What should I do?"
  * "Could you specify..."
  * "Let me know what you'd like..."
- After using tools and showing results, STOP. Just show what you found/did.
- If you need to ask something, it means you should use MORE tools instead.

# Reasoning Process (IMPORTANT)
For ANY task:
1. **Understand** - What is being asked? (interpret generously)
2. **Act immediately** - Use List/Glob/Read/Grep to gather context (don't ask which files)
3. **Execute** - Do the task based on what you found
4. **Report** - Show results and stop. NO follow-up questions.

When unsure, USE TOOLS FIRST. Only ask the user if:
- Tools failed completely AND
- The task is genuinely impossible without clarification

${getMemoryContext()}

You are the user's coding partner. Be proactive and helpful. Take action immediately, ask questions ONLY as absolute last resort after tools fail.`;
}

const messages: Message[] = [
  {
    role: "system",
    content: buildSystemPrompt(),
  },
];

// Loading spinner - Claude Code style
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerFrame = 0;
let spinnerStartTime = 0;

function startSpinner(message: string = "Thinking"): void {
  spinnerStartTime = Date.now();
  spinnerFrame = 0;
  updateThinking("analyzing", message);

  // Claude Code style: shows model name with spinner + thinking context
  const modelShort = CONFIG.model.split(":")[0].split("/").pop() || CONFIG.model;
  const thinkingCtx = getThinkingDisplay();
  const displayMsg = thinkingCtx || `${modelShort} is ${message.toLowerCase()}`;

  process.stdout.write(`\n${c.purple}${spinnerFrames[spinnerFrame]}${c.reset} ${c.dim}${displayMsg}...${c.reset}`);

  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % spinnerFrames.length;
    const elapsed = ((Date.now() - spinnerStartTime) / 1000).toFixed(1);
    const ctx = getThinkingDisplay() || `${modelShort} is ${message.toLowerCase()}`;
    process.stdout.clearLine?.(0);
    process.stdout.cursorTo?.(0);
    process.stdout.write(`${c.purple}${spinnerFrames[spinnerFrame]}${c.reset} ${c.dim}${ctx}... ${elapsed}s${c.reset}`);
  }, 80);
}

function stopSpinner(finalMessage?: string): number {
  const elapsed = Date.now() - spinnerStartTime;
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
  }
  process.stdout.clearLine?.(0);
  process.stdout.cursorTo?.(0);
  if (finalMessage) {
    console.log(`${c.green}✓${c.reset} ${c.dim}${finalMessage}${c.reset}`);
  }
  return elapsed;
}

// Detect if content has special formatting (code blocks, tables)
function hasSpecialFormatting(text: string): boolean {
  return text.includes("```") ||
         (text.includes("|") && /\|.*\|/.test(text)) ||
         text.includes("**") ||
         /^#{1,3} /m.test(text);
}

// Stream response handler for faster output with rich formatting (Claude Code style)
async function streamChat(response: Response): Promise<{ content: string; tool_calls: any[] }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let tool_calls: any[] = [];
  let isFirstChunk = true;
  let rawOutput = ""; // Buffer for re-rendering
  let rawLineCount = 0;
  const displayedToolNames = new Set<number>(); // Track which tool names we've shown

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;

        if (delta?.content) {
          if (isFirstChunk) {
            stopSpinner();
            process.stdout.write("\n"); // Single newline after spinner
            isFirstChunk = false;
          }
          content += delta.content;
          rawOutput += delta.content;

          // Count newlines for later clearing
          if (delta.content.includes("\n")) {
            rawLineCount += (delta.content.match(/\n/g) || []).length;
          }

          // Stream raw output (will re-render formatted at end if needed)
          process.stdout.write(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              while (tool_calls.length <= tc.index) {
                tool_calls.push({ id: "", function: { name: "", arguments: "" } });
              }
              if (tc.id) tool_calls[tc.index].id = tc.id;
              if (tc.function?.name) {
                tool_calls[tc.index].function.name = tc.function.name;
                // Show tool name immediately when it appears
                if (!displayedToolNames.has(tc.index)) {
                  displayedToolNames.add(tc.index);
                  if (isFirstChunk) {
                    stopSpinner();
                    process.stdout.write("\n");
                    isFirstChunk = false;
                  }
                  process.stdout.write(`${c.dim}→ ${tc.function.name}${c.reset}`);
                }
              }
              if (tc.function?.arguments) {
                tool_calls[tc.index].function.arguments += tc.function.arguments;
                // Show a subtle progress indicator
                if (tool_calls[tc.index].function.arguments.length % 50 === 0) {
                  process.stdout.write(`${c.dim}.${c.reset}`);
                }
              }
            }
          }
        }
      } catch {}
    }
  }

  // Clear tool streaming line if we displayed tool names
  if (displayedToolNames.size > 0) {
    process.stdout.write(`\r\x1b[2K`); // Clear the streaming dots
  }

  // If content has special formatting, clear and re-render with formatting
  if (content && hasSpecialFormatting(content)) {
    // Move cursor up and clear the raw output, then print formatted
    for (let i = 0; i <= rawLineCount; i++) {
      process.stdout.write("\x1b[A\x1b[2K"); // Move up and clear line
    }
    process.stdout.write(`\r\x1b[2K`); // Clear current line
    console.log(formatMarkdown(content));
  } else if (content) {
    console.log(); // Just add a newline
  }

  return { content, tool_calls: tool_calls.filter(tc => tc.id && tc.function.name) };
}

// Chat with image - sends multimodal message to vision-capable model
async function chatWithImage(prompt: string, imageDataUrl: string): Promise<void> {
  startSpinner("analyzing image");

  currentAbortController = new AbortController();
  const timeoutId = setTimeout(() => currentAbortController?.abort(), CONFIG.timeout);

  try {
    // Build messages with the image content
    const imageContent: ContentPart[] = [
      {
        type: "image_url",
        image_url: {
          url: imageDataUrl,
          detail: "high"
        }
      },
      {
        type: "text",
        text: prompt
      }
    ];

    // Get recent conversation context (last few messages) without images
    const contextMessages = messages.slice(-6).map(m => {
      // Convert any multimodal messages to text-only for context
      if (Array.isArray(m.content)) {
        const textParts = m.content.filter(p => p.type === "text").map(p => p.text).join("\n");
        return { ...m, content: textParts || "[image]" };
      }
      return m;
    });

    const requestMessages = [
      { role: "system", content: buildSystemPrompt() },
      ...contextMessages.slice(0, -1), // Exclude the last one which is our image message
      { role: "user", content: imageContent }
    ];

    const response = await fetch(`${CONFIG.apiUrl}/api/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CONFIG.apiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.model,
        messages: requestMessages,
        stream: true,
        project_root: process.cwd(),
        agentic: false,
        max_tokens: CONFIG.speedMode ? 2048 : CONFIG.maxTokens,
        temperature: CONFIG.speedMode ? 0.2 : 0.5, // Lower temp = more consistent, less questioning
      }),
      signal: currentAbortController.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      stopSpinner();
      const errorText = await response.text();
      if (errorText.includes("does not support images") || errorText.includes("vision")) {
        console.log(`\n${c.yellow}Note:${c.reset} Model ${CONFIG.model} may not support images.`);
        console.log(`${c.dim}Try a vision-capable model like llava, bakllava, or llama3.2-vision${c.reset}\n`);
      } else {
        console.log(`\n${c.red}Error:${c.reset} ${formatApiError(response.status, errorText)}\n`);
      }
      return;
    }

    const { content } = await streamChat(response);

    if (content) {
      messages.push({ role: "assistant", content });
    }

  } catch (error: any) {
    stopSpinner();
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      console.log(`\n${c.yellow}Request cancelled${c.reset}\n`);
    } else {
      console.log(`\n${c.red}Error:${c.reset} ${error.message}\n`);
    }
  }
}

// Chat function with streaming and timing
async function chat(userInput: string): Promise<void> {
  // Clear failure tracking for new user request
  clearFailures();
  recentToolCalls.length = 0;

  messages.push({ role: "user", content: userInput });

  // Compress context if getting long (extends effective context window)
  const compressedMessages = await compressContext(messages);
  if (compressedMessages.length < messages.length) {
    console.log(`${c.dim}(compressed ${messages.length - compressedMessages.length} old messages)${c.reset}`);
    messages.length = 0;
    messages.push(...compressedMessages);
  }

  let continueLoop = true;
  let iterations = 0;
  const maxIterations = 8; // Reduced from 10 to catch loops faster

  while (continueLoop && iterations < maxIterations) {
    iterations++;
    const iterationStart = Date.now();
    startSpinner(iterations === 1 ? "thinking" : "processing");

    // Create abort controller for this request
    currentAbortController = new AbortController();
    const timeoutMs = CONFIG.speedMode ? CONFIG.quickTimeout : CONFIG.timeout;
    const timeoutId = setTimeout(() => currentAbortController?.abort(), timeoutMs);

    try {
      const response = await fetch(`${CONFIG.apiUrl}/api/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CONFIG.apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
            tool_call_id: m.tool_call_id,
          })),
          tools: modelSupportsTools(CONFIG.model) ? CLI_TOOLS : undefined,
          stream: true,
          instance_id: cliInstanceId,
          project_root: process.cwd(),
          agentic: false,
          temperature: CONFIG.speedMode ? 0.2 : 0.5,
          max_tokens: CONFIG.speedMode ? 2048 : CONFIG.maxTokens,
        }),
        signal: currentAbortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        stopSpinner();
        const error = await response.text();
        console.log(`\n${c.red}Error:${c.reset} ${formatApiError(response.status, error)}\n`);
        continueLoop = false;
        break;
      }

      const { content, tool_calls } = await streamChat(response);
      const elapsedMs = Date.now() - iterationStart;
      const elapsed = (elapsedMs / 1000).toFixed(1);

      // Record stats
      const estimatedTokens = Math.round((content?.length || 0) / 4);
      recordResponseTime(elapsedMs, estimatedTokens);
      sessionStats.toolCalls += tool_calls.length;

      if (tool_calls.length > 0) {
        if (!content) stopSpinner();

        messages.push({
          role: "assistant",
          content: content || null,
          tool_calls: tool_calls,
        });

        // Execute tools - use parallel execution for multiple independent tools
        if (tool_calls.length > 1) {
          // Prepare tool calls for parallel execution
          const preparedCalls: ToolCall[] = [];
          for (const tc of tool_calls) {
            try {
              const args = JSON.parse(tc.function.arguments);
              preparedCalls.push({ id: tc.id, name: tc.function.name, args });
            } catch (e: any) {
              messages.push({
                role: "tool",
                content: `Error: Invalid JSON in tool arguments: ${e.message}`,
                tool_call_id: tc.id,
              });
            }
          }

          if (preparedCalls.length > 0) {
            const results = await executeToolsParallel(preparedCalls);
            for (const [id, result] of results) {
              messages.push({
                role: "tool",
                content: result,
                tool_call_id: id,
              });
            }
          }
        } else {
          // Single tool call - execute normally
          for (const tc of tool_calls) {
            try {
              const args = JSON.parse(tc.function.arguments);
              const result = await executeTool(tc.function.name, args);

              messages.push({
                role: "tool",
                content: result,
                tool_call_id: tc.id,
              });
            } catch (e: any) {
              const errorMsg = e.message.includes("JSON")
                ? `Error: Invalid tool arguments. Please check the JSON format and try again. Details: ${e.message}`
                : `Error executing tool: ${e.message}`;

              console.log(`${c.red}${errorMsg}${c.reset}`);

              messages.push({
                role: "tool",
                content: errorMsg,
                tool_call_id: tc.id,
              });
            }
          }
        }
      } else {
        messages.push({
          role: "assistant",
          content: content,
        });
        // Claude Code style: no timing after text responses
        continueLoop = false;
      }
    } catch (error: any) {
      stopSpinner();
      if (error.name === "AbortError") {
        console.log(`${c.yellow}Request cancelled${c.reset}`);
      } else {
        console.log(`${c.red}Error: ${error.message}${c.reset}`);
      }
      continueLoop = false;
    } finally {
      currentAbortController = null;
    }
  }

  if (iterations >= maxIterations) {
    console.log(`\n${c.yellow}Reached max iterations (${maxIterations})${c.reset}`);
  }
}

// Cancel current request
function cancelRequest(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    stopSpinner();
    console.log(`\n${c.yellow}Cancelled${c.reset}`);
  }
}

// Handle CLI arguments
function handleArgs(): boolean {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${c.purple}${c.bold}Bubbl${c.reset} - AI Coding Assistant

${c.bold}Usage:${c.reset}
  bubbl                    Start interactive mode
  bubbl "fix the bug"      Ask a single question
  bubbl --init             Configure API key and settings
  bubbl --new <name>       Start a named session (for parallel work)
  bubbl --resume           Resume interrupted session
  bubbl --help             Show this help

${c.bold}Options:${c.reset}
  --init, -i       Configure API key and server URL
  --new <name>     Start a named session
  --resume, -r     Resume last interrupted session
  --help, -h       Show help
  --version, -v    Show version

${c.bold}Multiple Sessions:${c.reset}
  bubbl --new frontend     # Terminal 1: work on frontend
  bubbl --new backend      # Terminal 2: work on backend
  bubbl --new tests        # Terminal 3: write tests

${c.bold}Environment:${c.reset}
  BUBBL_API_KEY        API key (or set via --init)
  BUBBL_API_URL        Server URL (default: http://localhost:3000)
  BUBBL_MODEL          Model to use (default: qwen2.5-coder:14b)
  BUBBL_SESSION_NAME   Custom session name

${c.bold}In Session:${c.reset}
  /help       Commands    /plan    Plan mode
  /explore    Overview    /memory  Project memory
  /sessions   All sessions
`);
    return true;
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log("bubbl v1.0.0");
    return true;
  }

  // Handle --new <name> for named sessions
  const newIdx = args.indexOf("--new");
  if (newIdx !== -1 && args[newIdx + 1]) {
    const sessionName = args[newIdx + 1];
    process.env.BUBBL_SESSION_NAME = sessionName;
    // Remove --new and name from args so they don't get treated as a question
    args.splice(newIdx, 2);
    return false; // Continue to main()
  }

  // Handle --resume to restore interrupted session
  if (args.includes("--resume") || args.includes("-r")) {
    process.env.BUBBL_RESUME = "true";
    const resumeIdx = args.indexOf("--resume");
    if (resumeIdx !== -1) args.splice(resumeIdx, 1);
    const rIdx = args.indexOf("-r");
    if (rIdx !== -1) args.splice(rIdx, 1);
    return false; // Continue to main()
  }

  if (args.includes("--init") || args.includes("-i")) {
    initConfig();
    return true;
  }

  return false;
}

// Interactive configuration
function initConfig(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`
${c.purple}${c.bold}Bubbl Configuration${c.reset}
`);

  rl.question(`${c.bold}API Key${c.reset} [${CONFIG.apiKey ? "***" + CONFIG.apiKey.slice(-8) : "not set"}]: `, (apiKey) => {
    rl.question(`${c.bold}API URL${c.reset} [${CONFIG.apiUrl}]: `, (apiUrl) => {
      rl.question(`${c.bold}Model${c.reset} [${CONFIG.model}]: `, (model) => {
        const newConfig: Partial<BubblConfig> = {};
        if (apiKey.trim()) newConfig.apiKey = apiKey.trim();
        if (apiUrl.trim()) newConfig.apiUrl = apiUrl.trim();
        if (model.trim()) newConfig.model = model.trim();

        saveConfig(newConfig);
        console.log(`\n${c.green}✓${c.reset} Configuration saved to ${CONFIG_FILE}`);
        console.log(`\nRun ${c.purple}bubbl${c.reset} to start.\n`);
        rl.close();
      });
    });
  });
}

// Main
async function main() {
  // Handle CLI arguments
  if (handleArgs()) return;

  // Check for direct question
  const args = process.argv.slice(2);
  const directQuestion = args.join(" ").trim();

  // Detect project type for display (using enhanced detection)
  const projectType = getProjectSummary();

  // Claude Code style: minimal header with session info
  const sessionLabel = SESSION_NAME || SESSION_ID;
  console.log(`
${c.purple}${c.bold}Bubbl${c.reset} ${c.dim}v1.0.0${c.reset}${SESSION_NAME ? ` ${c.cyan}[${SESSION_NAME}]${c.reset}` : ""}

${c.dim}Model:${c.reset}   ${CONFIG.model}
${c.dim}CWD:${c.reset}     ${process.cwd()}${projectType ? ` ${c.dim}(${projectType})${c.reset}` : ""}
`);

  // Save session for tracking
  saveSession();

  if (!CONFIG.apiKey) {
    console.log(`${c.yellow}No API key set.${c.reset} Run ${c.cyan}bubbl --init${c.reset} or set BUBBL_API_KEY\n`);
    return;
  }

  console.log(`${c.dim}/help for commands${c.reset}\n`);

  // Warm cache with common project files for faster tool responses
  warmCache();

  // Check API connectivity - warn early if server unreachable
  await checkApiConnectivity();

  // Check if model supports tool calling
  if (!modelSupportsTools(CONFIG.model)) {
    console.log(`${c.yellow}⚠${c.reset} Model ${c.cyan}${CONFIG.model}${c.reset} may not support tool calling.`);
    console.log(`${c.dim}  For code editing, use: qwen2.5:7b, llama3.1:8b, mistral, etc.${c.reset}`);
    console.log(`${c.dim}  Run /models to see all options${c.reset}\n`);
  }

  // Register CLI instance with API (shows in dashboard with model)
  await registerCliInstance();

  // Check for interrupted session to resume
  if (process.env.BUBBL_RESUME === "true") {
    const interrupted = loadInterruptedSession();
    if (interrupted) {
      restoreSession(interrupted, messages);
    } else {
      console.log(`${c.dim}No interrupted session to resume${c.reset}`);
    }
  } else {
    // Check if there's an interrupted session and notify user
    const interrupted = loadInterruptedSession();
    if (interrupted) {
      const ago = Math.round((Date.now() - interrupted.timestamp) / 1000 / 60);
      console.log(`${c.yellow}▶${c.reset} Interrupted session available ${c.dim}(${ago}m ago, ${interrupted.messages.length} messages)${c.reset}`);
      console.log(`${c.dim}Run 'bubbl --resume' to continue${c.reset}\n`);
    }
  }

  // Handle direct question mode
  if (directQuestion) {
    await chat(directQuestion);
    return;
  }

  // Dynamic prompt with git branch
  function getPrompt(): string {
    const gitInfo = getGitPrompt();
    if (gitInfo) {
      return `${gitInfo} ${c.purple}❯${c.reset} `;
    }
    return `${c.purple}❯${c.reset} `;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
  });

  // Set global readline for confirmations
  globalRl = rl;

  // Handle Ctrl+C - cancel current request or exit
  let lastCtrlC = 0;
  process.on("SIGINT", () => {
    if (currentAbortController) {
      cancelRequest();
      rl.prompt();
    } else {
      const now = Date.now();
      if (now - lastCtrlC < 500) {
        // Double Ctrl+C - save state and exit
        if (messages.length > 1) {
          saveInterruptedSession(messages);
          console.log(`\n${c.dim}Session saved. Run 'bubbl --resume' to continue.${c.reset}`);
        }
        console.log(`${c.purple}Bye!${c.reset}`);
        process.exit(0);
      }
      lastCtrlC = now;
      console.log(`\n${c.dim}Press Ctrl+C again to exit (session will be saved)${c.reset}`);
      rl.prompt();
    }
  });

  rl.prompt();

  // Command queue to prevent race conditions with async handlers
  let isProcessingCommand = false;
  let hasPendingInput = false;
  let isClosing = false;
  const commandQueue: string[] = [];

  async function processNextCommand(): Promise<void> {
    if (isProcessingCommand || commandQueue.length === 0) {
      if (commandQueue.length === 0) hasPendingInput = false;
      return;
    }

    isProcessingCommand = true;
    const input = commandQueue.shift()!;

    try {
      await handleInput(input);
    } finally {
      isProcessingCommand = false;
      // Process next command in queue if any
      if (commandQueue.length > 0) {
        processNextCommand();
      } else {
        hasPendingInput = false;
        if (!isClosing) rl.prompt();
      }
    }
  }

  async function handleInput(input: string): Promise<void> {
    if (input.startsWith("/")) {
      const [cmd, ...args] = input.slice(1).split(" ");

      switch (cmd) {
        case "quit":
        case "exit":
        case "q":
          console.log(`\n${c.purple}Bye!${c.reset}`);
          process.exit(0);

        case "help":
        case "h":
          console.log(`
${c.bold}Commands${c.reset}
  /help         Show this help
  /quit         Exit
  /clear        Clear conversation

${c.bold}Editing${c.reset}
  /undo         Undo last edit
  /rollback     Undo ALL session changes
  /changes      Show all changes made

${c.bold}Git${c.reset}
  /git          Git status overview
  /diff         Show uncommitted changes
  /commit       Generate commit message
  /branch [x]   List/switch branches

${c.bold}Planning${c.reset}
  /plan         Plan mode (think first)
  /go           Execute plan
  /noplan       Cancel plan mode

${c.bold}Explore${c.reset}
  /map          Codebase structure map
  /explore      Quick codebase overview
  /deep [q]     Deep analysis
  /search <q>   Search the web

${c.bold}Memory${c.reset}
  /memory       Project memory
  /remember <x> Save insight
  /todo [task]  Add/list todos

${c.bold}Sessions${c.reset}
  /sessions     List sessions
  /save [name]  Save conversation
  /load <name>  Load conversation
  /convs        List saved conversations
  ${c.dim}New instance: bubbl --new <name>${c.reset}

${c.bold}Context${c.reset}
  /related <f>  Show related files
  /context      Show project info

${c.bold}Images${c.reset}
  /image <path> Analyze an image file
  /screenshot   Capture & analyze screen
  /ss -i        Interactive selection
  /paste        Analyze clipboard image

${c.bold}Development${c.reset}
  /test [file]  Run tests
  /bench        Show response times
  /rename       Rename symbol in codebase
  /replace      Global search/replace

${c.bold}Integrations${c.reset}
  /mcp          MCP server connections
  /figma        Figma design integration
  /hooks        Pre/post execution hooks

${c.bold}Settings${c.reset}
  /model <id>   Change model
  /models       List models
  /auto         Toggle auto-approve
  /compact      Toggle compact output
  /speed        Toggle speed mode
  /autosave     Toggle auto-save on exit

${c.bold}Shortcuts${c.reset}
  Ctrl+C        Cancel / Ctrl+C x2 Exit
`);
          break;

        case "clear":
          messages.length = 1;
          clearFailures();
          recentToolCalls.length = 0;
          readFiles.clear();
          console.log(`${c.green}✓${c.reset} Conversation cleared, loop detection reset.`);
          break;

        case "reset":
          clearFailures();
          recentToolCalls.length = 0;
          console.log(`${c.green}✓${c.reset} Loop detection reset. Model can retry failed actions.`);
          break;

        case "plan":
          planMode = true;
          // Rebuild system prompt with plan mode
          messages[0] = { role: "system", content: buildSystemPrompt() };
          console.log(`${c.purple}●${c.reset} ${c.bold}Plan mode ON${c.reset}`);
          console.log(`${c.dim}Model will analyze and plan before making changes.${c.reset}`);
          console.log(`${c.dim}Use /go to execute the plan, /noplan to cancel.${c.reset}`);
          break;

        case "go":
          if (planMode && currentPlan) {
            planMode = false;
            messages[0] = { role: "system", content: buildSystemPrompt() };
            console.log(`${c.green}✓${c.reset} Executing plan...`);
            await chat("Execute the plan we just discussed. Proceed with the implementation.");
          } else if (planMode) {
            console.log(`${c.yellow}No plan yet.${c.reset} Ask me to plan something first.`);
          } else {
            console.log(`${c.dim}Not in plan mode. Use /plan first.${c.reset}`);
          }
          break;

        case "noplan":
          planMode = false;
          currentPlan = null;
          messages[0] = { role: "system", content: buildSystemPrompt() };
          console.log(`${c.green}✓${c.reset} Plan mode OFF`);
          break;

        case "search":
        case "web":
          if (args.length > 0) {
            const query = args.join(" ");
            console.log(`\n${c.purple}●${c.reset} ${c.bold}WebSearch${c.reset} ${c.yellow}"${query}"${c.reset}`);
            const results = await webSearch(query);
            console.log(results);
          } else {
            console.log(`${c.dim}Usage: /search <query>${c.reset}`);
          }
          break;

        case "map":
          // Show codebase structure map
          showCodebaseMap();
          break;

        case "explore":
          // Quick codebase exploration
          console.log(`\n${c.bold}${c.purple}Codebase Overview${c.reset}\n`);
          try {
            // Show directory structure
            const tree = execSync("find . -type f -name '*.ts' -o -name '*.js' -o -name '*.tsx' -o -name '*.py' -o -name '*.go' -o -name '*.rs' 2>/dev/null | grep -v node_modules | grep -v .git | head -30", {
              encoding: "utf-8",
              cwd: process.cwd(),
            }).trim();

            if (tree) {
              console.log(`${c.bold}Source Files${c.reset}`);
              tree.split("\n").forEach(f => console.log(`  ${c.cyan}${f}${c.reset}`));
            }

            // Show package.json scripts if exists
            if (fs.existsSync("package.json")) {
              const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
              if (pkg.scripts) {
                console.log(`\n${c.bold}Scripts${c.reset}`);
                Object.entries(pkg.scripts).slice(0, 8).forEach(([k, v]) => {
                  console.log(`  ${c.green}${k}${c.reset}: ${c.dim}${String(v).slice(0, 50)}${c.reset}`);
                });
              }
              if (pkg.dependencies) {
                console.log(`\n${c.bold}Dependencies${c.reset} ${c.dim}(${Object.keys(pkg.dependencies).length})${c.reset}`);
                console.log(`  ${c.dim}${Object.keys(pkg.dependencies).slice(0, 10).join(", ")}${c.reset}`);
              }
            }

            // Git info
            if (fs.existsSync(".git")) {
              const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
              const lastCommit = execSync("git log -1 --oneline", { encoding: "utf-8" }).trim();
              console.log(`\n${c.bold}Git${c.reset}`);
              console.log(`  Branch: ${c.cyan}${branch}${c.reset}`);
              console.log(`  Last: ${c.dim}${lastCommit}${c.reset}`);
            }
          } catch (e) {
            console.log(`${c.dim}Could not explore codebase${c.reset}`);
          }
          console.log();
          break;

        case "undo":
          console.log(undoLastEdit());
          break;

        case "history":
          if (undoStack.length === 0) {
            console.log(`${c.dim}No edit history${c.reset}`);
          } else {
            console.log(`\n${c.bold}${c.purple}Edit History${c.reset} ${c.dim}(${undoStack.length} edits, /undo to revert)${c.reset}\n`);
            undoStack.slice().reverse().forEach((backup, i) => {
              const ago = ((Date.now() - backup.timestamp) / 1000).toFixed(0);
              console.log(`  ${c.dim}${i + 1}.${c.reset} ${path.basename(backup.path)} ${c.dim}(${ago}s ago)${c.reset}`);
            });
            console.log();
          }
          break;

        case "sessions":
          const sessions = listSessions();
          if (sessions.length === 0) {
            console.log(`${c.dim}No active sessions${c.reset}`);
          } else {
            console.log(`\n${c.bold}${c.purple}Active Sessions${c.reset}\n`);
            for (const s of sessions.slice(0, 10)) {
              const active = s.id === SESSION_ID ? ` ${c.green}← current${c.reset}` : "";
              const ago = ((Date.now() - s.lastActive) / 1000 / 60).toFixed(0);
              console.log(`  ${c.cyan}${s.name}${c.reset}${active}`);
              console.log(`    ${c.dim}${s.cwd} (${ago}m ago)${c.reset}`);
            }
            console.log(`\n${c.dim}Start new: BUBBL_SESSION_NAME=name npx tsx bubbl.ts${c.reset}\n`);
          }
          break;

        case "memory":
          const memory = loadProjectMemory();
          if (!memory) {
            console.log(`${c.dim}No memory for this project yet${c.reset}`);
          } else {
            console.log(`\n${c.bold}${c.purple}Project Memory${c.reset}\n`);
            console.log(`${c.dim}Path:${c.reset} ${memory.projectPath}`);
            if (memory.conventions.length > 0) {
              console.log(`\n${c.bold}Conventions${c.reset}`);
              memory.conventions.slice(-5).forEach(c2 => console.log(`  - ${c2}`));
            }
            if (memory.patterns.length > 0) {
              console.log(`\n${c.bold}Patterns${c.reset}`);
              memory.patterns.slice(-5).forEach(p => console.log(`  - ${p}`));
            }
            if (memory.insights.length > 0) {
              console.log(`\n${c.bold}Insights${c.reset}`);
              memory.insights.slice(-5).forEach(i => console.log(`  - ${i}`));
            }
            if (memory.todos.length > 0) {
              console.log(`\n${c.bold}Todos${c.reset}`);
              memory.todos.forEach(t => console.log(`  ${c.yellow}○${c.reset} ${t}`));
            }
            console.log();
          }
          break;

        case "remember":
          if (args.length > 0) {
            const what = args.join(" ");
            updateMemory("insights", what);
            console.log(`${c.green}✓${c.reset} Remembered: ${what}`);
          } else {
            console.log(`${c.dim}Usage: /remember <something to remember about this project>${c.reset}`);
          }
          break;

        case "todo":
          if (args.length > 0) {
            const item = args.join(" ");
            updateMemory("todos", item);
            console.log(`${c.green}✓${c.reset} Added todo: ${item}`);
          } else {
            const mem = loadProjectMemory();
            if (mem?.todos.length) {
              console.log(`\n${c.bold}Todos${c.reset}`);
              mem.todos.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
              console.log();
            } else {
              console.log(`${c.dim}No todos. Usage: /todo <task>${c.reset}`);
            }
          }
          break;

        case "deep":
        case "analyze":
          // Deep codebase analysis
          console.log(await exploreCodebase(args.join(" ") || undefined));
          break;

        case "model":
          if (args[0]) {
            const target = args[0];
            // Try to fetch fresh models for validation
            const models = await fetchAvailableModels();
            const found = models.find((m) => m.id === target || m.name.toLowerCase().includes(target.toLowerCase()));
            if (found) {
              CONFIG.model = found.id;
              saveConfig({ model: found.id }); // Persist selection
              if (cliInstanceId) {
                try {
                  await fetch(`${CONFIG.apiUrl}/api/instances?id=${cliInstanceId}`, {
                    method: "PUT",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${CONFIG.apiKey}`,
                    },
                    body: JSON.stringify({ model: found.id }),
                  });
                } catch {}
              }
              console.log(`${c.green}✓${c.reset} Model: ${found.name} (${found.id})`);
              if (found.vram) console.log(`  ${c.yellow}⬛${c.reset} ${found.vram} VRAM required`);
              if (found.speed) console.log(`  ${c.green}⚡${c.reset} ${found.speed}`);
              console.log(`${c.dim}Saved to ~/.bubbl/config.json${c.reset}`);
            } else {
              // Allow custom model IDs (for dynamic Ollama models)
              CONFIG.model = target;
              saveConfig({ model: target });
              console.log(`${c.yellow}!${c.reset} Using custom model: ${target}`);
              console.log(`${c.dim}Note: This model is not in the known list. Use /models to see available.${c.reset}`);
            }
          } else {
            const models = getAvailableModels();
            const m = models.find((x) => x.id === CONFIG.model);
            console.log(`Current: ${CONFIG.model}${m ? ` — ${m.name}` : ""}`);
            if (m?.vram) console.log(`  ${c.yellow}⬛${c.reset} ${m.vram}`);
            if (m?.speed) console.log(`  ${c.green}⚡${c.reset} ${m.speed}`);
            console.log(`${c.dim}Use /models to list available, /model <id> to switch${c.reset}`);
          }
          break;

        case "models":
          console.log(`\n${c.dim}Fetching models...${c.reset}`);
          const allModels = await fetchAvailableModels();
          console.log(`\x1b[A\x1b[2K${c.bold}${c.purple}Available Models${c.reset}\n`);

          const ollamaModels = allModels.filter((m) => m.provider === "ollama");
          const moonshotModels = allModels.filter((m) => m.provider === "moonshot");
          const deepseekModels = allModels.filter((m) => m.provider === "deepseek");

          console.log(`${c.green}● Ollama (self-hosted, FREE)${c.reset}`);
          ollamaModels.forEach((m: any) => {
            const cur = m.id === CONFIG.model ? ` ${c.purple}← current${c.reset}` : "";
            const installed = m.installed ? `${c.green}✓${c.reset}` : `${c.dim}○${c.reset}`;
            console.log(`  ${installed} ${c.cyan}${m.id.padEnd(24)}${c.reset} ${m.name}${cur}`);
            const details: string[] = [];
            if (m.vram) details.push(`${c.yellow}⬛${c.reset} ${m.vram}`);
            if (m.speed) details.push(`${c.green}⚡${c.reset} ${m.speed}`);
            if (m.contextWindow) details.push(`${c.purple}📄${c.reset} ${Math.round(m.contextWindow / 1000)}k`);
            if (details.length > 0) {
              console.log(`      ${c.dim}${m.description}${c.reset}`);
              console.log(`      ${details.join("  ")}`);
            } else {
              console.log(`      ${c.dim}${m.description}${c.reset}`);
            }
            if (m.capabilities && m.capabilities.length > 0) {
              console.log(`      ${c.dim}[${m.capabilities.join(", ")}]${c.reset}`);
            }
          });

          if (moonshotModels.length > 0) {
            console.log(`\n${c.purple}● Moonshot (API, paid)${c.reset}`);
            moonshotModels.forEach((m) => {
              const cur = m.id === CONFIG.model ? ` ${c.purple}← current${c.reset}` : "";
              console.log(`  ${c.cyan}${m.id.padEnd(25)}${c.reset} ${m.name}${cur}`);
              console.log(`      ${c.dim}${m.description}${c.reset}`);
              if (m.contextWindow) {
                console.log(`      ${c.purple}📄${c.reset} ${Math.round(m.contextWindow / 1000)}k context`);
              }
              if (m.capabilities && m.capabilities.length > 0) {
                console.log(`      ${c.dim}[${m.capabilities.join(", ")}]${c.reset}`);
              }
            });
          }

          if (deepseekModels.length > 0) {
            console.log(`\n${c.blue}● DeepSeek (API, low-cost)${c.reset}`);
            deepseekModels.forEach((m) => {
              const cur = m.id === CONFIG.model ? ` ${c.purple}← current${c.reset}` : "";
              console.log(`  ${c.cyan}${m.id.padEnd(25)}${c.reset} ${m.name}${cur}`);
              console.log(`      ${c.dim}${m.description}${c.reset}`);
              if (m.contextWindow) {
                console.log(`      ${c.purple}📄${c.reset} ${Math.round(m.contextWindow / 1000)}k context`);
              }
              if (m.capabilities && m.capabilities.length > 0) {
                console.log(`      ${c.dim}[${m.capabilities.join(", ")}]${c.reset}`);
              }
            });
          }

          console.log(`\n${c.green}✓${c.reset} = installed  ${c.dim}○${c.reset} = not installed (run: ollama pull <model>)`);
          console.log(`${c.dim}Use /model <id> to switch (persisted to config)${c.reset}\n`);
          break;

        case "cd":
          try {
            process.chdir(args.join(" ") || process.env.HOME || "~");
            console.log(process.cwd());
          } catch (e: any) {
            console.log(`Error: ${e.message}`);
          }
          break;

        case "ls":
          console.log(listDir(args[0] || "."));
          break;

        case "pwd":
          console.log(process.cwd());
          break;

        case "status":
          try {
            const res = await fetch(`${CONFIG.apiUrl}/api/health`);
            const data = await res.json() as { services?: { api?: string; llm?: string; database?: string } };
            console.log(`${c.purple}API:${c.reset} ${data.services?.api || "?"}`);
            console.log(`${c.purple}LLM:${c.reset} ${data.services?.llm || "?"}`);
            console.log(`${c.purple}DB:${c.reset} ${data.services?.database || "?"}`);
          } catch {
            console.log(`${c.red}Cannot reach API${c.reset}`);
          }
          break;

        case "context":
          console.log(`\n${c.bold}${c.purple}Project Context${c.reset}\n`);
          console.log(`${c.bold}Directory:${c.reset} ${process.cwd()}`);

          // Show detected context
          try {
            if (fs.existsSync("package.json")) {
              const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
              console.log(`${c.bold}Project:${c.reset} ${pkg.name || "Node.js"}`);
              if (pkg.dependencies) console.log(`${c.dim}Dependencies: ${Object.keys(pkg.dependencies).length}${c.reset}`);
            }
            if (fs.existsSync(".git")) {
              const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
              console.log(`${c.bold}Git:${c.reset} ${branch}`);
            }
            if (fs.existsSync("tsconfig.json")) console.log(`${c.bold}TypeScript:${c.reset} yes`);
            if (fs.existsSync("Cargo.toml")) console.log(`${c.bold}Rust:${c.reset} yes`);
            if (fs.existsSync("go.mod")) console.log(`${c.bold}Go:${c.reset} yes`);
            if (fs.existsSync("requirements.txt") || fs.existsSync("pyproject.toml")) console.log(`${c.bold}Python:${c.reset} yes`);
          } catch {}

          console.log(`\n${c.dim}Auto-approve:${c.reset} ${CONFIG.autoApprove ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}`);
          console.log();
          break;

        case "auto":
          CONFIG.autoApprove = !CONFIG.autoApprove;
          saveConfig({ autoApprove: CONFIG.autoApprove });
          console.log(`${c.green}✓${c.reset} Auto-approve: ${CONFIG.autoApprove ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}`);
          console.log(`${c.dim}Edits will ${CONFIG.autoApprove ? "not" : ""} require confirmation${c.reset}`);
          break;

        case "compact":
          CONFIG.compactMode = !CONFIG.compactMode;
          saveConfig({ compactMode: CONFIG.compactMode });
          console.log(`${c.green}✓${c.reset} Compact mode: ${CONFIG.compactMode ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}`);
          break;

        case "autosave":
          CONFIG.autoSave = !CONFIG.autoSave;
          saveConfig({ autoSave: CONFIG.autoSave });
          console.log(`${c.green}✓${c.reset} Auto-save on exit: ${CONFIG.autoSave ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}`);
          break;

        case "speed":
        case "fast":
          CONFIG.speedMode = !CONFIG.speedMode;
          saveConfig({ speedMode: CONFIG.speedMode });
          // Rebuild system prompt with new mode
          messages[0] = { role: "system", content: buildSystemPrompt() };
          console.log(`${c.green}✓${c.reset} Speed mode: ${CONFIG.speedMode ? `${c.green}ON${c.reset}` : `${c.yellow}OFF${c.reset}`}`);
          if (CONFIG.speedMode) {
            console.log(`${c.dim}Using compact prompts for faster responses${c.reset}`);
            console.log(`${c.dim}Tip: Use a fast model like llama3.2:3b or qwen2.5:7b${c.reset}`);
          }
          break;

        case "rollback":
          console.log(rollbackSession());
          break;

        case "changes":
          if (sessionChanges.length === 0) {
            console.log(`${c.dim}No changes in this session${c.reset}`);
          } else {
            // Group by file and calculate total changes
            const byFile = new Map<string, SessionChange[]>();
            let totalAdded = 0, totalRemoved = 0;

            for (const change of sessionChanges) {
              if (!byFile.has(change.file)) byFile.set(change.file, []);
              byFile.get(change.file)!.push(change);
            }

            console.log(`\n${c.bold}${c.purple}Session Changes${c.reset} ${c.dim}(${byFile.size} files, ${sessionChanges.length} edits)${c.reset}\n`);

            for (const [file, changes] of byFile) {
              const firstBackup = changes[0].backup;
              let added = 0, removed = 0;

              // Calculate line diff if we have backup
              if (firstBackup && fs.existsSync(file)) {
                const originalLines = firstBackup.split("\n").length;
                const currentLines = fs.readFileSync(file, "utf-8").split("\n").length;
                const diff = currentLines - originalLines;
                if (diff > 0) added = diff;
                else if (diff < 0) removed = -diff;
                totalAdded += added;
                totalRemoved += removed;
              }

              const icon = changes[0].type === "write" ? `${c.green}+${c.reset}` : `${c.yellow}~${c.reset}`;
              const stats = added || removed ? ` ${c.green}+${added}${c.reset}/${c.red}-${removed}${c.reset}` : "";
              console.log(`  ${icon} ${path.basename(file)}${stats} ${c.dim}(${changes.length} edits)${c.reset}`);
            }

            console.log(`\n  ${c.bold}Total:${c.reset} ${c.green}+${totalAdded}${c.reset} / ${c.red}-${totalRemoved}${c.reset} lines`);
            console.log(`${c.dim}Use /rollback to undo all changes${c.reset}\n`);
          }
          break;

        // Git commands
        case "git":
          const gitStatus = getGitStatus();
          if (!gitStatus.isRepo) {
            console.log(`${c.dim}Not a git repository${c.reset}`);
          } else {
            console.log(`\n${c.bold}${c.purple}Git Status${c.reset}\n`);
            console.log(`Branch: ${c.cyan}${gitStatus.branch}${c.reset}`);
            if (gitStatus.ahead > 0) console.log(`  ${c.green}↑ ${gitStatus.ahead} ahead${c.reset}`);
            if (gitStatus.behind > 0) console.log(`  ${c.red}↓ ${gitStatus.behind} behind${c.reset}`);
            console.log(`\nChanges:`);
            if (gitStatus.staged > 0) console.log(`  ${c.green}● ${gitStatus.staged} staged${c.reset}`);
            if (gitStatus.modified > 0) console.log(`  ${c.yellow}● ${gitStatus.modified} modified${c.reset}`);
            if (gitStatus.untracked > 0) console.log(`  ${c.dim}+ ${gitStatus.untracked} untracked${c.reset}`);
            if (gitStatus.staged + gitStatus.modified + gitStatus.untracked === 0) {
              console.log(`  ${c.dim}Clean${c.reset}`);
            }
            console.log();
          }
          break;

        case "diff":
          console.log(showGitDiff());
          break;

        case "commit":
          const commitStatus = getGitStatus();
          if (!commitStatus.isRepo) {
            console.log(`${c.dim}Not a git repository${c.reset}`);
          } else if (commitStatus.staged === 0) {
            console.log(`${c.yellow}No staged changes.${c.reset}`);
            console.log(`${c.dim}Stage changes with: git add <files>${c.reset}`);
          } else {
            // Generate commit message using the model
            console.log(`${c.dim}Generating commit message...${c.reset}`);
            await chat("Generate a concise git commit message for the currently staged changes. Look at the diff and create a conventional commit message (feat:, fix:, docs:, etc.). Just output the message, nothing else.");
          }
          break;

        case "branch":
          if (args[0]) {
            try {
              execSync(`git checkout ${args[0]}`, { encoding: "utf-8", stdio: "inherit" });
            } catch {}
          } else {
            try {
              const branches = execSync("git branch -a", { encoding: "utf-8" }).trim();
              console.log(`\n${c.bold}Branches${c.reset}\n${branches}\n`);
            } catch (e: any) {
              console.log(`${c.red}Error:${c.reset} ${e.message}`);
            }
          }
          break;

        // Conversation management
        case "save":
          {
            const saveName = args[0] || `conversation-${Date.now()}`;
            console.log(saveConversation(saveName, messages));
          }
          break;

        case "load":
          if (!args[0]) {
            console.log(`${c.dim}Usage: /load <name>${c.reset}`);
            console.log(`${c.dim}Use /conversations to list saved conversations${c.reset}`);
          } else {
            const loaded = loadConversation(args[0]);
            if (loaded) {
              messages.length = 0;
              messages.push(...loaded.messages);
              console.log(loaded.info);
            } else {
              console.log(`${c.yellow}Conversation not found:${c.reset} ${args[0]}`);
              console.log(`${c.dim}Use /conversations to list saved conversations${c.reset}`);
            }
          }
          break;

        case "conversations":
        case "convs":
          console.log(listConversations());
          break;

        // Auto-context
        case "related":
          if (!args[0]) {
            console.log(`${c.dim}Usage: /related <file>${c.reset}`);
            console.log(`${c.dim}Shows test files, type definitions, and imports${c.reset}`);
          } else {
            console.log(showRelatedFiles(args[0]));
          }
          break;

        case "mcp":
          {
            const mcpConfig = loadMCPConfig();
            const subCommand = args[0];

            if (subCommand === "setup") {
              const serverType = args[1];
              if (!serverType) {
                console.log(`${c.dim}Usage: /mcp setup <figma|github|slack|notion>${c.reset}`);
                break;
              }

              if (serverType === "figma") {
                const apiKey = args[2];
                if (!apiKey) {
                  console.log(`\n${c.bold}Figma Setup${c.reset}\n`);
                  console.log(`1. Go to ${c.cyan}https://www.figma.com/developers/api#access-tokens${c.reset}`);
                  console.log(`2. Generate a Personal Access Token`);
                  console.log(`3. Run: ${c.cyan}/mcp setup figma <your-token>${c.reset}\n`);
                  break;
                }

                // Save Figma config
                const existingServer = mcpConfig.servers.find(s => s.type === "figma");
                if (existingServer) {
                  existingServer.apiKey = apiKey;
                  existingServer.enabled = true;
                } else {
                  mcpConfig.servers.push({
                    name: "Figma",
                    type: "figma",
                    enabled: true,
                    apiKey: apiKey,
                  });
                }
                saveMCPConfig(mcpConfig);
                figmaClient = null; // Reset client to pick up new key

                console.log(`${c.green}✓${c.reset} Figma connected!`);
                console.log(`${c.dim}Try: /figma files${c.reset}`);
              } else {
                console.log(`${c.yellow}${serverType} integration coming soon${c.reset}`);
              }
              break;
            }

            if (subCommand === "disable") {
              const serverType = args[1];
              const server = mcpConfig.servers.find(s => s.type === serverType);
              if (server) {
                server.enabled = false;
                saveMCPConfig(mcpConfig);
                console.log(`${c.green}✓${c.reset} ${serverType} disabled`);
              }
              break;
            }

            if (subCommand === "enable") {
              const serverType = args[1];
              const server = mcpConfig.servers.find(s => s.type === serverType);
              if (server) {
                server.enabled = true;
                saveMCPConfig(mcpConfig);
                console.log(`${c.green}✓${c.reset} ${serverType} enabled`);
              } else {
                console.log(`${c.yellow}Run /mcp setup ${serverType} first${c.reset}`);
              }
              break;
            }

            // Show MCP status
            const enabledServers = getEnabledMCPServers();

            console.log(`\n${c.bold}${c.purple}MCP Connections${c.reset}\n`);

            if (enabledServers.length === 0) {
              console.log(`  ${c.dim}No servers connected${c.reset}\n`);
            } else {
              for (const server of enabledServers) {
                console.log(`  ${c.green}●${c.reset} ${server.name} ${c.dim}(${server.type})${c.reset}`);
              }
              console.log();
            }

            console.log(`${c.bold}Available Integrations${c.reset}`);
            console.log(`  ${c.cyan}figma${c.reset}   - Design files, components, styles`);
            console.log(`  ${c.dim}github${c.reset}  - Issues, PRs, repos (coming soon)`);
            console.log(`  ${c.dim}slack${c.reset}   - Messages, channels (coming soon)`);
            console.log(`  ${c.dim}notion${c.reset}  - Pages, databases (coming soon)`);

            console.log(`\n${c.bold}Commands${c.reset}`);
            console.log(`  /mcp setup <service>   Connect a service`);
            console.log(`  /mcp enable <service>  Enable a service`);
            console.log(`  /mcp disable <service> Disable a service`);
            console.log(`  /figma                 Figma commands\n`);
          }
          break;

        case "hooks":
        case "hook":
          {
            const hooksConfig = loadHooksConfig();
            const subCmd = args[0];

            if (subCmd === "add") {
              const hookName = args[1];
              const trigger = args[2] as Hook["trigger"];
              const command = args.slice(3).join(" ");

              if (!hookName || !trigger || !command) {
                console.log(`${c.dim}Usage: /hooks add <name> <trigger> <command>${c.reset}`);
                console.log(`${c.dim}Triggers: pre_edit, post_edit, pre_write, post_write, pre_shell, post_shell, on_error${c.reset}`);
                console.log(`${c.dim}Use $FILE for file path, $ERROR for error message${c.reset}`);
                break;
              }

              const validTriggers = ["pre_edit", "post_edit", "pre_write", "post_write", "pre_shell", "post_shell", "on_error"];
              if (!validTriggers.includes(trigger)) {
                console.log(`${c.yellow}Invalid trigger.${c.reset} Use: ${validTriggers.join(", ")}`);
                break;
              }

              hooksConfig.hooks.push({
                name: hookName,
                trigger: trigger,
                command: command,
                enabled: true,
              });
              saveHooksConfig(hooksConfig);
              console.log(`${c.green}✓${c.reset} Hook "${hookName}" added`);
              break;
            }

            if (subCmd === "remove") {
              const hookName = args[1];
              if (!hookName) {
                console.log(`${c.dim}Usage: /hooks remove <name>${c.reset}`);
                break;
              }
              hooksConfig.hooks = hooksConfig.hooks.filter(h => h.name !== hookName);
              saveHooksConfig(hooksConfig);
              console.log(`${c.green}✓${c.reset} Hook "${hookName}" removed`);
              break;
            }

            if (subCmd === "enable" || subCmd === "disable") {
              const hookName = args[1];
              const hook = hooksConfig.hooks.find(h => h.name === hookName);
              if (hook) {
                hook.enabled = subCmd === "enable";
                saveHooksConfig(hooksConfig);
                console.log(`${c.green}✓${c.reset} Hook "${hookName}" ${subCmd}d`);
              } else {
                console.log(`${c.yellow}Hook not found:${c.reset} ${hookName}`);
              }
              break;
            }

            if (subCmd === "cmd") {
              const cmdName = args[1];
              const cmdValue = args.slice(2).join(" ");

              if (!cmdName) {
                console.log(`${c.dim}Usage: /hooks cmd <name> <command>${c.reset}`);
                console.log(`${c.dim}Creates a custom slash command: /<name> will run <command>${c.reset}`);
                break;
              }

              if (cmdValue) {
                hooksConfig.customCommands[cmdName] = cmdValue;
                saveHooksConfig(hooksConfig);
                console.log(`${c.green}✓${c.reset} Custom command /${cmdName} created`);
              } else {
                delete hooksConfig.customCommands[cmdName];
                saveHooksConfig(hooksConfig);
                console.log(`${c.green}✓${c.reset} Custom command /${cmdName} removed`);
              }
              break;
            }

            // Show hooks status
            console.log(`\n${c.bold}${c.purple}Hooks${c.reset}\n`);

            if (hooksConfig.hooks.length === 0) {
              console.log(`  ${c.dim}No hooks configured${c.reset}\n`);
            } else {
              for (const hook of hooksConfig.hooks) {
                const status = hook.enabled ? `${c.green}●${c.reset}` : `${c.dim}○${c.reset}`;
                console.log(`  ${status} ${hook.name} ${c.dim}(${hook.trigger})${c.reset}`);
                console.log(`    ${c.dim}${hook.command}${c.reset}`);
              }
              console.log();
            }

            if (Object.keys(hooksConfig.customCommands).length > 0) {
              console.log(`${c.bold}Custom Commands${c.reset}`);
              for (const [name, cmd] of Object.entries(hooksConfig.customCommands)) {
                console.log(`  /${c.cyan}${name}${c.reset} → ${c.dim}${cmd}${c.reset}`);
              }
              console.log();
            }

            console.log(`${c.bold}Commands${c.reset}`);
            console.log(`  /hooks add <name> <trigger> <command>  Add a hook`);
            console.log(`  /hooks remove <name>                   Remove a hook`);
            console.log(`  /hooks enable|disable <name>           Toggle a hook`);
            console.log(`  /hooks cmd <name> <command>            Create custom command`);
            console.log(`\n${c.bold}Triggers${c.reset}`);
            console.log(`  pre_edit, post_edit     Before/after file edits`);
            console.log(`  pre_write, post_write   Before/after file writes`);
            console.log(`  pre_shell, post_shell   Before/after shell commands`);
            console.log(`  on_error                When an error occurs\n`);
          }
          break;

        case "figma":
          {
            const client = getFigmaClient();
            const subCmd = args[0];

            if (!client) {
              console.log(`${c.yellow}Figma not connected${c.reset}`);
              console.log(`${c.dim}Run: /mcp setup figma${c.reset}`);
              break;
            }

            if (!subCmd || subCmd === "help") {
              console.log(`
${c.bold}${c.purple}Figma Commands${c.reset}

  /figma files              List recent files
  /figma file <key>         Get file details
  /figma components <key>   List components
  /figma styles <key>       Get design tokens
  /figma search <key> <q>   Search text in file
  /figma export <key> <id>  Export node as PNG

${c.dim}File key is the ID in the Figma URL: figma.com/file/<key>/...${c.reset}
`);
              break;
            }

            try {
              if (subCmd === "files") {
                console.log(`${c.dim}Fetching recent files...${c.reset}`);
                const result = await executeFigmaTool("figma_list_files", {});
                console.log(`\n${c.bold}Recent Figma Files${c.reset}\n`);
                console.log(result);
              } else if (subCmd === "file") {
                const fileKey = args[1];
                if (!fileKey) {
                  console.log(`${c.dim}Usage: /figma file <file-key>${c.reset}`);
                  break;
                }
                console.log(`${c.dim}Fetching file...${c.reset}`);
                const result = await executeFigmaTool("figma_get_file", { file_key: fileKey });
                console.log(`\n${result}`);
              } else if (subCmd === "components") {
                const fileKey = args[1];
                if (!fileKey) {
                  console.log(`${c.dim}Usage: /figma components <file-key>${c.reset}`);
                  break;
                }
                console.log(`${c.dim}Fetching components...${c.reset}`);
                const result = await executeFigmaTool("figma_get_components", { file_key: fileKey });
                console.log(`\n${c.bold}Components${c.reset}\n`);
                console.log(result);
              } else if (subCmd === "styles") {
                const fileKey = args[1];
                if (!fileKey) {
                  console.log(`${c.dim}Usage: /figma styles <file-key>${c.reset}`);
                  break;
                }
                console.log(`${c.dim}Fetching styles...${c.reset}`);
                const result = await executeFigmaTool("figma_get_styles", { file_key: fileKey });
                console.log(`\n${c.bold}Design Tokens${c.reset}\n`);
                console.log(result);
              } else if (subCmd === "search") {
                const fileKey = args[1];
                const query = args.slice(2).join(" ");
                if (!fileKey || !query) {
                  console.log(`${c.dim}Usage: /figma search <file-key> <query>${c.reset}`);
                  break;
                }
                console.log(`${c.dim}Searching...${c.reset}`);
                const result = await executeFigmaTool("figma_search", { file_key: fileKey, query });
                console.log(`\n${c.bold}Search Results${c.reset}\n`);
                console.log(result);
              } else if (subCmd === "export") {
                const fileKey = args[1];
                const nodeId = args[2];
                if (!fileKey || !nodeId) {
                  console.log(`${c.dim}Usage: /figma export <file-key> <node-id>${c.reset}`);
                  break;
                }
                console.log(`${c.dim}Exporting...${c.reset}`);
                const result = await executeFigmaTool("figma_export_node", { file_key: fileKey, node_id: nodeId });
                console.log(result);
              } else {
                console.log(`${c.dim}Unknown command. Run /figma for help.${c.reset}`);
              }
            } catch (error: any) {
              console.log(`${c.red}Error:${c.reset} ${error.message}`);
            }
          }
          break;

        // Image support commands
        case "image":
        case "img":
          if (!args[0]) {
            console.log(`${c.dim}Usage: /image <path|url> [prompt]${c.reset}`);
            console.log(`${c.dim}Analyze an image file or URL with optional prompt${c.reset}`);
            console.log(`${c.dim}Supported: PNG, JPG, GIF, WebP (local files or http/https URLs)${c.reset}`);
          } else {
            const imagePath = args[0];
            const imagePrompt = args.slice(1).join(" ") || "Describe this image in detail. If it's a screenshot of code or an error, explain what you see.";

            // Check if it's a URL
            if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
              console.log(`${c.purple}●${c.reset} ${c.bold}Analyzing image URL${c.reset}`);

              // For URLs, pass directly to the model (most vision models support URLs)
              const imageMessage = createImageMessage(imagePrompt, imagePath);
              messages.push(imageMessage);
              await chatWithImage(imagePrompt, imagePath);
            } else {
              // Local file
              const imageData = readImageAsBase64(imagePath);
              if (!imageData) {
                console.log(`${c.red}Error:${c.reset} Could not read image: ${imagePath}`);
                console.log(`${c.dim}Check that the file exists and is a supported format (PNG, JPG, GIF, WebP)${c.reset}`);
              } else {
                const info = getImageInfo(imagePath);
                console.log(`${c.purple}●${c.reset} ${c.bold}Analyzing image${c.reset} ${c.dim}(${info?.size || "?"})${c.reset}`);

                // Create multimodal message and send
                const imageMessage = createImageMessage(imagePrompt, imageData);
                messages.push(imageMessage);
                await chatWithImage(imagePrompt, imageData);
              }
            }
          }
          break;

        case "screenshot":
        case "ss":
          {
            const ssPrompt = args.join(" ") || "Describe what you see in this screenshot. If it shows code, errors, or UI, explain what's happening.";
            console.log(`${c.dim}Capturing screenshot...${c.reset}`);

            // Check if we're on macOS
            if (process.platform !== "darwin") {
              console.log(`${c.yellow}Screenshot capture is currently only supported on macOS${c.reset}`);
              break;
            }

            const screenshotData = args.includes("-i") || args.includes("--interactive")
              ? captureScreenshotInteractive()
              : captureScreenshot();

            if (!screenshotData) {
              console.log(`${c.red}Error:${c.reset} Failed to capture screenshot`);
            } else {
              console.log(`${c.green}✓${c.reset} Screenshot captured`);
              console.log(`${c.purple}●${c.reset} ${c.bold}Analyzing screenshot${c.reset}`);

              // Create multimodal message and send
              const imageMessage = createImageMessage(ssPrompt, screenshotData);
              messages.push(imageMessage);
              await chatWithImage(ssPrompt, screenshotData);
            }
          }
          break;

        case "test":
        case "tests":
          {
            const specificTest = args.join(" ") || undefined;
            const testCmd = getTestCommand(specificTest);

            if (!testCmd) {
              console.log(`${c.yellow}No test runner detected${c.reset}`);
              console.log(`${c.dim}Add a test script to package.json or install jest/vitest/pytest${c.reset}`);
              break;
            }

            console.log(`${c.purple}●${c.reset} ${c.bold}Running tests${c.reset} ${c.dim}(${testCmd})${c.reset}\n`);

            const result = runTests(specificTest);

            // Show summary
            if (result.failed === 0 && result.passed > 0) {
              console.log(`${c.green}✓${c.reset} All tests passed (${result.passed})`);
            } else if (result.failed > 0) {
              console.log(`${c.red}✗${c.reset} ${result.failed} failed, ${result.passed} passed`);
              if (result.failures.length > 0) {
                console.log(`\n${c.bold}Failures:${c.reset}`);
                result.failures.forEach(f => console.log(`  ${c.red}${f}${c.reset}`));
              }
            } else {
              console.log(`${c.dim}${result.output.slice(0, 500)}${c.reset}`);
            }

            console.log(`\n${c.dim}Duration: ${(result.duration / 1000).toFixed(1)}s${c.reset}`);

            // Offer to analyze failures
            if (result.failed > 0) {
              console.log(`\n${c.dim}Tip: Ask me to analyze and fix the failing tests${c.reset}`);
            }
          }
          break;

        case "bench":
        case "stats":
        case "perf":
          console.log(getStatsDisplay());
          break;

        case "rename":
          if (args.length < 2) {
            console.log(`${c.dim}Usage: /rename <old-name> <new-name>${c.reset}`);
            console.log(`${c.dim}Renames a symbol across the codebase${c.reset}`);
          } else {
            const oldName = args[0];
            const newName = args[1];

            console.log(`${c.purple}●${c.reset} ${c.bold}Finding occurrences${c.reset} of "${oldName}"...`);

            // Find all occurrences using grep
            try {
              const grepResult = execSync(
                `grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" -l "${oldName}" . 2>/dev/null | grep -v node_modules | grep -v .git`,
                { encoding: "utf-8", cwd: process.cwd() }
              ).trim();

              if (!grepResult) {
                console.log(`${c.yellow}No occurrences found${c.reset}`);
                break;
              }

              const files = grepResult.split("\n").filter(Boolean);
              console.log(`\n${c.bold}Found in ${files.length} files:${c.reset}`);
              files.slice(0, 10).forEach(f => console.log(`  ${c.cyan}${f}${c.reset}`));
              if (files.length > 10) {
                console.log(`  ${c.dim}... and ${files.length - 10} more${c.reset}`);
              }

              console.log(`\n${c.yellow}This will rename "${oldName}" → "${newName}" in all files.${c.reset}`);
              console.log(`${c.dim}Ask me to proceed with the rename to apply changes.${c.reset}`);
            } catch {
              console.log(`${c.yellow}No occurrences found${c.reset}`);
            }
          }
          break;

        case "replace":
          if (args.length < 2) {
            console.log(`${c.dim}Usage: /replace <pattern> <replacement>${c.reset}`);
            console.log(`${c.dim}Global search and replace across codebase${c.reset}`);
          } else {
            const pattern = args[0];
            const replacement = args[1];

            console.log(`${c.purple}●${c.reset} ${c.bold}Finding occurrences${c.reset} of "${pattern}"...`);

            try {
              const grepResult = execSync(
                `grep -rn --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" "${pattern}" . 2>/dev/null | grep -v node_modules | grep -v .git | head -20`,
                { encoding: "utf-8", cwd: process.cwd() }
              ).trim();

              if (!grepResult) {
                console.log(`${c.yellow}No occurrences found${c.reset}`);
                break;
              }

              const lines = grepResult.split("\n");
              console.log(`\n${c.bold}Preview (first ${Math.min(lines.length, 20)} matches):${c.reset}\n`);
              lines.forEach(l => {
                const highlighted = l.replace(new RegExp(pattern, 'g'), `${c.red}${pattern}${c.reset}`);
                console.log(`  ${highlighted}`);
              });

              console.log(`\n${c.yellow}This will replace "${pattern}" → "${replacement}"${c.reset}`);
              console.log(`${c.dim}Ask me to proceed with the replacement to apply changes.${c.reset}`);
            } catch {
              console.log(`${c.yellow}No occurrences found${c.reset}`);
            }
          }
          break;

        case "paste":
        case "clipboard":
          {
            const pastePrompt = args.join(" ") || "Describe this image. If it shows code, errors, or UI, explain what you see and suggest any fixes.";

            if (process.platform !== "darwin") {
              console.log(`${c.yellow}Clipboard paste is currently only supported on macOS${c.reset}`);
              break;
            }

            console.log(`${c.dim}Reading image from clipboard...${c.reset}`);
            const clipboardData = pasteImageFromClipboard();

            if (!clipboardData) {
              console.log(`${c.yellow}No image found in clipboard${c.reset}`);
              console.log(`${c.dim}Copy an image first (Cmd+C on an image, or take a screenshot with Cmd+Shift+4)${c.reset}`);
            } else {
              console.log(`${c.green}✓${c.reset} Image found in clipboard`);
              console.log(`${c.purple}●${c.reset} ${c.bold}Analyzing image${c.reset}`);

              const pasteMessage = createImageMessage(pastePrompt, clipboardData);
              messages.push(pasteMessage);
              await chatWithImage(pastePrompt, clipboardData);
            }
          }
          break;

        case "render":
          // Test rich text rendering - Claude Code style demo
          const testContent = `# Rendering Demo

Here's how different elements render:

## Code Block
\`\`\`typescript
async function fetchData(url: string): Promise<Data> {
  const response = await fetch(url);
  // Parse JSON response
  return response.json();
}
\`\`\`

## Table
| Model | Speed | VRAM |
|-------|-------|------|
| qwen2.5:14b | ~50 tok/s | 9GB |
| llama3.2:3b | ~150 tok/s | 2GB |

## Formatting
- **Bold** and *italic* text
- Inline \`code\` formatting
- [x] Completed task
- [ ] Pending task
`;
          console.log(formatMarkdown(testContent));
          break;

        default:
          console.log(`Unknown: ${cmd}`);
      }

      return;
    }

    await chat(input);
  }

  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    hasPendingInput = true;
    commandQueue.push(input);
    processNextCommand();
  });

  rl.on("close", async () => {
    isClosing = true;
    // Wait for any pending commands to complete before exiting
    while (hasPendingInput || isProcessingCommand || commandQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Auto-save conversation if enabled and we have messages
    if (CONFIG.autoSave && messages.length > 1) {
      const sessionName = SESSION_NAME || `session-${SESSION_ID}`;
      saveConversation(sessionName, messages);
      console.log(`\n${c.dim}Auto-saved: ${sessionName}${c.reset}`);
    }
    console.log(`${c.purple}Bye!${c.reset}`);
    process.exit(0);
  });
}

main().catch(console.error);
