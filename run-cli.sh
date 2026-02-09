#!/bin/bash
# Start Rodeo CLI
cd "$(dirname "$0")/cli"

# Check for API key
if [ -z "$RODEO_API_KEY" ]; then
    echo -e "\033[33mNo API key set. Using default...\033[0m"
    # Try to get first key from seed output
    export RODEO_API_KEY="rodeo-vincent-9418c07c-71b"
fi

npx tsx rodeo.ts "$@"
