"use client";

import { useState } from "react";

interface GitStatusBadgeProps {
  branch: string;
  hasChanges: boolean;
  staged: number;
  unstaged: number;
  untracked?: number;
  ahead?: number;
  behind?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * Compact git status badge for the header
 * Shows branch name and change indicators
 */
export function GitStatusBadge({
  branch,
  hasChanges,
  staged,
  unstaged,
  untracked = 0,
  ahead = 0,
  behind = 0,
  onClick,
  className = "",
}: GitStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Determine status color
  const statusColor = !hasChanges
    ? "text-terminal-green"
    : staged > 0
    ? "text-terminal-yellow"
    : "text-terminal-muted";

  // Status icon
  const statusIcon = !hasChanges ? "✓" : staged > 0 ? "●" : "○";

  // Total changes
  const totalChanges = staged + unstaged + untracked;

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm font-mono
          hover:bg-terminal-surface transition-colors ${statusColor}`}
      >
        {/* Branch icon */}
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>

        {/* Branch name */}
        <span className="max-w-[100px] truncate">{branch}</span>

        {/* Status indicator */}
        <span className={statusColor}>{statusIcon}</span>

        {/* Change count */}
        {hasChanges && (
          <span className="text-xs text-terminal-muted">
            {totalChanges}
          </span>
        )}

        {/* Ahead/behind indicators */}
        {(ahead > 0 || behind > 0) && (
          <span className="text-xs text-terminal-muted">
            {ahead > 0 && <span>↑{ahead}</span>}
            {behind > 0 && <span>↓{behind}</span>}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px]">
          <GitStatusTooltip
            branch={branch}
            hasChanges={hasChanges}
            staged={staged}
            unstaged={unstaged}
            untracked={untracked}
            ahead={ahead}
            behind={behind}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tooltip
// ============================================================================

interface GitStatusTooltipProps {
  branch: string;
  hasChanges: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

function GitStatusTooltip({
  branch,
  hasChanges,
  staged,
  unstaged,
  untracked,
  ahead,
  behind,
}: GitStatusTooltipProps) {
  return (
    <div className="bg-terminal-surface border border-terminal-border rounded-lg shadow-xl p-3 text-sm">
      <div className="font-semibold text-terminal-text mb-2">
        On branch <span className="text-terminal-accent">{branch}</span>
      </div>

      {!hasChanges ? (
        <div className="text-terminal-green flex items-center gap-2">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Working tree clean
        </div>
      ) : (
        <div className="space-y-1">
          {staged > 0 && (
            <div className="flex items-center gap-2 text-terminal-green">
              <span className="w-4 text-center">+</span>
              <span>{staged} staged</span>
            </div>
          )}
          {unstaged > 0 && (
            <div className="flex items-center gap-2 text-terminal-yellow">
              <span className="w-4 text-center">M</span>
              <span>{unstaged} modified</span>
            </div>
          )}
          {untracked > 0 && (
            <div className="flex items-center gap-2 text-terminal-muted">
              <span className="w-4 text-center">?</span>
              <span>{untracked} untracked</span>
            </div>
          )}
        </div>
      )}

      {/* Sync status */}
      {(ahead > 0 || behind > 0) && (
        <div className="mt-2 pt-2 border-t border-terminal-border text-terminal-muted">
          {ahead > 0 && <span className="mr-2">↑ {ahead} ahead</span>}
          {behind > 0 && <span>↓ {behind} behind</span>}
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-terminal-border text-xs text-terminal-muted">
        Click for /git command
      </div>
    </div>
  );
}

// ============================================================================
// Mini Badge (for very compact spaces)
// ============================================================================

interface GitMiniBadgeProps {
  branch: string;
  hasChanges: boolean;
  className?: string;
}

export function GitMiniBadge({ branch, hasChanges, className = "" }: GitMiniBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono ${
        hasChanges ? "text-terminal-yellow" : "text-terminal-muted"
      } ${className}`}
    >
      <svg
        className="w-3 h-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      {branch}
      {hasChanges && <span className="text-terminal-yellow">●</span>}
    </span>
  );
}

// ============================================================================
// Not a Git Repo Badge
// ============================================================================

export function NotGitRepoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-mono text-terminal-muted ${className}`}
    >
      <svg
        className="w-3 h-3 opacity-50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span className="opacity-50">no git</span>
    </span>
  );
}
