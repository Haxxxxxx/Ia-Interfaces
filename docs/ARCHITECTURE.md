# Rodeo / Sadary LLM Hub — Architecture

## Data Flow

```
Client (CLI / Webapp / Desktop)
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ POST /api/v1/chat/completions                                 │
│ GET  /api/models (public)                                     │
│ GET  /api/health (public)                                     │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│ 1. validateApiKey()     → lib/auth.ts                         │
│ 2. checkBudget()       → skip if Ollama                      │
│ 3. Parse body           → { model, messages, stream }         │
│ 4. chat()               → lib/llm-client.ts                  │
│    - kimi-* → Moonshot                                        │
│    - else   → Ollama (OLLAMA_URL)                             │
│ 5. Stream SSE / log usage                                    │
└───────────────────────────────────────────────────────────────┘
        │
        ├────────────────────┬────────────────────┐
        ▼                    ▼                    ▼
   Ollama local        Ollama (VPS)         Moonshot API
   :11434              GPU container        api.moonshot.ai
```

## Configuration

| Variable | Use |
|----------|-----|
| `OLLAMA_URL` | Ollama endpoint. Local: `http://localhost:11434/v1`. Docker: `http://ollama:11434/v1`. Remote GPU: `https://llm.example.com/v1` |
| `LLM_PROVIDER` | `ollama` (default) or `moonshot` |
| `MOONSHOT_API_KEY` | Enables Kimi models when set |
| `DEPLOYMENT_MODE` | `local` \| `docker` \| `vps` |

## VPS Deployment

1. **Docker Compose** — Ollama + Next.js
2. **Ollama** — `deploy.resources.reservations.devices: [gpu]`
3. **Cloudflare Tunnel** — Expose `localhost:3000` and optionally `localhost:11434` for remote Ollama

## GPU Models

| Model | VRAM | Use |
|-------|------|-----|
| qwen2.5:7b | 8GB | Fast code |
| qwen2.5:32b | 24GB | Better code |
| qwen2.5:72b, llama3.3:70b | 48GB | Heavy code, reasoning |
| llava:13b, llava-llama3:8b | 12–16GB | Vision, images, video frames |

## Multi-Instance (No Performance Impact)

- **API**: Stateless, each request independent
- **Auth**: Cached 5 min per API key
- **Ollama**: `OLLAMA_NUM_PARALLEL=2` in docker-compose — 2 concurrent requests per model
- **Queue**: `OLLAMA_MAX_QUEUE=64` — requests queue, 503 when full
