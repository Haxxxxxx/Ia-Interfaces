# Sadary LLM Hub

> **Self-hosted LLMs with Claude Code UI — FREE tokens, pay only GPU**

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  YOUR LOCAL COMPUTER                                            │
│  Desktop Client (Tauri) — Claude Code style UI                  │
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐   │
│  │ Instance 1  │ │ Instance 2  │ │ Instance 3              │   │
│  │ (Code)      │ │ (Research)  │ │ (Writing)               │   │
│  └──────┬──────┘ └──────┬──────┘ └──────────┬──────────────┘   │
│         │               │                    │                  │
│         └───────────────┼────────────────────┘                  │
│                         │ HTTPS                                 │
└─────────────────────────┼───────────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLOUD GPU (RunPod / Vast.ai / Shadow)                          │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Ollama + LLM Models (Qwen 72B, Llama 70B, etc.)         │  │
│  │  FREE tokens — pay only GPU rental                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  API Server (Next.js)                                     │  │
│  │  - Auth + Team management                                 │  │
│  │  - Multi-instance support                                 │  │
│  │  - Usage tracking (for analytics, not billing)            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Cloudflare Tunnel → llm.sadary.xyz                             │
└─────────────────────────────────────────────────────────────────┘
```

## Key Points

| Feature | Description |
|---------|-------------|
| **Tokens** | FREE — self-hosted, no per-token costs |
| **Pay only** | GPU cloud rental (~$0.30-2/hr) |
| **Interface** | Claude Code style — terminal UI, multi-instance |
| **Models** | Qwen 2.5 72B, Llama 3.3 70B, DeepSeek Coder |
| **Tool calling** | Local execution (files, shell, git) on YOUR machine |

## Cost Comparison

| Setup | Monthly Cost |
|-------|-------------|
| **Self-hosted (this)** | ~$50-200/mo (GPU only) |
| Claude API | $100-500+/mo (tokens) |
| Cursor Pro | $20/mo × users |
| ChatGPT Plus | $20/mo × users |

## Models (Self-Hosted)

| Model | VRAM | Speed | Best For |
|-------|------|-------|----------|
| `qwen2.5:72b` | 48GB | 20-30 tok/s | Best quality |
| `llama3.3:70b` | 48GB | 25-35 tok/s | Long context (128K) |
| `qwen2.5:32b` | 24GB | 40-50 tok/s | Good balance |
| `deepseek-coder-v2:16b` | 12GB | 60-80 tok/s | Code specialist |

## Quick Start

### 1. Setup GPU Cloud

```bash
# Option A: RunPod (~$0.50-2/hr for A100)
# Option B: Vast.ai (~$0.30-1/hr)
# Option C: Shadow PC (~$30-50/mo, RTX 4090)
```

### 2. Deploy on GPU Server

```bash
git clone https://github.com/sadary-dev/llm-hub.git
cd llm-hub

# Copy and configure
cp .env.example .env
# Edit .env with your settings

# Start services
docker compose up -d

# Pull model (one time)
docker exec ollama ollama pull qwen2.5:72b
```

### 3. Setup Tunnel

```bash
./scripts/setup-tunnel.sh llm-hub llm.sadary.xyz
```

### 4. Run Desktop Client

```bash
cd desktop
npm install
npm run tauri:dev
```

## Team

| Member | Role |
|--------|------|
| Vincent | CTO — Code, Solana |
| Pauline | CEO — Comms, Content |
| Rémi | COO — Strategy |
| Devs | Code, Testing |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Command Palette |
| `⌘N` | New Instance |
| `⌘M` | Model Selector |
| `⌘,` | Settings |

---

**Sadary** — No WeSplit references.
