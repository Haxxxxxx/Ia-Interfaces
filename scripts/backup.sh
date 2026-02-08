#!/bin/bash
# Sadary LLM Hub — Backup Script
# Backs up SQLite database

set -e

BACKUP_DIR=${BACKUP_DIR:-"/opt/llm-hub/backups"}
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "📦 Backing up database..."

# Copy SQLite DB from Docker volume
docker compose exec -T llm-hub cat /data/llmhub.db > "$BACKUP_DIR/llmhub_$DATE.db"

# Keep only last 7 backups
ls -t $BACKUP_DIR/llmhub_*.db | tail -n +8 | xargs -r rm

echo "✅ Backup complete: $BACKUP_DIR/llmhub_$DATE.db"
ls -lh $BACKUP_DIR/
