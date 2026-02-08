#!/bin/bash
# Sadary LLM Hub — Deploy Script
# Run from /opt/llm-hub on VPS

set -e

echo "📦 Deploying Sadary LLM Hub..."

# Pull latest
git pull origin main

# Rebuild and restart
docker compose build
docker compose up -d

# Cleanup
docker system prune -f

echo "✅ Deployed successfully!"
docker compose ps
