# Budget-Optimized Setup Guide

> **Target: Under €50/month total** (VPS + API costs)

---

## Recommended Setup: ~€15-25/month

### 1. VPS: Hetzner CX32 — €7.17/month

**Why Hetzner?**
- Best price/performance in EU
- Datacenters in Germany, Finland, USA
- Excellent network, 20TB traffic included
- Easy hourly billing (cancel anytime)

**Order here:** https://www.hetzner.com/cloud

```
Plan:     CX32 (shared vCPU)
RAM:      8 GB
CPU:      4 vCPU (AMD EPYC)
Storage:  80 GB NVMe
Traffic:  20 TB
Location: Falkenstein (DE) or Helsinki (FI)
OS:       Ubuntu 24.04
```

**Note:** 8GB RAM is enough for `qwen2.5:7b` which runs entirely in RAM (no GPU needed, just slower).

---

### 2. Models: Prioritize Local (FREE)

| Priority | Model | Provider | Cost | When to Use |
|----------|-------|----------|------|-------------|
| 1st | `qwen2.5:7b` | Ollama | FREE | General chat, quick tasks |
| 1st | `qwen2.5-coder:7b` | Ollama | FREE | Code generation, edits |
| 2nd | `deepseek-coder` | DeepSeek API | ~€0.14/1M | Complex code, fallback |
| Skip | ~~kimi-k2.5~~ | ~~Moonshot~~ | Too expensive | — |

---

### 3. API Budget: DeepSeek Only — ~€5-15/month

**DeepSeek Pricing (Jan 2025):**
- Input: $0.14/1M tokens (~€0.13)
- Output: $0.28/1M tokens (~€0.26)
- Cache hits: 90% cheaper

**Monthly estimate by usage:**

| Usage Level | Tokens/month | Cost |
|-------------|--------------|------|
| Light | 1M | ~€0.40 |
| Moderate | 5M | ~€2 |
| Heavy | 20M | ~€8 |
| Very heavy | 50M | ~€20 |

---

### 4. Free Services

- **Cloudflare Tunnel**: FREE (secure HTTPS access)
- **Cloudflare DNS**: FREE
- **GitHub**: FREE (code hosting)
- **SQLite**: FREE (no database server needed)

---

## Total Monthly Cost

```
┌────────────────────────────────────────────┐
│  Hetzner CX32 VPS         €7.17           │
│  DeepSeek API (moderate)  €5.00           │
│  Domain (optional)        €1.00           │
├────────────────────────────────────────────┤
│  TOTAL                    €13-15/month    │
│                                            │
│  Budget remaining         €35-37/month    │
└────────────────────────────────────────────┘
```

---

## Upgrade Path (if needed)

If local inference is too slow, consider:

1. **Hetzner CX42** (16GB RAM, €14/mo) — Run `qwen2.5:14b`
2. **Hetzner CAX31** (16GB ARM, €11/mo) — Efficient, but no x86
3. **GPU Cloud** (Vast.ai, RunPod) — ~€0.20/hour for RTX 3090

---

## Quick Setup Commands

### Order VPS

1. Go to https://www.hetzner.com/cloud
2. Create account, add payment
3. Create server: Ubuntu 24.04, CX32, your SSH key
4. Note the IP address

### First Connection

```bash
# From your Mac
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull the efficient 7B model
ollama pull qwen2.5:7b
ollama pull qwen2.5-coder:7b

# Test
ollama run qwen2.5:7b "Hello, how are you?"
```

### Expected Performance on CX32 (8GB, no GPU)

| Model | Speed | Notes |
|-------|-------|-------|
| qwen2.5:7b | ~15-25 tok/s | Usable for chat |
| qwen2.5-coder:7b | ~15-25 tok/s | Good for code |
| qwen2.5:14b | Too slow | Need 16GB+ RAM |

---

## Environment Config for Budget Mode

```bash
# /opt/llm-hub/app/.env

# Database
DATABASE_URL=file:./data/llmhub.db

# Ollama (local - FREE)
OLLAMA_URL=http://localhost:11434/v1

# DeepSeek (fallback for complex code - cheap)
DEEPSEEK_API_KEY=sk-your-deepseek-key

# Skip Moonshot (too expensive)
# MOONSHOT_API_KEY=

# Default to local model
DEFAULT_MODEL=qwen2.5:7b

NODE_ENV=production
```

---

## CLI Config for Budget Mode

```json
// ~/.rodeo/config.json
{
  "apiUrl": "https://llm.yourdomain.com",
  "apiKey": "YOUR_API_KEY",
  "model": "qwen2.5-coder:7b",
  "timeout": 180000
}
```

Use `/model deepseek-coder` only when local model struggles.

---

## Cost Monitoring

### Check DeepSeek usage
Visit: https://platform.deepseek.com/usage

### Set spending limit
In DeepSeek dashboard, set monthly limit to €20-30 as safety.

---

## Summary

| Component | Monthly Cost |
|-----------|--------------|
| Hetzner CX32 | €7.17 |
| DeepSeek API | €2-10 |
| Domain | €0-1 |
| **Total** | **€10-20** |
| **Budget** | **€50** |
| **Savings** | **€30-40** |

You'll be well under budget with room to spare for heavier usage months.
