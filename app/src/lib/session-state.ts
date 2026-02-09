/**
 * Session state management for undo/rollback functionality
 * Tracks file changes per session and provides restore capabilities
 */

import * as fs from "fs/promises";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export interface FileBackup {
  path: string;
  content: string | null; // null means file was created (didn't exist before)
  timestamp: Date;
}

export interface SessionChange {
  id: string;
  type: "create" | "edit" | "delete";
  path: string;
  backup: FileBackup;
  timestamp: Date;
}

export interface SessionState {
  id: string;
  instanceId: string;
  userId: string;
  projectRoot: string;
  changes: SessionChange[];
  undoStack: SessionChange[];
  readFiles: Set<string>;
  planMode: boolean;
  createdAt: Date;
  lastActivity: Date;
}

export interface UndoResult {
  success: boolean;
  message: string;
  restoredPath?: string;
}

export interface RollbackResult {
  success: boolean;
  message: string;
  filesRestored: number;
  errors: string[];
}

// ============================================================================
// Session Store (In-Memory)
// ============================================================================

const sessions = new Map<string, SessionState>();

/**
 * Get or create a session state
 */
export function getSession(
  instanceId: string,
  userId: string,
  projectRoot: string
): SessionState {
  const key = `${userId}:${instanceId}`;

  if (!sessions.has(key)) {
    sessions.set(key, {
      id: key,
      instanceId,
      userId,
      projectRoot,
      changes: [],
      undoStack: [],
      readFiles: new Set(),
      planMode: false,
      createdAt: new Date(),
      lastActivity: new Date(),
    });
  }

  const session = sessions.get(key)!;
  session.lastActivity = new Date();
  return session;
}

/**
 * Get session if it exists
 */
export function getExistingSession(instanceId: string, userId: string): SessionState | null {
  const key = `${userId}:${instanceId}`;
  return sessions.get(key) || null;
}

/**
 * Delete a session
 */
export function deleteSession(instanceId: string, userId: string): void {
  const key = `${userId}:${instanceId}`;
  sessions.delete(key);
}

// ============================================================================
// Change Tracking
// ============================================================================

/**
 * Track a file change for undo/rollback
 */
export function trackChange(
  instanceId: string,
  userId: string,
  projectRoot: string,
  change: {
    type: "create" | "edit" | "delete";
    path: string;
    backup: string | null; // Original content, or null if file was created
  }
): void {
  const session = getSession(instanceId, userId, projectRoot);

  const sessionChange: SessionChange = {
    id: crypto.randomUUID(),
    type: change.type,
    path: change.path,
    backup: {
      path: change.path,
      content: change.backup,
      timestamp: new Date(),
    },
    timestamp: new Date(),
  };

  session.changes.push(sessionChange);
  session.undoStack.push(sessionChange);
}

/**
 * Get the number of changes in the session
 */
export function getChangeCount(instanceId: string, userId: string): number {
  const session = getExistingSession(instanceId, userId);
  return session?.changes.length ?? 0;
}

/**
 * Get list of changed files
 */
export function getChangedFiles(instanceId: string, userId: string): string[] {
  const session = getExistingSession(instanceId, userId);
  if (!session) return [];

  const files = new Set(session.changes.map((c) => c.path));
  return Array.from(files);
}

// ============================================================================
// Undo Operations
// ============================================================================

/**
 * Undo the last file change
 */
export async function undoLastEdit(
  instanceId: string,
  userId: string
): Promise<UndoResult> {
  const session = getExistingSession(instanceId, userId);

  if (!session || session.undoStack.length === 0) {
    return {
      success: false,
      message: "Nothing to undo",
    };
  }

  const lastChange = session.undoStack.pop()!;

  try {
    if (lastChange.type === "create") {
      // File was created - delete it
      await fs.unlink(lastChange.path);
      return {
        success: true,
        message: `Deleted ${path.basename(lastChange.path)} (was created)`,
        restoredPath: lastChange.path,
      };
    } else if (lastChange.type === "edit" || lastChange.type === "delete") {
      // File was edited or deleted - restore backup
      if (lastChange.backup.content !== null) {
        await fs.writeFile(lastChange.path, lastChange.backup.content, "utf-8");
        return {
          success: true,
          message: `Restored ${path.basename(lastChange.path)}`,
          restoredPath: lastChange.path,
        };
      } else {
        return {
          success: false,
          message: "No backup content available",
        };
      }
    }

    return {
      success: false,
      message: "Unknown change type",
    };
  } catch (err: any) {
    // Put the change back on the stack since undo failed
    session.undoStack.push(lastChange);
    return {
      success: false,
      message: `Undo failed: ${err.message}`,
    };
  }
}

