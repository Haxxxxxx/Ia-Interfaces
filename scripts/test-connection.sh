#!/bin/bash
# =============================================================================
# Connection Test Script
# Run this locally to verify your VPS connection is working
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "╭────────────────────────────────────────────────────────────────╮"
echo "│                 VPS Connection Test                            │"
echo "╰────────────────────────────────────────────────────────────────╯"
echo ""

# Load config
CONFIG_FILE="$HOME/.rodeo/config.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${RED}Config file not found: $CONFIG_FILE${NC}"
  echo ""
  echo "Create it with:"
  echo ""
  echo "mkdir -p ~/.rodeo"
  echo 'cat > ~/.rodeo/config.json << EOF'
  echo '{'
  echo '  "apiUrl": "https://your-domain.com",'
  echo '  "apiKey": "your-api-key",'
  echo '  "model": "qwen2.5:7b"'
  echo '}'
  echo 'EOF'
  exit 1
fi

# Parse config
API_URL=$(cat "$CONFIG_FILE" | grep -o '"apiUrl"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
API_KEY=$(cat "$CONFIG_FILE" | grep -o '"apiKey"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
MODEL=$(cat "$CONFIG_FILE" | grep -o '"model"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

echo -e "${CYAN}Config:${NC}"
echo "  API URL: $API_URL"
echo "  API Key: ${API_KEY:0:10}..."
echo "  Model:   $MODEL"
echo ""

# =============================================================================
# Test 1: Health Check
# =============================================================================
echo -e "${YELLOW}[1/4] Health Check...${NC}"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/health" 2>/dev/null || echo "FAILED")
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ API is healthy${NC}"
  echo "  $BODY"
else
  echo -e "${RED}✗ Health check failed (HTTP $HTTP_CODE)${NC}"
  echo "  $BODY"
fi
echo ""

# =============================================================================
# Test 2: Models Endpoint
# =============================================================================
echo -e "${YELLOW}[2/4] Fetching available models...${NC}"
MODELS_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $API_KEY" \
  "$API_URL/api/models" 2>/dev/null || echo "FAILED")
HTTP_CODE=$(echo "$MODELS_RESPONSE" | tail -n1)
BODY=$(echo "$MODELS_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Models endpoint working${NC}"
  # Pretty print models if jq is available
  if command -v jq &> /dev/null; then
    echo "$BODY" | jq -r '.data[]? | "  - \(.id) (\(.provider // "ollama"))"' 2>/dev/null || echo "  $BODY"
  else
    echo "  $BODY"
  fi
else
  echo -e "${RED}✗ Models fetch failed (HTTP $HTTP_CODE)${NC}"
  echo "  $BODY"
fi
echo ""

# =============================================================================
# Test 3: Auth Check
# =============================================================================
echo -e "${YELLOW}[3/4] Testing authentication...${NC}"
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[]}' \
  "$API_URL/api/v1/chat/completions" 2>/dev/null || echo "FAILED")
HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "400" ]; then
  echo -e "${GREEN}✓ Authentication working${NC}"
elif [ "$HTTP_CODE" = "401" ]; then
  echo -e "${RED}✗ Authentication failed - check your API key${NC}"
else
  echo -e "${YELLOW}? Unexpected response (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# =============================================================================
# Test 4: Chat Completion
# =============================================================================
echo -e "${YELLOW}[4/4] Testing chat completion with $MODEL...${NC}"
echo "  Sending: 'Say hello in exactly 3 words'"
echo ""

CHAT_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [{\"role\": \"user\", \"content\": \"Say hello in exactly 3 words\"}],
    \"stream\": false,
    \"max_tokens\": 50
  }" \
  "$API_URL/api/v1/chat/completions" 2>/dev/null || echo "FAILED")

HTTP_CODE=$(echo "$CHAT_RESPONSE" | tail -n1)
BODY=$(echo "$CHAT_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Chat completion working!${NC}"
  if command -v jq &> /dev/null; then
    CONTENT=$(echo "$BODY" | jq -r '.choices[0].message.content' 2>/dev/null)
    echo -e "  ${CYAN}Response: $CONTENT${NC}"
  else
    echo "  $BODY"
  fi
else
  echo -e "${RED}✗ Chat completion failed (HTTP $HTTP_CODE)${NC}"
  echo "  $BODY"
fi

echo ""
echo "╭────────────────────────────────────────────────────────────────╮"
echo "│                    Test Complete                               │"
echo "╰────────────────────────────────────────────────────────────────╯"
