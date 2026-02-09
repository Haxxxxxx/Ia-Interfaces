#!/bin/bash
# Start Rodeo server
cd "$(dirname "$0")/app"
echo -e "\033[35mStarting Rodeo server...\033[0m"
npm run dev
