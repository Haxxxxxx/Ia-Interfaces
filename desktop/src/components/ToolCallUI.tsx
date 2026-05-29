/**
 * Presentational approval card. Execution happens in the agent engine;
 * this just shows the pending action + diff and reports the user's choice.
 */
interface ToolApprovalProps {
  description: string;
  args: Record<string, unknown>;
  diff?: string;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

function iconFor(desc: string): string {
  if (desc.startsWith("Run:")) return "⚡";
  if (desc.startsWith("Write")) return "✏️";
  if (desc.startsWith("Edit") || desc.startsWith("MultiEdit")) return "🔧";
  return "🔨";
}

export function ToolApproval({ description, args, diff, busy, onApprove, onDeny }: ToolApprovalProps) {
  return (
    <div className="my-3 border border-terminal-yellow/50 rounded bg-terminal-surface animate-fadeIn">
      <div className="px-4 py-3 border-b border-terminal-border flex items-center gap-3">
        <span className="text-xl">{iconFor(description)}</span>
        <div>
          <div className="font-medium text-terminal-yellow">Approve action?</div>
          <div className="text-sm text-terminal-muted">{description}</div>
        </div>
      </div>

      {diff ? (
        <div className="px-4 py-3">
          <div className="text-xs text-terminal-muted mb-2">Preview:</div>
          <pre className="text-xs bg-terminal-bg rounded p-2 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {diff.split("\n").map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith("+") ? "text-terminal-green" :
                  line.startsWith("-") ? "text-terminal-red" :
                  line.startsWith("⚠") ? "text-terminal-yellow" : ""
                }
              >
                {line || " "}
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <div className="px-4 py-3">
          <pre className="text-sm bg-terminal-bg rounded p-2 overflow-x-auto max-h-48">
            {JSON.stringify(args, null, 2)}
          </pre>
        </div>
      )}

      <div className="px-4 py-3 border-t border-terminal-border flex items-center justify-end gap-3">
        <button
          onClick={onDeny}
          disabled={busy}
          className="px-4 py-2 text-sm text-terminal-muted hover:text-terminal-text transition-colors"
        >
          Deny
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="px-4 py-2 text-sm bg-terminal-green text-terminal-bg rounded hover:bg-opacity-80 transition-colors disabled:opacity-50"
        >
          {busy ? "Running…" : "Approve"}
        </button>
      </div>
    </div>
  );
}
