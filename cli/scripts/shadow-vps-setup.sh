#!/bin/bash
# =============================================================================
# Shadow VPS Setup Script for Rodeo
# Run this script on your Shadow cloud VPS to set up Ollama with GPU support
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
ORANGE='\033[38;5;208m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo -e "${ORANGE}"
echo "╭────────────────────────────────────────────────────────────╮"
echo "│                                                            │"
echo "│   ██████   ██████  ██████  ███████  ██████                 │"
echo "│   ██   ██ ██    ██ ██   ██ ██      ██    ██                │"
echo "│   ██████  ██    ██ ██   ██ █████   ██    ██                │"
echo "│   ██   ██ ██    ██ ██   ██ ██      ██    ██                │"
echo "│   ██   ██  ██████  ██████  ███████  ██████                 │"
echo "│                                                            │"
echo "│   Shadow VPS Setup                                         │"
echo "╰────────────────────────────────────────────────────────────╯"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    SUDO=""
else
    SUDO="sudo"
fi

echo -e "${BOLD}Step 1: Checking GPU${NC}"
echo "─────────────────────────────────────────"

if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    GPU_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    echo -e "${GREEN}✓${NC} GPU detected: ${BLUE}$GPU_NAME${NC}"
    echo -e "  VRAM: ${YELLOW}${GPU_VRAM}MB${NC}"
else
    echo -e "${YELLOW}⚠${NC} No NVIDIA GPU detected (will use CPU)"
    GPU_VRAM=0
fi

echo ""
echo -e "${BOLD}Step 2: Installing Ollama${NC}"
echo "─────────────────────────────────────────"

if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✓${NC} Ollama already installed: $(ollama --version)"
else
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo -e "${GREEN}✓${NC} Ollama installed"
fi

echo ""
echo -e "${BOLD}Step 3: Configuring Remote Access${NC}"
echo "─────────────────────────────────────────"

# Create systemd override for remote access
$SUDO mkdir -p /etc/systemd/system/ollama.service.d

$SUDO tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_ORIGINS=*"
EOF

echo -e "${GREEN}✓${NC} Configured Ollama to listen on all interfaces"

# Reload and restart
$SUDO systemctl daemon-reload
$SUDO systemctl enable ollama
$SUDO systemctl restart ollama

echo -e "${GREEN}✓${NC} Ollama service restarted"

# Wait for Ollama to start
echo "Waiting for Ollama to start..."
sleep 3

# Verify it's listening
if ss -tlnp 2>/dev/null | grep -q "0.0.0.0:11434"; then
    echo -e "${GREEN}✓${NC} Ollama listening on 0.0.0.0:11434"
else
    echo -e "${YELLOW}⚠${NC} Checking with netstat..."
    netstat -tlnp 2>/dev/null | grep 11434 || echo "Port check inconclusive"
fi

echo ""
echo -e "${BOLD}Step 4: Configuring Firewall${NC}"
echo "─────────────────────────────────────────"

# Try ufw first, then firewalld
if command -v ufw &> /dev/null; then
    $SUDO ufw allow 11434/tcp 2>/dev/null && echo -e "${GREEN}✓${NC} Firewall rule added (ufw)" || echo -e "${YELLOW}⚠${NC} Could not add ufw rule"
elif command -v firewall-cmd &> /dev/null; then
    $SUDO firewall-cmd --permanent --add-port=11434/tcp 2>/dev/null && \
    $SUDO firewall-cmd --reload && \
    echo -e "${GREEN}✓${NC} Firewall rule added (firewalld)" || echo -e "${YELLOW}⚠${NC} Could not add firewalld rule"
else
    echo -e "${YELLOW}⚠${NC} No firewall detected (ufw/firewalld)"
fi

echo ""
echo -e "${BOLD}Step 5: Installing Models${NC}"
echo "─────────────────────────────────────────"

# Determine which models to install based on VRAM
if [ "$GPU_VRAM" -ge 48000 ] 2>/dev/null; then
    echo "Installing models for 48GB+ GPU (high quality)..."
    MODELS=("qwen2.5:72b" "llama3.3:70b")
elif [ "$GPU_VRAM" -ge 24000 ] 2>/dev/null; then
    echo "Installing models for 24GB GPU..."
    MODELS=("qwen2.5:32b" "deepseek-coder:33b" "qwen2.5-coder:14b")
elif [ "$GPU_VRAM" -ge 16000 ] 2>/dev/null; then
    echo "Installing models for 16GB GPU..."
    MODELS=("qwen2.5-coder:14b" "llama3.1:8b" "mistral:7b")
elif [ "$GPU_VRAM" -ge 8000 ] 2>/dev/null; then
    echo "Installing models for 8GB GPU..."
    MODELS=("qwen2.5-coder:7b" "llama3.2:3b")
else
    echo "Installing default models..."
    MODELS=("qwen2.5-coder:7b")
fi

for model in "${MODELS[@]}"; do
    echo -e "\n${BLUE}Pulling $model...${NC}"
    ollama pull "$model" && echo -e "${GREEN}✓${NC} $model installed" || echo -e "${RED}✗${NC} Failed to pull $model"
done

echo ""
echo -e "${BOLD}Step 6: Verification${NC}"
echo "─────────────────────────────────────────"

echo -e "\n${BOLD}Installed Models:${NC}"
ollama list

# Get public IP
PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || curl -s --connect-timeout 5 icanhazip.com 2>/dev/null || echo "unknown")
PRIVATE_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "unknown")

echo ""
echo -e "${ORANGE}╭────────────────────────────────────────────────────────────╮${NC}"
echo -e "${ORANGE}│${NC}  ${BOLD}${GREEN}Setup Complete!${NC}                                          ${ORANGE}│${NC}"
echo -e "${ORANGE}├────────────────────────────────────────────────────────────┤${NC}"
echo -e "${ORANGE}│${NC}                                                            ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}  ${BOLD}Connection Info:${NC}                                         ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}    Public IP:  ${BLUE}$PUBLIC_IP${NC}                              ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}    Private IP: ${BLUE}$PRIVATE_IP${NC}                                ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}    Port:       ${YELLOW}11434${NC}                                      ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}                                                            ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}  ${BOLD}Connect from Rodeo:${NC}                                      ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}    /shadow ${PUBLIC_IP}:11434                          ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}                                                            ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}  ${BOLD}Test connection:${NC}                                         ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}    curl http://${PUBLIC_IP}:11434/api/tags              ${ORANGE}│${NC}"
echo -e "${ORANGE}│${NC}                                                            ${ORANGE}│${NC}"
echo -e "${ORANGE}╰────────────────────────────────────────────────────────────╯${NC}"
echo ""
