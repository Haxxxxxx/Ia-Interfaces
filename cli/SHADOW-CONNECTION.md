# Shadow Cloud GPU Connection Guide

Complete guide to connect Rodeo to a Shadow cloud VPS for GPU-accelerated LLM inference.

---

## Overview

```
┌─────────────────┐         ┌─────────────────────────────┐
│  Your Computer  │         │      Shadow Cloud VPS       │
│                 │         │                             │
│  ┌───────────┐  │  HTTP   │  ┌───────────┐  ┌────────┐ │
│  │  Rodeo    │──┼────────►│  │  Ollama   │──│  GPU   │ │
│  │  CLI      │  │ :11434  │  │  Server   │  │ NVIDIA │ │
│  └───────────┘  │         │  └───────────┘  └────────┘ │
│                 │         │                             │
└─────────────────┘         └─────────────────────────────┘
```

---

## Prerequisites

- A Shadow cloud VPS with GPU (or any cloud VM with NVIDIA GPU)
- SSH access to the Shadow VPS
- Port 11434 accessible (firewall configured)

---

## Part 1: Shadow VPS Setup

### Step 1.1: Connect to Shadow

```bash
ssh your-username@YOUR_SHADOW_IP
```

### Step 1.2: Install Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 1.3: Configure Remote Access

Ollama defaults to localhost only. Enable remote access:

```bash
# Create override directory
sudo mkdir -p /etc/systemd/system/ollama.service.d

# Create config to listen on all interfaces
sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
EOF

# Apply changes
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Step 1.4: Verify Ollama is Listening

```bash
# Should show 0.0.0.0:11434 (not 127.0.0.1)
ss -tlnp | grep 11434
```

Expected output:
```
LISTEN  0  4096  0.0.0.0:11434  0.0.0.0:*  users:(("ollama",pid=1234,fd=3))
```

### Step 1.5: Open Firewall

```bash
# Ubuntu/Debian
sudo ufw allow 11434/tcp
sudo ufw reload

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=11434/tcp
sudo firewall-cmd --reload
```

### Step 1.6: Check GPU

```bash
# Verify GPU is detected
nvidia-smi

# Check VRAM
nvidia-smi --query-gpu=name,memory.total --format=csv
```

---

## Part 2: Install LLM Models

### Model Selection by VRAM

| VRAM | Recommended Models | Command |
|------|-------------------|---------|
| 8GB | qwen2.5-coder:7b, llama3.2:3b | `ollama pull qwen2.5-coder:7b` |
| 16GB | qwen2.5-coder:14b, llama3.1:8b | `ollama pull qwen2.5-coder:14b` |
| 24GB | qwen2.5:32b, deepseek-coder:33b | `ollama pull qwen2.5:32b` |
| 48GB+ | qwen2.5:72b, llama3.3:70b | `ollama pull qwen2.5:72b` |

### Install Commands (run on Shadow)

```bash
# For coding (recommended)
ollama pull qwen2.5-coder:7b

# For general use
ollama pull llama3.1:8b

# For high quality (24GB+)
ollama pull qwen2.5:32b

# List installed models
ollama list
```

### Test Model

```bash
ollama run qwen2.5-coder:7b "Write a Python hello world"
```

---

## Part 3: Connect from Local Machine

### Step 3.1: Test Connection

From your local terminal:

```bash
# Replace with your Shadow IP
curl http://YOUR_SHADOW_IP:11434/api/tags
```

Should return JSON with your models:
```json
{"models":[{"name":"qwen2.5-coder:7b","size":4500000000}]}
```

### Step 3.2: Connect in Rodeo

```bash
# Start Rodeo
rodeo

# Connect to Shadow (in Rodeo)
/shadow YOUR_SHADOW_IP:11434

# Verify connection
/gpu

# List available models
/models

# Switch to a model
/model qwen2.5-coder:7b
```

### Step 3.3: Permanent Configuration

The connection is saved automatically. To verify:

```bash
cat ~/.rodeo/config.json
```

Should show:
```json
{
  "shadowUrl": "http://YOUR_SHADOW_IP:11434",
  "model": "qwen2.5-coder:7b"
}
```

---

## Part 4: One-Line Setup Commands

### Complete Shadow Setup (copy & paste)

Run this single command on your Shadow VPS:

```bash
curl -fsSL https://ollama.com/install.sh | sh && \
sudo mkdir -p /etc/systemd/system/ollama.service.d && \
echo -e '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"\nEnvironment="OLLAMA_ORIGINS=*"' | \
sudo tee /etc/systemd/system/ollama.service.d/override.conf && \
sudo systemctl daemon-reload && \
sudo systemctl restart ollama && \
sudo ufw allow 11434/tcp && \
ollama pull qwen2.5-coder:7b && \
echo "Setup complete! IP: $(curl -s ifconfig.me)"
```

### Quick Connect Script (local)

Create this script on your local machine:

```bash
#!/bin/bash
# save as: ~/connect-shadow.sh

SHADOW_IP="${1:-YOUR_DEFAULT_SHADOW_IP}"

