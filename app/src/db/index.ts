import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database(process.env.DATABASE_URL?.replace("file:", "") || "./llmhub.db");
export const db = drizzle(sqlite, { schema });

// Initialize tables on first run
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    api_key TEXT NOT NULL UNIQUE,
    api_key_hash TEXT NOT NULL,
    monthly_budget REAL DEFAULT 20.0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    name TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'qwen2.5:72b',
    system_prompt TEXT,
    thinking INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    instance_id TEXT REFERENCES instances(id),
    role TEXT NOT NULL,
    content TEXT,
    reasoning_content TEXT,
    tool_calls TEXT,
    tool_call_id TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cached_tokens INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    instance_id TEXT,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cached_tokens INTEGER DEFAULT 0,
    cost_usd REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_logs(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_instances_user ON instances(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_id);
`);

// Migration: add source column if missing
try {
  sqlite.exec(`ALTER TABLE instances ADD COLUMN source TEXT DEFAULT 'web'`);
} catch {}
