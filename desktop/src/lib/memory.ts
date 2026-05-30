/**
 * Per-project memory — Rodeo's living knowledge of a codebase, stored in
 * `<projectRoot>/.rodeo/memory.md` so it travels with the repo (git-trackable)
 * and is shared by the desktop app and the CLI.
 */
import { invoke } from "@tauri-apps/api/core";
import { runAgent } from "./agent";
import { buildSystemPrompt } from "./tools";
import { gatherProjectContext } from "./project-context";
import { useStore } from "./store";
import type { ChatMessage } from "./ollama";

export const MEMORY_REL = ".rodeo/memory.md";
const DAY_MS = 24 * 60 * 60 * 1000;

interface ShellOut { stdout: string; stderr: string; exit_code: number }
async function sh(command: string, cwd: string): Promise<string> {
  try { const o = await invoke<ShellOut>("exec_shell", { command, cwd }); return (o.stdout || "").trim(); }
  catch { return ""; }
}

function memPath(cwd: string): string {
  return `${cwd.replace(/\/$/, "")}/${MEMORY_REL}`;
}

export async function readProjectMemory(cwd: string): Promise<string> {
  if (!cwd) return "";
  try { return await invoke<string>("read_file", { path: memPath(cwd) }); }
  catch { return ""; }
}

export async function writeProjectMemory(cwd: string, content: string): Promise<void> {
  if (!cwd) throw new Error("No working directory");
  await invoke("write_file", { path: memPath(cwd), content });
}

/** Append a knowledge note under the Notes section (creating the file if needed). */
export async function appendProjectMemory(cwd: string, note: string): Promise<void> {
  const existing = await readProjectMemory(cwd);
  const clean = note.trim();
  if (!clean) return;
  let next: string;
  if (existing.trim()) {
    if (/##\s*Notes/i.test(existing)) {
      next = existing.replace(/(##\s*Notes[^\n]*\n)/i, `$1- ${clean}\n`);
    } else {
      next = `${existing.trimEnd()}\n\n## Notes\n- ${clean}\n`;
    }
  } else {
    const stamp = new Date().toISOString().slice(0, 10);
    next = `# Rodeo Project Knowledge\n_Started ${stamp}_\n\n## Notes\n- ${clean}\n`;
  }
  await writeProjectMemory(cwd, next);
}

/**
 * Run the agent to explore the codebase and (re)write a structured project
 * memory. Returns the resulting memory content.
 */
export async function buildProjectKnowledge(
  cwd: string,
  model: string,
  onLog?: (s: string) => void
): Promise<string> {
  const ctx = await gatherProjectContext(cwd);
  const system = buildSystemPrompt(ctx, cwd, { autonomous: true });
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Build your project memory for this codebase. First EXPLORE: Glob the file tree, Read the entry points / config / main modules (don't stop at one file), Grep for key symbols. Then WRITE the file .rodeo/memory.md (use the Write tool — actually create it) with these sections:

# Rodeo Project Knowledge
## Overview — what this project is and does
## Architecture — how it's structured, data flow
## Key files — path: what it does (the important ones)
## Conventions — patterns, style, naming
## Build / run / test — the exact commands
## Gotchas & decisions — non-obvious things to remember

Be accurate and concise (~120 lines max). When done, briefly confirm what you wrote.`,
    },
  ];
  await runAgent(
    messages,
    { model, cwd, autoApprove: true, guarded: true, maxIterations: 25 },
    { onToolStart: (_tc, d) => onLog?.(d) }
  );
  return readProjectMemory(cwd);
}

/** Incrementally update existing memory from recent git changes (or full build if none). */
export async function refreshProjectKnowledge(cwd: string, model: string, onLog?: (s: string) => void): Promise<string> {
  const existing = await readProjectMemory(cwd);
  if (!existing.trim()) return buildProjectKnowledge(cwd, model, onLog);

  const changes = await sh("git log --oneline -15 2>/dev/null; echo '--- changed files ---'; git diff --stat HEAD~10..HEAD 2>/dev/null | tail -30", cwd);
  const ctx = await gatherProjectContext(cwd);
  const system = buildSystemPrompt(ctx, cwd, { autonomous: true });
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: `Update your project memory (.rodeo/memory.md) to reflect recent changes.

CURRENT MEMORY:
${existing.slice(0, 6000)}

RECENT CHANGES (git):
${changes || "(no git history available)"}

Read any changed files you need to, then WRITE an updated .rodeo/memory.md (Write tool): keep what's still accurate, add what's new, fix what's wrong. Keep it concise (~120 lines). Confirm briefly when done.`,
    },
  ];
  await runAgent(messages, { model, cwd, autoApprove: true, guarded: true, maxIterations: 20 }, { onToolStart: (_tc, d) => onLog?.(d) });
  return readProjectMemory(cwd);
}

/**
 * Nightly sweep: refresh each workspace's memory if it's due (>24h) and the
 * project changed since the last refresh. Serialized; skips while busy.
 */
export async function refreshWorkspaceMemories(): Promise<void> {
  const s = useStore.getState();
  if (s.autonomousRunning || s.monitorBusy || !s.ollamaUp) return;

  for (const w of s.workspaces) {
    const st = useStore.getState();
    if (st.autonomousRunning || st.monitorBusy) break;
    const due = !w.memoryRefreshedAt || Date.now() - w.memoryRefreshedAt > DAY_MS;
    if (!due) continue;
    const head = await sh("git rev-parse HEAD 2>/dev/null", w.path);
    // Skip if the repo hasn't moved since the last refresh.
    if (head && w.lastGitHead === head && w.memoryRefreshedAt) {
      useStore.getState().updateWorkspace(w.id, { memoryRefreshedAt: Date.now() });
      continue;
    }
    try {
      await refreshProjectKnowledge(w.path, w.model || st.localModel);
      useStore.getState().updateWorkspace(w.id, { memoryRefreshedAt: Date.now(), lastGitHead: head });
    } catch { /* skip this workspace */ }
  }
}