echo "Testing connection to $SHADOW_IP..."
if curl -s "http://$SHADOW_IP:11434/api/tags" > /dev/null; then
    echo "✓ Connected!"
    echo "Run: rodeo"
    echo "Then: /shadow $SHADOW_IP:11434"
else
    echo "✗ Connection failed"
fi
```

---

## Part 5: Usage Workflow

### Daily Workflow

```bash
# 1. Start Rodeo
rodeo

# 2. Verify Shadow connection
/gpu

# 3. Start coding!
help me refactor this function...
```

### Switch Between Local and Shadow

```bash
# Use Shadow GPU
/shadow YOUR_SHADOW_IP:11434

# Use local Ollama
/ollama reset

# Check current status
/gpu
```

### Model Management

```bash
# List all models
/models

# Switch model
/model qwen2.5-coder:14b

# Install new model (on Shadow via SSH)
ssh user@SHADOW_IP "ollama pull mistral:7b"
```

---

## Part 6: Troubleshooting

### Connection Refused

```bash
# Check Ollama is running
ssh user@SHADOW_IP "systemctl status ollama"

# Check it's listening on 0.0.0.0
ssh user@SHADOW_IP "ss -tlnp | grep 11434"

# If shows 127.0.0.1, re-run the override config
```

### Timeout Errors

```bash
# Check firewall
ssh user@SHADOW_IP "sudo ufw status"

# Open port
ssh user@SHADOW_IP "sudo ufw allow 11434/tcp"

# Test port from local
nc -zv YOUR_SHADOW_IP 11434
```

### Model Not Found

```bash
# List models on Shadow
ssh user@SHADOW_IP "ollama list"

# Pull missing model
ssh user@SHADOW_IP "ollama pull MODEL_NAME"

# Refresh in Rodeo
/models
```

### Out of Memory

```bash
# Check GPU memory
ssh user@SHADOW_IP "nvidia-smi"

# Use smaller model
/model qwen2.5-coder:7b

# Or quantized version
ssh user@SHADOW_IP "ollama pull llama3.1:8b-q4_0"
```

### Ollama Crashed

```bash
# Restart Ollama
ssh user@SHADOW_IP "sudo systemctl restart ollama"

# Check logs
ssh user@SHADOW_IP "journalctl -u ollama -f"
```

---

## Part 7: Performance Tips

### Optimize for Speed

1. **Use appropriate model size** - Don't use 70B model on 16GB GPU
2. **Keep models loaded** - Ollama keeps recently used models in memory
3. **Use quantized models** - `model:q4_0` uses less VRAM, runs faster

### Reduce Latency

```bash
# In Rodeo, enable speed mode
/speed

# Use a fast model
/model llama3.2:3b
```

### Monitor GPU Usage

```bash
# Watch GPU in real-time (on Shadow)
watch -n 1 nvidia-smi

# Or continuous monitoring
nvidia-smi -l 1
```

---

## Part 8: Security Considerations

### Secure the Connection

For production use, consider:

1. **SSH Tunnel** (recommended for security):
```bash
# Create SSH tunnel
ssh -L 11434:localhost:11434 user@SHADOW_IP -N &

# Connect Rodeo to tunnel
/shadow localhost:11434
```

2. **Firewall IP restriction**:
```bash
# Only allow your IP
sudo ufw allow from YOUR_LOCAL_IP to any port 11434
```

3. **VPN**: Use WireGuard or similar between your machine and Shadow

### API Key Protection

Ollama doesn't have built-in auth. For multi-user setups:
- Use a reverse proxy (nginx) with basic auth
- Restrict access by IP
- Use SSH tunnels

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    RODEO + SHADOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  SETUP (on Shadow VPS):                                     │
│    curl -fsSL https://ollama.com/install.sh | sh           │
│    # Then run override config (see above)                   │
│    ollama pull qwen2.5-coder:7b                            │
│                                                             │
│  CONNECT (in Rodeo):                                        │
│    /shadow YOUR_IP:11434                                    │
│    /gpu                                                     │
│    /models                                                  │
│                                                             │
│  DAILY USE:                                                 │
│    rodeo                    # Start CLI                     │
│    /gpu                     # Check connection              │
│    /model MODEL_NAME        # Switch model                  │
│                                                             │
│  TROUBLESHOOT:                                              │
│    /setup                   # Show setup guide              │
│    curl http://IP:11434/api/tags  # Test connection        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

Set these in your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
# Default Shadow URL
export RODEO_SHADOW_URL="http://YOUR_SHADOW_IP:11434"

# Default model
export RODEO_MODEL="qwen2.5-coder:14b"

# Optional: API key for Rodeo server
export RODEO_API_KEY="your-api-key"
```

---

## Next Steps

1. Run `/setup` in Rodeo for interactive guide
2. Check `/gpu` to verify your setup
3. Start coding with GPU acceleration!

For issues, check:
- Shadow VPS: `journalctl -u ollama -f`
- Local: Rodeo error messages
- Network: `curl http://SHADOW_IP:11434/api/tags`
