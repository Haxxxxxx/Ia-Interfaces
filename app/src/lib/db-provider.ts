/**
 * Database provider abstraction
 * Uses SQLite locally, Firestore in production (Firebase Functions)
 */
import { getFirestoreDb, useFirestore } from "./firebase-admin";
import type { User, Instance, UsageLog, Message } from "@/db/schema";

// ============================================
// Firestore Collections - Rodeo-specific to avoid conflicts
// ============================================
const USERS_COLLECTION = "rodeo_users";
const INSTANCES_COLLECTION = "rodeo_instances";
const USAGE_LOGS_COLLECTION = "rodeo_usage_logs";
const MESSAGES_COLLECTION = "rodeo_messages";

// ============================================
// User Operations
// ============================================

export async function getAllUsers(): Promise<User[]> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db.collection(USERS_COLLECTION).get();
    return snapshot.docs.map((doc) => docToUser(doc));
  } else {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    return db.select().from(users).all();
  }
}

export async function getUserById(id: string): Promise<User | null> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const doc = await db.collection(USERS_COLLECTION).doc(id).get();
    return doc.exists ? docToUser(doc) : null;
  } else {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(users).where(eq(users.id, id)).get() || null;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db
      .collection(USERS_COLLECTION)
      .where("email", "==", email)
      .limit(1)
      .get();
    return snapshot.empty ? null : docToUser(snapshot.docs[0]);
  } else {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(users).where(eq(users.email, email)).get() || null;
  }
}

export async function createUser(user: Omit<User, "createdAt"> & { createdAt?: Date }): Promise<void> {
  const userData = {
    ...user,
    createdAt: user.createdAt || new Date(),
  };

  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(USERS_COLLECTION).doc(user.id).set({
      ...userData,
      createdAt: userData.createdAt,
    });
  } else {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    await db.insert(users).values(userData);
  }
}

// ============================================
// Instance Operations
// ============================================

export async function getInstancesByUserId(userId: string): Promise<Instance[]> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db
      .collection(INSTANCES_COLLECTION)
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    return snapshot.docs.map((doc) => docToInstance(doc));
  } else {
    const { db } = await import("@/db");
    const { instances } = await import("@/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    return db
      .select()
      .from(instances)
      .where(eq(instances.userId, userId))
      .orderBy(desc(instances.createdAt))
      .all();
  }
}

export async function getInstanceById(id: string): Promise<Instance | null> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const doc = await db.collection(INSTANCES_COLLECTION).doc(id).get();
    return doc.exists ? docToInstance(doc) : null;
  } else {
    const { db } = await import("@/db");
    const { instances } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    return db.select().from(instances).where(eq(instances.id, id)).get() || null;
  }
}

export async function createInstance(instance: Instance): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(INSTANCES_COLLECTION).doc(instance.id).set({
      ...instance,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    });
  } else {
    const { db } = await import("@/db");
    const { instances } = await import("@/db/schema");
    await db.insert(instances).values(instance);
  }
}

export async function updateInstance(id: string, data: Partial<Instance>): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(INSTANCES_COLLECTION).doc(id).update({
      ...data,
      updatedAt: new Date(),
    });
  } else {
    const { db } = await import("@/db");
    const { instances } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db
      .update(instances)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(instances.id, id));
  }
}

export async function deleteInstance(id: string): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(INSTANCES_COLLECTION).doc(id).delete();
  } else {
    const { db } = await import("@/db");
    const { instances } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(instances).where(eq(instances.id, id));
  }
}

// ============================================
// Usage Log Operations
// ============================================

export async function createUsageLog(log: UsageLog): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(USAGE_LOGS_COLLECTION).doc(log.id).set({
      ...log,
      createdAt: log.createdAt,
    });
  } else {
    const { db } = await import("@/db");
    const { usageLogs } = await import("@/db/schema");
    await db.insert(usageLogs).values(log);
  }
}

export async function getUsageLogsByUserId(
  userId: string,
  startDate?: Date
): Promise<UsageLog[]> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    let query = db
      .collection(USAGE_LOGS_COLLECTION)
      .where("userId", "==", userId);

    if (startDate) {
      query = query.where("createdAt", ">=", startDate);
    }

    const snapshot = await query.orderBy("createdAt", "desc").get();
    return snapshot.docs.map((doc) => docToUsageLog(doc));
  } else {
    const { db } = await import("@/db");
    const { usageLogs } = await import("@/db/schema");
    const { eq, gte, and, desc } = await import("drizzle-orm");

    if (startDate) {
      return db
        .select()
        .from(usageLogs)
        .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, startDate)))
        .orderBy(desc(usageLogs.createdAt))
        .all();
    }

    return db
      .select()
      .from(usageLogs)
      .where(eq(usageLogs.userId, userId))
      .orderBy(desc(usageLogs.createdAt))
      .all();
  }
}

