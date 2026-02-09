import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("member"), // admin | member
  apiKey: text("api_key").notNull().unique(),
  apiKeyHash: text("api_key_hash").notNull(),
  monthlyBudget: real("monthly_budget").default(20.0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const instances = sqliteTable("instances", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  model: text("model").notNull().default("qwen2.5:72b"),
  source: text("source").default("web"), // web | cli
  systemPrompt: text("system_prompt"),
  thinking: integer("thinking", { mode: "boolean" }).default(true),
  status: text("status").default("active"), // active | archived
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").references(() => instances.id),
  role: text("role").notNull(), // user | assistant | system | tool
  content: text("content"),
  reasoningContent: text("reasoning_content"),
  toolCalls: text("tool_calls"), // JSON array
  toolCallId: text("tool_call_id"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  cachedTokens: integer("cached_tokens").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const usageLogs = sqliteTable("usage_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  instanceId: text("instance_id"),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cachedTokens: integer("cached_tokens").default(0),
  costUsd: real("cost_usd").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Instance = typeof instances.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
