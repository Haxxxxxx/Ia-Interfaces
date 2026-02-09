# Shadow Cloud GPU Setup for Rodeo

Complete guide to set up Ollama on Shadow cloud VPS and connect from your local machine.

---

## Part 1: Shadow VPS Setup

### 1.1 Connect to your Shadow VPS

```bash
# SSH into your Shadow instance
ssh user@YOUR_SHADOW_IP

# Or if using key authentication
ssh -i ~/.ssh/shadow_key user@YOUR_SHADOW_IP
```

### 1.2 Install Ollama on Shadow

```bash
# One-line Ollama installation
curl -fsSL https://ollama.com/install.sh | sh

# Verify installation
ollama --version
```

### 1.3 Configure Ollama for Remote Access

```bash
# Create systemd override for remote access
sudo mkdir -p /etc/systemd/system/ollama.service.d

# Create override config to listen on all interfaces
sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

# Reload and restart Ollama
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Verify it's listening on all interfaces
sudo ss -tlnp | grep 11434
# Should show: 0.0.0.0:11434
```

### 1.4 Open Firewall (if needed)

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 11434/tcp
sudo ufw reload

# Or with iptables
sudo iptables -A INPUT -p tcp --dport 11434 -j ACCEPT

# CentOS/RHEL with firewalld
sudo firewall-cmd --permanent --add-port=11434/tcp
sudo firewall-cmd --reload
```

---

## Part 2: Install LLM Models on Shadow GPU

### 2.1 Check GPU Status

```bash
# Check NVIDIA GPU
nvidia-smi

# Check available VRAM
nvidia-smi --query-gpu=memory.total,memory.free --format=csv
```

### 2.2 Model Installation Commands

Choose models based on your GPU VRAM:

#### For 8GB VRAM
```bash
# Fast coding model (recommended for 8GB)
ollama pull qwen2.5-coder:7b

# Alternative fast models
ollama pull llama3.2:3b
ollama pull deepseek-coder:1.3b
ollama pull phi3:mini
```

#### For 16GB VRAM
```bash
# Best coding model for 16GB
ollama pull qwen2.5-coder:14b

# Good general models
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull codellama:13b
```

#### For 24GB VRAM
```bash
# High quality models
ollama pull qwen2.5:32b
ollama pull deepseek-coder:33b
ollama pull llama3.1:70b-q4_0
ollama pull mixtral:8x7b
```

#### For 48GB+ VRAM (Shadow Ultra)
```bash
# Best quality models
ollama pull qwen2.5:72b
ollama pull llama3.3:70b
ollama pull deepseek-coder:33b
ollama pull codellama:70b
```

### 2.3 Verify Models

```bash
# List installed models
ollama list

# Test a model
ollama run qwen2.5-coder:7b "Write hello world in Python"
```

---

## Part 3: Connect from Local Machine

### 3.1 Test Connection

```bash
# Test from local machine (replace with your Shadow IP)
curl http://YOUR_SHADOW_IP:11434/api/tags

# Should return JSON with your models
```

### 3.2 Configure Rodeo CLI

```bash
# Connect Rodeo to Shadow
rodeo
# Then in Rodeo:
/shadow YOUR_SHADOW_IP:11434

# Or set via environment
export RODEO_OLLAMA_URL=http://YOUR_SHADOW_IP:11434
rodeo
```

### 3.3 Verify in Rodeo

```bash
# In Rodeo CLI, check GPU status
/gpu

# List available models
/models

# Switch to a model on Shadow
/model qwen2.5-coder:14b
```

---

## Part 4: One-Command Setup Scripts

### 4.1 Shadow VPS Setup Script

Run this on your Shadow VPS:

```bash
#!/bin/bash
# shadow-setup.sh - Run on Shadow VPS

set -e

echo "=== Installing Ollama on Shadow VPS ==="

# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Configure for remote access
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
EOF

# Restart Ollama
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Wait for Ollama to start
sleep 3

# Check GPU
echo ""
echo "=== GPU Status ==="
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "No NVIDIA GPU detected"

# Get VRAM
VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)

echo ""
echo "=== Installing recommended models for ${VRAM:-unknown}MB VRAM ==="

if [ -n "$VRAM" ]; then
    if [ "$VRAM" -ge 48000 ]; then
        echo "Installing models for 48GB+ GPU..."
        ollama pull qwen2.5:72b &
        ollama pull llama3.3:70b &
        wait
    elif [ "$VRAM" -ge 24000 ]; then
        echo "Installing models for 24GB GPU..."
        ollama pull qwen2.5:32b &
        ollama pull deepseek-coder:33b &
        wait
    elif [ "$VRAM" -ge 16000 ]; then
        echo "Installing models for 16GB GPU..."
        ollama pull qwen2.5-coder:14b
        ollama pull llama3.1:8b
    else
        echo "Installing models for 8GB GPU..."
        ollama pull qwen2.5-coder:7b
        ollama pull llama3.2:3b
    fi
