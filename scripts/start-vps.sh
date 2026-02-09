#!/bin/bash
# =============================================================================
# Start VPS Services
# Run this on the VPS to start all services
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/llm-hub"

echo -e "${YELLOW}Starting Ollama...${NC}"
systemctl start ollama
sleep 2

echo -e "${YELLOW}Starting Next.js app...${NC}"
cd "$APP_DIR/app"

# Check if using PM2
if command -v pm2 &> /dev/null; then
  pm2 start npm --name "llm-hub" -- start
  pm2 save
else
  # Run in background with nohup
  nohup npm start > /var/log/llm-hub.log 2>&1 &
  echo $! > /var/run/llm-hub.pid
fi

echo -e "${YELLOW}Starting Cloudflare Tunnel...${NC}"
systemctl start cloudflared

echo ""
echo -e "${GREEN}All services started!${NC}"
echo ""
echo "Check status:"
echo "  systemctl status ollama"
echo "  systemctl status cloudflared"
echo "  curl http://localhost:3000/api/health"
