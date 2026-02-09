"use client";

import { useMemo } from "react";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  filePath?: string;
  className?: string;
}

interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

/**
 * Word-level diff viewer component
 * Shows additions and removals with syntax highlighting
 */
export function DiffViewer({
  oldContent,
  newContent,
  filePath,
  className = "",
}: DiffViewerProps) {
  const diff = useMemo(() => {
    return computeDiff(oldContent, newContent);
  }, [oldContent, newContent]);

  if (diff.length === 0) {
    return (
      <div className={`bg-terminal-bg rounded-lg p-4 text-terminal-muted ${className}`}>
        No changes
      </div>
    );
  }

  return (
    <div className={`bg-terminal-bg rounded-lg overflow-hidden ${className}`}>
      {filePath && (
        <div className="px-4 py-2 bg-terminal-surface border-b border-terminal-border text-sm font-mono text-terminal-muted">
          {filePath}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {diff.map((line, idx) => (
              <tr
                key={idx}
                className={
                  line.type === "add"
                    ? "bg-terminal-green/10"
                    : line.type === "remove"
                    ? "bg-terminal-red/10"
                    : ""
                }
              >
                {/* Line numbers */}
                <td className="w-12 px-2 py-0.5 text-right text-terminal-muted select-none border-r border-terminal-border/50">
                  {line.oldLineNum ?? ""}
                </td>
                <td className="w-12 px-2 py-0.5 text-right text-terminal-muted select-none border-r border-terminal-border/50">
                  {line.newLineNum ?? ""}
                </td>
                {/* Indicator */}
                <td
                  className={`w-6 px-1 py-0.5 text-center select-none ${
                    line.type === "add"
                      ? "text-terminal-green"
                      : line.type === "remove"
                      ? "text-terminal-red"
                      : "text-terminal-muted"
                  }`}
                >
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </td>
                {/* Content */}
                <td className="px-2 py-0.5 whitespace-pre">
                  <span
                    className={
                      line.type === "add"
                        ? "text-terminal-green"
                        : line.type === "remove"
                        ? "text-terminal-red"
                        : "text-terminal-text"
                    }
                  >
                    {line.content || " "}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Inline diff component for smaller changes
 */
export function InlineDiff({
  oldText,
  newText,
  className = "",
}: {
  oldText: string;
  newText: string;
  className?: string;
}) {
  const changes = useMemo(() => {
    return computeWordDiff(oldText, newText);
  }, [oldText, newText]);

  return (
    <span className={className}>
      {changes.map((change, idx) => (
        <span
          key={idx}
          className={
            change.type === "add"
              ? "bg-terminal-green/20 text-terminal-green"
              : change.type === "remove"
              ? "bg-terminal-red/20 text-terminal-red line-through"
              : ""
          }
        >
          {change.text}
        </span>
      ))}
    </span>
  );
}

// ============================================================================
// Diff Algorithm (simplified LCS-based)
// ============================================================================

function computeDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const result: DiffLine[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  // Simple diff: match lines, mark additions and removals
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (oldIdx >= oldLines.length) {
      // Only new lines left
      result.push({
        type: "add",
        content: newLines[newIdx],
        newLineNum: newIdx + 1,
      });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // Only old lines left
      result.push({
        type: "remove",
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1,
      });
      oldIdx++;
    } else if (oldLines[oldIdx] === newLines[newIdx]) {
      // Lines match
      result.push({
        type: "context",
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1,
        newLineNum: newIdx + 1,
      });
      oldIdx++;
      newIdx++;
    } else {
      // Lines differ - look ahead to find best match
      const oldLookAhead = findInArray(oldLines, newLines[newIdx], oldIdx, 5);
      const newLookAhead = findInArray(newLines, oldLines[oldIdx], newIdx, 5);

      if (oldLookAhead !== -1 && (newLookAhead === -1 || oldLookAhead <= newLookAhead)) {
        // Old line was removed
        while (oldIdx < oldLookAhead) {
          result.push({
            type: "remove",
            content: oldLines[oldIdx],
            oldLineNum: oldIdx + 1,
          });
          oldIdx++;
        }
      } else if (newLookAhead !== -1) {
        // New line was added
        while (newIdx < newLookAhead) {
          result.push({
            type: "add",
            content: newLines[newIdx],
            newLineNum: newIdx + 1,
          });
          newIdx++;
        }
      } else {
        // Complete replacement
        result.push({
          type: "remove",
          content: oldLines[oldIdx],
          oldLineNum: oldIdx + 1,
        });
        result.push({
          type: "add",
          content: newLines[newIdx],
          newLineNum: newIdx + 1,
        });
        oldIdx++;
        newIdx++;
      }
    }
  }

  return result;
}

function findInArray(arr: string[], target: string, start: number, limit: number): number {
  for (let i = start; i < Math.min(arr.length, start + limit); i++) {
    if (arr[i] === target) return i;
  }
  return -1;
}

interface WordChange {
  type: "add" | "remove" | "same";
  text: string;
}

function computeWordDiff(oldText: string, newText: string): WordChange[] {
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);

  const result: WordChange[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldWords.length || newIdx < newWords.length) {
    if (oldIdx >= oldWords.length) {
      result.push({ type: "add", text: newWords[newIdx] });
      newIdx++;
    } else if (newIdx >= newWords.length) {
      result.push({ type: "remove", text: oldWords[oldIdx] });
      oldIdx++;
    } else if (oldWords[oldIdx] === newWords[newIdx]) {
      result.push({ type: "same", text: oldWords[oldIdx] });
      oldIdx++;
      newIdx++;
    } else {
      // Check for word change vs insertion/deletion
      const oldLookAhead = newWords.indexOf(oldWords[oldIdx], newIdx);
      const newLookAhead = oldWords.indexOf(newWords[newIdx], oldIdx);

      if (oldLookAhead !== -1 && oldLookAhead - newIdx < 3) {
        // Word was inserted
        while (newIdx < oldLookAhead) {
          result.push({ type: "add", text: newWords[newIdx] });
          newIdx++;
        }
      } else if (newLookAhead !== -1 && newLookAhead - oldIdx < 3) {
        // Word was removed
        while (oldIdx < newLookAhead) {
          result.push({ type: "remove", text: oldWords[oldIdx] });
          oldIdx++;
        }
      } else {
        // Word changed
        result.push({ type: "remove", text: oldWords[oldIdx] });
        result.push({ type: "add", text: newWords[newIdx] });
        oldIdx++;
        newIdx++;
      }
    }
  }

  return result;
}

/**
 * Git diff parser - converts git diff output to structured format
 */
export function parseGitDiff(diffContent: string): Array<{
  filePath: string;
  hunks: Array<{
    header: string;
    lines: DiffLine[];
  }>;
}> {
  const files: Array<{
    filePath: string;
    hunks: Array<{ header: string; lines: DiffLine[] }>;
  }> = [];

  const fileBlocks = diffContent.split(/^diff --git/m).slice(1);

  for (const block of fileBlocks) {
    const lines = block.split("\n");

    // Extract file path
    const pathMatch = lines[0]?.match(/a\/(.+) b\//);
    const filePath = pathMatch?.[1] || "unknown";

    const hunks: Array<{ header: string; lines: DiffLine[] }> = [];
    let currentHunk: { header: string; lines: DiffLine[] } | null = null;
    let oldLineNum = 0;
    let newLineNum = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        // New hunk
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
        oldLineNum = parseInt(match?.[1] || "1");
        newLineNum = parseInt(match?.[2] || "1");

        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          currentHunk.lines.push({
            type: "add",
            content: line.slice(1),
            newLineNum: newLineNum++,
          });
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          currentHunk.lines.push({
            type: "remove",
            content: line.slice(1),
            oldLineNum: oldLineNum++,
          });
        } else if (line.startsWith(" ")) {
          currentHunk.lines.push({
            type: "context",
            content: line.slice(1),
            oldLineNum: oldLineNum++,
            newLineNum: newLineNum++,
          });
        }
      }
    }

    files.push({ filePath, hunks });
  }

  return files;
}
