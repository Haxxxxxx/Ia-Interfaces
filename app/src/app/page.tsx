"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { ToolResult } from "@/components/ToolResult";
import { SlashCommandMenu } from "@/components/SlashCommandMenu";
import { GitStatusBadge, NotGitRepoBadge } from "@/components/GitStatusBadge";
import { FigmaWorkspace, FigmaConnectModal } from "@/components/FigmaWorkspace";
import { FigmaLayerPanel } from "@/components/FigmaLayerPanel";
import {
  parseCommand,
  findCommand,
  handleClientCommand,
  isSlashCommand,
} from "@/lib/slash-commands";

// ============================================================================
// Types
// ============================================================================

interface MessageImage {
  id: string;
  url: string;
  type: "uploaded" | "generated";
}

interface ToolCallResult {
  success: boolean;
  output: string;
  error?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  status: "running" | "done" | "error";
  result?: ToolCallResult;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  images?: MessageImage[];
  toolCalls?: ToolCall[];
  timestamp: Date;
}

interface Instance {
  id: string;
  name: string;
  model: string;
  messages: Message[];
  createdAt: Date;
}

interface HealthStatus {
  api: string;
  llm: string;
  database: string;
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  provider?: string;
  vram?: string;
  speed?: string;
  context_window?: number;
  capabilities?: string[];
  installed?: boolean;
  pricing?: {
    input_per_million: number;
    output_per_million: number;
    note?: string;
  };
}

interface SessionInfo {
  changeCount: number;
  planMode: boolean;
  git?: {
    branch: string;
    hasChanges: boolean;
    staged: number;
    unstaged: number;
    untracked: number;
  } | null;
}

interface AgenticEvent {
  type: "content" | "tool_start" | "tool_result" | "tool_error" | "iteration" | "done" | "error";
  content?: string;
  tool?: string;
  toolCallId?: string;
  result?: ToolCallResult;
  current?: number;
  max?: number;
  error?: string;
}

// Fallback models
const FALLBACK_MODELS: ModelInfo[] = [
  { id: "qwen2.5:7b", name: "Qwen 2.5 7B", description: "Fast local model", badge: "local", badgeColor: "green" },
  { id: "qwen2.5-coder:7b", name: "Qwen Coder 7B", description: "Best for code", badge: "local", badgeColor: "green" },
  { id: "qwen2.5:32b", name: "Qwen 2.5 32B", description: "Powerful local", badge: "gpu", badgeColor: "yellow" },
  { id: "kimi-k2.5", name: "Kimi K2.5", description: "Moonshot API", badge: "api", badgeColor: "purple" },
];

// ============================================================================
// Main Component
// ============================================================================

