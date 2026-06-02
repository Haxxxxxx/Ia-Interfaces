/**
 * MCP (Model Context Protocol) client.
 *
 * Lets Rodeo connect to local MCP servers (filesystem, git, fetch, custom…) over
 * stdio and inherit their tools — the same ecosystem Claude Code plugs into. Each
 * server is a long-lived child process managed by the Rust side (mcp_spawn /
 * mcp_request / mcp_notify / mcp_stop); here we drive the JSON-RPC handshake,
 * cache each server's tool list, expose them to the agent as
 * `mcp__<server>__<tool>` schemas, and route tool calls back.
 *
 * Servers are configured in the store (useStore.mcpServers). Connection is lazy
 * and best-effort: if a server fails to start, its tools simply don't appear and
 * the rest of Rodeo keeps working offline.
 */
import { invoke } from "@tauri-apps/api/core";
import { useStore, type McpServer } from "./store";

interface McpTool { name: string; description?: string; inputSchema?: any }

interface ConnState {
  id: string;
  nextId: number;
  tools: McpTool[];
  connected: boolean;
  error?: string;
}

const conns = new Map<string, ConnState>();

function rpc(state: ConnState, method: string, params: unknown) {
  const id = state.nextId++;
  return { id, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) };
}

async function request(serverId: string, state: ConnState, method: string, params: unknown): Promise<any> {
  const { id, body } = rpc(state, method, params);
  const raw = await invoke<string>("mcp_request", { id: serverId, request: body, requestId: id });
  const parsed = JSON.parse(raw);
  if (parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  return parsed.result;
}

async function notify(serverId: string, method: string, params: unknown): Promise<void> {
  await invoke("mcp_notify", { id: serverId, request: JSON.stringify({ jsonrpc: "2.0", method, params }) });
}

async function connectOne(cfg: McpServer): Promise<ConnState> {
  const state: ConnState = { id: cfg.id, nextId: 1, tools: [], connected: false };
  try {
    await invoke("mcp_spawn", {
      id: cfg.id,
      command: cfg.command,
      args: cfg.args || [],
      env: cfg.env || {},
      cwd: cfg.cwd || "",
    });
    await request(cfg.id, state, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "rodeo", version: "1.0" },
    });
    await notify(cfg.id, "notifications/initialized", {});
    const res = await request(cfg.id, state, "tools/list", {});
    state.tools = Array.isArray(res?.tools) ? res.tools : [];
    state.connected = true;
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    try { await invoke("mcp_stop", { id: cfg.id }); } catch { /* ignore */ }
  }
  return state;
}

/** Connect (idempotently) all enabled servers. Best-effort. */
export async function ensureMcpConnected(): Promise<void> {
  const servers = (useStore.getState().mcpServers || []).filter((s) => s.enabled);
  await Promise.all(
    servers.map(async (cfg) => {
      const existing = conns.get(cfg.id);
      if (existing?.connected) return;
      conns.set(cfg.id, await connectOne(cfg));
    })
  );
  // Drop connections whose config was removed/disabled.
  const live = new Set(servers.map((s) => s.id));
  for (const id of [...conns.keys()]) {
    if (!live.has(id)) {
      conns.delete(id);
      try { await invoke("mcp_stop", { id }); } catch { /* ignore */ }
    }
  }
}

/** Force a fresh reconnect for one server (used by the settings UI). */
export async function reconnectMcpServer(cfg: McpServer): Promise<ConnState> {
  try { await invoke("mcp_stop", { id: cfg.id }); } catch { /* ignore */ }
  conns.delete(cfg.id);
  const state = await connectOne(cfg);
  conns.set(cfg.id, state);
  return state;
}

export async function disconnectAllMcp(): Promise<void> {
  for (const id of [...conns.keys()]) {
    try { await invoke("mcp_stop", { id }); } catch { /* ignore */ }
  }
  conns.clear();
}

/** OpenAI-shaped tool schemas for every connected server's tools. */
export async function getMcpToolSchemas(): Promise<any[]> {
  await ensureMcpConnected();
  const schemas: any[] = [];
  for (const state of conns.values()) {
    if (!state.connected) continue;
    for (const t of state.tools) {
      schemas.push({
        type: "function",
        function: {
          name: `mcp__${state.id}__${t.name}`,
          description: (t.description || `${t.name} (via MCP server ${state.id})`).slice(0, 1024),
          parameters: t.inputSchema && typeof t.inputSchema === "object"
            ? t.inputSchema
            : { type: "object", properties: {} },
        },
      });
    }
  }
  return schemas;
}

/** Snapshot of connection status for the settings UI. */
export function mcpStatus(): { id: string; connected: boolean; toolCount: number; error?: string }[] {
  return [...conns.values()].map((s) => ({
    id: s.id, connected: s.connected, toolCount: s.tools.length, error: s.error,
  }));
}

/** Execute an `mcp__<server>__<tool>` call. */
export async function callMcpTool(fullName: string, args: any): Promise<string> {
  // Split on the first "__" after the prefix: mcp__<serverId>__<toolName>.
  const rest = fullName.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep === -1) return `Error: malformed MCP tool name "${fullName}"`;
  const serverId = rest.slice(0, sep);
  const toolName = rest.slice(sep + 2);

  await ensureMcpConnected();
  const state = conns.get(serverId);
  if (!state || !state.connected) {
    return `Error: MCP server "${serverId}" is not connected${state?.error ? ` (${state.error})` : ""}.`;
  }
  try {
    const res = await request(serverId, state, "tools/call", { name: toolName, arguments: args || {} });
    return formatMcpResult(res);
  } catch (e) {
    return `Error calling ${toolName}: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function formatMcpResult(res: any): string {
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
