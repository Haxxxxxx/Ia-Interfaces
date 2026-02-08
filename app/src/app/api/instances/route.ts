import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { db } from "@/db";
import { instances } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// GET /api/instances - List user's instances
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userInstances = await db
    .select()
    .from(instances)
    .where(and(eq(instances.userId, user.id), eq(instances.status, "active")))
    .orderBy(desc(instances.updatedAt))
    .all();

  return Response.json({ instances: userInstances });
}

// POST /api/instances - Create instance
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, model = "kimi-k2.5", systemPrompt, thinking = true } = body;

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const now = new Date();
  const instance = {
    id: uuidv4(),
    userId: user.id,
    name,
    model,
    systemPrompt: systemPrompt || null,
    thinking,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(instances).values(instance);

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

  const body = await req.json();
  const { name, model, systemPrompt, thinking, status } = body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (model !== undefined) updates.model = model;
  if (systemPrompt !== undefined) updates.systemPrompt = systemPrompt;
  if (thinking !== undefined) updates.thinking = thinking;
  if (status !== undefined) updates.status = status;

  await db
    .update(instances)
    .set(updates)
    .where(and(eq(instances.id, instanceId), eq(instances.userId, user.id)));

  const updated = await db
    .select()
    .from(instances)
    .where(eq(instances.id, instanceId))
    .get();

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

  await db
    .update(instances)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(instances.id, instanceId), eq(instances.userId, user.id)));

  return Response.json({ success: true });
}
