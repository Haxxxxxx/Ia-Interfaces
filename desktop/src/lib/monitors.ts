/**
 * Scheduled monitoring tasks. Each monitor periodically runs a guarded,
 * autonomous agent check, parses a STATUS verdict, records history, and
 * fires a desktop notification on ALERT.
 *
 * Runs only while the app is open (it isn't a background daemon); the
 * scheduler does an on-launch catch-up for monitors that came due.
 */
import { useStore } from "./store";
import type { MonitorTask } from "./store";
import { runAgent } from "./agent";
import { buildSystemPrompt } from "./tools";
import { gatherProjectContext } from "./project-context";
import type { ChatMessage } from "./ollama";

let ticking = false;

function parseStatus(text: string): { status: "ok" | "alert" | "error"; summary: string } {
  const m = text.match(/STATUS:\s*(OK|ALERT|ERROR)\s*[—:–-]*\s*(.*)/i);
  if (m) {
    const status = m[1].toLowerCase() as "ok" | "alert" | "error";
    return { status, summary: (m[2] || "").trim() || text.slice(-200).trim() };
  }
  // No explicit verdict — assume OK, keep a short tail as the summary.
  return { status: "ok", summary: text.slice(-200).trim() || "(no summary)" };
}

async function notifyAlert(title: string, body: string) {
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (granted) n.sendNotification({ title: `⚠ ${title}`, body });
  } catch {
    // notifications unavailable — the in-app status badge still reflects it
  }
}

export async function runMonitor(id: string): Promise<void> {
  const get = useStore.getState;
  const mon = get().monitors.find((m) => m.id === id);
  if (!mon) return;

  const st = get();
  if (!st.ollamaUp) {
    get().recordMonitorRun(id, { ts: Date.now(), status: "error", summary: "Ollama offline" });
    return;
  }

  get().setMonitorBusy(true);
  try {
    const cwd = st.workingDirectory;
    const ctx = cwd ? await gatherProjectContext(cwd) : "";
    const system = buildSystemPrompt(ctx, cwd, { learned: st.learnedProfile, autonomous: true });
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: `Monitoring check: ${mon.prompt}\n\nInvestigate with your tools (read-only is fine — don't modify files unless the check explicitly requires it). Then end your final message with EXACTLY one line:\nSTATUS: OK — <one-line summary>\nor\nSTATUS: ALERT — <what is wrong>\nBe terse.`,
      },
    ];

    let finalText = "";
    await runAgent(
      messages,
      { model: st.localModel, cwd, autoApprove: true, guarded: true, maxIterations: 15 },
      {
        onAssistantTurn: (text) => { if (text) finalText = text; },
        onTurnMetric: (m) => get().addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "turn", ...m }),
        onToolMetric: (m) => get().addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "tool", ...m }),
      }
    );

    const { status, summary } = parseStatus(finalText);
    get().recordMonitorRun(id, { ts: Date.now(), status, summary });
    if (status === "alert") await notifyAlert(mon.title, summary);
  } catch (e: any) {
    get().recordMonitorRun(id, { ts: Date.now(), status: "error", summary: String(e?.message || e) });
  } finally {
    get().setMonitorBusy(false);
  }
}

function isDue(m: MonitorTask, now: number): boolean {
  return m.enabled && now - m.lastRunAt >= m.everyMinutes * 60_000;
}

/** Runs any due monitors, one at a time. Safe to call frequently. */
export async function tickMonitors(): Promise<void> {
  if (ticking) return;
  const get = useStore.getState;
  if (get().autonomousRunning || get().monitorBusy) return; // avoid model contention

  ticking = true;
  try {
    const now = Date.now();
    const due = get().monitors.filter((m) => isDue(m, now));
    for (const m of due) {
      if (get().autonomousRunning) break;
      await runMonitor(m.id);
    }
  } finally {
    ticking = false;
  }
}
