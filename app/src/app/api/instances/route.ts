import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import {
  getInstancesByUserId,
  getInstanceById,
  createInstance,
  updateInstance,
  // deleteInstance - not used, instances are archived not deleted
} from "@/lib/db-provider";
import { v4 as uuidv4 } from "uuid";

// GET /api/instances - List user's instances
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userInstances = await getInstancesByUserId(user.id);
  // Filter to active only
  const activeInstances = userInstances.filter((i) => i.status === "active");

  return Response.json({ instances: activeInstances });
}

// POST /api/instances - Create instance
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, model = "qwen2.5:7b", source = "web", systemPrompt, thinking = true } = body;

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const now = new Date();
  const instance = {
    id: body.id || uuidv4(),
    userId: user.id,
    name,
    model,
    source: source === "cli" ? "cli" : "web",
    systemPrompt: systemPrompt || null,
    thinking,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await createInstance(instance);

  return Response.json({ instance }, { status: 201 });
}

// PUT /api/instances/:id - Update instance (via query param)
export async function PUT(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("id");
  if (!instanceId) {
    return Response.json({ error: "Instance ID required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await getInstanceById(instanceId);
  if (!existing || existing.userId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, model, source, systemPrompt, thinking, status } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (model !== undefined) updates.model = model;
  if (source !== undefined) updates.source = source === "cli" ? "cli" : "web";
  if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
  if (thinking !== undefined) updates.thinking = thinking;
  if (status !== undefined) updates.status = status;

  await updateInstance(instanceId, updates);
  const updated = await getInstanceById(instanceId);

  return Response.json({ instance: updated });
}

// DELETE /api/instances/:id - Archive instance
export async function DELETE(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const instanceId = url.searchParams.get("id");
  if (!instanceId) {
    return Response.json({ error: "Instance ID required" }, { status: 400 });
  }

  // Verify ownership
  const existing = await getInstanceById(instanceId);
  if (!existing || existing.userId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await updateInstance(instanceId, { status: "archived" });

  return Response.json({ success: true });
}
