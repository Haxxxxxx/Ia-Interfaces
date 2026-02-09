/**
 * Messages API - Sync conversation history between CLI and webapp
 *
 * GET /api/instances/:id/messages - Fetch messages for an instance
 * POST /api/instances/:id/messages - Add a message (from CLI sync)
 * DELETE /api/instances/:id/messages - Clear messages for an instance
 */

import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/auth";
import { getInstanceById } from "@/lib/db-provider";
import {
  createMessage,
  getMessagesByInstanceId,
  getRecentMessages,
  deleteMessagesByInstanceId,
} from "@/lib/db-provider";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/instances/:id/messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = params.id;
  const instance = await getInstanceById(instanceId);

  if (!instance) {
    return Response.json({ error: "Instance not found" }, { status: 404 });
  }

  // Check ownership (null userId means public/legacy instance)
  if (instance.userId && instance.userId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get limit from query params
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam) : undefined;

  try {
    const messages = limit
      ? await getRecentMessages(instanceId, limit)
      : await getMessagesByInstanceId(instanceId);

    return Response.json({
      instanceId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        reasoningContent: m.reasoningContent,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
        toolCallId: m.toolCallId,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cachedTokens: m.cachedTokens,
        createdAt: m.createdAt.toISOString(),
      })),
      count: messages.length,
    });
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    return Response.json(
      { error: "Failed to fetch messages", details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/instances/:id/messages
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = params.id;
  const instance = await getInstanceById(instanceId);

  if (!instance) {
    return Response.json({ error: "Instance not found" }, { status: 404 });
  }

  if (instance.userId && instance.userId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Support single message or batch
    const messagesToCreate = Array.isArray(body.messages)
      ? body.messages
      : body.message
      ? [body.message]
      : [body];

    const createdMessages = [];

    for (const msg of messagesToCreate) {
      const message = {
        id: msg.id || uuidv4(),
        instanceId,
        role: msg.role,
        content: msg.content || null,
        reasoningContent: msg.reasoningContent || null,
        toolCalls: msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        toolCallId: msg.toolCallId || null,
        inputTokens: msg.inputTokens || 0,
        outputTokens: msg.outputTokens || 0,
        cachedTokens: msg.cachedTokens || 0,
        createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
      };

      await createMessage(message);
      createdMessages.push(message.id);
    }

    return Response.json({
      success: true,
      created: createdMessages.length,
      messageIds: createdMessages,
    });
  } catch (error: any) {
    console.error("Error creating message:", error);
    return Response.json(
      { error: "Failed to create message", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/instances/:id/messages
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = params.id;
  const instance = await getInstanceById(instanceId);

  if (!instance) {
    return Response.json({ error: "Instance not found" }, { status: 404 });
  }

  if (instance.userId && instance.userId !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await deleteMessagesByInstanceId(instanceId);
    return Response.json({ success: true, cleared: true });
  } catch (error: any) {
    console.error("Error deleting messages:", error);
    return Response.json(
      { error: "Failed to delete messages", details: error.message },
      { status: 500 }
    );
  }
}