else
    echo "Installing default models..."
    ollama pull qwen2.5-coder:7b
fi

echo ""
echo "=== Installed Models ==="
ollama list

echo ""
echo "=== Setup Complete ==="
echo "Shadow IP: $(curl -s ifconfig.me)"
echo "Ollama Port: 11434"
echo ""
echo "Connect from Rodeo:"
echo "  /shadow $(curl -s ifconfig.me):11434"
```

### 4.2 Local Connection Script

Run this on your local machine:

```bash
#!/bin/bash
# rodeo-connect-shadow.sh - Run on local machine

SHADOW_IP="${1:-}"

if [ -z "$SHADOW_IP" ]; then
    echo "Usage: $0 <shadow-ip>"
    echo "Example: $0 192.168.1.100"
    exit 1
fi

echo "=== Testing connection to Shadow at $SHADOW_IP ==="

# Test connection
if curl -s --connect-timeout 5 "http://$SHADOW_IP:11434/api/tags" > /dev/null; then
    echo "✓ Connection successful!"

    # Show available models
    echo ""
    echo "=== Available Models ==="
    curl -s "http://$SHADOW_IP:11434/api/tags" | jq -r '.models[].name' 2>/dev/null || \
        curl -s "http://$SHADOW_IP:11434/api/tags"

    # Save to Rodeo config
    echo ""
    echo "=== Configuring Rodeo ==="

    CONFIG_DIR="$HOME/.rodeo"
    CONFIG_FILE="$CONFIG_DIR/config.json"

    mkdir -p "$CONFIG_DIR"

    if [ -f "$CONFIG_FILE" ]; then
        # Update existing config
        if command -v jq &> /dev/null; then
            jq --arg url "http://$SHADOW_IP:11434" '.shadowUrl = $url' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        else
            echo "Install jq for automatic config update, or run in Rodeo:"
            echo "  /shadow $SHADOW_IP:11434"
        fi
    else
        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "apiUrl": "http://localhost:3000",
  "shadowUrl": "http://$SHADOW_IP:11434",
  "model": "qwen2.5-coder:7b",
  "timeout": 120000
}
EOF
    fi

    echo "✓ Shadow URL saved to config"
    echo ""
    echo "Start Rodeo and use:"
    echo "  /gpu      - Check connection status"
    echo "  /models   - List available models"
    echo "  /model <name> - Switch model"

else
    echo "✗ Connection failed!"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check Shadow is running: ssh user@$SHADOW_IP 'systemctl status ollama'"
    echo "2. Check firewall: ssh user@$SHADOW_IP 'sudo ufw status'"
    echo "3. Check Ollama is listening: ssh user@$SHADOW_IP 'ss -tlnp | grep 11434'"
fi
```

---

## Part 5: Quick Reference

### Commands on Shadow VPS

```bash
# Start Ollama
sudo systemctl start ollama

# Stop Ollama
sudo systemctl stop ollama

# Restart Ollama
sudo systemctl restart ollama

# Check status
sudo systemctl status ollama

# View logs
journalctl -u ollama -f

# List models
ollama list

# Pull a model
ollama pull <model-name>

# Remove a model
ollama rm <model-name>

# Check GPU usage
nvidia-smi -l 1
```

### Commands in Rodeo CLI

```bash
# Connect to Shadow
/shadow <ip>:11434

# Check system status
/gpu

# List models
/models

# Switch model
/model qwen2.5-coder:14b

# Reset to local Ollama
/ollama reset
```

### Environment Variables

```bash
# Use Shadow by default
export RODEO_OLLAMA_URL=http://YOUR_SHADOW_IP:11434

# Or in .bashrc/.zshrc
echo 'export RODEO_OLLAMA_URL=http://YOUR_SHADOW_IP:11434' >> ~/.zshrc
```

---

## Troubleshooting

### Connection Refused
```bash
# On Shadow: Check Ollama is listening on 0.0.0.0
ss -tlnp | grep 11434

# Should show: 0.0.0.0:11434, NOT 127.0.0.1:11434
# If wrong, re-run the systemd override setup
```

### Timeout Errors
```bash
# Check firewall on Shadow
sudo ufw status
sudo ufw allow 11434/tcp

# Check if port is open from local
nc -zv YOUR_SHADOW_IP 11434
```

### Out of Memory
```bash
# Check current GPU memory usage
nvidia-smi

# Use a smaller model
/model qwen2.5-coder:7b

# Or use quantized version
ollama pull llama3.1:8b-q4_0
```

### Model Not Found
```bash
# On Shadow, pull the model first
ollama pull <model-name>

# Then refresh in Rodeo
/models
```
