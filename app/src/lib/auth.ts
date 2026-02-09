import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { calculateModelCost } from "./models";
import {
  getAllUsers,
  getUserById,
  getUserByEmail,
  createUser as dbCreateUser,
  createUsageLog,
  getTotalUsage,
} from "./db-provider";
import type { User } from "@/db/schema";

// Cache API key → user to avoid O(n) bcrypt scan on every request
// TTL 5 min; concurrent requests with same key hit cache
const API_KEY_CACHE = new Map<string, { user: User; expires: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Dev mode bypass - creates a fake dev user for local testing
const DEV_USER: User = {
  id: "dev-user-local",
  name: "Dev User",
  email: "dev@localhost",
  role: "admin",
  apiKey: "dev-key-local",
  apiKeyHash: "",
  monthlyBudget: 1000,
  createdAt: new Date(),
};

export async function validateApiKey(apiKey: string | null | undefined) {
  // DEV MODE: Skip auth in development when no key provided or "dev" key used
  if (process.env.NODE_ENV === "development") {
    if (!apiKey || apiKey === "dev" || apiKey === "development") {
      return DEV_USER;
    }
  }

  if (!apiKey) return null;

  const now = Date.now();
  const cached = API_KEY_CACHE.get(apiKey);
  if (cached && cached.expires > now) {
    return cached.user;
  }

  const allUsers = await getAllUsers();

  for (const user of allUsers) {
    // Skip users without apiKeyHash (e.g., users from other apps in shared Firestore)
    if (!user.apiKeyHash) continue;

    if (await bcrypt.compare(apiKey, user.apiKeyHash)) {
      API_KEY_CACHE.set(apiKey, { user, expires: now + CACHE_TTL_MS });
      return user;
    }
  }

  return null;
}

export async function findUserByEmail(email: string) {
  return getUserByEmail(email);
}

export async function findUserById(id: string) {
  return getUserById(id);
}

export async function generateApiKey(name: string): Promise<{ key: string; hash: string }> {
  const key = `rodeo-${name.toLowerCase().replace(/\s/g, "-")}-${uuidv4().slice(0, 12)}`;
  const hash = await bcrypt.hash(key, 10);
  return { key, hash };
}

export async function checkBudget(userId: string) {
  // Dev user has unlimited budget
  if (userId === "dev-user-local") {
    return { exceeded: false, used: 0, limit: 1000, remaining: 1000, percentUsed: 0 };
  }

  const user = await getUserById(userId);
  if (!user) return { exceeded: true, used: 0, limit: 0 };

  // Get current month usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const used = await getTotalUsage(userId, startOfMonth);
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
  // Skip logging for dev user (doesn't exist in DB)
  if (userId === "dev-user-local") {
    return calculateModelCost(model, inputTokens, outputTokens, cachedTokens);
  }

  const costUsd = calculateModelCost(model, inputTokens, outputTokens, cachedTokens);

  await createUsageLog({
    id: uuidv4(),
    userId,
    instanceId: instanceId || null,
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

  await dbCreateUser(user);

  return { ...user, fullApiKey: key };
}
