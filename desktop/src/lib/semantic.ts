/**
 * Semantic code search (local RAG).
 *
 * Embeds the project's source into vectors via a local Ollama embedding model
 * (`nomic-embed-text` by default) and answers natural-language queries by cosine
 * similarity — so Rodeo finds the right code by *meaning*, not just by grep
 * guessing the exact token. The index lives in `<project>/.rodeo/index.json` and
 * is built on demand. Fully offline once the embed model is pulled.
 */
import { invoke } from "@tauri-apps/api/core";
import { OLLAMA_URL } from "./ollama";

export const EMBED_MODEL = "nomic-embed-text";

interface ShellOutput { stdout: string; stderr: string; exit_code: number }

interface Chunk { path: string; start: number; end: number; text: string; vec: number[] }
interface Index { model: string; createdAt: number; root: string; chunks: Chunk[]; mtimes: Record<string, number> }

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt|swift|c|h|cpp|hpp|cs|rb|php|sql|sh|toml|json|md|yaml|yml|css|scss|html|vue|svelte)$/i;
const CHUNK_LINES = 50;
const CHUNK_STEP = 40;       // 10-line overlap
const MAX_FILES = 600;
const MAX_CHUNKS = 2000;
const MAX_FILE_BYTES = 200_000;

function indexPath(cwd: string): string {
  return `${cwd.replace(/\/$/, "")}/.rodeo/index.json`;
}

/** Is the embedding model installed locally? */
export function embedModelAvailable(models: string[]): boolean {
  return models.some((m) => m.toLowerCase().startsWith(EMBED_MODEL));
}

// ---------------------------------------------------------------------------
// Embeddings (Ollama native — localhost, no CORS concern)
// ---------------------------------------------------------------------------
async function embed(inputs: string[], signal?: AbortSignal): Promise<number[][]> {
  // Prefer the batch /api/embed endpoint; fall back to per-item /api/embeddings.
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
      signal,
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embeddings)) return data.embeddings;
    }
  } catch { /* fall through */ }

  const out: number[][] = [];
  for (const input of inputs) {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
      signal,
    });
    if (!res.ok) throw new Error(`embedding failed (${res.status}) — is "${EMBED_MODEL}" pulled?`);
    const data = await res.json();
    out.push(data.embedding || []);
  }
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ---------------------------------------------------------------------------
// File discovery + chunking
// ---------------------------------------------------------------------------
async function listSourceFiles(cwd: string): Promise<string[]> {
  // rg --files respects .gitignore (skips node_modules, target, dist, etc.).
  let out: ShellOutput;
  try {
    out = await invoke<ShellOutput>("exec_shell", { command: "rg --files", cwd });
    if (out.exit_code === 127) throw new Error("no rg");
  } catch {
    out = await invoke<ShellOutput>("exec_shell", {
      command: "find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/target/*' -not -path '*/dist/*'",
      cwd,
    });
  }
  return out.stdout.split("\n").map((s) => s.trim()).filter((s) => s && CODE_EXT.test(s)).slice(0, MAX_FILES);
}

function chunkFile(rel: string, content: string): Omit<Chunk, "vec">[] {
  const lines = content.split("\n");
  const chunks: Omit<Chunk, "vec">[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_STEP) {
    const slice = lines.slice(i, i + CHUNK_LINES);
    const text = slice.join("\n").trim();
    if (text.length < 20) continue;
    chunks.push({ path: rel, start: i + 1, end: Math.min(i + CHUNK_LINES, lines.length), text });
    if (i + CHUNK_LINES >= lines.length) break;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Build / load
// ---------------------------------------------------------------------------
export async function buildIndex(
  cwd: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  if (!cwd) return "Error: no working directory set.";
  const files = await listSourceFiles(cwd);
  if (!files.length) return "No source files found to index.";

  const pending: Omit<Chunk, "vec">[] = [];
  const mtimes: Record<string, number> = {};
  for (const rel of files) {
    if (pending.length >= MAX_CHUNKS) break;
    const abs = `${cwd.replace(/\/$/, "")}/${rel.replace(/^\.\//, "")}`;
    let content = "";
    try { content = await invoke<string>("read_file", { path: abs }); } catch { continue; }
    if (content.length > MAX_FILE_BYTES) continue;
    mtimes[rel] = content.length; // cheap change-detector (avoids a stat per file)
    for (const c of chunkFile(rel.replace(/^\.\//, ""), content)) {
      pending.push(c);
      if (pending.length >= MAX_CHUNKS) break;
    }
  }

  onProgress?.(`Embedding ${pending.length} chunks from ${files.length} files…`);
  const chunks: Chunk[] = [];
  const BATCH = 32;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    let vecs: number[][];
    try {
      vecs = await embed(batch.map((b) => b.text));
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}\nPull it with:  ollama pull ${EMBED_MODEL}`;
    }
    batch.forEach((b, j) => chunks.push({ ...b, vec: vecs[j] || [] }));
    onProgress?.(`Embedded ${Math.min(i + BATCH, pending.length)}/${pending.length}…`);
  }

  const index: Index = { model: EMBED_MODEL, createdAt: Date.now(), root: cwd, chunks, mtimes };
  await invoke("write_file", { path: indexPath(cwd), content: JSON.stringify(index) });
  return `Indexed ${chunks.length} chunks from ${files.length} files → .rodeo/index.json`;
}

async function loadIndex(cwd: string): Promise<Index | null> {
  try {
    const raw = await invoke<string>("read_file", { path: indexPath(cwd) });
    return JSON.parse(raw) as Index;
  } catch {
    return null;
  }
}

export async function semanticSearch(cwd: string, query: string, k = 6): Promise<string> {
  if (!cwd) return "Error: no working directory set.";
  const q = String(query || "").trim();
  if (!q) return "Error: empty query.";
  const index = await loadIndex(cwd);
  if (!index || !index.chunks.length) {
    return "No semantic index yet. Build one first (run IndexProject, or ask me to \"index this project\"), then search again. Until then use Grep.";
  }
  let qvec: number[];
  try {
    qvec = (await embed([q]))[0];
  } catch (e) {
    return `Error embedding query: ${e instanceof Error ? e.message : String(e)}`;
  }
  const scored = index.chunks
    .map((c) => ({ c, score: cosine(qvec, c.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(12, k)));

  const ageNote =
    Date.now() - index.createdAt > 1000 * 60 * 60 * 24
      ? "\n(Index is over a day old — re-run IndexProject if results feel stale.)"
      : "";

  return (
    scored
      .map(({ c, score }) => {
        const preview = c.text.split("\n").slice(0, 4).join("\n");
        return `${c.path}:${c.start}-${c.end}  (${score.toFixed(2)})\n${preview}`;
      })
      .join("\n\n") + ageNote
  );
}
