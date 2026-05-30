import { invoke } from "@tauri-apps/api/core";

interface ShellOutput { stdout: string; stderr: string; exit_code: number }

// Short-lived per-cwd cache. Gathering context spawns ~3 shells + 7 file reads;
// monitors / the autonomous loop call this repeatedly, so within a few seconds
// it's the same answer. ChatPanel keeps its own UI-level cache too — this just
// makes the lib-level callers (monitors, autonomous, memory) cheap as well.
const CTX_TTL_MS = 30_000;
const ctxCache = new Map<string, { ctx: string; at: number }>();

/** Drop the cached context for a cwd (e.g. right after Rodeo edits files). */
export function invalidateProjectContext(cwd?: string): void {
  if (cwd) ctxCache.delete(cwd);
  else ctxCache.clear();
}

/**
 * Gather lightweight project context so Rodeo codes in-context, like a
 * CLAUDE.md-aware agent. Best-effort: every probe is wrapped, missing data
 * is simply omitted. Runs fully offline. Cached per-cwd for CTX_TTL_MS; pass
 * `{ force: true }` to re-probe (e.g. after the working tree changed).
 */
export async function gatherProjectContext(cwd: string, opts: { force?: boolean } = {}): Promise<string> {
  if (!cwd) return "";

  const cached = ctxCache.get(cwd);
  if (!opts.force && cached && Date.now() - cached.at < CTX_TTL_MS) return cached.ctx;

  const parts: string[] = [];

  // Rodeo's own project memory — highest priority, his accumulated knowledge.
  const memory = await tryRead(`${cwd}/.rodeo/memory.md`);
  if (memory) parts.push(`### Rodeo project memory (.rodeo/memory.md — your own notes on this codebase)\n${truncate(memory, 4000)}`);

  // Project instructions files.
  for (const file of ["CLAUDE.md", "RODEO.md", "AGENTS.md", ".cursorrules"]) {
    const text = await tryRead(`${cwd}/${file}`);
    if (text) parts.push(`### ${file}\n${truncate(text, 1500)}`);
  }

  // package.json → name + scripts (tells Rodeo how to build/test/lint).
  const pkg = await tryRead(`${cwd}/package.json`);
  if (pkg) {
    try {
      const json = JSON.parse(pkg);
      const scripts = json.scripts ? Object.keys(json.scripts).join(", ") : "none";
      parts.push(`### package.json\nname: ${json.name ?? "?"}\nscripts: ${scripts}`);
    } catch { /* ignore malformed */ }
  }

  // Cargo.toml presence (Rust projects).
  if (await tryRead(`${cwd}/Cargo.toml`)) parts.push("### Rust project (Cargo.toml present)");

  // Git state.
  const branch = await tryShell("git rev-parse --abbrev-ref HEAD 2>/dev/null", cwd);
  if (branch.trim()) {
    const status = await tryShell("git status --short 2>/dev/null | head -20", cwd);
    parts.push(`### Git\nbranch: ${branch.trim()}\n${status.trim() ? status.trim() : "working tree clean"}`);
  }

  // Top-level structure.
  const ls = await tryShell("ls -1A 2>/dev/null | grep -v node_modules | head -40", cwd);
  if (ls.trim()) parts.push(`### Top-level files\n${ls.trim()}`);

  const ctx = parts.join("\n\n");
  ctxCache.set(cwd, { ctx, at: Date.now() });
  return ctx;
}

async function tryRead(path: string): Promise<string | null> {
  try { return await invoke<string>("read_file", { path }); } catch { return null; }
}

async function tryShell(command: string, cwd: string): Promise<string> {
  try {
    const out = await invoke<ShellOutput>("exec_shell", { command, cwd });
    return out.stdout || "";
  } catch { return ""; }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n… (truncated)" : s;
}
