# Rodeo / Sadary LLM Hub — Agent Guide

> **For Claude Code / Cursor agents** working on this codebase.  
> This document explains architecture, data flows, and conventions so you can make coherent changes.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CLI / Webapp / Desktop (Tauri)                                          │
│                                                                         │
│  POST /api/v1/chat/completions  (streaming)                             │
│  GET  /api/models               (public)                                │
│  GET  /api/health               (public)                                │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Next.js API (app/)                                                       │
│                                                                         │
│  1. Auth (validateApiKey) → 2. Budget → 3. Parse body                  │
│  4. Route to LLM (model-based) → 5. Stream / log usage                  │
│                                                                         │
│  lib/llm-client.ts  → routes kimi-* → Moonshot, deepseek-* → DeepSeek, else → Ollama │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
           ┌──────────────────────┼──────────────────────┬──────────────────────┐
           ▼                      ▼                      ▼                      ▼
    ┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │ Ollama       │    │ Ollama (VPS GPU) │    │ Moonshot API     │    │ DeepSeek API    │
    │ local:11434  │    │ remote URL       │    │ api.moonshot.ai  │    │ api.deepseek.com│
    │ (CPU/GPU)    │    │ (heavier models) │    │ (kimi-k2.5)      │    │ (deepseek-coder)│
    └──────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 2. Key Files & Responsibilities

| Path | Responsibility |
|------|----------------|
| `app/src/lib/config.ts` | Env parsing, OLLAMA_URL, deployment mode |
| `app/src/lib/llm-client.ts` | LLM routing, streaming, retries |
| `app/src/lib/models.ts` | Model catalog, pricing, metadata |
| `app/src/lib/auth.ts` | API key validation, budget, usage logging |
| `app/src/lib/tools-schema.ts` | Tool definitions for agent |
| `app/src/app/api/v1/chat/completions/route.ts` | Main chat endpoint |
| `app/src/app/api/health/route.ts` | Health & backend status |
| `config/models.yaml` | Model definitions (reference) |

---

## 3. Data Flow (Chat Request)

```
Client → POST /api/v1/chat/completions
  → validateApiKey(Authorization header)
  → checkBudget(userId) [skip if ollama]
  → parse body: { model, messages, stream, ... }
  → chat({ model, messages, tools, stream })
    → kimi-* → Moonshot; deepseek-* → DeepSeek; else → Ollama
    → OpenAI SDK .chat.completions.create({ stream: true })
  → for await chunk → enqueue SSE
  → logUsage(userId, model, tokens) [async]
  → close stream
```

**Latency rules:**
- Auth: single DB lookup (indexed by api_key_hash)
- Budget: one aggregate query per request
- No artificial delays; streaming starts immediately

---

## 4. VPS & GPU Setup

### Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `ollama` | `ollama`, `moonshot`, or `deepseek` |
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama endpoint |
| `DEFAULT_MODEL` | `qwen2.5:7b` | Fallback model |
| `MOONSHOT_API_KEY` | - | Moonshot API key (optional) |
| `DEEPSEEK_API_KEY` | - | DeepSeek API key (optional) |

**VPS (Docker):**
- `OLLAMA_URL=http://ollama:11434/v1` (internal Docker network)
- Ollama container uses `deploy.resources.reservations.devices: [gpu]`

**Local dev → remote GPU:**
- `OLLAMA_URL=https://llm.yourdomain.com/v1` (Ollama behind Cloudflare Tunnel)
- Or `OLLAMA_URL=http://vps-ip:11434/v1` if exposed

### Heavier Models (GPU)

| Model | VRAM | Notes |
|-------|------|-------|
| qwen2.5:7b | 8GB | Works on CPU (slow) |
| qwen2.5:32b | 24GB | RTX 4090, A10 |
| qwen2.5:72b, llama3.3:70b | 48GB | A100 80GB recommended |

---

## 5. Conventions

### Code style
- TypeScript strict mode
- Prefer `async/await` over raw Promises
- Use `lib/` for shared logic; routes stay thin

### Add a new model
1. Add to `lib/models.ts` (OLLAMA_MODELS, MOONSHOT_MODELS, or DEEPSEEK_MODELS)
2. Route is automatic: `kimi-*` → Moonshot, `deepseek-*` → DeepSeek, else → Ollama

### Add a new API route
1. Create `app/src/app/api/…/route.ts`
2. Use `validateApiKey` for auth
3. Return `Response.json()` or `ReadableStream` for SSE

### Database
- SQLite via Drizzle (`db/`, `schema.ts`)
- Migrations: `npm run db:push` or `db:generate` + `db:migrate`

---

## 6. Testing

```bash
# Health
curl http://localhost:3000/api/health

# Models (public)
curl http://localhost:3000/api/models

# Chat (requires API key)
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer rodeo-xxx-xxxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen2.5:7b","messages":[{"role":"user","content":"Hi"}],"stream":true}'
```

---

## 7. Multi-Instance & Concurrency

### Per-request behavior
- **Stateless**: Each `/api/v1/chat/completions` request is independent
- **Auth cache**: API key → user cached 5 min (avoids O(n) bcrypt scan per request)
- **No rate limit** on chat route (rate-limit.ts exists but is not wired)
- **Streaming**: Response streams immediately; `logUsage` runs async after stream ends

### Ollama on VPS
- **OLLAMA_NUM_PARALLEL=2**: Up to 2 concurrent requests per model
- **OLLAMA_MAX_QUEUE=64**: Requests queue beyond that; 503 when full
- **OLLAMA_MAX_LOADED_MODELS=2**: Keeps 2 models in VRAM (e.g. 7b + 72b)
- Heavy models (72B, 70B) share GPU; concurrent requests are batched by Ollama

### Heavy / vision models
- **Code**: qwen2.5:72b, llama3.3:70b, deepseek-coder-v2:16b
- **Vision**: llava:13b, llava-llama3:8b (images, video frames)
- **Moonshot**: kimi-k2.5 has native vision (images + video)

---

## 8. Collaboration (Multiple Agents)

- Read `AGENTS.md` and `docs/ARCHITECTURE.md` before editing
- Prefer small, focused PRs
- When touching `llm-client` or `config`, coordinate with other agents
- Keep `models.ts` as single source of truth for model metadata
