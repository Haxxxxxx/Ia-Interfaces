/**
 * Autonomous queue runner — works the task list to completion while the user
 * is away. Auto-approves within guardrails, lets Rodeo re-plan its own queue
 * (TaskAdd/TaskUpdate), logs every step, and continues past failures.
 */
import { useStore } from "./store";
import { runAgent } from "./agent";
import { buildSystemPrompt } from "./tools";
import { gatherProjectContext } from "./project-context";
import type { ChatMessage } from "./ollama";

let currentAbort: AbortController | null = null;

export function isAutonomousActive(): boolean {
  return currentAbort !== null;
}

export function stopAutonomous() {
  currentAbort?.abort();
}

export async function runAutonomousQueue() {
  if (currentAbort) return; // already running
  const abort = new AbortController();
  currentAbort = abort;
  const get = useStore.getState;

  get().setAutonomousRunning(true);
  get().appendAutonomousLog(`▶ Autonomous run started — ${new Date().toLocaleTimeString()}`);

  try {
    while (!abort.signal.aborted) {
      const st = get();
      const task = st.tasks.find((t) => t.status === "pending");
      if (!task) { get().appendAutonomousLog("✓ Queue empty — all tasks processed."); break; }
      if (!st.workingDirectory) { get().appendAutonomousLog("✗ No working directory set — stopping."); break; }
      if (!st.ollamaUp) { get().appendAutonomousLog("✗ Ollama offline — stopping."); break; }

      get().updateTask(task.id, { status: "running" });
      get().appendAutonomousLog(`▸ ${task.title}`);

      try {
        const ctx = await gatherProjectContext(st.workingDirectory);
        const system = buildSystemPrompt(ctx, st.workingDirectory, {
          learned: st.learnedProfile,
          autonomous: true,
        });
        const messages: ChatMessage[] = [
          { role: "system", content: system },
          {
            role: "user",
            content: `Current task (id ${task.id.slice(0, 8)}): ${task.title}\n${task.detail || ""}\n\nComplete this fully and autonomously. Verify your work. When finished, call TaskUpdate to mark it done (or failed with a short reason). Add follow-up tasks with TaskAdd if needed.`,
          },
        ];

        let finalText = "";
        await runAgent(
          messages,
          { model: st.localModel, cwd: st.workingDirectory, autoApprove: true, guarded: true, maxIterations: 40, signal: abort.signal },
          {
            onAssistantTurn: (text) => { if (text) finalText = text; },
            onToolStart: (_tc, d) => get().appendAutonomousLog(`   ⚙ ${d}`),
            onTurnMetric: (m) => get().addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "turn", ...m }),
            onToolMetric: (m) => get().addMetric({ id: crypto.randomUUID(), ts: Date.now(), kind: "tool", ...m }),
          }
        );

        // If the agent didn't set a terminal status itself, mark it done.
        const after = get().tasks.find((t) => t.id === task.id);
        if (after?.status === "running") {
          get().updateTask(task.id, { status: "done", result: finalText.slice(0, 2000) });
        } else if (after && !after.result) {
          get().updateTask(task.id, { result: finalText.slice(0, 2000) });
        }
        get().appendAutonomousLog(`   ✓ ${get().tasks.find((t) => t.id === task.id)?.status ?? "done"}: ${task.title}`);
      } catch (e: any) {
        if (abort.signal.aborted) { get().updateTask(task.id, { status: "pending" }); break; }
        get().updateTask(task.id, { status: "failed", result: String(e?.message || e) });
        get().appendAutonomousLog(`   ✗ failed: ${task.title} — ${e?.message || e}`);
      }
    }
  } finally {
    get().setAutonomousRunning(false);
    get().appendAutonomousLog(`■ Autonomous run stopped — ${new Date().toLocaleTimeString()}`);
    currentAbort = null;
  }
}
