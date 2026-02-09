# Tomorrow's Quick Start

## Pre-Flight Checklist

- [ ] Shadow PC Neo ordered (~€32/month)
- [ ] Cloudflare account ready (free)
- [ ] Domain (optional, or use tunnel URL)

---

## Step 1: Start Shadow PC (2 min)

1. Open Shadow app on Mac
2. Click "Start"
3. Wait for Windows boot

---

## Step 2: Run Setup (5 min)

In Shadow PC → **PowerShell (Admin)**:

```powershell
# Download and run setup
Set-ExecutionPolicy Bypass -Scope Process -Force
irm "https://raw.githubusercontent.com/Haxxolotto/Ia-Interfaces/main/scripts/windows/setup-shadow-pc.ps1" | iex
```

This installs:
- Ollama (LLM inference)
- Node.js
- Your API server
- Cloudflare Tunnel

---

## Step 3: Configure (2 min)

Edit `C:\llm-hub\app\.env`:

```env
DATABASE_URL=file:./data/llmhub.db
OLLAMA_URL=http://localhost:11434/v1
DEFAULT_MODEL=qwen2.5-coder:14b
NODE_ENV=production
```

---

## Step 4: Setup Tunnel (3 min)

```powershell
C:\cloudflared\cloudflared.exe tunnel login
C:\cloudflared\cloudflared.exe tunnel create llm-hub
C:\cloudflared\cloudflared.exe tunnel route dns llm-hub llm.YOURDOMAIN.com
```

---

## Step 5: Create Startup Task (1 min)

```powershell
& "C:\llm-hub\scripts\windows\create-startup-task.ps1"
Start-ScheduledTask -TaskName "LLM-Hub-AutoStart"
```

---

## Step 6: Configure Mac CLI (1 min)

On your Mac:

```bash
mkdir -p ~/.rodeo
cat > ~/.rodeo/config.json << 'EOF'
{
  "apiUrl": "https://llm.YOURDOMAIN.com",
  "apiKey": "your-api-key",
  "model": "qwen2.5-coder:14b",
  "timeout": 180000
}
EOF
```

---

## Step 7: Test!

```bash
cd ~/Desktop/GitHub/Ia-Interfaces/cli
npx tsx rodeo.ts "Hello! Can you read package.json?"
```

---

## Daily Usage

1. **Start Shadow PC** (app or phone)
2. Wait ~1 min for boot (services auto-start)
3. Use CLI: `npx tsx rodeo.ts`

---

## Useful Commands

```bash
# Switch models
/model qwen2.5-coder:7b    # Faster
/model qwen2.5-coder:14b   # Better quality
/model deepseek-coder:6.7b # Good for code

# List models
/models

# Toggle auto-approve (skip confirmations)
/auto

# Undo last edit
/undo

# Check status
/status
```

---

## Available Models (ALL FREE)

| Model | VRAM | Speed | Best For |
|-------|------|-------|----------|
| qwen2.5-coder:14b | 9GB | ~50 tok/s | Code quality |
| qwen2.5-coder:7b | 5GB | ~100 tok/s | Fast code |
| deepseek-coder:6.7b | 4GB | ~100 tok/s | Code |
| qwen2.5:14b | 9GB | ~50 tok/s | General |
| llama3.2:3b | 2GB | ~150 tok/s | Ultra-fast |

---

## Cost Summary

```
Shadow PC Neo     €32/month
Everything else   FREE
─────────────────────────
Total             €32/month
```

---

## Files Reference

```
cli/
└── rodeo.ts              # The CLI you'll use daily

scripts/windows/
├── setup-shadow-pc.ps1   # One-time setup
├── start-services.ps1    # Runs on boot
└── create-startup-task.ps1

docs/
├── SHADOW-PC-SETUP.md    # Detailed guide
├── TOMORROW-CHECKLIST.md # Step-by-step
└── BUDGET-SETUP.md       # Cost breakdown
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CLI can't connect | Check Shadow PC is running |
| Slow responses | Try smaller model: `/model qwen2.5:7b` |
| Edit not matching | Re-read the file first |
| Tunnel not working | `cloudflared tunnel info llm-hub` |

---

**Ready to code!** 🚀
