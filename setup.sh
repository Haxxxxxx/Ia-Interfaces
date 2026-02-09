#!/bin/bash
# Rodeo - Quick Setup Script

set -e

echo ""
echo -e "\033[35m  ____           _            \033[0m"
echo -e "\033[35m |  _ \\ ___   __| | ___  ___  \033[0m"
echo -e "\033[35m | |_) / _ \\ / _\` |/ _ \\/ _ \\ \033[0m"
echo -e "\033[35m |  _ < (_) | (_| |  __/ (_) |\033[0m"
echo -e "\033[35m |_| \\_\\___/ \\__,_|\\___|\\___/ \033[0m"
echo ""
echo "Setting up Rodeo..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required. Install from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required (you have $(node -v))"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# Check Ollama
if command -v ollama &> /dev/null; then
    echo "✓ Ollama installed"
else
    echo "⚠ Ollama not installed. Installing..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install ollama
    else
        curl -fsSL https://ollama.ai/install.sh | sh
    fi
fi

# Install app dependencies
echo ""
echo "Installing app dependencies..."
cd "$(dirname "$0")/app"
npm install --silent

# Install CLI dependencies
echo "Installing CLI dependencies..."
cd ../cli
npm install --silent 2>/dev/null || true

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
    echo ""
    echo "Starting Ollama..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
fi

# Pull model if not exists
if ! ollama list 2>/dev/null | grep -q "qwen2.5:7b"; then
    echo "Pulling qwen2.5:7b model (this may take a few minutes)..."
    ollama pull qwen2.5:7b
fi
echo "✓ Model qwen2.5:7b ready"

# Create API keys
echo ""
echo "Creating API keys..."
cd ../app
npx tsx scripts/seed-team.ts 2>/dev/null || echo "Keys may already exist"

echo ""
echo -e "\033[32m✓ Setup complete!\033[0m"
echo ""
echo "To start Rodeo:"
echo ""
echo "  1. Start the server:"
echo "     cd app && npm run dev"
echo ""
echo "  2. Open web UI:"
echo "     http://localhost:3000"
echo ""
echo "  3. Or use CLI:"
echo "     cd cli && RODEO_API_KEY=\"rodeo-vincent-xxx\" npx tsx rodeo.ts"
echo ""
