import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { parseCommand, findCommand } from "@/lib/slash-commands";
import { getSandboxPath } from "@/lib/tool-executor";
import {
  undoLastEdit,
  rollbackSession,
  getChangedFiles,
  getChangeCount,
  isPlanMode,
} from "@/lib/session-state";
import {
  getProjectMemory,
  addInsight,
  removeFromMemory,
  formatMemoryForDisplay,
  autoDetectAndSaveTechStack,
} from "@/lib/project-memory";
import {
  getGitStatus,
  getGitDiff,
  generateCommitMessage,
  formatGitStatus,
  isGitRepo,
} from "@/lib/git-integration";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// Types
// ============================================================================

interface CommandResponse {
  success: boolean;
  output?: string;
  error?: string;
  data?: unknown;
}

// ============================================================================
// Handler
// ============================================================================

export async function POST(req: NextRequest): Promise<Response> {
  // 1. Auth
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse request
  const body = await req.json();
  const {
    command: commandInput,
    instance_id: instanceId = "default",
    project_root: clientProjectRoot,
  } = body;

  if (!commandInput) {
    return Response.json({ error: "Missing command" }, { status: 400 });
  }

  // 3. Parse command
  const parsed = parseCommand(commandInput);
  if (!parsed) {
    return Response.json({ error: "Invalid command format" }, { status: 400 });
  }

  const command = findCommand(parsed.name);
  if (!command) {
    return Response.json(
      { error: `Unknown command: /${parsed.name}` },
      { status: 400 }
    );
  }

  if (command.type !== "server") {
    return Response.json(
      { error: `/${parsed.name} is a client-side command` },
      { status: 400 }
    );
  }

  // 4. Get project root
  const projectRoot = clientProjectRoot || await getSandboxPath(user.id, instanceId);

  // 5. Execute command
  let response: CommandResponse;

  try {
    switch (command.name) {
      case "git":
        response = await handleGitStatus(projectRoot);
        break;

      case "diff":
        response = await handleGitDiff(projectRoot);
        break;

      case "commit":
        response = await handleCommit(projectRoot, parsed.flags);
        break;

      case "explore":
        response = await handleExplore(projectRoot, instanceId);
        break;

      case "memory":
        response = await handleMemory(instanceId, projectRoot);
        break;

      case "remember":
        response = await handleRemember(instanceId, projectRoot, parsed.rawArgs);
        break;

      case "forget":
        response = await handleForget(instanceId, projectRoot, parsed.args[0]);
        break;

      case "undo":
        response = await handleUndo(instanceId, user.id);
        break;

      case "rollback":
        response = await handleRollback(instanceId, user.id);
        break;

      case "changes":
        response = await handleChanges(instanceId, user.id);
        break;

      case "search":
        response = await handleSearch(parsed.rawArgs);
        break;

      case "imagine":
        // Handled by the chat route with /imagine prefix
        response = {
          success: false,
          error: "Use /imagine in chat for image generation",
        };
        break;

      default:
        response = {
          success: false,
          error: `Command /${command.name} is not implemented`,
        };
    }
  } catch (error: any) {
    response = {
      success: false,
      error: error.message,
    };
  }

  return Response.json(response);
}

// ============================================================================
// Command Handlers
// ============================================================================

async function handleGitStatus(projectRoot: string): Promise<CommandResponse> {
  const status = await getGitStatus(projectRoot);

  if (!status.isGitRepo) {
    return {
      success: true,
      output: "Not a git repository. Run `git init` to initialize.",
    };
  }

  return {
    success: true,
    output: formatGitStatus(status),
    data: status,
  };
}

async function handleGitDiff(projectRoot: string): Promise<CommandResponse> {
  const isRepo = await isGitRepo(projectRoot);
  if (!isRepo) {
    return {
      success: false,
      error: "Not a git repository",
    };
  }

  const diff = await getGitDiff(projectRoot);

  if (!diff.combined) {
    return {
      success: true,
      output: "No changes to show",
    };
  }

  // Truncate if too long
  let output = diff.combined;
  if (output.length > 50000) {
    output = output.slice(0, 50000) + "\n\n... (diff truncated)";
  }

  return {
    success: true,
    output: "```diff\n" + output + "\n```",
    data: diff.stats,
  };
}

async function handleCommit(
  projectRoot: string,
  _flags: Record<string, boolean | string>
): Promise<CommandResponse> {
  const isRepo = await isGitRepo(projectRoot);
  if (!isRepo) {
    return {
      success: false,
      error: "Not a git repository",
    };
  }

  const status = await getGitStatus(projectRoot);
  if (status.staged.length === 0) {
    return {
      success: false,
      error: "No staged changes. Use `git add` to stage files first.",
    };
  }

  // Generate commit message
  const message = await generateCommitMessage(projectRoot);

  return {
    success: true,
    output: `**Suggested commit message:**\n\n\`\`\`\n${message}\n\`\`\`\n\nRun \`git commit -m "your message"\` to commit.`,
    data: { suggestedMessage: message },
  };
}

