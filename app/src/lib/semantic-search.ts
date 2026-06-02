/**
 * Semantic code search (local RAG) for the server.
 *
 * Embeds a project's source into vectors via a local Ollama embedding model
 * (nomic-embed-text) and answers natural-language queries by cosine similarity.
 * The index lives at `<projectRoot>/.rodeo/index.json`. Mirrors the desktop app
 * (lib/semantic.ts) and the CLI. Fully local once the embed model is pulled.
 */
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { getConfig } from "./config";

const execAsync = promisify(exec);

export const EMBED_MODEL = "nomic-embed-text";

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|rs|py|go|java|kt|swift|c|h|cpp|hpp|cs|rb|php|sql|sh|toml|json|md|yaml|yml|css|scss|html|vue|svelte)$/i;
const CHUNK_LINES = 50;
const CHUNK_STEP = 40;
const MAX_FILES = 600;
const MAX_CHUNKS = 2000;
const MAX_FILE_BYTES = 200_000;

interface Chunk { path: string; start: number; end: number; text: string; vec: number[] }
interface Index { model: string; createdAt: number; chunks: Chunk[] }

function indexPath(projectRoot: string): string {
  return path.join(projectRoot, ".rodeo", "index.json");
}

/** Ollama base URL without the trailing /v1 (embeddings use the native API). */
function embedBaseUrl(): string {
  const v1 = getConfig().ollamaUrl.replace(/\/+$/, "");
  return v1.endsWith("/v1") ? v1.slice(0, -3) : v1;
}

async function embed(inputs: string[]): Promise<number[][]> {
  const base = embedBaseUrl();
  try {
    const res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data.embeddings)) return data.embeddings;
    }
  } catch { /* fall through */ }
  const out: number[][] = [];
  for (const input of inputs) {
    const res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
    });
    if (!res.ok) throw new Error(`embedding failed (${res.status}) — is "${EMBED_MODEL}" pulled? Run: ollama pull ${EMBED_MODEL}`);
    const data: any = await res.json();
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

async function listSourceFiles(projectRoot: string): Promise<string[]> {
  let raw = "";
  try {
    raw = (await execAsync("rg --files", { cwd: projectRoot, maxBuffer: 32 * 1024 * 1024 })).stdout;
  } catch {
    try {
      raw = (await execAsync(
        "find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/target/*' -not -path '*/dist/*'",
        { cwd: projectRoot, maxBuffer: 32 * 1024 * 1024 }
      )).stdout;
    } catch { return []; }
  }
  return raw.split("\n").map((s) => s.trim()).filter((s) => s && CODE_EXT.test(s)).slice(0, MAX_FILES);
}

function chunkFile(rel: string, content: string): Omit<Chunk, "vec">[] {
  const lines = content.split("\n");
  const chunks: Omit<Chunk, "vec">[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_STEP) {
    const text = lines.slice(i, i + CHUNK_LINES).join("\n").trim();
    if (text.length >= 20) chunks.push({ path: rel, start: i + 1, end: Math.min(i + CHUNK_LINES, lines.length), text });
    if (i + CHUNK_LINES >= lines.length) break;
  }
  return chunks;
}

export async function buildSemanticIndex(projectRoot: string): Promise<string> {
  if (!projectRoot) return "Error: no project root.";
  const files = await listSourceFiles(projectRoot);
  if (!files.length) return "No source files found to index.";

  const pending: Omit<Chunk, "vec">[] = [];
  for (const rel of files) {
    if (pending.length >= MAX_CHUNKS) break;
    const abs = path.resolve(projectRoot, rel);
    let content = "";
    try { content = await fs.readFile(abs, "utf-8"); } catch { continue; }
    if (content.length > MAX_FILE_BYTES) continue;
    for (const ch of chunkFile(rel.replace(/^\.\//, ""), content)) {
      pending.push(ch);
      if (pending.length >= MAX_CHUNKS) break;
    }
  }

  const chunks: Chunk[] = [];
  const BATCH = 32;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    let vecs: number[][];
    try { vecs = await embed(batch.map((b) => b.text)); }
    catch (e) { return `Error: ${e instanceof Error ? e.message : String(e)}`; }
    batch.forEach((b, j) => chunks.push({ ...b, vec: vecs[j] || [] }));
  }

  const index: Index = { model: EMBED_MODEL, createdAt: Date.now(), chunks };
  await fs.mkdir(path.dirname(indexPath(projectRoot)), { recursive: true });
  await fs.writeFile(indexPath(projectRoot), JSON.stringify(index));
  return `Indexed ${chunks.length} chunks from ${files.length} files → .rodeo/index.json`;
}

export async function semanticSearch(projectRoot: string, query: string, k = 6): Promise<string> {
  if (!projectRoot) return "Error: no project root.";
  const q = String(query || "").trim();
  if (!q) return "Error: empty query.";
  let index: Index;
  try { index = JSON.parse(await fs.readFile(indexPath(projectRoot), "utf-8")); }
  catch { return "No semantic index yet. Run IndexProject first (or ask me to \"index this project\"), then search again. Until then use Grep."; }
  if (!index.chunks?.length) return "The semantic index is empty — re-run IndexProject.";

  let qvec: number[];
  try { qvec = (await embed([q]))[0]; }
  catch (e) { return `Error embedding query: ${e instanceof Error ? e.message : String(e)}`; }

  const scored = index.chunks
    .map((ch) => ({ ch, score: cosine(qvec, ch.vec) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(12, k)));
  const ageNote = Date.now() - index.createdAt > 1000 * 60 * 60 * 24
    ? "\n(Index is over a day old — re-run IndexProject if results feel stale.)" : "";
  return scored
    .map(({ ch, score }) => `${ch.path}:${ch.start}-${ch.end}  (${score.toFixed(2)})\n${ch.text.split("\n").slice(0, 4).join("\n")}`)
    .join("\n\n") + ageNote;
}
