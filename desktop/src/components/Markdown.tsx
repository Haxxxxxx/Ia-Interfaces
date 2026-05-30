import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

/**
 * Renders assistant messages as proper Markdown (headers, lists, tables,
 * links, blockquotes) with syntax-highlighted fenced code blocks.
 */
export function Markdown({ content }: { content: string }) {
  return (
    <div className="md-body text-sm leading-relaxed selectable break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const text = String(children).replace(/\n$/, "");
            const isBlock = !!match || text.includes("\n");
            if (!isBlock) {
              return <code className="px-1 py-0.5 rounded bg-terminal-bg text-terminal-accent text-[0.85em]">{children}</code>;
            }
            return <CodeBlock code={text} language={match?.[1]} />;
          },
          // The code component already renders its own container.
          pre: ({ children }) => <>{children}</>,
          h1: ({ children }) => <h1 className="text-lg font-semibold mt-4 mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold mt-3 mb-1.5">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-1 text-terminal-text">{children}</h3>,
          p: ({ children }) => <p className="my-2 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => <a href={href} className="text-terminal-accent underline hover:opacity-80" target="_blank" rel="noreferrer">{children}</a>,
          strong: ({ children }) => <strong className="font-semibold text-terminal-text">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-terminal-accent/50 pl-3 my-2 text-terminal-muted">{children}</blockquote>,
          hr: () => <hr className="my-3 border-terminal-border" />,
          table: ({ children }) => <div className="my-2 overflow-x-auto"><table className="text-xs border-collapse">{children}</table></div>,
          th: ({ children }) => <th className="border border-terminal-border px-2 py-1 bg-terminal-surface text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-terminal-border px-2 py-1">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
