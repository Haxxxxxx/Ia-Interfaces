import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface PerfEvent {
  id: string;
  ts: number;
  kind: "turn" | "tool";
  model?: string;
  ttftMs?: number;     // turn: time to first token
  durationMs: number;  // turn: stream duration; tool: exec time
  tokens?: number;     // turn: approx tokens generated
  tokPerSec?: number;  // turn
  toolName?: string;   // tool
  ok?: boolean;        // tool success
}

export interface MonitorRun {
  ts: number;
  status: "ok" | "alert" | "error";
  summary: string;
}

export interface MonitorTask {
  id: string;
  title: string;
  prompt: string;          // what to check each run
  everyMinutes: number;    // run interval
  enabled: boolean;
  lastRunAt: number;
  lastStatus: "ok" | "alert" | "error" | "never";
  lastSummary: string;
  runs: MonitorRun[];      // capped history
}

export interface Workspace {
  id: string;
  name: string;
  path: string;            // project root / working directory
  model: string;           // preferred local model for this project
  createdAt: number;
  lastOpenedAt: number;
}

export interface AgentTask {
  id: string;
  title: string;
  detail?: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: string;
  createdAt: number;
  updatedAt: number;
}

interface Instance {
  id: string;
  name: string;
  model: string;
  thinking: boolean;
  systemPrompt?: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  // Auth
  apiKey: string;
  setApiKey: (key: string) => void;

  // Settings
  apiUrl: string;
  setApiUrl: (url: string) => void;
  workingDirectory: string;
  setWorkingDirectory: (dir: string) => void;

  // Offline brain
  mode: "local" | "remote";
  setMode: (mode: "local" | "remote") => void;
  localModel: string;
  setLocalModel: (model: string) => void;
  autoApprove: boolean;
  setAutoApprove: (on: boolean) => void;
  ollamaUp: boolean;
  ollamaModels: string[];
  setOllama: (state: { up: boolean; models?: string[] }) => void;

  // Instances
  instances: Instance[];
  activeInstanceId: string | null;
  setActiveInstance: (id: string) => void;
  createInstance: (name: string, model?: string) => void;
  deleteInstance: (id: string) => void;
  addMessage: (instanceId: string, message: Omit<Message, "id" | "timestamp">) => void;
  updateLastMessage: (instanceId: string, update: Partial<Message>) => void;

  // UI
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;

  // Connection
  isConnected: boolean;
  setConnected: (connected: boolean) => void;

  // Views
  view: "chat" | "workspaces" | "tasks" | "monitors" | "dashboard";
  setView: (v: "chat" | "workspaces" | "tasks" | "monitors" | "dashboard") => void;

  // Perf metrics (session only)
  metrics: PerfEvent[];
  addMetric: (e: PerfEvent) => void;
  clearMetrics: () => void;

  // Autonomous task queue (self-managing)
  tasks: AgentTask[];
  addTask: (title: string, detail?: string) => string;
  updateTask: (id: string, patch: Partial<AgentTask>) => void;
  removeTask: (id: string) => void;
  clearTasks: (which: "done" | "all") => void;
  reorderTask: (id: string, dir: "up" | "down") => void;
  autonomousRunning: boolean;
  setAutonomousRunning: (v: boolean) => void;
  autonomousLog: string[];
  appendAutonomousLog: (line: string) => void;
  clearAutonomousLog: () => void;

  // Learning / nightly self-update
  learnedProfile: string;
  lastLearnedAt: number;
  selfUpdateEnabled: boolean;
  setSelfUpdateEnabled: (v: boolean) => void;
  setLearned: (profile: string, at: number) => void;

  // Project workspaces
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  addWorkspace: (name: string, path: string, model?: string) => string;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  removeWorkspace: (id: string) => void;
  switchWorkspace: (id: string) => void;

