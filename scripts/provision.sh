#!/bin/bash
# Sadary LLM Hub — VPS Provision Script
# Run on fresh Hostinger VPS (Ubuntu 22.04+)

set -e

echo "🚀 Provisioning Sadary LLM Hub..."

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Install Docker Compose
apt install -y docker-compose-plugin

# Install Cloudflare Tunnel
curl -L --output cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
dpkg -i cloudflared.deb
rm cloudflared.deb

# Create app directory
mkdir -p /opt/llm-hub
cd /opt/llm-hub

echo "✅ Base provisioning complete!"
echo ""
echo "Next steps:"
echo "1. Clone the repo: git clone https://github.com/sadary-dev/llm-hub.git ."
echo "2. Copy .env.example to .env and fill in values"
echo "3. Run: docker compose up -d"
echo "4. Setup Cloudflare Tunnel: cloudflared tunnel login"
