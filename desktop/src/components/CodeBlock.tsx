import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="my-3 border border-terminal-border rounded-lg overflow-hidden bg-[#0b0e14]">
      <div className="px-3 py-1.5 bg-terminal-surface/70 border-b border-terminal-border flex items-center justify-between">
        <span className="text-xs text-terminal-muted font-medium">{language || "code"}</span>
        <button onClick={handleCopy} className="text-xs text-terminal-muted hover:text-terminal-accent transition-colors">
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={oneDark}
        customStyle={{ margin: 0, background: "transparent", padding: "0.85rem", fontSize: "12.5px", lineHeight: 1.55 }}
        codeTagProps={{ style: { fontFamily: "'JetBrains Mono', monospace" } }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