  // Scheduled monitoring tasks
  monitors: MonitorTask[];
  addMonitor: (m: { title: string; prompt: string; everyMinutes: number }) => string;
  updateMonitor: (id: string, patch: Partial<MonitorTask>) => void;
  removeMonitor: (id: string) => void;
  recordMonitorRun: (id: string, run: MonitorRun) => void;
  monitorBusy: boolean;
  setMonitorBusy: (v: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      apiKey: "",
      setApiKey: (key) => set({ apiKey: key }),

      // Settings
      apiUrl: "https://llm.sadary.xyz",
      setApiUrl: (url) => set({ apiUrl: url }),
      workingDirectory: "",
      setWorkingDirectory: (dir) => set({ workingDirectory: dir }),

      // Offline brain — default to fully-local operation
      mode: "local",
      setMode: (mode) => set({ mode }),
      // 14b is much more reliable at agentic editing than 7b (7b narrates /
      // drops tool calls). Instruct models tool-call cleanly; -coder variants
      // emit tool calls as text, so avoid them for the agent loop.
      localModel: "qwen2.5:14b",
      setLocalModel: (localModel) => set({ localModel }),
      autoApprove: false,
      setAutoApprove: (autoApprove) => set({ autoApprove }),
      ollamaUp: false,
      ollamaModels: [],
      setOllama: ({ up, models }) =>
        set((s) => ({ ollamaUp: up, ollamaModels: models ?? s.ollamaModels })),

      // Instances
      instances: [],
      activeInstanceId: null,

      setActiveInstance: (id) => set({ activeInstanceId: id }),

      createInstance: (name, model = "kimi-k2.5") => {
        const newInstance: Instance = {
          id: crypto.randomUUID(),
          name,
          model,
          thinking: true,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          instances: [...state.instances, newInstance],
          activeInstanceId: newInstance.id,
        }));
      },

      deleteInstance: (id) =>
        set((state) => ({
          instances: state.instances.filter((i) => i.id !== id),
          activeInstanceId:
            state.activeInstanceId === id
              ? state.instances[0]?.id || null
              : state.activeInstanceId,
        })),

      addMessage: (instanceId, message) =>
        set((state) => ({
          instances: state.instances.map((instance) =>
            instance.id === instanceId
              ? {
                  ...instance,
                  messages: [
                    ...instance.messages,
                    {
                      ...message,
                      id: crypto.randomUUID(),
                      timestamp: Date.now(),
                    },
                  ],
                  updatedAt: Date.now(),
                }
              : instance
          ),
        })),

      updateLastMessage: (instanceId, update) =>
        set((state) => ({
          instances: state.instances.map((instance) =>
            instance.id === instanceId
              ? {
                  ...instance,
                  messages: instance.messages.map((msg, idx) =>
                    idx === instance.messages.length - 1
                      ? { ...msg, ...update }
                      : msg
                  ),
                }
              : instance
          ),
        })),

      // UI
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      showSettings: false,
      setShowSettings: (show) => set({ showSettings: show }),

      // Connection
      isConnected: false,
      setConnected: (connected) => set({ isConnected: connected }),

      // Views
      view: "chat",
      setView: (view) => set({ view }),

      // Perf metrics (session only, capped)
      metrics: [],
      addMetric: (e) =>
        set((state) => ({ metrics: [...state.metrics.slice(-299), e] })),
      clearMetrics: () => set({ metrics: [] }),

      // Autonomous task queue
      tasks: [],
      addTask: (title, detail) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((s) => ({ tasks: [...s.tasks, { id, title, detail, status: "pending", createdAt: now, updatedAt: now }] }));
        return id;
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      clearTasks: (which) =>
        set((s) => ({ tasks: which === "all" ? [] : s.tasks.filter((t) => t.status !== "done" && t.status !== "skipped") })),
      reorderTask: (id, dir) =>
        set((s) => {
          const i = s.tasks.findIndex((t) => t.id === id);
          if (i < 0) return {};
          const j = dir === "up" ? i - 1 : i + 1;
          if (j < 0 || j >= s.tasks.length) return {};
          const next = [...s.tasks];
          [next[i], next[j]] = [next[j], next[i]];
          return { tasks: next };
        }),
      autonomousRunning: false,
      setAutonomousRunning: (autonomousRunning) => set({ autonomousRunning }),
      autonomousLog: [],
      appendAutonomousLog: (line) => set((s) => ({ autonomousLog: [...s.autonomousLog.slice(-499), line] })),
      clearAutonomousLog: () => set({ autonomousLog: [] }),

      // Learning / nightly self-update
      learnedProfile: "",
      lastLearnedAt: 0,
      selfUpdateEnabled: true,
      setSelfUpdateEnabled: (selfUpdateEnabled) => set({ selfUpdateEnabled }),
      setLearned: (learnedProfile, lastLearnedAt) => set({ learnedProfile, lastLearnedAt }),

      // Project workspaces
      workspaces: [],
      activeWorkspaceId: null,
      addWorkspace: (name, path, model) => {
        const id = crypto.randomUUID();
        const now = Date.now();
        set((s) => ({
          workspaces: [...s.workspaces, { id, name, path, model: model || s.localModel, createdAt: now, lastOpenedAt: now }],
          activeWorkspaceId: id,
          workingDirectory: path,
          ...(model ? { localModel: model } : {}),
        }));
        return id;
      },
      updateWorkspace: (id, patch) =>
        set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      removeWorkspace: (id) =>
        set((s) => ({
          workspaces: s.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
        })),
      switchWorkspace: (id) =>
        set((s) => {
          const w = s.workspaces.find((x) => x.id === id);
          if (!w) return {};
          return {
            activeWorkspaceId: id,
            workingDirectory: w.path,
            localModel: w.model || s.localModel,
            workspaces: s.workspaces.map((x) => (x.id === id ? { ...x, lastOpenedAt: Date.now() } : x)),
          };
        }),

      // Scheduled monitoring tasks
      monitors: [],
      addMonitor: ({ title, prompt, everyMinutes }) => {
        const id = crypto.randomUUID();
        set((s) => ({
          monitors: [...s.monitors, {
            id, title, prompt, everyMinutes, enabled: true,
            lastRunAt: 0, lastStatus: "never", lastSummary: "", runs: [],
          }],
        }));
        return id;
      },
      updateMonitor: (id, patch) =>
        set((s) => ({ monitors: s.monitors.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      removeMonitor: (id) => set((s) => ({ monitors: s.monitors.filter((m) => m.id !== id) })),
      recordMonitorRun: (id, run) =>
        set((s) => ({
          monitors: s.monitors.map((m) =>
            m.id === id
              ? { ...m, lastRunAt: run.ts, lastStatus: run.status, lastSummary: run.summary, runs: [...m.runs.slice(-19), run] }
              : m
          ),
        })),
      monitorBusy: false,
      setMonitorBusy: (monitorBusy) => set({ monitorBusy }),
    }),
    {
      name: "rodeo-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        apiUrl: state.apiUrl,
        workingDirectory: state.workingDirectory,
        mode: state.mode,
        localModel: state.localModel,
        autoApprove: state.autoApprove,
        instances: state.instances,
        activeInstanceId: state.activeInstanceId,
        sidebarCollapsed: state.sidebarCollapsed,
        tasks: state.tasks,
        learnedProfile: state.learnedProfile,
        lastLearnedAt: state.lastLearnedAt,
        selfUpdateEnabled: state.selfUpdateEnabled,
        monitors: state.monitors,
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
    }
  )
);