async function handleExplore(
  projectRoot: string,
  instanceId: string
): Promise<CommandResponse> {
  const lines: string[] = [];
  lines.push("# Project Overview\n");

  // Auto-detect tech stack
  const memory = await autoDetectAndSaveTechStack(instanceId, projectRoot);
  if (memory.techStack.length > 0) {
    lines.push("## Tech Stack");
    lines.push(memory.techStack.join(", "));
    lines.push("");
  }

  // List top-level structure
  try {
    const { stdout } = await execAsync("ls -la", { cwd: projectRoot });
    lines.push("## Directory Structure");
    lines.push("```");
    lines.push(stdout);
    lines.push("```");
  } catch {
    lines.push("Could not list directory");
  }

  // Count files by type
  try {
    const { stdout } = await execAsync(
      'find . -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | wc -l',
      { cwd: projectRoot }
    );
    lines.push(`\n**Source files:** ${stdout.trim()} TypeScript/JavaScript files`);
  } catch {
    // Ignore
  }

  // Git status if available
  const gitStatus = await getGitStatus(projectRoot);
  if (gitStatus.isGitRepo) {
    lines.push(`\n## Git`);
    lines.push(`Branch: ${gitStatus.branch}`);
    if (gitStatus.hasChanges) {
      lines.push(`Changes: ${gitStatus.staged.length} staged, ${gitStatus.unstaged.length} unstaged, ${gitStatus.untracked.length} untracked`);
    } else {
      lines.push("Working tree clean");
    }
  }

  return {
    success: true,
    output: lines.join("\n"),
  };
}

async function handleMemory(
  instanceId: string,
  projectRoot: string
): Promise<CommandResponse> {
  const memory = await getProjectMemory(instanceId, projectRoot);

  if (!memory) {
    return {
      success: true,
      output: "No memory saved yet. Use `/remember <text>` to save insights.",
    };
  }

  return {
    success: true,
    output: formatMemoryForDisplay(memory),
    data: memory,
  };
}

async function handleRemember(
  instanceId: string,
  projectRoot: string,
  text: string
): Promise<CommandResponse> {
  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: "Usage: /remember <text>\nExample: /remember prefer functional components",
    };
  }

  const memory = await addInsight(instanceId, projectRoot, text.trim());

  return {
    success: true,
    output: `Saved to memory: "${text.trim()}"\n\nTotal insights: ${memory.insights.length}`,
  };
}

async function handleForget(
  instanceId: string,
  projectRoot: string,
  indexStr: string
): Promise<CommandResponse> {
  const index = parseInt(indexStr);
  if (isNaN(index)) {
    return {
      success: false,
      error: "Usage: /forget <index>\nUse /memory to see indexed items",
    };
  }

  const result = await removeFromMemory(instanceId, projectRoot, "insights", index);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  return {
    success: true,
    output: `Removed from memory: "${result.removed}"`,
  };
}

async function handleUndo(
  instanceId: string,
  userId: string
): Promise<CommandResponse> {
  const result = await undoLastEdit(instanceId, userId);

  return {
    success: result.success,
    output: result.message,
    data: result.restoredPath ? { restoredPath: result.restoredPath } : undefined,
  };
}

async function handleRollback(
  instanceId: string,
  userId: string
): Promise<CommandResponse> {
  const result = await rollbackSession(instanceId, userId);

  let output = result.message;
  if (result.errors.length > 0) {
    output += "\n\nErrors:\n" + result.errors.map((e) => `- ${e}`).join("\n");
  }

  return {
    success: result.success,
    output,
    data: { filesRestored: result.filesRestored },
  };
}

async function handleChanges(
  instanceId: string,
  userId: string
): Promise<CommandResponse> {
  const count = getChangeCount(instanceId, userId);
  const files = getChangedFiles(instanceId, userId);

  if (count === 0) {
    return {
      success: true,
      output: "No changes in this session",
    };
  }

  const output = `**${count} change(s) in this session:**\n\n${files.map((f) => `- ${f}`).join("\n")}`;

  return {
    success: true,
    output,
    data: { count, files },
  };
}

async function handleSearch(query: string): Promise<CommandResponse> {
  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: "Usage: /search <query>",
    };
  }

  // Note: Actual web search would require an external API
  // For now, return a placeholder that suggests using the AI for this
  return {
    success: true,
    output: `To search the web, ask me: "Search for ${query}"\n\nI can help research topics and summarize findings.`,
  };
}

// ============================================================================
// GET handler for session info
// ============================================================================

export async function GET(req: NextRequest): Promise<Response> {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = req.nextUrl.searchParams.get("instance_id") || "default";
  const projectRoot = req.nextUrl.searchParams.get("project_root") ||
    await getSandboxPath(user.id, instanceId);

  // Get session info
  const changeCount = getChangeCount(instanceId, user.id);
  const planMode = isPlanMode(instanceId, user.id);

  // Get git status
  let gitInfo = null;
  try {
    const status = await getGitStatus(projectRoot);
    if (status.isGitRepo) {
      gitInfo = {
        branch: status.branch,
        hasChanges: status.hasChanges,
        staged: status.staged.length,
        unstaged: status.unstaged.length,
        untracked: status.untracked.length,
      };
    }
  } catch {
    // Git not available
  }

  // Get memory summary
  let memorySummary = null;
  try {
    const memory = await getProjectMemory(instanceId, projectRoot);
    if (memory) {
      memorySummary = {
        insights: memory.insights.length,
        conventions: memory.conventions.length,
        todos: memory.todos.length,
      };
    }
  } catch {
    // Memory not available
  }

  return Response.json({
    instanceId,
    projectRoot,
    session: {
      changeCount,
      planMode,
    },
    git: gitInfo,
    memory: memorySummary,
  });
}
