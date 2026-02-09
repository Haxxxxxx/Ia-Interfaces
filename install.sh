#!/bin/bash
# Rodeo - One-Line Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/your-repo/rodeo/main/install.sh | bash

set -e

# Colors
PURPLE='\033[35m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
DIM='\033[2m'
NC='\033[0m'

echo ""
echo -e "${PURPLE}  ____           _            ${NC}"
echo -e "${PURPLE} |  _ \\ ___   __| | ___  ___  ${NC}"
echo -e "${PURPLE} | |_) / _ \\ / _\` |/ _ \\/ _ \\ ${NC}"
echo -e "${PURPLE} |  _ < (_) | (_| |  __/ (_) |${NC}"
echo -e "${PURPLE} |_| \\_\\___/ \\__,_|\\___|\\___/ ${NC}"
echo ""
echo -e "${DIM}Self-hosted AI Coding Assistant${NC}"
echo ""

# Detect OS
OS=$(uname -s)
ARCH=$(uname -m)
echo -e "${PURPLE}System:${NC} $OS $ARCH"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗${NC} Node.js not found"
    echo ""
    echo "Install Node.js first:"
    if [[ "$OS" == "Darwin" ]]; then
        echo "  brew install node"
    else
        echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        echo "  sudo apt-get install -y nodejs"
    fi
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗${NC} Node.js 18+ required (you have $(node -v))"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"

# Check/Install Ollama
if ! command -v ollama &> /dev/null; then
    echo -e "${YELLOW}!${NC} Installing Ollama..."
    if [[ "$OS" == "Darwin" ]]; then
        brew install ollama 2>/dev/null || curl -fsSL https://ollama.ai/install.sh | sh
    else
        curl -fsSL https://ollama.ai/install.sh | sh
    fi
fi
echo -e "${GREEN}✓${NC} Ollama installed"

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
    echo -e "${DIM}Starting Ollama...${NC}"
    if [[ "$OS" == "Darwin" ]]; then
        open -a Ollama 2>/dev/null || (ollama serve > /dev/null 2>&1 &)
    else
        ollama serve > /dev/null 2>&1 &
    fi
    sleep 3
fi
echo -e "${GREEN}✓${NC} Ollama running"

# Pull default model
if ! ollama list 2>/dev/null | grep -q "qwen2.5:7b"; then
    echo -e "${DIM}Pulling qwen2.5:7b (4.7GB)...${NC}"
    ollama pull qwen2.5:7b
fi
echo -e "${GREEN}✓${NC} Model qwen2.5:7b ready"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install dependencies
echo -e "${DIM}Installing dependencies...${NC}"
cd "$SCRIPT_DIR/app"
npm install --silent 2>/dev/null

cd "$SCRIPT_DIR/cli"
npm install --silent 2>/dev/null

# Initialize database and create API keys
cd "$SCRIPT_DIR/app"
npm run db:push 2>/dev/null || true

echo ""
echo -e "${DIM}Creating API keys...${NC}"
npx tsx scripts/seed-team.ts 2>/dev/null | grep -E "(API Key:|Vincent|Pauline|Remi|Dev)" | head -20

echo ""
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo -e "${PURPLE}Quick Start:${NC}"
echo ""
echo "  1. Start the server:"
echo -e "     cd $SCRIPT_DIR/app && npm run dev"
echo ""
echo "  2. In another terminal, run CLI:"
echo -e "     cd $SCRIPT_DIR/cli"
echo -e "     RODEO_API_KEY=\"your-key\" npx tsx rodeo.ts"
echo ""
echo "  3. Or open web UI:"
echo -e "     open http://localhost:3000"
echo ""