export default function Home() {
  // Helper: Calculate sidebar width based on state
  const getSidebarWidth = (): string => {
    if (sidebarCollapsed) return "w-0";
    if (showFigmaPanel && figmaToken) return "w-[420px]";
    return "w-64";
  };

  // Core state
  const [apiKey, setApiKey] = useState("");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("qwen2.5:7b");
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS);
  const [showSettings, setShowSettings] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelPickerIndex, setModelPickerIndex] = useState(0);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Agentic state
  const [planMode, setPlanMode] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [currentIteration, setCurrentIteration] = useState<{ current: number; max: number } | null>(null);

  // Token tracking
  const [sessionTokens, setSessionTokens] = useState({ input: 0, output: 0, cached: 0 });

  // Figma integration
  const [figmaToken, setFigmaToken] = useState<string | null>(null);
  const [showFigmaPanel, setShowFigmaPanel] = useState(false);
  const [showFigmaConnect, setShowFigmaConnect] = useState(false);
  const [figmaFileKey, setFigmaFileKey] = useState<string | null>(null);
  const [figmaFileInput, setFigmaFileInput] = useState("");
  const [figmaMode, setFigmaMode] = useState<"layers" | "assets">("layers");
  const [selectedFigmaNode, setSelectedFigmaNode] = useState<any>(null);

  // Parse Figma file key from URL
  const parseFigmaUrl = (url: string): string | null => {
    const trimmed = url.trim();
    if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  };

  const loadFigmaFile = () => {
    const key = parseFigmaUrl(figmaFileInput);
    if (key) {
      setFigmaFileKey(key);
      setShowFigmaPanel(true);
    }
  };

  // Slash command state
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Pending images
  const [pendingImages, setPendingImages] = useState<MessageImage[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Effects
  // ============================================================================

  // Load from storage
  useEffect(() => {
    const storedKey = localStorage.getItem("rodeo-api-key");
    const storedInstances = localStorage.getItem("rodeo-instances");
    const storedModel = localStorage.getItem("rodeo-model");
    const storedFigmaToken = localStorage.getItem("rodeo-figma-token");

    // Dev mode: auto-set API key for local development
    const isDev = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const effectiveKey = storedKey || (isDev ? "dev" : "");

    if (effectiveKey) setApiKey(effectiveKey);
    if (storedModel) setModel(storedModel);
    if (storedFigmaToken) setFigmaToken(storedFigmaToken);

    async function loadInstances() {
      const localParsed = storedInstances ? (() => {
        try { return JSON.parse(storedInstances); }
        catch { return []; }
      })() : [];

      if (effectiveKey) {
        try {
          const res = await fetch("/api/instances", {
            headers: { Authorization: `Bearer ${effectiveKey}` },
          });
          const data = await res.json();
          const apiInstances = data.instances || [];
          const localMap = new Map<string, any>(localParsed.map((i: any) => [i.id, i]));
          const merged = apiInstances.map((api: any) => {
            const local: any = localMap.get(api.id);
            return {
              id: api.id,
              name: api.name,
              model: api.model,
              messages: local?.messages?.map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp),
              })) || [],
              createdAt: new Date(api.createdAt),
            };
          });
          const apiIds = new Set(apiInstances.map((a: any) => a.id));
          const localOnly = localParsed.filter((i: any) => !apiIds.has(i.id)).map((i: any) => ({
            ...i,
            createdAt: new Date(i.createdAt),
            messages: i.messages?.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })) || [],
          }));
          const all = [...merged, ...localOnly];
          if (all.length > 0) {
            setInstances(all);
            setActiveInstanceId(all[0].id);
          }
          return;
        } catch {}
      }
      if (localParsed.length > 0) {
        setInstances(localParsed.map((i: any) => ({
          ...i,
          createdAt: new Date(i.createdAt),
          messages: i.messages?.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })) || [],
        })));
        setActiveInstanceId(localParsed[0].id);
      }
    }
    loadInstances();
  }, []);

  // Save to storage
  useEffect(() => {
    if (apiKey) localStorage.setItem("rodeo-api-key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("rodeo-model", model);
  }, [model]);

  useEffect(() => {
    localStorage.setItem("rodeo-instances", JSON.stringify(instances));
  }, [instances]);

  // Check health
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        setHealth(data.services);
      } catch {
        setHealth({ api: "error", llm: "error", database: "error" });
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch models
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch("/api/models");
        if (res.ok) {
          const data = await res.json();
          const ms = (data.data || []).map((m: any) => ({
            id: m.id,
            name: m.name,
            description: m.description || "",
            badge: m.badge || "local",
            badgeColor: m.badgeColor || "green",
            provider: m.provider,
            vram: m.vram,
            speed: m.speed,
            context_window: m.context_window,
            capabilities: m.capabilities,
            installed: m.installed,
            pricing: m.pricing,
          }));
          if (ms.length > 0) setModels(ms);
        }
      } catch {}
    }
    fetchModels();
  }, []);

  // Fetch session info
  useEffect(() => {
    if (!apiKey || !activeInstanceId) return;

    async function fetchSessionInfo() {
      try {
        const res = await fetch(`/api/v1/commands?instance_id=${activeInstanceId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSessionInfo({
            changeCount: data.session?.changeCount || 0,
            planMode: data.session?.planMode || false,
            git: data.git,
          });
          setPlanMode(data.session?.planMode || false);
        } else if (res.status === 401) {
          // Silently handle 401 - API key might be invalid or expired
          // Don't spam console with auth errors
          return;
        }
      } catch (error) {
        // Silently handle network errors - don't spam console
        // Only log unexpected errors
        if (process.env.NODE_ENV === "development") {
          console.debug("Session info fetch error:", error);
        }
      }
    }
    fetchSessionInfo();
    const interval = setInterval(fetchSessionInfo, 10000);
    return () => clearInterval(interval);
  }, [apiKey, activeInstanceId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [instances, activeInstanceId]);

  // Show command menu when typing /
  useEffect(() => {
    if (input.startsWith("/") && !input.includes(" ")) {
      setShowCommandMenu(true);
    } else {
      setShowCommandMenu(false);
    }
  }, [input]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowSettings(false);
        setShowModelPicker(false);
        setShowCommandMenu(false);
        return;
      }

      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "n":
            e.preventDefault();
            createInstance();
            break;
          case "k":
            e.preventDefault();
            setShowModelPicker(true);
            break;
          case ",":
            e.preventDefault();
            setShowSettings(true);
            break;
          case "b":
            e.preventDefault();
            setSidebarCollapsed((p) => !p);
            break;
          case "z":
            if (e.shiftKey) {
              e.preventDefault();
              handleUndo();
            }
            break;
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [instances.length, model, apiKey, activeInstanceId]);

  // ============================================================================
  // Instance Management
  // ============================================================================

  const activeInstance = instances.find((i) => i.id === activeInstanceId);

  const createInstance = useCallback(async () => {
    const instance: Instance = {
      id: crypto.randomUUID(),
      name: `Chat ${instances.length + 1}`,
      model,
      messages: [],
      createdAt: new Date(),
    };
    setInstances((prev) => [instance, ...prev]);
    setActiveInstanceId(instance.id);
    setTimeout(() => inputRef.current?.focus(), 100);

    if (apiKey) {
      try {
        await fetch("/api/instances", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            id: instance.id,
            name: instance.name,
            model: instance.model,
            source: "web",
          }),
        });
      } catch {}
    }
  }, [instances.length, model, apiKey]);

  const deleteInstance = (id: string) => {
    setInstances((prev) => prev.filter((i) => i.id !== id));
    if (activeInstanceId === id) {
      const remaining = instances.filter((i) => i.id !== id);
      setActiveInstanceId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const addMessage = (instanceId: string, message: Message) => {
    setInstances((prev) =>
      prev.map((inst) =>
        inst.id === instanceId
          ? { ...inst, messages: [...inst.messages, message] }
          : inst
      )
    );
  };

  const updateLastMessage = (instanceId: string, content: string, toolCalls?: ToolCall[]) => {
    setInstances((prev) =>
      prev.map((inst) => {
        if (inst.id !== instanceId) return inst;
        const messages = [...inst.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
          messages[lastIdx] = { ...messages[lastIdx], content, toolCalls };
        }
        return { ...inst, messages };
      })
    );
  };

  const updateToolCallResult = (instanceId: string, toolCallId: string, result: ToolCallResult, status: "done" | "error") => {
    setInstances((prev) =>
      prev.map((inst) => {
        if (inst.id !== instanceId) return inst;
        const messages = [...inst.messages];
        const lastIdx = messages.length - 1;
        if (lastIdx >= 0 && messages[lastIdx].toolCalls) {
          messages[lastIdx] = {
            ...messages[lastIdx],
            toolCalls: messages[lastIdx].toolCalls!.map((tc) =>
              tc.id === toolCallId ? { ...tc, status, result } : tc
            ),
          };
        }
        return { ...inst, messages };
      })
    );
  };

  // ============================================================================
  // Command Handling
  // ============================================================================

  const handleClientCommandResult = useCallback((result: any) => {
    if (result.action === "clear" && activeInstanceId) {
      setInstances((prev) =>
        prev.map((inst) =>
          inst.id === activeInstanceId ? { ...inst, messages: [] } : inst
        )
      );
    } else if (result.action === "model_change" && result.payload) {
      setModel(result.payload as string);
    } else if (result.action === "toggle_plan") {
      setPlanMode((p) => !p);
    }
  }, [activeInstanceId]);

  const handleServerCommand = async (command: string, instanceId: string) => {
    try {
      const res = await fetch("/api/v1/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          command,
          instance_id: instanceId,
        }),
      });

      const data = await res.json();
      return data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const handleUndo = async () => {
    if (!activeInstanceId) return;
    const result = await handleServerCommand("/undo", activeInstanceId);
    if (result.output) {
      addMessage(activeInstanceId, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.output,
        timestamp: new Date(),
      });
    }
  };

  // ============================================================================
  // Image Handling
  // ============================================================================

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setPendingImages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), url: dataUrl, type: "uploaded" },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => prev.filter((img) => img.id !== id));
  };

  // ============================================================================
  // Send Message
  // ============================================================================

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && pendingImages.length === 0) || !apiKey || loading) return;

    let instanceId = activeInstanceId;

    // Create instance if none
    if (!instanceId) {
      const instance: Instance = {
        id: crypto.randomUUID(),
        name: input.slice(0, 40) + (input.length > 40 ? "..." : ""),
        model,
        messages: [],
        createdAt: new Date(),
      };
      setInstances((prev) => [instance, ...prev]);
      setActiveInstanceId(instance.id);
      instanceId = instance.id;

      if (apiKey) {
        try {
          await fetch("/api/instances", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ id: instance.id, name: instance.name, model: instance.model, source: "web" }),
          });
        } catch {}
      }
    }

    // Check for slash command
    if (isSlashCommand(input)) {
      const parsed = parseCommand(input);
      if (parsed) {
        const command = findCommand(parsed.name);

        if (command?.type === "client") {
          // Handle client-side command
          const result = handleClientCommand(parsed, {
            setModel,
            clearMessages: () => {
              setInstances((prev) =>
                prev.map((inst) =>
                  inst.id === instanceId ? { ...inst, messages: [] } : inst
                )
              );
            },
            togglePlanMode: () => setPlanMode((p) => !p),
          });

          if (result.success && result.output) {
            // Show help output as message
            addMessage(instanceId, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: result.output,
              timestamp: new Date(),
            });
          }

          setInput("");
          return;
        }

        if (command?.type === "server") {
          // Add user message showing the command
          addMessage(instanceId, {
            id: crypto.randomUUID(),
            role: "user",
            content: input,
            timestamp: new Date(),
          });

          // Handle server-side command
          setLoading(true);
          const result = await handleServerCommand(input, instanceId);

          addMessage(instanceId, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: result.output || result.error || "Command completed",
            timestamp: new Date(),
          });

          setInput("");
          setLoading(false);
          return;
        }
      }
    }

    // Regular message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
      timestamp: new Date(),
    };

    setPendingImages([]);

    setInstances((prev) =>
      prev.map((inst) =>
        inst.id === instanceId
          ? {
              ...inst,
              name: inst.messages.length === 0 ? input.slice(0, 40) : inst.name,
              messages: [...inst.messages, userMessage],
            }
          : inst
      )
    );

    setInput("");
    setLoading(true);

    // Add empty assistant message
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    addMessage(instanceId, assistantMessage);

    // Check for /imagine
    const imagineMatch = input.match(/^\/imagine\s+(.+)$/i);
    if (imagineMatch) {
      await generateImage(imagineMatch[1].trim(), instanceId);
      setLoading(false);
      return;
    }

    try {
      // Build message history
      const inst = instances.find((i) => i.id === instanceId);
      const history = [...(inst?.messages || []), userMessage].map((m) => {
        if (m.images && m.images.length > 0) {
          const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
          if (m.content) contentParts.push({ type: "text", text: m.content });
          for (const img of m.images) {
            contentParts.push({ type: "image_url", image_url: { url: img.url } });
          }
          return { role: m.role, content: contentParts };
        }
        return { role: m.role, content: m.content };
      });

      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: history,
          stream: true,
          agentic: true,
          instance_id: instanceId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        updateLastMessage(instanceId, `Error: ${error.error || error.details || "Request failed"}`);
        setLoading(false);
        return;
      }

      // Stream response with agentic events
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let toolCalls: ToolCall[] = [];

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") {
            try {
              const data = JSON.parse(line.slice(6));

              // Handle agentic events
              if (data.agenticEvent) {
                const event = data.agenticEvent as AgenticEvent;

                switch (event.type) {
                  case "iteration":
                    setCurrentIteration({ current: event.current!, max: event.max! });
                    break;

                  case "tool_start":
                    // Add tool call in running state
                    if (!toolCalls.find((tc) => tc.id === event.toolCallId)) {
                      toolCalls.push({
                        id: event.toolCallId!,
                        name: event.tool!,
                        arguments: "",
                        status: "running",
                      });
                      updateLastMessage(instanceId, content, toolCalls);
                    }
                    break;

                  case "tool_result":
                  case "tool_error":
                    // Update tool call with result
                    updateToolCallResult(
                      instanceId,
                      event.toolCallId!,
                      event.result!,
                      event.type === "tool_result" ? "done" : "error"
                    );
                    break;

                  case "done":
                    setCurrentIteration(null);
                    break;

                  case "error":
                    content += `\n\n**Error:** ${event.error}`;
                    updateLastMessage(instanceId, content, toolCalls);
                    break;
                }
                continue;
              }

              // Handle regular streaming
              const delta = data.choices?.[0]?.delta;

              if (delta?.content) {
                content += delta.content;
                updateLastMessage(instanceId, content, toolCalls);
              }

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  if (tc.index !== undefined) {
                    if (!toolCalls[tc.index]) {
                      toolCalls[tc.index] = {
                        id: tc.id || `call_${tc.index}`,
                        name: "",
                        arguments: "",
                        status: "running",
                      };
                    }
                    if (tc.function?.name) toolCalls[tc.index].name = tc.function.name;
                    if (tc.function?.arguments) toolCalls[tc.index].arguments += tc.function.arguments;
                  }
                }
                updateLastMessage(instanceId, content, toolCalls);
              }

              // Track token usage
              if (data.usage) {
                setSessionTokens((prev) => ({
                  input: prev.input + (data.usage.prompt_tokens || 0),
                  output: prev.output + (data.usage.completion_tokens || 0),
                  cached: prev.cached + (data.usage.cached_tokens || 0),
                }));
              }
            } catch {}
          }
        }
      }
    } catch (error: any) {
      updateLastMessage(instanceId, `Error: ${error.message}`);
    } finally {
      setLoading(false);
      setCurrentIteration(null);
    }
  }

  async function generateImage(prompt: string, instanceId: string) {
    try {
      updateLastMessage(instanceId, "Generating image...");

      const res = await fetch("/api/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ prompt, size: "1024x1024", n: 1 }),
      });

      if (!res.ok) {
        const error = await res.json();
        updateLastMessage(instanceId, `Image generation failed: ${error.error || "Unknown error"}`);
        return false;
      }

      const data = await res.json();
      const provider = res.headers.get("X-Image-Provider") || "unknown";

      if (data.data && data.data.length > 0) {
        const generatedImages: MessageImage[] = data.data.map((img: any) => ({
          id: crypto.randomUUID(),
          url: img.url || `data:image/png;base64,${img.b64_json}`,
          type: "generated" as const,
        }));

        setInstances((prev) =>
          prev.map((inst) => {
            if (inst.id !== instanceId) return inst;
            const messages = [...inst.messages];
            const lastIdx = messages.length - 1;
            if (lastIdx >= 0 && messages[lastIdx].role === "assistant") {
              messages[lastIdx] = {
                ...messages[lastIdx],
                content: `Generated with ${provider}:`,
                images: generatedImages,
              };
            }
            return { ...inst, messages };
          })
        );
        return true;
      }

      updateLastMessage(instanceId, "No image was generated.");
      return false;
    } catch (error: any) {
      updateLastMessage(instanceId, `Image generation error: ${error.message}`);
      return false;
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Filter models by search
  const filteredModels = models.filter(
    (m) =>
      !modelSearch ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.description.toLowerCase().includes(modelSearch.toLowerCase())
  );

  const localModels = filteredModels.filter((m) => m.badge !== "api");
  const apiModels = filteredModels.filter((m) => m.badge === "api");

  // Settings modal
  if (showSettings) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-lg modal-content">
          <div className="flex items-center justify-between p-4 border-b border-terminal-border">
            <h2 className="font-semibold">Settings</h2>
            <button onClick={() => setShowSettings(false)} className="text-terminal-muted hover:text-terminal-text px-2">ESC</button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm text-terminal-muted mb-2">API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="rodeo-xxx-xxxx" className="input" />
            </div>
            <div>
              <label className="block text-sm text-terminal-muted mb-2">Default Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="input">
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-terminal-muted mb-2">Keyboard Shortcuts</label>
              <div className="bg-terminal-bg rounded p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>New Chat</span><kbd className="kbd">Cmd+N</kbd></div>
                <div className="flex justify-between"><span>Change Model</span><kbd className="kbd">Cmd+K</kbd></div>
                <div className="flex justify-between"><span>Toggle Sidebar</span><kbd className="kbd">Cmd+B</kbd></div>
                <div className="flex justify-between"><span>Undo Last Edit</span><kbd className="kbd">Cmd+Shift+Z</kbd></div>
                <div className="flex justify-between"><span>Settings</span><kbd className="kbd">Cmd+,</kbd></div>
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-terminal-border flex justify-between">
            <button onClick={() => { if (confirm("Clear all conversations?")) { setInstances([]); setActiveInstanceId(null); } }} className="text-sm text-terminal-red hover:underline">Clear All Data</button>
            <button onClick={() => setShowSettings(false)} className="btn btn-primary">Done</button>
          </div>
        </div>
      </div>
    );
  }

  // Model picker modal
  if (showModelPicker) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 modal-backdrop">
        <div className="bg-terminal-surface border border-terminal-border rounded-lg w-full max-w-xl modal-content">
          <div className="p-3 border-b border-terminal-border">
            <input
              type="text"
              placeholder="Search models..."
              className="input"
              value={modelSearch}
              onChange={(e) => { setModelSearch(e.target.value); setModelPickerIndex(0); }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Escape") { setShowModelPicker(false); setModelSearch(""); setModelPickerIndex(0); }
                else if (e.key === "ArrowDown") { e.preventDefault(); setModelPickerIndex((i) => Math.min(i + 1, filteredModels.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setModelPickerIndex((i) => Math.max(i - 1, 0)); }
                else if (e.key === "Enter" && filteredModels.length > 0) {
                  e.preventDefault();
                  const selected = filteredModels[modelPickerIndex];
                  if (selected) { setModel(selected.id); setModelSearch(""); setShowModelPicker(false); setModelPickerIndex(0); }
                }
              }}
            />
          </div>
          <div className="p-2 max-h-[60vh] overflow-y-auto">
            {localModels.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs font-semibold text-terminal-green uppercase">Local Models (FREE)</div>
                {localModels.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelPicker(false); }}
                    onMouseEnter={() => setModelPickerIndex(idx)}
                    className={`w-full text-left px-3 py-2 rounded ${modelPickerIndex === idx ? "bg-terminal-accent/20" : "hover:bg-terminal-bg"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${m.installed ? "bg-terminal-green" : "bg-terminal-muted/30"}`} />
                      <span className="font-medium">{m.name}</span>
                      {model === m.id && <span className="text-xs text-terminal-accent">✓</span>}
                    </div>
                    <p className="text-xs text-terminal-muted mt-0.5">{m.description}</p>
                  </button>
                ))}
              </>
            )}
            {apiModels.length > 0 && (
              <>
                <div className="px-3 py-2 mt-2 text-xs font-semibold text-terminal-accent uppercase border-t border-terminal-border pt-3">API Models (Paid)</div>
                {apiModels.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelPicker(false); }}
                    onMouseEnter={() => setModelPickerIndex(localModels.length + idx)}
                    className={`w-full text-left px-3 py-2 rounded ${modelPickerIndex === localModels.length + idx ? "bg-terminal-accent/20" : "hover:bg-terminal-bg"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      {model === m.id && <span className="text-xs text-terminal-accent">✓</span>}
                    </div>
                    <p className="text-xs text-terminal-muted mt-0.5">{m.description}</p>
                  </button>
                ))}
              </>
            )}
          </div>
          <div className="p-3 border-t border-terminal-border text-xs text-terminal-muted flex justify-between">
            <span>{models.length} models</span>
            <span>↑↓ Navigate · ↵ Select · ESC Close</span>
          </div>
        </div>
      </div>
    );
  }

  // Main UI
  return (
    <div className="h-screen flex flex-col bg-terminal-bg">
      {/* Header */}
      <header className="flex-none h-12 border-b border-terminal-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarCollapsed((p) => !p)} className="p-1 hover:bg-terminal-surface rounded text-terminal-muted">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <svg className="w-6 h-6 text-terminal-accent" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="6"/>
          </svg>
          <span className="font-semibold text-terminal-accent">Rodeo</span>

          {/* Plan mode indicator */}
          {planMode && (
            <span className="px-2 py-0.5 rounded text-xs bg-terminal-accent/20 text-terminal-accent font-medium">
              PLAN MODE
            </span>
          )}

          {/* Git status */}
          {sessionInfo?.git ? (
            <GitStatusBadge
              branch={sessionInfo.git.branch}
              hasChanges={sessionInfo.git.hasChanges}
              staged={sessionInfo.git.staged}
              unstaged={sessionInfo.git.unstaged}
              untracked={sessionInfo.git.untracked}
              onClick={() => setInput("/git")}
            />
          ) : (
            <NotGitRepoBadge />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Token counter */}
          {(sessionTokens.input > 0 || sessionTokens.output > 0) && (
            <div
              className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-terminal-surface border border-terminal-border"
              title={`Input: ${sessionTokens.input.toLocaleString()} | Output: ${sessionTokens.output.toLocaleString()}${sessionTokens.cached > 0 ? ` | Cached: ${sessionTokens.cached.toLocaleString()}` : ""}`}
            >
              <svg className="w-3 h-3 text-terminal-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span className="text-terminal-muted">
                {((sessionTokens.input + sessionTokens.output) / 1000).toFixed(1)}k
              </span>
            </div>
          )}

          {/* Iteration counter */}
          {currentIteration && (
            <span className="px-2 py-0.5 rounded text-xs bg-terminal-yellow/20 text-terminal-yellow">
              Step {currentIteration.current}/{currentIteration.max}
            </span>
          )}

          {/* Undo button */}
          {sessionInfo && sessionInfo.changeCount > 0 && (
            <button
              onClick={handleUndo}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm text-terminal-muted hover:text-terminal-accent hover:bg-terminal-surface"
              title="Undo last change (Cmd+Shift+Z)"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 10h14a4 4 0 1 1 0 8H9" /><polyline points="7 14 3 10 7 6" />
              </svg>
              <span className="text-xs">{sessionInfo.changeCount}</span>
            </button>
          )}

          {/* Status indicator */}
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${health?.llm === "ok" ? "bg-terminal-green" : "bg-terminal-red"}`} />
            <span className="text-xs text-terminal-muted hidden sm:inline">{health?.llm === "ok" ? "Connected" : "Disconnected"}</span>
          </div>

          {/* Figma toggle */}
          <button
            onClick={() => figmaToken ? setShowFigmaPanel(!showFigmaPanel) : setShowFigmaConnect(true)}
            className={`px-2 py-1 text-sm rounded hover:bg-terminal-surface flex items-center gap-1 ${showFigmaPanel ? "text-terminal-accent" : "text-terminal-muted"}`}
            title={figmaToken ? "Toggle Figma Panel" : "Connect Figma"}
          >
            <svg className="w-4 h-4" viewBox="0 0 38 57" fill="currentColor">
              <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
              <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" opacity="0.8" />
              <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" opacity="0.6" />
              <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" opacity="0.4" />
              <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" opacity="0.6" />
            </svg>
            {!figmaToken && <span className="text-xs">Figma</span>}
          </button>

          <button onClick={() => setShowModelPicker(true)} className="px-2 py-1 text-sm rounded hover:bg-terminal-surface text-terminal-muted">
            {models.find((m) => m.id === model)?.name || model}
          </button>
          <button onClick={() => setShowSettings(true)} className="px-2 py-1 text-sm rounded hover:bg-terminal-surface text-terminal-muted">Settings</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className={`${getSidebarWidth()} transition-all duration-200 border-r border-terminal-border flex flex-col overflow-hidden`}>
          {/* Sidebar Mode Tabs when Figma connected */}
          {figmaToken && (
            <div className="flex border-b border-terminal-border bg-terminal-surface/50">
              <button
                onClick={() => setShowFigmaPanel(false)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  !showFigmaPanel
                    ? "text-terminal-accent border-b-2 border-terminal-accent"
                    : "text-terminal-muted hover:text-terminal-text"
                }`}
              >
                💬 Chats
              </button>
              <button
                onClick={() => setShowFigmaPanel(true)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
                  showFigmaPanel
                    ? "text-terminal-purple border-b-2 border-terminal-purple"
                    : "text-terminal-muted hover:text-terminal-text"
                }`}
              >
                <svg className="w-3 h-3" viewBox="0 0 38 57" fill="currentColor">
                  <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
                </svg>
                Figma
              </button>
            </div>
          )}

          {/* Figma Panel Content */}
          {showFigmaPanel && figmaToken ? (
            <div className="flex-1 flex flex-col overflow-hidden bg-terminal-bg">
              {/* File Input - Beautiful card style */}
              {!figmaFileKey && (
                <div className="flex-1 flex flex-col p-4">
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-full max-w-[280px] space-y-4">
                      {/* Icon */}
                      <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7 text-white" viewBox="0 0 38 57" fill="currentColor">
                          <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
                          <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" opacity="0.8" />
                        </svg>
                      </div>

                      {/* Title */}
                      <div className="text-center">
                        <h3 className="text-base font-medium mb-1">Open a Figma File</h3>
                        <p className="text-xs text-terminal-muted">Paste a file URL to browse layers</p>
                      </div>

                      {/* Input */}
                      <div className="space-y-2">
                        <div className="relative">
                          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          <input
                            type="text"
                            value={figmaFileInput}
                            onChange={(e) => setFigmaFileInput(e.target.value)}
                            placeholder="https://figma.com/design/..."
                            className="w-full pl-10 pr-3 py-3 text-sm bg-terminal-surface border border-terminal-border rounded-xl focus:border-terminal-accent focus:outline-none focus:ring-2 focus:ring-terminal-accent/20 transition-all"
                            onKeyDown={(e) => e.key === "Enter" && loadFigmaFile()}
                          />
                        </div>
                        <button
                          onClick={loadFigmaFile}
                          disabled={!figmaFileInput.trim()}
                          className="w-full py-2.5 text-sm bg-gradient-to-r from-[#A259FF] to-[#1ABCFE] text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                          Open File
                        </button>
                      </div>

                      {/* Hint */}
                      <div className="text-center">
                        <p className="text-[10px] text-terminal-muted/60">
                          Copy URL from your browser's address bar
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Disconnect at bottom */}
                  <div className="pt-3 border-t border-terminal-border/50">
                    <button
                      onClick={() => {
                        setFigmaToken(null);
                        setFigmaFileKey(null);
                        setShowFigmaPanel(false);
                        localStorage.removeItem("rodeo-figma-token");
                      }}
                      className="w-full px-2 py-1.5 text-xs text-terminal-muted hover:text-terminal-red transition-colors flex items-center justify-center gap-1"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                      Disconnect Figma
                    </button>
                  </div>
                </div>
              )}

              {/* Mode Toggle: Layers / Assets */}
              {figmaFileKey && (
                <>
                  <div className="flex border-b border-terminal-border bg-terminal-surface">
                    <button
                      onClick={() => setFigmaMode("layers")}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        figmaMode === "layers"
                          ? "bg-terminal-accent/10 text-terminal-accent border-b-2 border-terminal-accent"
                          : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-bg/50"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 12h7v9h-7zM3 14h7v7H3z" />
                      </svg>
                      Layers
                    </button>
                    <button
                      onClick={() => setFigmaMode("assets")}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        figmaMode === "assets"
                          ? "bg-terminal-accent/10 text-terminal-accent border-b-2 border-terminal-accent"
                          : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-bg/50"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      Assets
                    </button>
                  </div>

                  {/* Figma Layer Panel */}
                  {figmaMode === "layers" ? (
                    <FigmaLayerPanel
                      figmaToken={figmaToken}
                      fileKey={figmaFileKey}
                      fileUrl={figmaFileInput}
                      onNodeSelect={(id, name, type) => {
                        // Node selected - styles will be fetched automatically
                      }}
                      onNodeStylesFetched={(styles, imageUrl) => {
                        setSelectedFigmaNode({ styles, imageUrl });
                      }}
                      onCloseFile={() => { setFigmaFileKey(null); setFigmaFileInput(""); }}
                      className="flex-1"
                    />
                  ) : (
                    <FigmaWorkspace
                      figmaToken={figmaToken}
                      onTokenRequest={() => setShowFigmaConnect(true)}
                      onCodeGenerated={(code, css) => {
                        // Insert generated code into chat
                        if (activeInstanceId) {
                          const codeMessage = `Generated from Figma:\n\n\`\`\`tsx\n${code}\n\`\`\`\n\n\`\`\`css\n${css}\n\`\`\``;
                          addMessage(activeInstanceId, {
                            id: crypto.randomUUID(),
                            role: "assistant",
                            content: codeMessage,
                            timestamp: new Date(),
                          });
                        }
                      }}
                      className="flex-1"
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            /* Normal Chat Sidebar */
            <>
              <div className="p-3 border-b border-terminal-border">
                <button onClick={createInstance} className="w-full btn btn-primary text-sm flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {instances.length === 0 ? (
                  <div className="p-4 text-center text-terminal-muted text-sm">
                    <p>No conversations</p>
                    <p className="text-xs mt-1">Cmd+N to start</p>
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {instances.map((inst) => (
                      <div
                        key={inst.id}
                        className={`group flex rounded transition-all ${activeInstanceId === inst.id ? "bg-terminal-accent/20 border-l-2 border-terminal-accent" : "hover:bg-terminal-surface border-l-2 border-transparent"}`}
                      >
                        <button onClick={() => setActiveInstanceId(inst.id)} className="flex-1 text-left px-3 py-2 text-sm truncate">
                          <span className={activeInstanceId === inst.id ? "text-terminal-accent" : "text-terminal-muted"}>{inst.name}</span>
                        </button>
                        <button onClick={() => deleteInstance(inst.id)} className="px-2 opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-red">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-terminal-border">
                <div className="flex items-center justify-between mb-3">
                  <a href="/dashboard" className="text-xs text-terminal-muted hover:text-terminal-accent transition-colors">Dashboard</a>
                  {!figmaToken && (
                    <button
                      onClick={() => setShowFigmaConnect(true)}
                      className="text-xs text-terminal-purple hover:text-terminal-accent transition-colors flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 38 57" fill="currentColor">
                        <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
                      </svg>
                      Connect Figma
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <a href="https://github.com/anthropics/rodeo" target="_blank" rel="noopener noreferrer" className="text-terminal-muted hover:text-terminal-accent transition-colors" title="GitHub">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  </a>
                  <a href="https://twitter.com/rodeo_ai" target="_blank" rel="noopener noreferrer" className="text-terminal-muted hover:text-terminal-accent transition-colors" title="Twitter/X">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                  <a href="https://discord.gg/rodeo" target="_blank" rel="noopener noreferrer" className="text-terminal-muted hover:text-terminal-accent transition-colors" title="Discord">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
                  </a>
                  <span className="text-terminal-muted text-xs ml-auto">v1.0</span>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {!activeInstance ? (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-center max-w-lg">
                  <svg className="w-16 h-16 text-terminal-accent mx-auto mb-6" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" opacity="0.2"/><circle cx="12" cy="12" r="6"/>
                  </svg>
                  <h1 className="text-3xl font-bold text-terminal-accent mb-3">Rodeo</h1>
                  <p className="text-terminal-muted mb-6">AI assistant with code editing powers</p>
                  {!apiKey ? (
                    <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
                      <input type="password" placeholder="Enter API key" className="input mb-2" onChange={(e) => setApiKey(e.target.value)} />
                      <p className="text-xs text-terminal-muted">Get your key from Settings</p>
                    </div>
                  ) : (
                    <button onClick={createInstance} className="btn btn-primary px-6 py-2">Start New Chat</button>
                  )}
                </div>
              </div>
            ) : activeInstance.messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-4">
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-semibold mb-4">How can I help?</h2>
                  <p className="text-terminal-muted mb-6">Try commands like /help, /git, or /explore</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ icon: "💻", text: "Help me code" }, { icon: "🔍", text: "/explore" }, { icon: "📝", text: "/memory" }, { icon: "⎇", text: "/git" }].map((s, i) => (
                      <button key={i} onClick={() => setInput(s.text)} className="flex items-center gap-2 px-3 py-2 rounded bg-terminal-surface border border-terminal-border hover:border-terminal-accent text-sm text-left">
                        <span>{s.icon}</span><span className="text-terminal-muted">{s.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto p-4 space-y-6">
                {activeInstance.messages.map((msg) => (
                  <div key={msg.id} className="animate-fadeIn">
                    {msg.role === "user" ? (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-terminal-accent/20 flex items-center justify-center text-terminal-accent text-sm font-medium shrink-0">U</div>
                        <div className="flex-1 pt-1">
                          <div className="bg-terminal-accent/10 rounded-lg px-4 py-2 inline-block max-w-full">
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {msg.images.map((img) => (
                                <img key={img.id} src={img.url} alt="" className="max-w-xs max-h-48 rounded border border-terminal-border cursor-pointer" onClick={() => window.open(img.url, "_blank")} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className={`w-8 h-8 rounded-full bg-terminal-accent/20 flex items-center justify-center text-terminal-accent text-sm font-bold shrink-0 ${loading && msg === activeInstance.messages[activeInstance.messages.length - 1] ? "animate-pulse" : ""}`}>R</div>
                        <div className="flex-1 pt-1 min-w-0">
                          {/* Tool Calls */}
                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div className="mb-3 space-y-2">
                              {msg.toolCalls.map((tc) => (
                                <ToolResult
                                  key={tc.id}
                                  tool={tc.name}
                                  status={tc.status}
                                  result={tc.result}
                                  arguments={tc.arguments}
                                />
                              ))}
                            </div>
                          )}
                          {/* Content */}
                          <div className="prose-terminal">
                            <MarkdownMessage content={msg.content} />
                            {loading && msg === activeInstance.messages[activeInstance.messages.length - 1] && !msg.content && (
                              <div className="flex items-center gap-2 py-2">
                                <div className="flex gap-1">
                                  <span className="w-2 h-2 rounded-full bg-terminal-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <span className="w-2 h-2 rounded-full bg-terminal-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <span className="w-2 h-2 rounded-full bg-terminal-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span className="text-xs text-terminal-muted">
                                  {currentIteration ? `Step ${currentIteration.current}...` : "Thinking..."}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Generated images */}
                          {msg.images && msg.images.length > 0 && (
                            <div className="flex flex-wrap gap-3 mt-3">
                              {msg.images.map((img) => (
                                <img key={img.id} src={img.url} alt="Generated" className="max-w-sm max-h-64 rounded-lg shadow-lg cursor-pointer" onClick={() => window.open(img.url, "_blank")} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex-none border-t border-terminal-border p-4">
            <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
              {/* Pending images */}
              {pendingImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingImages.map((img) => (
                    <div key={img.id} className="relative group">
                      <img src={img.url} alt="" className="w-16 h-16 object-cover rounded border border-terminal-border" />
                      <button type="button" onClick={() => removePendingImage(img.id)} className="absolute -top-1 -right-1 w-4 h-4 bg-terminal-red text-white rounded-full text-xs opacity-0 group-hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="relative flex gap-2">
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />

                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || !apiKey} className="flex-none px-3 py-2 rounded bg-terminal-surface border border-terminal-border text-terminal-muted hover:text-terminal-accent disabled:opacity-40">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                </button>

                <div className="relative flex-1">
                  {/* Slash command menu */}
                  <SlashCommandMenu
                    input={input}
                    cursorPosition={cursorPosition}
                    visible={showCommandMenu}
                    onSelect={(cmd) => { setInput(cmd); setShowCommandMenu(false); inputRef.current?.focus(); }}
                    onClose={() => setShowCommandMenu(false)}
                  />

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setCursorPosition(e.target.selectionStart); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !showCommandMenu) { e.preventDefault(); sendMessage(e); }
                    }}
                    placeholder={!apiKey ? "Enter API key in settings..." : loading ? "Working..." : "Message or type / for commands..."}
                    className="input resize-none pr-16"
                    rows={1}
                    disabled={loading || !apiKey}
                    style={{ minHeight: "44px" }}
                  />

                  <button
                    type="submit"
                    disabled={loading || !apiKey || (!input.trim() && pendingImages.length === 0)}
                    className="absolute right-2 bottom-2 px-3 py-1.5 rounded text-sm bg-terminal-accent text-terminal-bg disabled:opacity-40"
                  >
                    {loading ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg> : "Send"}
                  </button>
                </div>
              </div>

              <div className="flex justify-between text-xs text-terminal-muted mt-2">
                <span>{activeInstance ? `${activeInstance.messages.length} messages` : "No active chat"}</span>
                <span>/ for commands · Shift+Enter for newline</span>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* Figma Connect Modal */}
      <FigmaConnectModal
        isOpen={showFigmaConnect}
        onClose={() => setShowFigmaConnect(false)}
        onConnect={(token) => {
          setFigmaToken(token);
          localStorage.setItem("rodeo-figma-token", token);
          setShowFigmaPanel(true);
        }}
      />
    </div>
  );
}
