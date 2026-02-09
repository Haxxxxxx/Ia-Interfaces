#!/bin/bash
# =============================================================================
# Connect to Shadow Cloud GPU from Local Machine
# Run this script to connect Rodeo to your Shadow VPS running Ollama
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
ORANGE='\033[38;5;208m'
NC='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'

SHADOW_IP="${1:-}"
SHADOW_PORT="${2:-11434}"

echo -e "${ORANGE}"
echo "╭─────────────────────────────────────────╮"
echo "│  Rodeo - Connect to Shadow Cloud GPU   │"
echo "╰─────────────────────────────────────────╯"
echo -e "${NC}"

# Interactive mode if no IP provided
if [ -z "$SHADOW_IP" ]; then
    echo -e "${BOLD}Enter your Shadow VPS details:${NC}"
    echo ""
    read -p "Shadow IP address: " SHADOW_IP
    read -p "Port [11434]: " input_port
    SHADOW_PORT="${input_port:-11434}"
fi

if [ -z "$SHADOW_IP" ]; then
    echo -e "${RED}Error: No IP address provided${NC}"
    echo ""
    echo "Usage: $0 <shadow-ip> [port]"
    echo "Example: $0 192.168.1.100"
    echo "         $0 shadow.example.com 11434"
    exit 1
fi

SHADOW_URL="http://${SHADOW_IP}:${SHADOW_PORT}"

echo ""
echo -e "${BOLD}Testing connection to ${BLUE}${SHADOW_URL}${NC}..."
echo "─────────────────────────────────────────"

# Test connection
if curl -s --connect-timeout 10 "${SHADOW_URL}/api/tags" > /tmp/shadow_models.json 2>/dev/null; then
    echo -e "${GREEN}✓${NC} Connection successful!"
    echo ""

    # Parse and show models
    echo -e "${BOLD}Available Models:${NC}"
    if command -v jq &> /dev/null; then
        jq -r '.models[] | "  \(.name) (\(.size / 1024 / 1024 / 1024 | floor)GB)"' /tmp/shadow_models.json 2>/dev/null || \
        jq -r '.models[].name' /tmp/shadow_models.json 2>/dev/null || \
        cat /tmp/shadow_models.json
    else
        echo -e "${DIM}  (install jq for formatted output)${NC}"
        cat /tmp/shadow_models.json
    fi

    rm -f /tmp/shadow_models.json

    echo ""
    echo -e "${BOLD}Saving configuration...${NC}"
    echo "─────────────────────────────────────────"

    # Save to Rodeo config
    CONFIG_DIR="$HOME/.rodeo"
    CONFIG_FILE="$CONFIG_DIR/config.json"

    mkdir -p "$CONFIG_DIR"

    if [ -f "$CONFIG_FILE" ]; then
        # Backup existing config
        cp "$CONFIG_FILE" "$CONFIG_FILE.bak"

        if command -v jq &> /dev/null; then
            # Update with jq
            jq --arg url "$SHADOW_URL" '.shadowUrl = $url' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && \
            mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
            echo -e "${GREEN}✓${NC} Updated existing config"
        else
            # Manual update (simple approach)
            if grep -q "shadowUrl" "$CONFIG_FILE"; then
                sed -i.bak "s|\"shadowUrl\":.*|\"shadowUrl\": \"$SHADOW_URL\",|" "$CONFIG_FILE"
            else
                # Add shadowUrl before the last }
                sed -i.bak "s|}$|,\"shadowUrl\": \"$SHADOW_URL\"}|" "$CONFIG_FILE"
            fi
            echo -e "${GREEN}✓${NC} Updated existing config"
        fi
    else
        # Create new config
        cat > "$CONFIG_FILE" << EOF
{
  "apiUrl": "http://localhost:3000",
  "shadowUrl": "$SHADOW_URL",
  "model": "qwen2.5-coder:7b",
  "timeout": 120000
}
EOF
        echo -e "${GREEN}✓${NC} Created new config"
    fi

    echo -e "${GREEN}✓${NC} Shadow URL saved: ${BLUE}${SHADOW_URL}${NC}"

    echo ""
    echo -e "${ORANGE}╭─────────────────────────────────────────╮${NC}"
    echo -e "${ORANGE}│${NC}  ${GREEN}Connected to Shadow Cloud GPU!${NC}         ${ORANGE}│${NC}"
    echo -e "${ORANGE}├─────────────────────────────────────────┤${NC}"
    echo -e "${ORANGE}│${NC}                                         ${ORANGE}│${NC}"
    echo -e "${ORANGE}│${NC}  Start Rodeo and use:                   ${ORANGE}│${NC}"
    echo -e "${ORANGE}│${NC}    ${BLUE}/gpu${NC}     - Check GPU status          ${ORANGE}│${NC}"
    echo -e "${ORANGE}│${NC}    ${BLUE}/models${NC}  - List available models     ${ORANGE}│${NC}"
    echo -e "${ORANGE}│${NC}    ${BLUE}/model${NC}   - Switch model              ${ORANGE}│${NC}"
    echo -e "${ORANGE}│${NC}                                         ${ORANGE}│${NC}"
    echo -e "${ORANGE}╰─────────────────────────────────────────╯${NC}"

else
    echo -e "${RED}✗${NC} Connection failed!"
    echo ""
    echo -e "${BOLD}Troubleshooting:${NC}"
    echo ""
    echo "1. Check Shadow VPS is running:"
    echo -e "   ${DIM}ssh user@${SHADOW_IP} 'systemctl status ollama'${NC}"
    echo ""
    echo "2. Check Ollama is listening on all interfaces:"
    echo -e "   ${DIM}ssh user@${SHADOW_IP} 'ss -tlnp | grep 11434'${NC}"
    echo -e "   ${DIM}Should show: 0.0.0.0:11434 (not 127.0.0.1:11434)${NC}"
    echo ""
    echo "3. Check firewall allows port 11434:"
    echo -e "   ${DIM}ssh user@${SHADOW_IP} 'sudo ufw allow 11434/tcp'${NC}"
    echo ""
    echo "4. Run setup script on Shadow VPS:"
    echo -e "   ${DIM}ssh user@${SHADOW_IP}${NC}"
    echo -e "   ${DIM}curl -fsSL https://raw.githubusercontent.com/.../shadow-vps-setup.sh | bash${NC}"
    echo ""
    exit 1
fi
