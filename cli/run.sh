#!/bin/bash
# Rodeo CLI launcher

export RODEO_API_URL="${RODEO_API_URL:-http://localhost:3000}"
export RODEO_MODEL="${RODEO_MODEL:-qwen2.5:7b}"

# Load API key from ~/.rodeorc if exists
if [ -f ~/.rodeorc ]; then
  source ~/.rodeorc
fi

# Run the CLI
cd "$(dirname "$0")"
npx tsx rodeo.ts "$@"
