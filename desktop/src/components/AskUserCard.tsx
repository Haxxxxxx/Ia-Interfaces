import { useState } from "react";

interface AskUserCardProps {
  question: string;
  options: string[];
  header?: string;
  allowMultiple?: boolean;
  onAnswer: (answer: string) => void;
}

export function AskUserCard({ question, options, header, allowMultiple, onAnswer }: AskUserCardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  function toggle(opt: string) {
    if (allowMultiple) setSelected((s) => (s.includes(opt) ? s.filter((x) => x !== opt) : [...s, opt]));
    else onAnswer(opt); // single-select answers immediately
  }

  function submitMulti() {
    const answer = [...selected, custom.trim()].filter(Boolean).join("; ");
    if (answer) onAnswer(answer);
  }

  return (
    <div className="my-3 border border-terminal-accent/50 rounded-lg bg-terminal-surface animate-fadeIn">
      <div className="px-4 py-3 border-b border-terminal-border">
        {header && <div className="text-xs uppercase tracking-wide text-terminal-accent mb-1">{header}</div>}
        <div className="text-sm font-medium">{question}</div>
      </div>

      <div className="p-3 space-y-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                on ? "border-terminal-accent bg-terminal-accent/15 text-terminal-text" : "border-terminal-border hover:border-terminal-accent/50 hover:bg-terminal-bg"
              }`}
            >
              {allowMultiple && <span className="mr-2">{on ? "☑" : "☐"}</span>}
              {opt}
            </button>
          );
        })}

        {/* Custom answer */}
        <div className="flex gap-2 pt-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && custom.trim() && !allowMultiple) onAnswer(custom.trim()); }}
            placeholder="Other… (type your own answer)"
            className="flex-1 px-3 py-2 text-sm bg-terminal-bg border border-terminal-border rounded-lg focus:outline-none focus:ring-2 focus:ring-terminal-accent"
          />
          <button
            onClick={() => (allowMultiple ? submitMulti() : custom.trim() && onAnswer(custom.trim()))}
            disabled={allowMultiple ? selected.length === 0 && !custom.trim() : !custom.trim()}
            className="px-4 py-2 text-sm bg-terminal-accent text-terminal-bg rounded-lg font-medium hover:bg-opacity-80 disabled:opacity-40"
          >
            {allowMultiple ? "Submit" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
