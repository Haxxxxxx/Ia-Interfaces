/**
 * Offline-aware web access for the coding brain.
 *
 * We deliberately shell out to `curl` (via the native exec_shell command) rather
 * than the webview's fetch(): fetch from the Tauri webview is subject to CORS for
 * arbitrary origins, while curl is not — and curl is preinstalled on macOS, so
 * this adds zero dependencies and keeps the app fully self-contained. When the
 * machine is offline curl simply fails, which we translate into a clear,
 * non-fatal message so the agent can carry on doing local work.
 */
import { invoke } from "@tauri-apps/api/core";

interface ShellOutput { stdout: string; stderr: string; exit_code: number }

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function shellQuote(s: string): string {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

async function curl(urlOrArgs: string[], timeoutSec = 20): Promise<ShellOutput> {
  const cmd = [
    "curl", "-sSL", "--compressed",
    "--max-time", String(timeoutSec),
    "-A", shellQuote(UA),
    ...urlOrArgs.map(shellQuote),
  ].join(" ");
  return invoke<ShellOutput>("exec_shell", { command: cmd, cwd: "" });
}

/** Quick connectivity probe so we can give an "offline" message instead of a
 *  cryptic curl error. Best-effort, short timeout. */
export async function isOnline(): Promise<boolean> {
  try {
    const o = await invoke<ShellOutput>("exec_shell", {
      command: `curl -sSf --max-time 4 -o /dev/null -w '%{http_code}' https://duckduckgo.com`,
      cwd: "",
    });
    return o.exit_code === 0;
  } catch {
    return false;
  }
}

const OFFLINE_MSG =
  "Couldn't reach the network — you appear to be offline. Web tools are unavailable right now; continue with local files, Grep, and SemanticSearch instead.";

// ---------------------------------------------------------------------------
// HTML → text
// ---------------------------------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(x?)([0-9a-f]+);/gi, (full, hex, code) => {
      const n = hex ? parseInt(code, 16) : parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : full;
    });
}

function htmlToText(html: string): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ");
  // Keep some structure: turn block-ish tags into newlines.
  t = t
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ");
  t = t.replace(/<[^>]+>/g, " ");
  t = decodeEntities(t);
  return t.replace(/[ \t\f\v]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// WebFetch — fetch a URL and return readable text
// ---------------------------------------------------------------------------
export async function webFetch(rawUrl: string, _prompt?: string): Promise<string> {
  const url = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return `Error: WebFetch only accepts http(s) URLs (got "${url.slice(0, 80)}").`;
  }
  let out: ShellOutput;
  try {
    out = await curl([url], 20);
  } catch (e) {
    return `Error fetching ${url}: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (out.exit_code !== 0) {
    if (await isOnline().then((up) => !up)) return OFFLINE_MSG;
    return `Error: fetch failed (curl exit ${out.exit_code}). ${out.stderr.trim().slice(0, 200)}`;
  }
  const text = htmlToText(out.stdout);
  if (!text) return `Fetched ${url} but it had no readable text (binary or empty).`;
  const MAX = 15000;
  const body = text.length > MAX ? text.slice(0, MAX) + "\n\n… (truncated)" : text;
  return `# ${url}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// WebSearch — DuckDuckGo HTML endpoint (no API key, works offline-aware)
// ---------------------------------------------------------------------------
interface SearchResult { title: string; url: string; snippet: string }

function unwrapDdg(href: string): string {
  // DDG wraps results as //duckduckgo.com/l/?uddg=<encoded>&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { /* keep raw */ } }
  return href.startsWith("//") ? "https:" + href : href;
}

function parseDdg(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  // Snippets appear after each link in a result__snippet anchor/div.
  const snippetRe = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html))) snippets.push(htmlToText(sm[1]));
  let i = 0;
  while ((m = blockRe.exec(html))) {
    results.push({
      title: htmlToText(m[2]),
      url: unwrapDdg(m[1]),
      snippet: snippets[i] || "",
    });
    i++;
  }
  return results;
}

export async function webSearch(query: string, num = 6): Promise<string> {
  const q = String(query || "").trim();
  if (!q) return "Error: empty search query.";
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  let out: ShellOutput;
  try {
    out = await curl([url], 15);
  } catch (e) {
    return `Error searching: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (out.exit_code !== 0) {
    if (await isOnline().then((up) => !up)) return OFFLINE_MSG;
    return `Error: search failed (curl exit ${out.exit_code}).`;
  }
  const results = parseDdg(out.stdout).slice(0, Math.max(1, Math.min(10, num)));
  if (!results.length) return `No results for "${q}".`;
  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`)
    .join("\n\n");
}
