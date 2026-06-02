import { invoke } from "@tauri-apps/api/core";
import type { ToolCall } from "./ollama";
import { READ_ONLY_TOOLS } from "./tools";
import { useStore } from "./store";

// Destructive shell patterns blocked when running guarded (autonomous/auto-approve).
const DANGEROUS_BASH: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\*)/i,
  /\brm\s+-[a-z]*f[a-z]*r?\s+(\/|~|\*)/i,
  /\b(sudo|doas|su)\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bchmod\s+-?R?\s*777\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /\bgit\s+checkout\s+(--\s+)?\.(\s|$)/i,        // discards ALL uncommitted changes
  /\bgit\s+restore\b[^|\n]*\s\.(\s|$)/i,         // git restore [flags] . — same
  /\b(curl|wget)\b[^\n|]*\|\s*(sh|bash|zsh)\b/i,
  /\b\/dev\/(sda|disk\d|nvme|rdisk)/i,
  /:\(\)\s*\{[^}]*\}\s*;\s*:/, // fork bomb
  />\s*\/dev\/(sd|disk|nvme)/i,
  /\bnpm\s+publish\b/i,
  /\b(rm|mv)\s+-[a-z]*\s+~\b/i,
];

function bashGuard(command: string): string | null {
  const bad = DANGEROUS_BASH.find((re) => re.test(command));
  return bad ? `Error: blocked by autonomy guardrail (matched ${bad}). Refusing to run: ${command}` : null;
}

// Collapse '.' and '..' segments so a sandbox check can't be fooled by traversal
// (e.g. "<cwd>/../../etc/passwd" must reduce to "/etc/passwd" BEFORE we compare).
function normalizePath(p: string): string {
  const isAbs = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!isAbs) out.push(".."); // can't go above an absolute root
    } else {
      out.push(seg);
    }
  }
  return (isAbs ? "/" : "") + out.join("/");
}

// Keep file writes inside the working directory when guarded. Operates on the
// NORMALIZED path so "../" can't escape the sandbox.
function pathGuard(abs: string, cwd: string): string | null {
  if (!cwd) return "Error: autonomy guardrail — set a working directory before writing files.";
  const base = normalizePath(cwd.replace(/\/$/, ""));
  const target = normalizePath(abs);
  if (target === base || target.startsWith(base + "/")) return null;
  return `Error: autonomy guardrail — refusing to write outside the working directory (${base}): ${target}`;
}

interface ShellOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
}

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

// Tracks files read this session so Edit/Write can enforce read-before-write.
const readFiles = new Set<string>();

export function isReadOnly(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}

/** Resolve a possibly-relative path against the working directory, NORMALIZED
 *  (so '..' segments are collapsed and the sandbox check can't be bypassed and
 *  the approval UI shows the true target, not a deceptive "../.." string). */
export function resolvePath(p: string, cwd: string): string {
  if (!p) return cwd;
  let abs: string;
  if (p.startsWith("~")) abs = p.replace(/^~/, ""); // best-effort; pathGuard rejects if outside cwd
  else if (p.startsWith("/")) abs = p;
  else if (!cwd) return normalizePath(p);
  else abs = `${cwd.replace(/\/$/, "")}/${p}`;
  return normalizePath(abs);
}

// ----------------------------------------------------------------------------
// Edit core (shared by Edit / MultiEdit) — exact first, then whitespace-fuzzy.
// ----------------------------------------------------------------------------

interface EditOp { old_string: string; new_string: string; replace_all?: boolean }

function applyEdit(content: string, op: EditOp): { content: string; error?: string } {
  const { old_string, new_string, replace_all } = op;

  if (old_string === new_string) {
    return { content, error: "old_string and new_string are identical" };
  }

  // 1. Exact match
  if (content.includes(old_string)) {
    const count = content.split(old_string).length - 1;
    if (count > 1 && !replace_all) {
      return { content, error: `old_string appears ${count} times — pass replace_all:true or add more context` };
    }
    const next = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string);
    return { content: next };
  }

  // 2. Whitespace-tolerant fuzzy match: compare line blocks by trimmed content,
  //    preserving the file's own indentation when substituting.
  const fuzzy = fuzzyReplace(content, old_string, new_string);
  if (fuzzy) return { content: fuzzy };

  // 3. Tolerate accidental line-number prefixes the model copied from Read output
  //    (e.g. "12  const x = 1"). Fuzzy-match again with those stripped.
  const cleaned = stripLineNumberPrefix(old_string);
  if (cleaned !== old_string) {
    const f2 = fuzzyReplace(content, cleaned, new_string);
    if (f2) return { content: f2 };
  }

  return {
    content,
    error: `old_string not found. Re-read the file with Read and copy the exact code WITHOUT the line-number prefixes. First 60 chars tried: "${old_string.slice(0, 60).replace(/\n/g, "\\n")}"`,
  };
}

