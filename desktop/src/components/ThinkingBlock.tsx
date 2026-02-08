import { useState } from "react";

interface ThinkingBlockProps {
  content: string;
}

export function ThinkingBlock({ content }: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) return null;

  const previewLength = 150;
  const preview =
    content.length > previewLength
      ? content.slice(0, previewLength) + "..."
      : content;

  return (
    <div className="mb-3 border border-terminal-border rounded bg-terminal-surface/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-xs text-terminal-muted hover:text-terminal-text transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-terminal-purple">◆</span>
          <span>Thinking</span>
        </span>
        <span>{isExpanded ? "▼" : "▶"}</span>
      </button>

      <div
        className={`px-3 overflow-hidden transition-all ${
          isExpanded ? "pb-3 max-h-[500px] overflow-auto" : "max-h-0"
        }`}
      >
        <pre className="text-xs text-terminal-muted whitespace-pre-wrap font-mono">
          {isExpanded ? content : preview}
        </pre>
      </div>

      {!isExpanded && content.length > previewLength && (
        <div className="px-3 pb-2">
          <pre className="text-xs text-terminal-muted/60 whitespace-pre-wrap font-mono">
            {preview}
          </pre>
        </div>
      )}
    </div>
  );
}
