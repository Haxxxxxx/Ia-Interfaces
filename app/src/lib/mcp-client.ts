/**
 * Generic stdio MCP (Model Context Protocol) client for the server.
 *
 * Lets the server connect to standard MCP servers (filesystem, git, fetch,
 * custom) and inherit their tools as `mcp__<server>__<tool>`. Mirrors the CLI's
 * Node implementation: spawn a child process and speak JSON-RPC over
 * stdin/stdout with an async pending-id map.
 *
 * Because the server is a shared host, MCP servers are configured by the
 * OPERATOR via the RODEO_MCP_SERVERS env var (a JSON array), not by end users —
 * spawning arbitrary user-supplied commands server-side would be unsafe.
 *
 *   RODEO_MCP_SERVERS='[{"name":"fs","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/srv/work"]}]'
 *
 * Connection is lazy + best-effort: a server that fails to start contributes
 * no tools and the rest of the server keeps working.
 */
import { spawn, type ChildProcess } from "child_process";

interface McpServerSpec { name: string; command: string; args?: string[]; env?: Record<string, string>; cwd?: string }

interface McpConn {
  proc: ChildProcess;
  nextId: number;
  pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>;
  buffer: string;
  tools: { name: string; description?: string; inputSchema?: any }[];
  ready: boolean;
  error?: string;
}

const conns = new Map<string, McpConn>();

function configuredServers(): McpServerSpec[] {
  const raw = process.env.RODEO_MCP_SERVERS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s?.name && s?.command) : [];
  } catch {
    return [];
  }
}

function rpcRequest(conn: McpConn, method: string, params: unknown, timeoutMs = 20000): Promise<any> {
  const id = conn.nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { conn.pending.delete(id); reject(new Error(`MCP ${method} timed out`)); }, timeoutMs);
    conn.pending.set(id, { resolve, reject, timer });
    try { conn.proc.stdin?.write(body); }
    catch (e) { conn.pending.delete(id); clearTimeout(timer); reject(e); }
  });
}

function rpcNotify(conn: McpConn, method: string, params: unknown): void {
  try { conn.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n"); } catch { /* ignore */ }
}

function connect(spec: McpServerSpec): McpConn {
  const proc = spawn(spec.command, spec.args || [], {
    env: { ...process.env, ...(spec.env || {}), PATH: `${process.env.PATH || ""}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin` },
    cwd: spec.cwd || process.cwd(),
    stdio: ["pipe", "pipe", "ignore"],
  });
  const conn: McpConn = { proc, nextId: 1, pending: new Map(), buffer: "", tools: [], ready: false };
  proc.stdout?.on("data", (d: Buffer) => {
    conn.buffer += d.toString();
    let idx: number;
    while ((idx = conn.buffer.indexOf("\n")) >= 0) {
      const line = conn.buffer.slice(0, idx).trim();
      conn.buffer = conn.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && conn.pending.has(msg.id)) {
          const p = conn.pending.get(msg.id)!;
          conn.pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      } catch { /* incomplete/invalid line */ }
    }
  });
  proc.on("error", (e) => { conn.error = String(e); conn.ready = false; });
  proc.on("exit", () => {
    conn.ready = false;
    conn.pending.forEach((p) => { clearTimeout(p.timer); p.reject(new Error("MCP server exited")); });
    conn.pending.clear();
  });
  return conn;
}

export async function ensureMcpConnected(): Promise<void> {
  for (const spec of configuredServers()) {
    if (conns.get(spec.name)?.ready) continue;
    const conn = connect(spec);
    conns.set(spec.name, conn);
    try {
      await rpcRequest(conn, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "rodeo-server", version: "1.0" },
      });
      rpcNotify(conn, "notifications/initialized", {});
      const res = await rpcRequest(conn, "tools/list", {});
      conn.tools = Array.isArray(res?.tools) ? res.tools : [];
      conn.ready = true;
    } catch (e) {
      conn.error = e instanceof Error ? e.message : String(e);
      try { conn.proc.kill(); } catch { /* ignore */ }
    }
  }
}

/** OpenAI-shaped tool schemas for connected MCP servers. */
export function mcpToolSchemas(): any[] {
  const out: any[] = [];
  for (const [name, conn] of Array.from(conns)) {
    if (!conn.ready) continue;
    for (const t of conn.tools) {
      out.push({
        type: "function",
        function: {
          name: `mcp__${name}__${t.name}`,
          description: (t.description || `${t.name} (via MCP server ${name})`).slice(0, 1024),
          parameters: t.inputSchema && typeof t.inputSchema === "object" ? t.inputSchema : { type: "object", properties: {} },
        },
      });
    }
  }
  return out;
}

function formatResult(res: any): string {
  if (!res) return "(no result)";
  const content = res.content;
  if (Array.isArray(content)) {
    const parts = content.map((c: any) => {
      if (c?.type === "text") return c.text;
      if (c?.type === "resource" && c.resource?.text) return c.resource.text;
      return JSON.stringify(c);
    });
    const text = parts.join("\n").trim();
    return (res.isError ? "[tool reported an error]\n" : "") + (text || "(empty result)");
  }
  return typeof res === "string" ? res : JSON.stringify(res);
}

export async function callMcpTool(fullName: string, args: any): Promise<string> {
  const rest = fullName.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep === -1) return `Error: malformed MCP tool name "${fullName}"`;
  const server = rest.slice(0, sep);
  const tool = rest.slice(sep + 2);
  await ensureMcpConnected();
  const conn = conns.get(server);
  if (!conn?.ready) return `Error: MCP server "${server}" is not connected${conn?.error ? ` (${conn.error})` : ""}.`;
  try {
    const res = await rpcRequest(conn, "tools/call", { name: tool, arguments: args || {} });
    return formatResult(res);
  } catch (e) {
    return `Error calling ${tool}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// Kill any spawned MCP children when the process exits.
process.on("exit", () => { Array.from(conns.values()).forEach((conn) => { try { conn.proc.kill(); } catch { /* ignore */ } }); });
