"use client";

import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

// Copy button component for code blocks
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded bg-terminal-surface/80 hover:bg-terminal-surface border border-terminal-border/50 text-terminal-muted hover:text-terminal-accent transition-colors"
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <svg className="w-4 h-4 text-terminal-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function MarkdownMessage({ content, className = "" }: MarkdownMessageProps) {
  if (!content) return null;

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node: _node, className, children, ...props }) {
            const isBlock = /language-\w+/.test(className || "");
            const codeString = String(children).replace(/\n$/, "");

            return isBlock ? (
              <div className="relative group">
                <CopyButton text={codeString} />
                <code
                  className={`block bg-terminal-bg border border-terminal-border rounded-lg p-4 pr-12 overflow-x-auto my-2 text-sm font-mono whitespace-pre ${className || ""}`}
                  {...props}
                >
                  {children}
                </code>
              </div>
            ) : (
              <code
                className="px-1.5 py-0.5 rounded bg-terminal-surface border border-terminal-border text-terminal-accent text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <div className="my-2">{children}</div>;
          },
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-terminal-text">{children}</strong>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-terminal-accent hover:underline"
              >
                {children}
              </a>
            );
          },
          h1({ children }) {
            return <h1 className="text-xl font-bold mt-4 mb-2 text-terminal-accent">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-3 mb-2 text-terminal-accent">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
