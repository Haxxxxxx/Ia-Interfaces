# VPS Quick Start Guide

> **Ready-to-use checklist for connecting to your VPS and running models**

## 🎯 Tomorrow's Checklist

### Option A: Ollama on VPS (Self-hosted, FREE inference)

```bash
# 1. SSH into your VPS
ssh root@YOUR_VPS_IP

# 2. Run the setup script (installs Ollama + pulls models)
curl -fsSL https://raw.githubusercontent.com/Haxxolotto/Ia-Interfaces/main/scripts/setup-ollama-vps.sh | bash

# 3. Verify Ollama is running
curl http://localhost:11434/api/tags

# 4. Back on your Mac, set up the CLI
cd ~/Desktop/GitHub/Ia-Interfaces/cli
cp ~/.rodeo/config.example.json ~/.rodeo/config.json
# Edit config with your VPS URL and API key
```

### Option B: Cloud APIs (Paid per token)

**Moonshot API** (Kimi K2.5 for chat - 256K context):
```bash
# 1. Get API key from platform.moonshot.ai
# 2. Add to your VPS .env file
echo "MOONSHOT_API_KEY=sk-your-moonshot-key" >> /opt/llm-hub/app/.env
```

**DeepSeek API** (Code specialist - very low cost ~$0.14/1M tokens):
```bash
# 1. Get API key from platform.deepseek.com
# 2. Add to your VPS .env file
echo "DEEPSEEK_API_KEY=sk-your-deepseek-key" >> /opt/llm-hub/app/.env
```

```bash
# 3. Restart the app
cd /opt/llm-hub/app && npm run build && npm start
```

---

## 📋 Pre-flight Checklist

### VPS Requirements
- [ ] Ubuntu 22.04+ or Debian 12+
- [ ] Minimum 8GB RAM (16GB+ recommended for larger models)
- [ ] 50GB+ disk space for models
- [ ] SSH access configured

### Local Requirements
- [ ] Node.js 18+
- [ ] SSH key added to VPS
- [ ] Git repo cloned

---

## 🚀 Step-by-Step VPS Setup

### 1. Initial VPS Provisioning

```bash
# SSH into your fresh VPS
ssh root@YOUR_VPS_IP

# Update system
apt update && apt upgrade -y

# Install essentials
apt install -y curl git htop

# Clone the repo
git clone https://github.com/Haxxolotto/Ia-Interfaces.git /opt/llm-hub
cd /opt/llm-hub
```

### 2. Install Ollama (for local model inference)

```bash
# One-line Ollama install
curl -fsSL https://ollama.com/install.sh | sh

# Start Ollama service
systemctl enable ollama
systemctl start ollama

# Pull your preferred models
ollama pull qwen2.5:7b           # Fast, 8GB VRAM
ollama pull qwen2.5-coder:7b     # Code-optimized
ollama pull qwen2.5:32b          # Powerful, 24GB VRAM (if you have it)

# Verify
ollama list
```

### 3. Configure Ollama for Remote Access

```bash
# Edit Ollama service to listen on all interfaces
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
EOF

# Reload and restart
systemctl daemon-reload
systemctl restart ollama

# Verify it's listening
curl http://localhost:11434/api/tags
```

### 4. Set Up the API Server (Next.js)

```bash
cd /opt/llm-hub/app

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
# Database
DATABASE_URL=file:./data/llmhub.db

# Ollama (local)
OLLAMA_URL=http://localhost:11434/v1

# Moonshot API (optional - for Kimi K2.5 chat)
# MOONSHOT_API_KEY=sk-your-moonshot-key-here

# DeepSeek API (optional - for code editing, very low cost)
# DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# Default model
DEFAULT_MODEL=qwen2.5:7b

# App
NODE_ENV=production
EOF

# Build and start
npm run build
npm start
```

### 5. Set Up Cloudflare Tunnel (Secure Access)

```bash
# Install cloudflared
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb

# Login and create tunnel
cloudflared tunnel login
cloudflared tunnel create llm-hub

# Configure tunnel
TUNNEL_ID=$(cloudflared tunnel list | grep llm-hub | awk '{print $1}')

cat > /etc/cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: llm.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
EOF

# Route DNS and start
cloudflared tunnel route dns llm-hub llm.yourdomain.com
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared
```

---

## 🔑 Generate Your API Key

```bash
# On the VPS, run the seed script
cd /opt/llm-hub/app
npx tsx scripts/seed-team.ts

# This creates a default admin user with an API key
# Copy the generated API key
```

---

## 💻 Local CLI Setup

### On Your Mac

```bash
cd ~/Desktop/GitHub/Ia-Interfaces/cli

# Install dependencies
npm install

# Create config
mkdir -p ~/.rodeo
cat > ~/.rodeo/config.json << 'EOF'
{
  "apiUrl": "https://llm.yourdomain.com",
  "apiKey": "YOUR_API_KEY_HERE",
  "model": "qwen2.5:7b",
  "timeout": 120000
}
EOF

# Test the CLI
npx tsx rodeo.ts "Hello, can you see me?"
```

---

## 🧪 Connection Test

### Test from your Mac

```bash
# Test API health
curl https://llm.yourdomain.com/api/health

# Test chat endpoint
curl -X POST https://llm.yourdomain.com/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5:7b",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'
```

### Expected Response
```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    }
  }]
}
```

---

## 🔧 Troubleshooting

### Ollama not responding
```bash
# Check status
systemctl status ollama

# Check logs
journalctl -u ollama -f

# Restart
systemctl restart ollama
```

### API server not responding
```bash
# Check if running
curl http://localhost:3000/api/health

# Check logs
cd /opt/llm-hub/app && npm run dev
```

### Cloudflare tunnel issues
```bash
# Check tunnel status
cloudflared tunnel info llm-hub

# Check logs
journalctl -u cloudflared -f

# Restart
systemctl restart cloudflared
```

---

## 📊 Model Recommendations

### Local Models (Ollama - FREE)
| Model | VRAM | Speed | Best For |
|-------|------|-------|----------|
| `qwen2.5:7b` | 8GB | ~80 tok/s | Quick tasks, chat |
| `qwen2.5-coder:7b` | 8GB | ~80 tok/s | Code generation |
| `qwen2.5:14b` | 12GB | ~50 tok/s | Balanced |
| `qwen2.5:32b` | 24GB | ~30 tok/s | Complex reasoning |
| `llama3.3:70b` | 48GB | ~15 tok/s | Maximum quality |

### Cloud Models (Low Cost)
| Model | Provider | Cost | Best For |
|-------|----------|------|----------|
| `kimi-k2.5` | Moonshot | ~$2/1M tokens | Chat with 256K context |
| `deepseek-coder` | DeepSeek | ~$0.14/1M tokens | Code editing, refactoring |
| `deepseek-chat` | DeepSeek | ~$0.14/1M tokens | General chat, cheap alternative |

---

## 🔐 Security Notes

- Never expose Ollama port (11434) directly to internet
- Always use Cloudflare Tunnel or VPN
- Rotate API keys regularly
- Keep VPS updated: `apt update && apt upgrade -y`
