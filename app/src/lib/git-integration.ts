/**
 * Git integration for Rodeo
 * Provides git status, diff, and commit message generation
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface GitStatus {
  isGitRepo: boolean;
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  hasChanges: boolean;
  clean: boolean;
}

export interface GitFileChange {
  status: "added" | "modified" | "deleted" | "renamed" | "copied";
  path: string;
  oldPath?: string; // For renames
}

export interface GitDiff {
  staged: string;
  unstaged: string;
  combined: string;
  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
}

export interface CommitResult {
  success: boolean;
  message?: string;
  hash?: string;
  error?: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Check if directory is a git repository
 */
export async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --is-inside-work-tree", {
      cwd: projectRoot,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current git status
 */
export async function getGitStatus(projectRoot: string): Promise<GitStatus> {
  const defaultStatus: GitStatus = {
    isGitRepo: false,
    branch: "",
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    hasChanges: false,
    clean: true,
  };

  try {
    // Check if git repo
    const isRepo = await isGitRepo(projectRoot);
    if (!isRepo) {
      return defaultStatus;
    }

    // Get branch info
    let branch = "";
    try {
      const { stdout } = await execAsync("git branch --show-current", {
        cwd: projectRoot,
      });
      branch = stdout.trim();
    } catch {
      branch = "HEAD detached";
    }

    // Get ahead/behind count
    let ahead = 0;
    let behind = 0;
    try {
      const { stdout } = await execAsync(
        "git rev-list --left-right --count HEAD...@{u} 2>/dev/null || echo '0\t0'",
        { cwd: projectRoot }
      );
      const [a, b] = stdout.trim().split("\t").map(Number);
      ahead = a || 0;
      behind = b || 0;
    } catch {
      // No upstream
    }

    // Get status with porcelain format
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectRoot,
    });

    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: string[] = [];

    for (const line of statusOutput.split("\n")) {
      if (!line) continue;

      const indexStatus = line[0];
      const workStatus = line[1];
      const filePath = line.slice(3);

      // Parse rename/copy
      let path = filePath;
      let oldPath: string | undefined;
      if (filePath.includes(" -> ")) {
        [oldPath, path] = filePath.split(" -> ");
      }

      // Staged changes (index)
      if (indexStatus !== " " && indexStatus !== "?") {
        staged.push({
          status: parseStatus(indexStatus),
          path,
          oldPath,
        });
      }

      // Unstaged changes (working tree)
      if (workStatus !== " " && workStatus !== "?") {
        unstaged.push({
          status: parseStatus(workStatus),
          path,
        });
      }

      // Untracked files
      if (indexStatus === "?" && workStatus === "?") {
        untracked.push(path);
      }
    }

    const hasChanges = staged.length > 0 || unstaged.length > 0 || untracked.length > 0;

    return {
      isGitRepo: true,
      branch,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      hasChanges,
      clean: !hasChanges,
    };
  } catch {
    return defaultStatus;
  }
}

/**
 * Get git diff
 */
export async function getGitDiff(
  projectRoot: string,
  options?: { staged?: boolean; unstaged?: boolean }
): Promise<GitDiff> {
  const result: GitDiff = {
    staged: "",
    unstaged: "",
    combined: "",
    stats: {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    },
  };

  try {
    const showStaged = options?.staged ?? true;
    const showUnstaged = options?.unstaged ?? true;

    if (showStaged) {
      try {
        const { stdout } = await execAsync("git diff --cached", {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        });
        result.staged = stdout;
      } catch {
        // No staged changes
      }
    }

    if (showUnstaged) {
      try {
        const { stdout } = await execAsync("git diff", {
          cwd: projectRoot,
          maxBuffer: 10 * 1024 * 1024,
        });
        result.unstaged = stdout;
      } catch {
        // No unstaged changes
      }
    }

    result.combined = [result.staged, result.unstaged].filter(Boolean).join("\n\n");

    // Get stats
    try {
      const { stdout } = await execAsync("git diff --cached --stat", {
        cwd: projectRoot,
      });
      const statsMatch = stdout.match(/(\d+) files? changed(?:, (\d+) insertions?)?(?:, (\d+) deletions?)?/);
      if (statsMatch) {
        result.stats.filesChanged = parseInt(statsMatch[1]) || 0;
        result.stats.insertions = parseInt(statsMatch[2]) || 0;
        result.stats.deletions = parseInt(statsMatch[3]) || 0;
      }
    } catch {
      // No stats available
    }

    return result;
  } catch {
    return result;
  }
}

/**
 * Generate a commit message based on staged changes
 */
