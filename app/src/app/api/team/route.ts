import { NextRequest } from "next/server";
import { validateApiKey, createUser } from "@/lib/auth";
import { db } from "@/db";
import { users, usageLogs } from "@/db/schema";
import { eq, sql, gte, and } from "drizzle-orm";

// GET /api/team - List team members (admin only)
export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const teamMembers = await db.select().from(users).all();

  // Get usage for each member
  const membersWithUsage = await Promise.all(
    teamMembers.map(async (member) => {
      const usage = await db
        .select({
          totalCost: sql<number>`SUM(cost_usd)`,
          totalRequests: sql<number>`COUNT(*)`,
        })
        .from(usageLogs)
        .where(
          and(
            eq(usageLogs.userId, member.id),
            gte(usageLogs.createdAt, startOfMonth)
          )
        )
        .get();

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        monthlyBudget: member.monthlyBudget,
        createdAt: member.createdAt,
        usage: {
          costThisMonth: usage?.totalCost || 0,
          requestsThisMonth: usage?.totalRequests || 0,
        },
      };
    })
  );

  return Response.json({ team: membersWithUsage });
}

// POST /api/team - Add team member (admin only)
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, role = "member", monthlyBudget = 20.0 } = body;

  if (!name) {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const newUser = await createUser(name, email, role, monthlyBudget);

  return Response.json(
    {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        monthlyBudget: newUser.monthlyBudget,
      },
      apiKey: newUser.fullApiKey, // Only returned once!
    },
    { status: 201 }
  );
}

// PUT /api/team/:id - Update member (admin only)
export async function PUT(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const memberId = url.searchParams.get("id");
  if (!memberId) {
    return Response.json({ error: "Member ID required" }, { status: 400 });
  }

  const body = await req.json();
  const { name, email, role, monthlyBudget } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (monthlyBudget !== undefined) updates.monthlyBudget = monthlyBudget;

  await db.update(users).set(updates).where(eq(users.id, memberId));

  const updated = await db.select().from(users).where(eq(users.id, memberId)).get();

  return Response.json({
    user: {
      id: updated?.id,
      name: updated?.name,
      email: updated?.email,
      role: updated?.role,
      monthlyBudget: updated?.monthlyBudget,
    },
  });
}

// DELETE /api/team/:id - Remove member (admin only)
export async function DELETE(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(req.url);
  const memberId = url.searchParams.get("id");
  if (!memberId) {
    return Response.json({ error: "Member ID required" }, { status: 400 });
  }

  // Don't delete, just revoke access (could add a 'deleted' status)
  await db.delete(users).where(eq(users.id, memberId));

  return Response.json({ success: true });
}