/**
 * Rollback all changes in the session
 */
export async function rollbackSession(
  instanceId: string,
  userId: string
): Promise<RollbackResult> {
  const session = getExistingSession(instanceId, userId);

  if (!session || session.changes.length === 0) {
    return {
      success: true,
      message: "No changes to rollback",
      filesRestored: 0,
      errors: [],
    };
  }

  const errors: string[] = [];
  let filesRestored = 0;

  // Process changes in reverse order
  const changesReversed = [...session.changes].reverse();

  // Group changes by file (only restore to first backup)
  const fileBackups = new Map<string, SessionChange>();
  for (const change of changesReversed) {
    if (!fileBackups.has(change.path)) {
      fileBackups.set(change.path, change);
    }
  }

  for (const [filePath, change] of Array.from(fileBackups.entries())) {
    try {
      if (change.backup.content === null) {
        // File was created during session - delete it
        try {
          await fs.unlink(filePath);
          filesRestored++;
        } catch (err: any) {
          if (err.code !== "ENOENT") {
            errors.push(`Failed to delete ${filePath}: ${err.message}`);
          }
        }
      } else {
        // Restore original content
        await fs.writeFile(filePath, change.backup.content, "utf-8");
        filesRestored++;
      }
    } catch (err: any) {
      errors.push(`Failed to restore ${filePath}: ${err.message}`);
    }
  }

  // Clear the session changes
  session.changes = [];
  session.undoStack = [];

  return {
    success: errors.length === 0,
    message:
      errors.length === 0
        ? `Rolled back ${filesRestored} file(s)`
        : `Rolled back ${filesRestored} file(s) with ${errors.length} error(s)`,
    filesRestored,
    errors,
  };
}

// ============================================================================
// Plan Mode
// ============================================================================

/**
 * Toggle plan mode for a session
 */
export function togglePlanMode(
  instanceId: string,
  userId: string,
  projectRoot: string,
  enabled?: boolean
): boolean {
  const session = getSession(instanceId, userId, projectRoot);
  session.planMode = enabled ?? !session.planMode;
  return session.planMode;
}

/**
 * Check if session is in plan mode
 */
export function isPlanMode(instanceId: string, userId: string): boolean {
  const session = getExistingSession(instanceId, userId);
  return session?.planMode ?? false;
}

// ============================================================================
// Read Tracking
// ============================================================================

/**
 * Mark a file as read in the session
 */
export function markFileRead(
  instanceId: string,
  userId: string,
  projectRoot: string,
  filePath: string
): void {
  const session = getSession(instanceId, userId, projectRoot);
  session.readFiles.add(filePath);
}

/**
 * Check if a file has been read in the session
 */
export function hasFileBeenRead(
  instanceId: string,
  userId: string,
  filePath: string
): boolean {
  const session = getExistingSession(instanceId, userId);
  return session?.readFiles.has(filePath) ?? false;
}

/**
 * Get all files read in the session
 */
export function getReadFiles(instanceId: string, userId: string): string[] {
  const session = getExistingSession(instanceId, userId);
  return session ? Array.from(session.readFiles) : [];
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up old sessions (> 24 hours inactive)
 */
export function cleanupOldSessions(): void {
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const now = Date.now();

  for (const [key, session] of Array.from(sessions.entries())) {
    if (now - session.lastActivity.getTime() > maxAge) {
      sessions.delete(key);
    }
  }
}

/**
 * Get session summary for UI
 */
export function getSessionSummary(instanceId: string, userId: string): {
  changeCount: number;
  changedFiles: string[];
  planMode: boolean;
  lastActivity: Date | null;
} | null {
  const session = getExistingSession(instanceId, userId);
  if (!session) return null;

  return {
    changeCount: session.changes.length,
    changedFiles: getChangedFiles(instanceId, userId),
    planMode: session.planMode,
    lastActivity: session.lastActivity,
  };
}

// Run cleanup every hour
if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldSessions, 60 * 60 * 1000);
}
