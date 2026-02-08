import { NextRequest } from "next/server";
import { validateApiKey, checkBudget } from "@/lib/auth";
import { db } from "@/db";
import { usageLogs } from "@/db/schema";
import { eq, gte, and, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
  const user = await validateApiKey(apiKey);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const budget = await checkBudget(user.id);

  // Get daily breakdown for current month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const dailyUsage = await db
    .select({
      date: sql<string>`date(created_at / 1000, 'unixepoch')`,
      inputTokens: sql<number>`SUM(input_tokens)`,
      outputTokens: sql<number>`SUM(output_tokens)`,
      cachedTokens: sql<number>`SUM(cached_tokens)`,
      costUsd: sql<number>`SUM(cost_usd)`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, user.id),
        gte(usageLogs.createdAt, startOfMonth)
      )
    )
    .groupBy(sql`date(created_at / 1000, 'unixepoch')`)
    .all();

  // Get model breakdown
  const modelUsage = await db
    .select({
      model: usageLogs.model,
      inputTokens: sql<number>`SUM(input_tokens)`,
      outputTokens: sql<number>`SUM(output_tokens)`,
      costUsd: sql<number>`SUM(cost_usd)`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(usageLogs)
    .where(
      and(
        eq(usageLogs.userId, user.id),
        gte(usageLogs.createdAt, startOfMonth)
      )
    )
    .groupBy(usageLogs.model)
    .all();

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
    },
    budget,
    daily: dailyUsage,
    byModel: modelUsage,
  });
}