/** Strip leading "<num>  " line-number prefixes if most lines have them. */
function stripLineNumberPrefix(s: string): string {
  const lines = s.split("\n");
  const re = /^\s*\d+(\s{2,}|\t|: ?| \| )/;
  const hits = lines.filter((l) => re.test(l)).length;
  if (hits >= Math.ceil(lines.length * 0.6)) {
    return lines.map((l) => l.replace(re, "")).join("\n");
  }
  return s;
}

function fuzzyReplace(content: string, oldStr: string, newStr: string): string | null {
  const fileLines = content.split("\n");
  const oldLines = oldStr.split("\n");
  const oldTrim = oldLines.map((l) => l.trim());

  for (let i = 0; i + oldLines.length <= fileLines.length; i++) {
    let match = true;
    for (let j = 0; j < oldLines.length; j++) {
      if (fileLines[i + j].trim() !== oldTrim[j]) { match = false; break; }
    }
    if (!match) continue;

    // Reindent new_string by the delta between the file's actual indentation
    // and the indentation the model supplied — preserves relative structure
    // across ALL lines (not just the first).
    const fileIndent = fileLines[i].match(/^\s*/)?.[0] ?? "";
    const oldIndent = (oldLines.find((l) => l.trim() !== "") || "").match(/^\s*/)?.[0] ?? "";
    const newLines = newStr.split("\n").map((l) => {
      if (l.trim() === "") return "";
      const stripped = l.startsWith(oldIndent) ? l.slice(oldIndent.length) : l.replace(/^\s+/, "");
      return fileIndent + stripped;
    });
    const out = [...fileLines.slice(0, i), ...newLines, ...fileLines.slice(i + oldLines.length)];
    return out.join("\n");
  }
  return null;
}

/** Compute the would-be new content for a set of edits (for diff preview). */
export async function computeEdit(
  filePath: string,
  edits: EditOp[],
  cwd: string
): Promise<{ before: string; after: string; error?: string }> {
  const abs = resolvePath(filePath, cwd);
  let before = "";
  try {
    before = await invoke<string>("read_file", { path: abs });
  } catch (e) {
    return { before: "", after: "", error: `Cannot read ${abs}: ${e}` };
  }
  let after = before;
  for (const op of edits) {
    const r = applyEdit(after, op);
    if (r.error) return { before, after: before, error: r.error };
    after = r.content;
  }
  return { before, after };
}

/**
 * Accurate line diff (LCS) with small context windows around changes, for the
 * approval UI. Strips identical leading/trailing lines BEFORE building the LCS
 * matrix, so an edit to one function in a 2000-line file costs O(changed²), not
 * O(file²) — the matrix used to be ~4M cells per preview regardless of edit size.
 * (It also previously ran a throwaway naive diff first, then discarded it.)
 */
export function makeDiff(before: string, after: string, maxLines = 80): string {
  const aAll = before.split("\n");
  const bAll = after.split("\n");

  // Common prefix / suffix — identical lines that would only show as collapsed
  // "…" context anyway, so exclude them from the matrix entirely.
  let p = 0;
  while (p < aAll.length && p < bAll.length && aAll[p] === bAll[p]) p++;
  let sa = aAll.length, sb = bAll.length;
  while (sa > p && sb > p && aAll[sa - 1] === bAll[sb - 1]) { sa--; sb--; }
  if (sa === p && sb === p) return "(no textual change)";

  const a = aAll.slice(p, sa);
  const b = bAll.slice(p, sb);
  const n = a.length, m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);

  const rows: { sign: " " | "+" | "-"; text: string }[] = [];
  // A couple of context lines from the trimmed prefix.
  for (let k = Math.max(0, p - 2); k < p; k++) rows.push({ sign: " ", text: aAll[k] });

  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ sign: " ", text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { rows.push({ sign: "-", text: a[i] }); i++; }
    else { rows.push({ sign: "+", text: b[j] }); j++; }
  }
  while (i < n) rows.push({ sign: "-", text: a[i++] });
  while (j < m) rows.push({ sign: "+", text: b[j++] });

  // A couple of context lines from the trimmed suffix.
  for (let k = sa; k < Math.min(aAll.length, sa + 2); k++) rows.push({ sign: " ", text: aAll[k] });

  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, k) => { if (r.sign !== " ") for (let d = -2; d <= 2; d++) if (rows[k + d]) keep[k + d] = true; });
  const out: string[] = [];
  let gap = false;
  for (let k = 0; k < rows.length && out.length < maxLines; k++) {
    if (!keep[k]) { if (!gap) { out.push("  …"); gap = true; } continue; }
    gap = false;
    out.push(`${rows[k].sign} ${rows[k].text}`);
  }
  return out.join("\n") || "(no textual change)";
}

