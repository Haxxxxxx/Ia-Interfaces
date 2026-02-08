#!/bin/bash
# Sadary LLM Hub — Add Team Member
# Usage: ./add-team-member.sh "Name" "email@example.com" [budget]

set -e

NAME=${1:-"New Member"}
EMAIL=${2:-""}
BUDGET=${3:-20.0}
API_URL=${API_URL:-"https://llm.sadary.xyz"}
ADMIN_KEY=${ADMIN_KEY:-""}

if [ -z "$ADMIN_KEY" ]; then
  echo "Error: ADMIN_KEY environment variable required"
  echo "Usage: ADMIN_KEY=your-admin-key ./add-team-member.sh 'Name' 'email@example.com' [budget]"
  exit 1
fi

echo "👤 Adding team member: $NAME"

RESPONSE=$(curl -s -X POST "$API_URL/api/team" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d "{\"name\": \"$NAME\", \"email\": \"$EMAIL\", \"monthlyBudget\": $BUDGET}")

echo "$RESPONSE" | jq .

API_KEY=$(echo "$RESPONSE" | jq -r '.apiKey')

if [ "$API_KEY" != "null" ]; then
  echo ""
  echo "✅ Member added successfully!"
  echo ""
  echo "🔑 API Key (save this, shown only once):"
  echo "   $API_KEY"
  echo ""
  echo "Share this key with $NAME to access Sadary Hub."
else
  echo "❌ Failed to add member"
fi
