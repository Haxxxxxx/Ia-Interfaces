# Shadow PC Setup Guide

> **On-demand GPU cloud for team LLM inference — €32/month**

---

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Shadow PC Neo (€32/month)                                  │
│  ├── RTX 2000 Ada GPU (16GB VRAM)                          │
│  ├── 16GB RAM                                               │
│  ├── Windows 11                                             │
│  └── Auto-starts services on boot                           │
├─────────────────────────────────────────────────────────────┤
│  On boot, automatically starts:                             │
│  ├── Ollama (qwen2.5-coder:7b) ──→ FREE inference          │
│  ├── Next.js API server ──→ Port 3000                       │
│  └── Cloudflare Tunnel ──→ https://llm.yourdomain.com      │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Order Shadow PC Neo

1. Go to https://shadow.tech/shadowpc/offers
2. Select **Neo** plan (~€32/month)
3. Complete signup
4. Download Shadow app on your Mac
5. Launch and connect to your Shadow PC

---

## Step 2: Initial Setup (One-time)

Connect to Shadow PC and open **PowerShell as Administrator**:

```powershell
# Download setup script
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/YOUR_USERNAME/Ia-Interfaces/main/scripts/windows/setup-shadow-pc.ps1" -OutFile "$env:TEMP\setup.ps1"

# Run setup
Set-ExecutionPolicy Bypass -Scope Process -Force
& "$env:TEMP\setup.ps1"
```

This installs:
- Ollama (LLM inference)
- Node.js
- Your LLM Hub app
- Cloudflare Tunnel

---

## Step 3: Configure Environment

Edit `C:\llm-hub\app\.env`:

```powershell
notepad C:\llm-hub\app\.env
```

Set these values:

```env
# Database
DATABASE_URL=file:./data/llmhub.db

# Ollama (local GPU - FREE)
OLLAMA_URL=http://localhost:11434/v1

# DeepSeek (cheap fallback)
DEEPSEEK_API_KEY=sk-your-key-here

# Default model
DEFAULT_MODEL=qwen2.5-coder:7b

NODE_ENV=production
```

---

## Step 4: Setup Cloudflare Tunnel

```powershell
# Login to Cloudflare
C:\cloudflared\cloudflared.exe tunnel login

# Create tunnel
C:\cloudflared\cloudflared.exe tunnel create llm-hub

# Get tunnel ID
$tunnelId = (C:\cloudflared\cloudflared.exe tunnel list | Select-String "llm-hub").ToString().Split()[0]

# Create config
@"
tunnel: $tunnelId
credentials-file: C:\Users\music\.cloudflared\$tunnelId.json

ingress:
  - hostname: llm.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
"@ | Out-File -FilePath "C:\Users\music\.cloudflared\config.yml" -Encoding UTF8

# Route DNS
C:\cloudflared\cloudflared.exe tunnel route dns llm-hub llm.yourdomain.com
```

---

## Step 5: Create Startup Task

```powershell
# Copy scripts to Shadow PC
Copy-Item "scripts\windows\*" -Destination "C:\llm-hub\scripts\windows\" -Recurse

# Create auto-start task
C:\llm-hub\scripts\windows\create-startup-task.ps1
```

---

## Step 6: Test

```powershell
# Start services now
Start-ScheduledTask -TaskName "LLM-Hub-AutoStart"

# Check Ollama
curl http://localhost:11434/api/tags

# Check API
curl http://localhost:3000/api/health

# Check tunnel
curl https://llm.yourdomain.com/api/health
```

---

## Daily Usage

### Start Shadow PC

1. Open Shadow app (Mac/Phone/Web)
2. Click "Start"
3. Wait ~1 minute for boot
4. Services auto-start — API ready!

### Team Access

Everyone uses: `https://llm.yourdomain.com`

No need to connect to Shadow directly.

### Stop Shadow PC

Just close the Shadow app or let it idle.
Services will auto-start next time you boot.

---

## CLI Configuration (Mac)

```bash
# Create config
mkdir -p ~/.rodeo
cat > ~/.rodeo/config.json << 'EOF'
{
  "apiUrl": "https://llm.yourdomain.com",
  "apiKey": "YOUR_API_KEY",
  "model": "qwen2.5-coder:7b",
  "timeout": 180000
}
EOF

# Test
cd ~/Desktop/GitHub/Ia-Interfaces/cli
npx tsx rodeo.ts "Hello!"
```

---

## Performance (Shadow PC Neo)

| Model | Speed | Notes |
|-------|-------|-------|
| qwen2.5:7b | ~80-100 tok/s | Blazing fast |
| qwen2.5-coder:7b | ~80-100 tok/s | Great for code |
| qwen2.5:14b | ~50-60 tok/s | Still fast |
| qwen2.5:32b | ~25-30 tok/s | 16GB VRAM limit |

---

## Troubleshooting

### Services not starting

```powershell
# Check task status
Get-ScheduledTask -TaskName "LLM-Hub-AutoStart"

# View logs
Get-Content C:\llm-hub\logs\startup.log -Tail 50

# Run manually
C:\llm-hub\scripts\windows\start-services.ps1
```

### Ollama not responding

```powershell
# Check if running
Get-Process ollama -ErrorAction SilentlyContinue

# Start manually
ollama serve

# Check models
ollama list
```

### API not accessible

```powershell
# Check local
curl http://localhost:3000/api/health

# Check tunnel
C:\cloudflared\cloudflared.exe tunnel info llm-hub
```

---

## Cost Summary

```
Shadow PC Neo          €32/month
DeepSeek API           €5/month (estimated)
Cloudflare             FREE
─────────────────────────────────
TOTAL                  ~€37/month
Budget                 €50/month
Savings                €13/month
```

---

## Files Reference

```
C:\llm-hub\
├── app\                      # Next.js API server
│   ├── .env                  # Your configuration
│   └── data\                 # SQLite database
├── scripts\windows\
│   ├── setup-shadow-pc.ps1   # Initial setup
│   ├── start-services.ps1    # Startup script
│   └── create-startup-task.ps1
└── logs\
    └── startup.log           # Service logs
```
