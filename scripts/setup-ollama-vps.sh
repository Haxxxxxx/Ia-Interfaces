#!/bin/bash
# =============================================================================
# Ollama VPS Setup Script
# Run this on a fresh Ubuntu 22.04+ VPS to set up local LLM inference
# =============================================================================

set -e

echo "╭────────────────────────────────────────────────────────────────╮"
echo "│            Ollama VPS Setup for Rodeo/Sadary Hub               │"
echo "╰────────────────────────────────────────────────────────────────╯"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# =============================================================================
# 1. System Update
# =============================================================================
echo -e "${YELLOW}[1/6] Updating system...${NC}"
apt update && apt upgrade -y
apt install -y curl git htop jq

# =============================================================================
# 2. Install Ollama
# =============================================================================
echo -e "${YELLOW}[2/6] Installing Ollama...${NC}"
curl -fsSL https://ollama.com/install.sh | sh

# Configure Ollama to listen on all interfaces
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf << 'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_ORIGINS=*"
EOF

systemctl daemon-reload
systemctl enable ollama
systemctl restart ollama

# Wait for Ollama to start
echo "Waiting for Ollama to start..."
sleep 5

# =============================================================================
# 3. Pull Default Models
# =============================================================================
echo -e "${YELLOW}[3/6] Pulling default models...${NC}"
echo "This may take a while depending on your connection..."

# Detect available RAM
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
echo "Detected ${TOTAL_RAM}GB RAM"

# Pull appropriate models based on RAM
if [ "$TOTAL_RAM" -ge 48 ]; then
  echo "Pulling large models (48GB+ RAM detected)..."
  ollama pull qwen2.5:72b
  ollama pull llama3.3:70b
elif [ "$TOTAL_RAM" -ge 24 ]; then
  echo "Pulling medium models (24GB+ RAM detected)..."
  ollama pull qwen2.5:32b
  ollama pull qwen2.5-coder:7b
elif [ "$TOTAL_RAM" -ge 16 ]; then
  echo "Pulling standard models (16GB+ RAM detected)..."
  ollama pull qwen2.5:14b
  ollama pull qwen2.5-coder:7b
else
  echo "Pulling light models (8GB RAM detected)..."
  ollama pull qwen2.5:7b
  ollama pull qwen2.5-coder:7b
fi

# Always pull the fast 7b model
ollama pull qwen2.5:7b

echo -e "${GREEN}Models pulled:${NC}"
ollama list

# =============================================================================
# 4. Install Node.js
# =============================================================================
echo -e "${YELLOW}[4/6] Installing Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# =============================================================================
# 5. Setup App Directory
# =============================================================================
echo -e "${YELLOW}[5/6] Setting up application...${NC}"
APP_DIR="/opt/llm-hub"

if [ ! -d "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  echo "Please clone your repo to $APP_DIR"
  echo "  git clone https://github.com/YOUR_USERNAME/Ia-Interfaces.git $APP_DIR"
else
  echo "App directory exists at $APP_DIR"
fi

# Create data directory
mkdir -p "$APP_DIR/app/data"

# Create .env template
cat > "$APP_DIR/app/.env.example" << 'EOF'
# =============================================================================
# LLM Hub Environment Configuration
# =============================================================================

# Database (SQLite)
DATABASE_URL=file:./data/llmhub.db

# Ollama (local inference - FREE)
OLLAMA_URL=http://localhost:11434/v1

# Moonshot API (cloud inference - PAID)
# Uncomment and add your key to use Kimi K2.5
# MOONSHOT_API_KEY=sk-your-moonshot-api-key

# Default model (Ollama model ID)
DEFAULT_MODEL=qwen2.5:7b

# App settings
NODE_ENV=production
PORT=3000

# Rate limiting
DEFAULT_MONTHLY_BUDGET_USD=50.0
DEFAULT_RPM_LIMIT=60
EOF

echo "Created .env.example at $APP_DIR/app/.env.example"
echo "Copy it to .env and configure your settings"

# =============================================================================
# 6. Install Cloudflared (optional)
# =============================================================================
echo -e "${YELLOW}[6/6] Installing Cloudflared...${NC}"
curl -L --output /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i /tmp/cloudflared.deb
rm /tmp/cloudflared.deb

echo ""
echo "╭────────────────────────────────────────────────────────────────╮"
echo "│                    Setup Complete!                             │"
echo "╰────────────────────────────────────────────────────────────────╯"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo ""
echo "1. Clone your repo (if not already done):"
echo "   git clone https://github.com/YOUR_USERNAME/Ia-Interfaces.git $APP_DIR"
echo ""
echo "2. Configure the app:"
echo "   cd $APP_DIR/app"
echo "   cp .env.example .env"
echo "   nano .env  # Edit with your settings"
echo ""
echo "3. Install dependencies and build:"
echo "   npm install"
echo "   npm run build"
echo ""
echo "4. Start the app:"
echo "   npm start"
echo ""
echo "5. (Optional) Set up Cloudflare Tunnel:"
echo "   cloudflared tunnel login"
echo "   cloudflared tunnel create llm-hub"
echo "   # See docs/VPS-QUICKSTART.md for full instructions"
echo ""
echo -e "${GREEN}Test Ollama:${NC}"
echo "   curl http://localhost:11434/api/tags"
echo ""
echo -e "${GREEN}Available models:${NC}"
ollama list
