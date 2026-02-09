#!/bin/bash
# Quick Figma MCP Setup for Rodeo CLI
# Usage: ./setup-figma.sh <your-figma-token>

set -e

RODEO_DIR="$HOME/.rodeo"
MCP_CONFIG="$RODEO_DIR/mcp.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ____           _            ${NC}"
echo -e "${CYAN} |  _ \\ ___   __| | ___  ___  ${NC}"
echo -e "${CYAN} | |_) / _ \\ / _\` |/ _ \\/ _ \\ ${NC}"
echo -e "${CYAN} |  _ < (_) | (_| |  __/ (_) |${NC}"
echo -e "${CYAN} |_| \\_\\___/ \\__,_|\\___|\\___/ ${NC}"
echo ""
echo -e "${YELLOW}Figma MCP Setup${NC}"
echo ""

# Check for token argument
if [ -z "$1" ]; then
    echo "Usage: ./setup-figma.sh <figma-token>"
    echo ""
    echo "To get your token:"
    echo "  1. Go to https://www.figma.com/settings"
    echo "  2. Scroll to 'Personal Access Tokens'"
    echo "  3. Click 'Generate new token'"
    echo "  4. Copy the token (starts with figd_)"
    echo ""
    exit 1
fi

FIGMA_TOKEN="$1"

# Create config directory
mkdir -p "$RODEO_DIR"

# Check if config exists
if [ -f "$MCP_CONFIG" ]; then
    # Update existing config
    echo "Updating existing MCP configuration..."

    # Use node to safely update JSON
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$MCP_CONFIG', 'utf-8'));

// Find or create Figma server
const figmaIdx = config.servers.findIndex(s => s.type === 'figma');
const figmaServer = {
    name: 'Figma',
    type: 'figma',
    enabled: true,
    apiKey: '$FIGMA_TOKEN'
};

if (figmaIdx >= 0) {
    config.servers[figmaIdx] = figmaServer;
} else {
    config.servers.push(figmaServer);
}

fs.writeFileSync('$MCP_CONFIG', JSON.stringify(config, null, 2));
console.log('Updated!');
"
else
    # Create new config
    echo "Creating new MCP configuration..."
    cat > "$MCP_CONFIG" << EOF
{
  "servers": [
    {
      "name": "Figma",
      "type": "figma",
      "enabled": true,
      "apiKey": "$FIGMA_TOKEN"
    }
  ]
}
EOF
fi

echo ""
echo -e "${GREEN}✓ Figma connected successfully!${NC}"
echo ""
echo "Quick test commands:"
echo -e "  ${CYAN}/figma files${NC}              - List your recent files"
echo -e "  ${CYAN}/figma components <key>${NC}   - List components in a file"
echo -e "  ${CYAN}/figma styles <key>${NC}       - Get design tokens"
echo ""
echo "Start the CLI with: ./run.sh"
echo ""
