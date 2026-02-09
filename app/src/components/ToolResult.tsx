"use client";

import { useState } from "react";
import { DiffViewer } from "./DiffViewer";

interface ToolResultProps {
  tool: string;
  status: "running" | "done" | "error";
  result?: {
    success: boolean;
    output: string;
    error?: string;
  };
  arguments?: string;
  className?: string;
}

/**
 * Tool result visualization component
 * Shows tool execution status and output with appropriate formatting
 */
export function ToolResult({
  tool,
  status,
  result,
  arguments: args,
  className = "",
}: ToolResultProps) {
  const [expanded, setExpanded] = useState(false);
  const parsedArgs = parseArgs(args);

  // Determine if output is long enough to collapse
  const outputLength = result?.output?.length || 0;
  const isCollapsible = outputLength > 500;
  const displayOutput = expanded || !isCollapsible
    ? result?.output
    : result?.output?.slice(0, 500) + "...";

  return (
    <div
      className={`tool-result rounded-lg border overflow-hidden ${
        status === "running"
          ? "border-terminal-yellow/30 bg-terminal-yellow/5"
          : status === "error" || (result && !result.success)
          ? "border-terminal-red/30 bg-terminal-red/5"
          : "border-terminal-green/30 bg-terminal-green/5"
      } ${className}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
          isCollapsible ? "hover:bg-terminal-surface/50" : ""
        }`}
        onClick={() => isCollapsible && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {/* Status icon */}
          <StatusIcon status={status} success={result?.success} />

          {/* Tool name */}
          <span
            className={`font-mono text-sm font-medium ${
              status === "running"
                ? "text-terminal-yellow"
                : status === "error" || (result && !result.success)
                ? "text-terminal-red"
                : "text-terminal-green"
            }`}
          >
            {tool}
          </span>

          {/* Brief args summary */}
          {parsedArgs && (
            <span className="text-xs text-terminal-muted truncate max-w-[200px]">
              {formatArgsSummary(tool, parsedArgs)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status text */}
          <span className="text-xs text-terminal-muted">
            {status === "running"
              ? "Running..."
              : result?.success
              ? "Success"
              : "Failed"}
          </span>

          {/* Expand/collapse indicator */}
          {isCollapsible && (
            <svg
              className={`w-4 h-4 text-terminal-muted transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {/* Output */}
      {result && (expanded || !isCollapsible || status === "error") && (
        <div className="border-t border-terminal-border/30">
          {/* Error message */}
          {result.error && (
            <div className="px-3 py-2 bg-terminal-red/10 text-terminal-red text-sm">
              {result.error}
            </div>
          )}

          {/* Output content */}
          {displayOutput && (
            <div className="px-3 py-2 font-mono text-xs overflow-x-auto">
              <ToolOutput tool={tool} output={displayOutput} args={parsedArgs} />
            </div>
          )}

          {/* Show more button */}
          {isCollapsible && !expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="w-full px-3 py-1 text-xs text-terminal-muted hover:text-terminal-accent border-t border-terminal-border/30"
            >
              Show full output ({Math.round(outputLength / 1000)}KB)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusIcon({
  status,
  success,
}: {
  status: "running" | "done" | "error";
  success?: boolean;
}) {
  if (status === "running") {
    return (
      <svg
        className="w-4 h-4 text-terminal-yellow animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
        <path d="M12 2a10 10 0 0 1 10 10" />
      </svg>
    );
  }

  if (status === "error" || !success) {
    return (
      <svg
        className="w-4 h-4 text-terminal-red"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }

  return (
    <svg
      className="w-4 h-4 text-terminal-green"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ToolOutput({
  tool,
  output,
  args,
}: {
  tool: string;
  output: string;
  args?: Record<string, unknown>;
}) {
  const toolLower = tool.toLowerCase();

  // Format output based on tool type
  switch (toolLower) {
    case "read":
      return <ReadOutput output={output} args={args} />;

    case "edit":
      return <EditOutput output={output} args={args} />;

    case "glob":
    case "list":
      return <FileListOutput output={output} />;

    case "grep":
      return <GrepOutput output={output} />;

    case "bash":
      return <BashOutput output={output} />;

    default:
      return <pre className="whitespace-pre-wrap text-terminal-text">{output}</pre>;
  }
}

function ReadOutput({ output, args }: { output: string; args?: Record<string, unknown> }) {
  const lines = output.split("\n");
  const filePath = args?.file_path as string;

  return (
    <div>
      {filePath && (
        <div className="text-terminal-muted mb-2 text-xs">
          {filePath}
        </div>
      )}
      <div className="bg-terminal-bg rounded overflow-x-auto">
        {lines.map((line, idx) => (
          <div key={idx} className="flex">
            <span className="text-terminal-muted select-none w-12 text-right pr-2 border-r border-terminal-border/30 mr-2">
              {line.match(/^\s*(\d+)/)?.[1] || ""}
            </span>
            <span className="text-terminal-text">{line.replace(/^\s*\d+\t/, "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditOutput({ output, args }: { output: string; args?: Record<string, unknown> }) {
  const filePath = args?.file_path as string;
  const oldString = args?.old_string as string;
  const newString = args?.new_string as string;

  // Show a mini diff if we have the strings
  if (oldString && newString) {
    return (
      <div>
        <div className="text-terminal-text mb-2">{output}</div>
        <div className="mt-2">
          <DiffViewer
            oldContent={oldString}
            newContent={newString}
            filePath={filePath}
            className="text-xs"
          />
        </div>
      </div>
    );
  }

  return <div className="text-terminal-text">{output}</div>;
}

function FileListOutput({ output }: { output: string }) {
  const lines = output.split("\n").filter(Boolean);

  return (
    <div className="space-y-0.5">
      {lines.map((line, idx) => {
        const isDir = line.endsWith("/");
        return (
          <div key={idx} className="flex items-center gap-2">
            <span className={isDir ? "text-terminal-accent" : "text-terminal-text"}>
              {isDir ? "📁" : "📄"}
            </span>
            <span className={isDir ? "text-terminal-accent" : "text-terminal-text"}>
              {line}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function GrepOutput({ output }: { output: string }) {
  const lines = output.split("\n").filter(Boolean);

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        // Parse grep output: file:line:content
        const match = line.match(/^([^:]+):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, content] = match;
          return (
            <div key={idx} className="flex gap-2">
              <span className="text-terminal-accent truncate max-w-[200px]" title={file}>
                {file}
              </span>
              <span className="text-terminal-muted">:{lineNum}</span>
              <span className="text-terminal-text">{content}</span>
            </div>
          );
        }
        return <div key={idx} className="text-terminal-text">{line}</div>;
      })}
    </div>
  );
}

function BashOutput({ output }: { output: string }) {
  return (
    <pre className="whitespace-pre-wrap text-terminal-text bg-terminal-bg rounded p-2">
      {output}
    </pre>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function parseArgs(args?: string): Record<string, unknown> | undefined {
  if (!args) return undefined;
  try {
    return JSON.parse(args);
  } catch {
    return undefined;
  }
}

function formatArgsSummary(tool: string, args: Record<string, unknown>): string {
  const toolLower = tool.toLowerCase();

  switch (toolLower) {
    case "read":
    case "write":
    case "list":
      return String(args.file_path || args.path || "");

    case "edit":
      return String(args.file_path || "");

    case "bash":
      const cmd = String(args.command || "");
      return cmd.length > 30 ? cmd.slice(0, 30) + "..." : cmd;

    case "glob":
      return String(args.pattern || "");

    case "grep":
      return `/${args.pattern || ""}/`;

    default:
      return "";
  }
}

// ============================================================================
// Compact Tool Badge
// ============================================================================

interface ToolBadgeProps {
  tool: string;
  status: "running" | "done" | "error";
  onClick?: () => void;
}

export function ToolBadge({ tool, status, onClick }: ToolBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${
        status === "running"
          ? "bg-terminal-yellow/20 text-terminal-yellow"
          : status === "error"
          ? "bg-terminal-red/20 text-terminal-red"
          : "bg-terminal-green/20 text-terminal-green"
      }`}
    >
      {status === "running" && (
        <svg
          className="w-3 h-3 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
      )}
      {tool}
    </button>
  );
}
