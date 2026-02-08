"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  monthlyBudget: number;
  usage: {
    costThisMonth: number;
    requestsThisMonth: number;
  };
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", email: "", budget: 20 });
  const [newApiKey, setNewApiKey] = useState("");

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    const apiKey = localStorage.getItem("sadary-api-key");
    if (!apiKey) {
      window.location.href = "/dashboard";
      return;
    }

    try {
      const res = await fetch("/api/team", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.status === 403) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setTeam(data.team || []);
      setIsAdmin(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const apiKey = localStorage.getItem("sadary-api-key");
    if (!apiKey) return;

    const res = await fetch("/api/team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: newMember.name,
        email: newMember.email,
        monthlyBudget: newMember.budget,
      }),
    });

    const data = await res.json();
    if (data.apiKey) {
      setNewApiKey(data.apiKey);
    }

    setNewMember({ name: "", email: "", budget: 20 });
    fetchTeam();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-terminal-muted">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-terminal-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <div className="text-terminal-muted">Admin access required</div>
          <Link href="/dashboard" className="text-terminal-accent hover:underline mt-4 block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
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
          <Link href="/dashboard" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Overview
          </Link>
          <Link href="/dashboard/instances" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Instances
          </Link>
          <Link href="/dashboard/usage" className="py-3 border-b-2 border-transparent text-terminal-muted hover:text-terminal-text">
            Usage
          </Link>
          <Link href="/dashboard/team" className="py-3 border-b-2 border-terminal-accent text-terminal-accent">
            Team
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="p-6">
        <div className="max-w-4xl mx-auto">
          {/* Add Member Button */}
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Team Members</h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2 bg-terminal-accent text-terminal-bg rounded font-medium hover:bg-opacity-80"
            >
              + Add Member
            </button>
          </div>

          {/* New API Key Alert */}
          {newApiKey && (
            <div className="bg-terminal-green/10 border border-terminal-green rounded-lg p-4 mb-6">
              <div className="font-medium text-terminal-green mb-2">
                New API Key (save this, shown only once):
              </div>
              <code className="block bg-terminal-bg p-3 rounded text-sm break-all">
                {newApiKey}
              </code>
              <button
                onClick={() => setNewApiKey("")}
                className="mt-3 text-sm text-terminal-muted hover:text-terminal-text"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Add Member Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddMember}
              className="bg-terminal-surface border border-terminal-border rounded-lg p-4 mb-6 space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-terminal-muted mb-1">Name</label>
                  <input
                    type="text"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-terminal-muted mb-1">Email</label>
                  <input
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-terminal-muted mb-1">
                  Monthly Budget ($)
                </label>
                <input
                  type="number"
                  value={newMember.budget}
                  onChange={(e) => setNewMember({ ...newMember, budget: Number(e.target.value) })}
                  className="w-32 px-3 py-2 bg-terminal-bg border border-terminal-border rounded"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-terminal-accent text-terminal-bg rounded"
                >
                  Add Member
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-terminal-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Team List */}
          <div className="space-y-3">
            {team.map((member) => (
              <div
                key={member.id}
                className="bg-terminal-surface border border-terminal-border rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{member.name}</span>
                    {member.role === "admin" && (
                      <span className="text-xs px-2 py-0.5 bg-terminal-purple/20 text-terminal-purple rounded">
                        admin
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-terminal-muted mt-1">
                    {member.email || "No email"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-terminal-accent">
                    ${member.usage.costThisMonth.toFixed(2)} / ${member.monthlyBudget}
                  </div>
                  <div className="text-sm text-terminal-muted">
                    {member.usage.requestsThisMonth} requests this month
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
