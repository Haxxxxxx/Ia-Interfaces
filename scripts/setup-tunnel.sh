#!/bin/bash
# Sadary LLM Hub — Cloudflare Tunnel Setup
# Run after cloudflared is installed

set -e

TUNNEL_NAME=${1:-"llm-hub"}
DOMAIN=${2:-"llm.sadary.xyz"}

echo "🌐 Setting up Cloudflare Tunnel..."

# Login (opens browser)
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create $TUNNEL_NAME

# Get tunnel ID
TUNNEL_ID=$(cloudflared tunnel list | grep $TUNNEL_NAME | awk '{print $1}')

echo "Tunnel ID: $TUNNEL_ID"

# Create config
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml << EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json

ingress:
  - hostname: $DOMAIN
    service: http://localhost:3000
    originRequest:
      connectTimeout: 10s
      keepAliveTimeout: 120s
      keepAliveConnections: 100
  - service: http_status:404
EOF

# Route DNS
cloudflared tunnel route dns $TUNNEL_NAME $DOMAIN

# Install as service
cloudflared service install
systemctl enable cloudflared
systemctl start cloudflared

echo "✅ Tunnel setup complete!"
echo "Domain: $DOMAIN"
cloudflared tunnel info $TUNNEL_NAME