export async function generateCommitMessage(
  projectRoot: string,
  _model?: string
): Promise<string> {
  const status = await getGitStatus(projectRoot);
  const diff = await getGitDiff(projectRoot, { staged: true, unstaged: false });

  if (status.staged.length === 0) {
    return "# No staged changes to commit";
  }

  // Build a summary of changes
  const changes: string[] = [];

  for (const file of status.staged) {
    const action = file.status === "added" ? "Add" :
                   file.status === "deleted" ? "Remove" :
                   file.status === "renamed" ? "Rename" : "Update";
    changes.push(`- ${action} ${file.path}`);
  }

  // Analyze the diff to determine the type of change
  const diffContent = diff.staged.slice(0, 5000); // Limit for analysis

  let commitType = "chore";
  let subject = "Update files";

  if (diffContent.includes("test") || diffContent.includes("spec")) {
    commitType = "test";
    subject = "Add/update tests";
  } else if (diffContent.includes("fix") || diffContent.includes("bug")) {
    commitType = "fix";
    subject = "Fix bug";
  } else if (status.staged.some(f => f.status === "added")) {
    commitType = "feat";
    subject = "Add new feature";
  } else if (diffContent.includes("refactor")) {
    commitType = "refactor";
    subject = "Refactor code";
  } else if (status.staged.some(f => f.path.endsWith(".md"))) {
    commitType = "docs";
    subject = "Update documentation";
  }

  // Create the message
  const message = `${commitType}: ${subject}

Changes:
${changes.join("\n")}

Files: ${status.staged.length}
+${diff.stats.insertions} -${diff.stats.deletions}`;

  return message;
}

/**
 * Create a commit with the given message
 */
export async function createCommit(
  projectRoot: string,
  message: string
): Promise<CommitResult> {
  try {
    // Check for staged changes
    const status = await getGitStatus(projectRoot);
    if (status.staged.length === 0) {
      return {
        success: false,
        error: "No staged changes to commit",
      };
    }

    // Create commit
    const { stdout } = await execAsync(
      `git commit -m "${message.replace(/"/g, '\\"')}"`,
      { cwd: projectRoot }
    );

    // Get commit hash
    const hashMatch = stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    const hash = hashMatch?.[1] || "unknown";

    return {
      success: true,
      message,
      hash,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get recent commits for context
 */
export async function getRecentCommits(
  projectRoot: string,
  count: number = 5
): Promise<Array<{ hash: string; message: string; date: string }>> {
  try {
    const { stdout } = await execAsync(
      `git log --oneline -n ${count} --pretty=format:"%h|%s|%cr"`,
      { cwd: projectRoot }
    );

    return stdout.split("\n").filter(Boolean).map((line) => {
      const [hash, message, date] = line.split("|");
      return { hash, message, date };
    });
  } catch {
    return [];
  }
}

/**
 * Stage files for commit
 */
export async function stageFiles(
  projectRoot: string,
  files: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const fileList = files.map((f) => `"${f}"`).join(" ");
    await execAsync(`git add ${fileList}`, { cwd: projectRoot });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Stage all changes
 */
export async function stageAll(
  projectRoot: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync("git add -A", { cwd: projectRoot });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function parseStatus(char: string): GitFileChange["status"] {
  switch (char) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "modified";
  }
}

/**
 * Format git status for display
 */
export function formatGitStatus(status: GitStatus): string {
  if (!status.isGitRepo) {
    return "Not a git repository";
  }

  const lines: string[] = [];

  // Branch info
  let branchLine = `On branch **${status.branch}**`;
  if (status.ahead > 0 || status.behind > 0) {
    const parts: string[] = [];
    if (status.ahead > 0) parts.push(`${status.ahead} ahead`);
    if (status.behind > 0) parts.push(`${status.behind} behind`);
    branchLine += ` (${parts.join(", ")})`;
  }
  lines.push(branchLine);
  lines.push("");

  if (status.clean) {
    lines.push("Working tree clean");
    return lines.join("\n");
  }

  // Staged changes
  if (status.staged.length > 0) {
    lines.push("**Staged changes:**");
    for (const change of status.staged) {
      const icon = change.status === "added" ? "+" :
                   change.status === "deleted" ? "-" :
                   change.status === "renamed" ? "R" : "M";
      lines.push(`  ${icon} ${change.path}`);
    }
    lines.push("");
  }

  // Unstaged changes
  if (status.unstaged.length > 0) {
    lines.push("**Unstaged changes:**");
    for (const change of status.unstaged) {
      const icon = change.status === "added" ? "+" :
                   change.status === "deleted" ? "-" : "M";
      lines.push(`  ${icon} ${change.path}`);
    }
    lines.push("");
  }

  // Untracked files
  if (status.untracked.length > 0) {
    lines.push("**Untracked files:**");
    for (const file of status.untracked.slice(0, 20)) {
      lines.push(`  ? ${file}`);
    }
    if (status.untracked.length > 20) {
      lines.push(`  ... and ${status.untracked.length - 20} more`);
    }
  }

  return lines.join("\n");
}

/**
 * Get a compact status for header display
 */
export function getCompactStatus(status: GitStatus): {
  branch: string;
  changes: number;
  staged: number;
  icon: string;
} {
  if (!status.isGitRepo) {
    return { branch: "", changes: 0, staged: 0, icon: "" };
  }

  const changes = status.unstaged.length + status.untracked.length;
  const staged = status.staged.length;

  let icon = "";
  if (status.clean) {
    icon = "✓";
  } else if (staged > 0) {
    icon = "●";
  } else if (changes > 0) {
    icon = "○";
  }

  return {
    branch: status.branch,
    changes,
    staged,
    icon,
  };
}
