import { useState } from "react";
import { useStore } from "../lib/store";
import { reconnectMcpServer } from "../lib/mcp";

/** Split a command-args string into argv, respecting simple quoting. */
function parseArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

type Status = { connected: boolean; toolCount: number; error?: string } | "testing" | null;

export function McpServersSection() {
  const { mcpServers, addMcpServer, removeMcpServer, toggleMcpServer, workingDirectory } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [status, setStatus] = useState<Record<string, Status>>({});

  const wd = workingDirectory || "/path/to/project";
  const presets = [
    { label: "Filesystem", name: "filesystem", command: "npx", args: `-y @modelcontextprotocol/server-filesystem ${wd}` },
    { label: "Git", name: "git", command: "uvx", args: `mcp-server-git --repository ${wd}` },
    { label: "Fetch", name: "fetch", command: "uvx", args: `mcp-server-fetch` },
  ];

  function applyPreset(p: (typeof presets)[number]) {
    setName(p.name); setCommand(p.command); setArgsText(p.args); setOpen(true);
  }

  function add() {
    if (!command.trim()) return;
    addMcpServer({ name: name.trim() || command.trim(), command: command.trim(), args: parseArgs(argsText) });
    setName(""); setCommand(""); setArgsText(""); setOpen(false);
  }

  async function test(id: string) {
    const cfg = mcpServers.find((s) => s.id === id);
    if (!cfg) return;
    setStatus((s) => ({ ...s, [id]: "testing" }));
    const res = await reconnectMcpServer(cfg);
    setStatus((s) => ({ ...s, [id]: { connected: res.connected, toolCount: res.tools.length, error: res.error } }));
  }

  return (
    <div>
      <label className="block text-sm text-terminal-muted mb-2">MCP servers</label>
      <p className="mb-2 text-xs text-terminal-muted">
        Connect external tool providers (filesystem, git, fetch, custom). Their tools become available to Rodeo as <code>mcp__server__tool</code>.
      </p>

      <div className="space-y-2">
        {mcpServers.length === 0 && <div className="text-xs text-terminal-muted italic">No servers configured.</div>}
        {mcpServers.map((srv) => {
          const st = status[srv.id];
          return (
            <div key={srv.id} className="border border-terminal-border rounded p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium">{srv.name}</span>
                  <span className="ml-2 text-xs text-terminal-muted">{srv.id}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleMcpServer(srv.id, !srv.enabled)}
                    className={`px-2 py-0.5 rounded text-xs border ${srv.enabled ? "border-terminal-accent text-terminal-accent" : "border-terminal-border text-terminal-muted"}`}
                  >
                    {srv.enabled ? "enabled" : "disabled"}
                  </button>
                  <button onClick={() => test(srv.id)} className="px-2 py-0.5 rounded text-xs border border-terminal-border hover:bg-terminal-bg">test</button>
                  <button onClick={() => removeMcpServer(srv.id)} className="px-2 py-0.5 rounded text-xs text-red-400 hover:bg-terminal-bg">remove</button>
                </div>
              </div>
              <div className="mt-1 text-xs text-terminal-muted font-mono truncate">{srv.command} {(srv.args || []).join(" ")}</div>
              {st === "testing" && <div className="mt-1 text-xs text-terminal-muted">testing…</div>}
              {st && st !== "testing" && (
                <div className={`mt-1 text-xs ${st.connected ? "text-green-400" : "text-red-400"}`}>
                  {st.connected ? `connected · ${st.toolCount} tools` : `failed${st.error ? `: ${st.error}` : ""}`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((p) => (
          <button key={p.label} onClick={() => applyPreset(p)} className="px-2 py-1 text-xs border border-terminal-border rounded hover:bg-terminal-bg">+ {p.label}</button>
        ))}
        <button onClick={() => setOpen((o) => !o)} className="px-2 py-1 text-xs border border-terminal-border rounded hover:bg-terminal-bg">{open ? "cancel" : "+ Custom"}</button>
      </div>

      {open && (
        <div className="mt-2 space-y-2 border border-terminal-border rounded p-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name (e.g. filesystem)"
            className="w-full px-2 py-1.5 bg-terminal-bg border border-terminal-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-terminal-accent" />
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="command (e.g. npx, uvx)"
            className="w-full px-2 py-1.5 bg-terminal-bg border border-terminal-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-terminal-accent" />
          <input value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder="args (space-separated)"
            className="w-full px-2 py-1.5 bg-terminal-bg border border-terminal-border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-terminal-accent" />
          <button onClick={add} className="px-3 py-1.5 text-sm bg-terminal-accent text-terminal-bg rounded hover:bg-opacity-80">Add server</button>
        </div>
      )}
    </div>
  );
}
