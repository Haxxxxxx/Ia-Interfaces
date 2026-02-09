# Tomorrow's Setup Checklist — Shadow PC

## Quick Reference

```
Shadow PC Plan:    Neo (~€32/month)
Domain:            ___________________ (optional)
```

---

## Step 1: Start Shadow PC

1. Open Shadow app (Mac/Phone/Web)
2. Click "Start"
3. Wait for Windows to boot

---

## Step 2: Run Setup Script

Open **PowerShell as Administrator** and run:

```powershell
# Download and run setup
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/YOUR_USERNAME/Ia-Interfaces/main/scripts/windows/setup-shadow-pc.ps1" -OutFile "$env:TEMP\setup.ps1"
Set-ExecutionPolicy Bypass -Scope Process -Force
& "$env:TEMP\setup.ps1"
```

This installs Ollama, Node.js, and pulls `qwen2.5-coder:7b`.

---

## Step 3: Configure Environment

```powershell
notepad C:\llm-hub\app\.env
```

Set:

```env
DATABASE_URL=file:./data/llmhub.db
OLLAMA_URL=http://localhost:11434/v1
DEFAULT_MODEL=qwen2.5-coder:14b
NODE_ENV=production
```

No API keys needed — everything runs locally!

---

## Step 4: Setup Cloudflare Tunnel

```powershell
# Login
C:\cloudflared\cloudflared.exe tunnel login

# Create tunnel
C:\cloudflared\cloudflared.exe tunnel create llm-hub

# Route DNS (replace with your domain)
C:\cloudflared\cloudflared.exe tunnel route dns llm-hub llm.yourdomain.com
```

Create config file at `C:\Users\music\.cloudflared\config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\music\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: llm.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

---

## Step 5: Create Auto-Start Task

```powershell
# Create startup task
& "C:\llm-hub\scripts\windows\create-startup-task.ps1"

# Test it now
Start-ScheduledTask -TaskName "LLM-Hub-AutoStart"
```

---

## Step 6: Configure Mac CLI

On your Mac:

```bash
mkdir -p ~/.rodeo
cat > ~/.rodeo/config.json << 'EOF'
{
  "apiUrl": "https://llm.yourdomain.com",
  "apiKey": "YOUR_API_KEY",
  "model": "qwen2.5-coder:7b",
  "timeout": 180000
}
EOF
```

---

## Step 7: Test

```bash
# Health check
curl https://llm.yourdomain.com/api/health

# Run CLI
cd ~/Desktop/GitHub/Ia-Interfaces/cli
npx tsx rodeo.ts "Hello!"
```

---

## Daily Usage

1. **Start Shadow PC** via app (Mac/phone)
2. Wait ~1 min for boot
3. Services auto-start
4. Team uses `https://llm.yourdomain.com`
5. Close Shadow when done (optional)

---

## What You Need

1. **Cloudflare Account** (FREE)
   - For secure tunnel access
   - https://dash.cloudflare.com

2. **Domain** (optional, ~€10/year)
   - Or use Cloudflare's free tunnel URL

No API keys needed — all models run locally for FREE!

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Services not starting | Check `C:\llm-hub\logs\startup.log` |
| Ollama slow | GPU driver issue — check Device Manager |
| API not responding | `curl http://localhost:3000/api/health` |
| Tunnel not working | `cloudflared tunnel info llm-hub` |

---

## Cost Summary

```
Shadow PC Neo     €32/month
Local models      FREE (Ollama)
Cloudflare        FREE
──────────────────────────────
TOTAL             €32/month
Budget            €50/month
SAVINGS           €18/month
```

---

## Done!

```bash
cd ~/Desktop/GitHub/Ia-Interfaces/cli
npx tsx rodeo.ts
```

GPU-accelerated Claude Code clone for €32/month — 100% FREE inference!
