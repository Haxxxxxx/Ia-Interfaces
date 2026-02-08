"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Instance {
  id: string;
  name: string;
  model: string;
  thinking: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchInstances();
  }, []);

  async function fetchInstances() {
    const apiKey = localStorage.getItem("sadary-api-key");
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const apiKey = localStorage.getItem("sadary-api-key");
    if (!apiKey) return;

    setCreating(true);
    try {
      await fetch("/api/instances", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ name: newName }),
      });
      setNewName("");
      fetchInstances();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    const apiKey = localStorage.getItem("sadary-api-key");
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
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <h1 className="text-xl font-semibold">Sadary Hub</h1>
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
            className="bg-terminal-surface border border-terminal-border rounded-lg p-4 mb-6 flex gap-4"
          >
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
          </form>

          {/* Instances List */}
          {loading ? (
            <div className="text-center py-8 text-terminal-muted">Loading...</div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8 text-terminal-muted">
              No instances yet. Create one above.
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance) => (
                <div
                  key={instance.id}
                  className="bg-terminal-surface border border-terminal-border rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{instance.name}</div>
                    <div className="text-sm text-terminal-muted flex items-center gap-3 mt-1">
                      <span>{instance.model}</span>
                      {instance.thinking && (
                        <span className="text-terminal-purple">thinking</span>
                      )}
                      <span>
                        {new Date(instance.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(instance.id)}
                    className="text-terminal-muted hover:text-terminal-red transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