// ----------------------------------------------------------------------------
// Tool execution
// ----------------------------------------------------------------------------

export async function executeTool(toolCall: ToolCall, cwd: string, guarded = false): Promise<string> {
  let args: any;
  try {
    args = JSON.parse(toolCall.function.arguments || "{}");
  } catch {
    return `Error: tool arguments were not valid JSON: ${toolCall.function.arguments}`;
  }
  const name = toolCall.function.name;

  try {
    switch (name) {
      case "Read": {
        const abs = resolvePath(args.file_path, cwd);
        const raw = await invoke<string>("read_file", { path: abs });
        readFiles.add(abs);
        let lines = raw.split("\n");
        const offset = args.offset ? Math.max(0, args.offset - 1) : 0;
        const limit = args.limit ?? 2000;
        lines = lines.slice(offset, offset + limit);
        const width = String(offset + lines.length).length;
        return lines.map((l, idx) => `${String(offset + idx + 1).padStart(width)}  ${l}`).join("\n") || "(empty file)";
      }

      case "Write": {
        const abs = resolvePath(args.file_path, cwd);
        if (guarded) { const g = pathGuard(abs, cwd); if (g) return g; }
        await invoke("write_file", { path: abs, content: args.content });
        readFiles.add(abs);
        return `Wrote ${args.content.length} bytes to ${abs}`;
      }

      case "Edit": {
        const abs = resolvePath(args.file_path, cwd);
        if (guarded) { const g = pathGuard(abs, cwd); if (g) return g; }
        const { after, error } = await computeEdit(args.file_path, [
          { old_string: args.old_string, new_string: args.new_string, replace_all: args.replace_all },
        ], cwd);
        if (error) return `Error: ${error}`;
        await invoke("write_file", { path: abs, content: after });
        return `Edited ${abs}`;
      }

      case "MultiEdit": {
        const abs = resolvePath(args.file_path, cwd);
        if (guarded) { const g = pathGuard(abs, cwd); if (g) return g; }
        const { after, error } = await computeEdit(args.file_path, args.edits || [], cwd);
        if (error) return `Error: ${error}`;
        await invoke("write_file", { path: abs, content: after });
        return `Applied ${args.edits?.length ?? 0} edits to ${abs}`;
      }

      case "Bash": {
        if (guarded) { const g = bashGuard(args.command); if (g) return g; }
        const out = await invoke<ShellOutput>("exec_shell", { command: args.command, cwd });
        const body = [out.stdout, out.stderr].filter(Boolean).join("\n").trim();
        const truncated = body.length > 30000 ? body.slice(0, 30000) + "\n… (output truncated)" : body;
        return out.exit_code === 0 ? (truncated || "(no output)") : `Exit ${out.exit_code}\n${truncated}`;
      }

      case "Glob": {
        const files = await invoke<string[]>("search_files", {
          pattern: args.pattern,
          cwd: args.path ? resolvePath(args.path, cwd) : cwd,
        });
        return files.length ? files.slice(0, 200).join("\n") : "No files matched";
      }

      case "Grep": {
        const searchPath = args.path ? resolvePath(args.path, cwd) : cwd;
        const flags = ["--line-number", "--no-heading", "--color=never"];
        if (args.case_insensitive) flags.push("-i");
        if (args.glob) flags.push("-g", shellQuote(args.glob));
        const cmd = `rg ${flags.join(" ")} -e ${shellQuote(args.pattern)} ${shellQuote(searchPath)}`;
        const out = await invoke<ShellOutput>("exec_shell", { command: cmd, cwd });
        if (out.exit_code === 127) {
          // ripgrep missing — fall back to grep
          const g = await invoke<ShellOutput>("exec_shell", {
            command: `grep -rn ${args.case_insensitive ? "-i " : ""}${shellQuote(args.pattern)} ${shellQuote(searchPath)}`,
            cwd,
          });
          return g.stdout.split("\n").slice(0, 200).join("\n") || "No matches";
        }
        if (out.exit_code === 1) return "No matches";
        return out.stdout.split("\n").slice(0, 200).join("\n") || "No matches";
      }

      case "List": {
        const abs = resolvePath(args.path, cwd);
        const entries = await invoke<FileEntry[]>("list_directory", { path: abs });
        return entries
          .sort((a, b) => Number(b.is_dir) - Number(a.is_dir) || a.name.localeCompare(b.name))
          .map((e) => `${e.is_dir ? "dir " : "file"}  ${e.name}${e.is_dir ? "/" : ""}`)
          .join("\n") || "(empty)";
      }

      case "TaskList": {
        const tasks = useStore.getState().tasks;
        if (!tasks.length) return "Task queue is empty.";
        return tasks.map((t) => `[${t.status}] ${t.id.slice(0, 8)} — ${t.title}${t.detail ? ` :: ${t.detail}` : ""}`).join("\n");
      }
      case "TaskAdd": {
        if (!args.title) return "Error: title is required";
        const id = useStore.getState().addTask(args.title, args.detail);
        return `Added task ${id.slice(0, 8)}: ${args.title}`;
      }
      case "TaskUpdate": {
        const { tasks, updateTask } = useStore.getState();
        const t = tasks.find((x) => x.id === args.id || x.id.startsWith(String(args.id)));
        if (!t) return `Error: no task matching id "${args.id}"`;
        const patch: Record<string, unknown> = {};
        if (args.status) patch.status = args.status;
        if (args.title) patch.title = args.title;
        if (args.detail) patch.detail = args.detail;
        updateTask(t.id, patch);
        return `Updated task ${t.id.slice(0, 8)} (${Object.keys(patch).join(", ") || "no change"})`;
      }

      case "RememberProject": {
        if (!args.note) return "Error: note is required";
        if (!cwd) return "Error: no working directory set — can't save project memory";
        const { appendProjectMemory } = await import("./memory");
        await appendProjectMemory(cwd, String(args.note));
        return `Remembered in .rodeo/memory.md: ${args.note}`;
      }

      case "WebSearch": {
        const { webSearch } = await import("./web");
        return webSearch(String(args.query || ""), Number(args.num) || 6);
      }
      case "WebFetch": {
        const { webFetch } = await import("./web");
        return webFetch(String(args.url || ""), args.prompt ? String(args.prompt) : undefined);
      }
      case "IndexProject": {
        const { buildIndex } = await import("./semantic");
        return buildIndex(cwd);
      }
      case "SemanticSearch": {
        const { semanticSearch } = await import("./semantic");
        return semanticSearch(cwd, String(args.query || ""), Number(args.k) || 6);
      }

      default:
        // MCP tools are namespaced "mcp__<server>__<tool>" and routed dynamically.
        if (name.startsWith("mcp__")) {
          const { callMcpTool } = await import("./mcp");
          return callMcpTool(name, args);
        }
        return `Error: unknown tool "${name}"`;
    }
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function shellQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Human-readable one-liner for the approval UI. */
export function describeTool(toolCall: ToolCall): string {
  let a: any = {};
  try { a = JSON.parse(toolCall.function.arguments || "{}"); } catch {}
  switch (toolCall.function.name) {
    case "Read": return `Read ${a.file_path}`;
    case "Write": return `Write ${a.content?.length ?? 0} bytes → ${a.file_path}`;
    case "Edit": return `Edit ${a.file_path}`;
    case "MultiEdit": return `MultiEdit ${a.file_path} (${a.edits?.length ?? 0} edits)`;
    case "Bash": return `Run: ${a.command}`;
    case "Glob": return `Glob ${a.pattern}`;
    case "Grep": return `Grep "${a.pattern}"`;
    case "List": return `List ${a.path}`;
    case "WebSearch": return `Web search: ${a.query}`;
    case "WebFetch": return `Fetch ${a.url}`;
    case "IndexProject": return `Build semantic index`;
    case "SemanticSearch": return `Semantic search: ${a.query}`;
    case "Task": return `Sub-agent: ${a.description || a.prompt?.slice(0, 40) || "task"}`;
    default:
      if (toolCall.function.name.startsWith("mcp__")) {
        const [, server, tool] = toolCall.function.name.split("__");
        return `MCP ${server}/${tool}`;
      }
      return toolCall.function.name;
  }
}
