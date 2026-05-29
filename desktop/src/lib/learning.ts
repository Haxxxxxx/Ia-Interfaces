/**
 * Nightly self-update. Distills conversation data into a durable "learned
 * profile" (injected into every future session) and bakes a custom
 * `rodeo:tuned` Ollama model that carries it in its SYSTEM prompt.
 *
 * Real weight fine-tuning isn't practical locally, so this is prompt-level
 * learning — but it compounds and is fully transparent/editable.
 */
import { useStore } from "./store";
import { ollamaComplete, isOllamaUp, listLocalModels } from "./ollama";
import { invoke } from "@tauri-apps/api/core";

const DAY_MS = 24 * 60 * 60 * 1000;

const BASE_PERSONA =
  "You are Rodeo, an autonomous local AI coding assistant. You use tools to read, edit, and run code. Be concise, verify your work with typecheck/lint/tests, and follow the user's conventions.";

interface ShellOutput { stdout: string; stderr: string; exit_code: number }

export function shouldSelfUpdate(): boolean {
  const s = useStore.getState();
  if (!s.selfUpdateEnabled || s.autonomousRunning || !s.ollamaUp) return false;
  if (Date.now() - s.lastLearnedAt < DAY_MS) return false;
  const msgs = s.instances.reduce((a, i) => a + i.messages.length, 0);
  return msgs >= 4;
}

function pickBase(models: string[]): string {
  return models.find((m) => !m.startsWith("rodeo") && !/coder/i.test(m)) || "qwen2.5:7b";
}

function collectExcerpts(): string {
  const s = useStore.getState();
  const lines: string[] = [];
  for (const inst of s.instances) {
    for (const m of inst.messages.slice(-30)) {
      if (m.role === "user") lines.push(`USER: ${m.content.slice(0, 500)}`);
      else if (m.role === "assistant" && m.content) lines.push(`RODEO: ${m.content.slice(0, 300)}`);
    }
  }
  return lines.slice(-120).join("\n");
}

export async function runSelfUpdate(opts: { bakeModel?: boolean } = {}): Promise<string> {
  const s = useStore.getState();
  const distillModel = s.localModel.startsWith("rodeo:") ? pickBase(s.ollamaModels) : s.localModel;

  const excerpts = collectExcerpts();
  if (!excerpts.trim()) return "No conversation data to learn from yet.";

  // 1. Distill an updated profile.
  const profile = (
    await ollamaComplete(
      [
        {
          role: "system",
          content:
            "You maintain a durable PROFILE for an AI coding assistant. Merge new signal into the existing profile. Capture: user preferences & communication style, coding conventions, project facts/paths, recurring instructions, and approaches that worked or failed. Output ONLY the updated profile as concise markdown bullets (max ~35 lines). No preamble.",
        },
        {
          role: "user",
          content: `EXISTING PROFILE:\n${s.learnedProfile || "(empty)"}\n\nNEW CONVERSATION EXCERPTS:\n${excerpts}\n\nReturn the updated profile.`,
        },
      ],
      distillModel
    )
  )
    .replace(/"""/g, '"')
    .trim();

  if (!profile) return "Distillation returned empty; profile unchanged.";
  useStore.getState().setLearned(profile, Date.now());

  // 2. Bake a custom rodeo:tuned model carrying the profile.
  let baked = "";
  if (opts.bakeModel !== false) {
    try {
      const base = pickBase(s.ollamaModels);
      const sys = `${BASE_PERSONA}\n\nLearned profile:\n${profile}`.replace(/"""/g, '"');
      const modelfile = `FROM ${base}\nPARAMETER temperature 0.3\nSYSTEM """${sys}"""\n`;
      const tmp = "/tmp/rodeo-Modelfile";
      await invoke("write_file", { path: tmp, content: modelfile });
      const out = await invoke<ShellOutput>("exec_shell", { command: `ollama create rodeo:tuned -f ${tmp}`, cwd: "" });
      baked = out.exit_code === 0 ? " · baked rodeo:tuned" : ` · bake failed: ${out.stderr.slice(0, 140)}`;
      if (out.exit_code === 0 && (await isOllamaUp())) {
        const models = await listLocalModels().catch(() => []);
        useStore.getState().setOllama({ up: true, models: models.map((m) => m.name) });
      }
    } catch (e: any) {
      baked = ` · bake error: ${e?.message || e}`;
    }
  }

  useStore.getState().appendAutonomousLog(`🧠 Self-update complete${baked}`);
  return `Updated learned profile (${profile.split("\n").length} lines)${baked}`;
}
