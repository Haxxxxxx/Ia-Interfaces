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
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Auth
      apiKey: "",
      setApiKey: (key) => set({ apiKey: key }),

      // Settings
      apiUrl: "https://llm.sadary.xyz",
      setApiUrl: (url) => set({ apiUrl: url }),
      workingDirectory: "",
      setWorkingDirectory: (dir) => set({ workingDirectory: dir }),

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
    }),
    {
      name: "sadary-hub-storage",
      partialize: (state) => ({
        apiKey: state.apiKey,
        apiUrl: state.apiUrl,
        workingDirectory: state.workingDirectory,
        instances: state.instances,
        activeInstanceId: state.activeInstanceId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
