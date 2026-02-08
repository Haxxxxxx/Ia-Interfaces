import { db } from "@/db";
import { users, usageLogs } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { calculateCost } from "./moonshot-client";

export async function validateApiKey(apiKey: string | null | undefined) {
  if (!apiKey) return null;

  // Find user by API key prefix (first 8 chars for lookup)
  const prefix = apiKey.slice(0, 8);
  const allUsers = await db.select().from(users).all();

  for (const user of allUsers) {
    if (await bcrypt.compare(apiKey, user.apiKeyHash)) {
      return user;
    }
  }

  return null;
}

export async function generateApiKey(name: string): Promise<{ key: string; hash: string }> {
  const key = `sadary-${name.toLowerCase().replace(/\s/g, "-")}-${uuidv4().slice(0, 12)}`;
  const hash = await bcrypt.hash(key, 10);
  return { key, hash };
}

export async function checkBudget(userId: string) {
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { exceeded: true, used: 0, limit: 0 };

  // Get current month usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usage = await db
    .select({
      total: sql<number>`SUM(cost_usd)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, userId),
        gte(usageLogs.createdAt, startOfMonth)
      )
    )
    .get();

  const used = usage?.total || 0;
  const limit = user.monthlyBudget || 20;

  return {
    exceeded: used >= limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentUsed: Math.round((used / limit) * 100),
  };
}

export async function logUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  instanceId?: string
) {
  const costUsd = calculateCost(model, inputTokens, outputTokens, cachedTokens);

  await db.insert(usageLogs).values({
    id: uuidv4(),
    userId,
    instanceId,
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    costUsd,
    createdAt: new Date(),
  });

  return costUsd;
}

export async function createUser(
  name: string,
  email?: string,
  role: "admin" | "member" = "member",
  monthlyBudget: number = 20.0
) {
  const { key, hash } = await generateApiKey(name);

  const user = {
    id: uuidv4(),
    name,
    email: email || null,
    role,
    apiKey: key.slice(0, 20) + "...", // Store truncated for display
    apiKeyHash: hash,
    monthlyBudget,
    createdAt: new Date(),
  };

  await db.insert(users).values(user);

  return { ...user, fullApiKey: key };
}
