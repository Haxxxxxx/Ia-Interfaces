"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Instance {
  id: string;
  name: string;
  model: string;
  source?: string;
  thinking: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
  badge: string;
  badgeColor: string;
  vram?: string;
  speed?: string;
  context_window?: number;
  capabilities?: string[];
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("qwen2.5:7b");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchInstances();
    fetchModels();
  }, []);

  async function fetchInstances() {
    const apiKey = localStorage.getItem("rodeo-api-key");
    if (!apiKey) {
      window.location.href = "/dashboard";
      return;
    }

    try {
      const res = await fetch("/api/instances", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await res.json();
      setInstances(data.instances || []);
    } finally {
      setLoading(false);
    }
  }

  async function fetchModels() {
    try {
      const res = await fetch("/api/models");
      if (res.ok) {
        const data = await res.json();
        setModels(data.data || []);
        // Set default to recommended model
        if (data.recommended) {
          setNewModel(data.recommended);
        }
      }
    } catch {}
  }

  function getModelInfo(modelId: string): ModelInfo | undefined {
    return models.find((m) => m.id === modelId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const apiKey = localStorage.getItem("rodeo-api-key");
    if (!apiKey) return;

    setCreating(true);
    try {
      await fetch("/api/instances", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ name: newName, model: newModel }),
      });
      setNewName("");
      fetchInstances();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const apiKey = localStorage.getItem("rodeo-api-key");
    if (!apiKey) return;

    await fetch(`/api/instances?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    fetchInstances();
  }

  return (
    <div className="min-h-screen bg-terminal-bg">
      {/* Header */}
      <header className="border-b border-terminal-border px-6 py-4">
        <div className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 hover-lift">
            <svg className="w-6 h-6 text-terminal-accent" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" opacity="0.3"/>
              <circle cx="12" cy="12" r="6"/>
            </svg>
            <span className="text-xl font-semibold text-terminal-accent">Rodeo</span>
          </a>
          <Link
            href="/"
            className="px-3 py-1.5 bg-terminal-accent text-terminal-bg rounded text-sm font-medium hover:bg-opacity-80 transition-colors"
          >
            Open Chat
          </Link>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-terminal-border px-6">
        <div className="flex gap-6">
          <Link
            href="/dashboard"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/instances"
            className="py-3 border-b-2 border-terminal-accent text-terminal-accent"
          >
            Instances
          </Link>
          <Link
            href="/dashboard/usage"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Usage
          </Link>
          <Link
            href="/dashboard/team"
            className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text"
          >
            Team
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          {/* Create Instance */}
          <form
            onSubmit={handleCreate}
            className="bg-terminal-surface border border-terminal-border rounded-lg p-4 mb-6 space-y-4"
          >
            <div className="flex gap-4">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New instance name..."
                className="flex-1 px-4 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="px-6 py-2 bg-terminal-accent text-terminal-bg rounded font-medium hover:bg-opacity-80 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>

            {/* Model Selector */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-xs text-terminal-muted mb-1">Model</label>
                <select
                  value={newModel}
                  onChange={(e) => setNewModel(e.target.value)}
                  className="w-full px-4 py-2 bg-terminal-bg border border-terminal-border rounded text-terminal-text"
                >
                  <optgroup label="Local Models (FREE)">
                    {models.filter((m) => m.badge !== "api").map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.vram ? `(${m.vram})` : ""}
                      </option>
                    ))}
                  </optgroup>
                  {models.some((m) => m.badge === "api") && (
                    <optgroup label="API Models (paid)">
                      {models.filter((m) => m.badge === "api").map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Selected Model Details */}
              {newModel && getModelInfo(newModel) && (
                <div className="flex-1 px-3 py-2 bg-terminal-bg rounded border border-terminal-border text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-terminal-text">{getModelInfo(newModel)?.name}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        getModelInfo(newModel)?.badgeColor === "green"
                          ? "bg-terminal-green/20 text-terminal-green"
                          : getModelInfo(newModel)?.badgeColor === "yellow"
                          ? "bg-terminal-yellow/20 text-terminal-yellow"
                          : "bg-terminal-purple/20 text-terminal-purple"
                      }`}
                    >
                      {getModelInfo(newModel)?.badge}
                    </span>
                  </div>
                  <p className="text-terminal-muted">{getModelInfo(newModel)?.description}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-terminal-muted">
                    {getModelInfo(newModel)?.vram && (
                      <span>⬛ {getModelInfo(newModel)?.vram}</span>
                    )}
                    {getModelInfo(newModel)?.speed && (
                      <span>⚡ {getModelInfo(newModel)?.speed}</span>
                    )}
                    {getModelInfo(newModel)?.context_window && (
                      <span>📄 {Math.round((getModelInfo(newModel)?.context_window || 0) / 1000)}k</span>
                    )}
                  </div>
                  {getModelInfo(newModel)?.capabilities && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {getModelInfo(newModel)?.capabilities?.map((cap) => (
                        <span key={cap} className="px-1 py-0.5 bg-terminal-surface rounded text-terminal-muted">
                          {cap}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>

          {/* Instances List */}
          {loading ? (
            <div className="text-center py-8 text-terminal-muted">
              <div className="inline-flex gap-1">
                <span className="w-2 h-2 rounded-full bg-terminal-accent typing-dot" />
                <span className="w-2 h-2 rounded-full bg-terminal-accent typing-dot" />
                <span className="w-2 h-2 rounded-full bg-terminal-accent typing-dot" />
              </div>
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8 text-terminal-muted animate-fadeIn">
              No instances yet. Create one above.
            </div>
          ) : (
            <div className="space-y-3 stagger-children">
              {instances.map((instance) => {
                const modelInfo = getModelInfo(instance.model);
                return (
                  <div
                    key={instance.id}
                    className="bg-terminal-surface border border-terminal-border rounded-lg p-4 flex items-start justify-between card-hover hover-lift"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{instance.name}</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            instance.source === "cli"
                              ? "bg-terminal-green/20 text-terminal-green"
                              : "bg-terminal-accent/20 text-terminal-accent"
                          }`}
                        >
                          {instance.source === "cli" ? "CLI" : "Web"}
                        </span>
                        {instance.thinking && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-terminal-purple/20 text-terminal-purple">
                            thinking
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs text-terminal-muted">Model:</span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            modelInfo?.badgeColor === "green"
                              ? "bg-terminal-green/20 text-terminal-green"
                              : modelInfo?.badgeColor === "yellow"
                              ? "bg-terminal-yellow/20 text-terminal-yellow"
                              : "bg-terminal-purple/20 text-terminal-purple"
                          }`}
                        >
                          {modelInfo?.name || instance.model}
                        </span>
                        {modelInfo?.vram && (
                          <span className="text-xs text-terminal-muted">⬛ {modelInfo.vram}</span>
                        )}
                        {modelInfo?.context_window && (
                          <span className="text-xs text-terminal-muted">📄 {Math.round(modelInfo.context_window / 1000)}k</span>
                        )}
                      </div>
                      <div className="text-xs text-terminal-muted mt-1">
                        Updated {new Date(instance.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(instance.id)}
                      className="text-terminal-muted hover:text-terminal-red transition-colors ml-4"
                    >
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