export async function getTotalUsage(userId: string, startDate: Date): Promise<number> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    try {
      const snapshot = await db
        .collection(USAGE_LOGS_COLLECTION)
        .where("userId", "==", userId)
        .where("createdAt", ">=", startDate)
        .get();

      return snapshot.docs.reduce((sum, doc) => sum + (doc.data().costUsd || 0), 0);
    } catch (e: any) {
      // Index not ready or other error - return 0 (no usage)
      console.error("getTotalUsage error:", e.message);
      return 0;
    }
  } else {
    const { db } = await import("@/db");
    const { usageLogs } = await import("@/db/schema");
    const { eq, gte, and, sql } = await import("drizzle-orm");

    const result = await db
      .select({ total: sql<number>`SUM(cost_usd)` })
      .from(usageLogs)
      .where(and(eq(usageLogs.userId, userId), gte(usageLogs.createdAt, startDate)))
      .get();

    return result?.total || 0;
  }
}

// ============================================
// Message Operations (for conversation history sync)
// ============================================

export async function createMessage(message: Message): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    await db.collection(MESSAGES_COLLECTION).doc(message.id).set({
      ...message,
      createdAt: message.createdAt,
    });
  } else {
    const { db } = await import("@/db");
    const { messages } = await import("@/db/schema");
    await db.insert(messages).values(message);
  }
}

export async function getMessagesByInstanceId(instanceId: string): Promise<Message[]> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db
      .collection(MESSAGES_COLLECTION)
      .where("instanceId", "==", instanceId)
      .orderBy("createdAt", "asc")
      .get();
    return snapshot.docs.map((doc) => docToMessage(doc));
  } else {
    const { db } = await import("@/db");
    const { messages } = await import("@/db/schema");
    const { eq, asc } = await import("drizzle-orm");
    return db
      .select()
      .from(messages)
      .where(eq(messages.instanceId, instanceId))
      .orderBy(asc(messages.createdAt))
      .all();
  }
}

export async function getRecentMessages(instanceId: string, limit: number = 50): Promise<Message[]> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db
      .collection(MESSAGES_COLLECTION)
      .where("instanceId", "==", instanceId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    // Reverse to get chronological order
    return snapshot.docs.map((doc) => docToMessage(doc)).reverse();
  } else {
    const { db } = await import("@/db");
    const { messages } = await import("@/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.instanceId, instanceId))
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .all();
    return result.reverse();
  }
}

export async function deleteMessagesByInstanceId(instanceId: string): Promise<void> {
  if (useFirestore()) {
    const db = getFirestoreDb();
    const snapshot = await db
      .collection(MESSAGES_COLLECTION)
      .where("instanceId", "==", instanceId)
      .get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  } else {
    const { db } = await import("@/db");
    const { messages } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(messages).where(eq(messages.instanceId, instanceId));
  }
}

// ============================================
// Helper Functions
// ============================================

function docToMessage(doc: FirebaseFirestore.DocumentSnapshot): Message {
  const data = doc.data()!;
  return {
    id: doc.id,
    instanceId: data.instanceId || null,
    role: data.role,
    content: data.content || null,
    reasoningContent: data.reasoningContent || null,
    toolCalls: data.toolCalls || null,
    toolCallId: data.toolCallId || null,
    inputTokens: data.inputTokens || 0,
    outputTokens: data.outputTokens || 0,
    cachedTokens: data.cachedTokens || 0,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
  };
}

function docToUser(doc: FirebaseFirestore.DocumentSnapshot): User {
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    email: data.email || null,
    role: data.role || "member",
    apiKey: data.apiKey,
    apiKeyHash: data.apiKeyHash,
    monthlyBudget: data.monthlyBudget ?? 20,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
  };
}

function docToInstance(doc: FirebaseFirestore.DocumentSnapshot): Instance {
  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId || null,
    name: data.name,
    model: data.model || "qwen2.5:7b",
    source: data.source || "web",
    systemPrompt: data.systemPrompt || null,
    thinking: data.thinking ?? true,
    status: data.status || "active",
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
    updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
  };
}

function docToUsageLog(doc: FirebaseFirestore.DocumentSnapshot): UsageLog {
  const data = doc.data()!;
  return {
    id: doc.id,
    userId: data.userId,
    instanceId: data.instanceId || null,
    model: data.model,
    inputTokens: data.inputTokens || 0,
    outputTokens: data.outputTokens || 0,
    cachedTokens: data.cachedTokens || 0,
    costUsd: data.costUsd || 0,
    createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
  };
}
