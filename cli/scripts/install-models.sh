#!/bin/bash
# =============================================================================
# Model Installation Script for Ollama
# Installs recommended models based on available GPU VRAM
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
ORANGE='\033[38;5;208m'
NC='\033[0m'
BOLD='\033[1m'

echo -e "${ORANGE}"
echo "╭─────────────────────────────────────────╮"
echo "│  Rodeo - Install LLM Models            │"
echo "╰─────────────────────────────────────────╯"
echo -e "${NC}"

# Check if Ollama is running
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}Error: Ollama is not installed${NC}"
    echo "Install with: curl -fsSL https://ollama.com/install.sh | sh"
    exit 1
fi

# Get GPU VRAM
if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    GPU_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    echo -e "GPU: ${BLUE}$GPU_NAME${NC} (${YELLOW}${GPU_VRAM}MB${NC} VRAM)"
else
    # Check for Apple Silicon
    if [[ $(uname -m) == "arm64" ]] && [[ $(uname) == "Darwin" ]]; then
        MEM_BYTES=$(sysctl -n hw.memsize 2>/dev/null)
        GPU_VRAM=$((MEM_BYTES / 1024 / 1024))
        echo -e "GPU: ${BLUE}Apple Silicon${NC} (${YELLOW}${GPU_VRAM}MB${NC} unified memory)"
    else
        echo -e "${YELLOW}No GPU detected, using CPU mode${NC}"
        GPU_VRAM=0
    fi
fi

echo ""

# Define model sets
declare -A MODEL_SETS
MODEL_SETS["coding"]="qwen2.5-coder:7b qwen2.5-coder:14b deepseek-coder:6.7b codellama:7b"
MODEL_SETS["general"]="llama3.2:3b llama3.1:8b mistral:7b"
MODEL_SETS["large"]="qwen2.5:32b llama3.3:70b deepseek-coder:33b"
MODEL_SETS["fast"]="llama3.2:3b phi3:mini qwen2.5:1.5b"

# Interactive selection
echo -e "${BOLD}Select model set to install:${NC}"
echo ""
echo "  1) ${BLUE}coding${NC}   - Best for code (qwen2.5-coder, deepseek-coder)"
echo "  2) ${BLUE}general${NC}  - General purpose (llama3, mistral)"
echo "  3) ${BLUE}fast${NC}     - Fastest models (small, quick responses)"
echo "  4) ${BLUE}large${NC}    - High quality (requires 24GB+ VRAM)"
echo "  5) ${BLUE}auto${NC}     - Auto-select based on VRAM"
echo "  6) ${BLUE}custom${NC}   - Enter model names manually"
echo ""

read -p "Choice [5]: " choice
choice="${choice:-5}"

case $choice in
    1) MODELS="${MODEL_SETS[coding]}" ;;
    2) MODELS="${MODEL_SETS[general]}" ;;
    3) MODELS="${MODEL_SETS[fast]}" ;;
    4) MODELS="${MODEL_SETS[large]}" ;;
    5)
        # Auto-select based on VRAM
        if [ "$GPU_VRAM" -ge 48000 ] 2>/dev/null; then
            MODELS="qwen2.5:72b llama3.3:70b qwen2.5-coder:14b"
        elif [ "$GPU_VRAM" -ge 24000 ] 2>/dev/null; then
            MODELS="qwen2.5:32b qwen2.5-coder:14b deepseek-coder:33b"
        elif [ "$GPU_VRAM" -ge 16000 ] 2>/dev/null; then
            MODELS="qwen2.5-coder:14b llama3.1:8b mistral:7b"
        elif [ "$GPU_VRAM" -ge 8000 ] 2>/dev/null; then
            MODELS="qwen2.5-coder:7b llama3.2:3b deepseek-coder:1.3b"
        else
            MODELS="llama3.2:3b phi3:mini"
        fi
        ;;
    6)
        echo ""
        echo "Enter model names (space-separated):"
        echo "Examples: qwen2.5-coder:7b llama3.1:8b mistral:7b"
        read -p "> " MODELS
        ;;
    *)
        echo "Invalid choice"
        exit 1
        ;;
esac

echo ""
echo -e "${BOLD}Installing models:${NC}"
echo "─────────────────────────────────────────"

for model in $MODELS; do
    echo ""
    echo -e "${BLUE}Pulling ${model}...${NC}"

    if ollama pull "$model"; then
        echo -e "${GREEN}✓${NC} ${model} installed"
    else
        echo -e "${RED}✗${NC} Failed to install ${model}"
    fi
done

echo ""
echo -e "${BOLD}Installed Models:${NC}"
echo "─────────────────────────────────────────"
ollama list

echo ""
echo -e "${GREEN}Done!${NC} Use ${BLUE}/models${NC} in Rodeo to see available models."
