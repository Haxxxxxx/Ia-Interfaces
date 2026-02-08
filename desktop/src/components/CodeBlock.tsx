import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  return (
    <div className="my-3 border border-terminal-border rounded overflow-hidden">
      {/* Header */}
      <div className="px-3 py-1.5 bg-terminal-surface border-b border-terminal-border flex items-center justify-between">
        <span className="text-xs text-terminal-muted">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs text-terminal-muted hover:text-terminal-text transition-colors"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <pre className="p-3 overflow-x-auto bg-terminal-bg">
        <code className="text-sm text-terminal-text">{code}</code>
      </pre>
    </div>
  );
}
