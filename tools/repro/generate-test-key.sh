#!/bin/bash

##
# Generate a test CacheGPT API key
# Requires: SUPABASE_TOKEN environment variable
##

set -e

BASE_URL="${CACHEGPT_URL:-http://localhost:3000}"
SUPABASE_TOKEN="${SUPABASE_TOKEN}"

if [ -z "$SUPABASE_TOKEN" ]; then
  echo "❌ Error: SUPABASE_TOKEN environment variable not set"
  echo ""
  echo "Usage:"
  echo "  export SUPABASE_TOKEN='your_supabase_jwt_token'"
  echo "  ./generate-test-key.sh"
  echo ""
  echo "To get a Supabase token:"
  echo "  1. Login to CacheGPT web app"
  echo "  2. Open browser DevTools → Application → Cookies"
  echo "  3. Copy the value of 'sb-access-token' cookie"
  exit 1
fi

echo "======================================"
echo "CacheGPT API Key Generator"
echo "======================================"
echo "Base URL: $BASE_URL"
echo "Token: ${SUPABASE_TOKEN:0:20}..."
echo ""

# Generate a test key
KEY_NAME="Test Key $(date +%Y%m%d%H%M%S)"

echo "Creating API key: $KEY_NAME"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/api-keys" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"keyName\": \"$KEY_NAME\",
    \"expiresInDays\": 30
  }")

# Check if request was successful
if echo "$RESPONSE" | grep -q '"apiKey"'; then
  echo ""
  echo "✅ API Key created successfully!"
  echo ""
  echo "======================================"
  echo "SAVE THIS KEY - IT WON'T BE SHOWN AGAIN"
  echo "======================================"

  # Extract and display the API key
  API_KEY=$(echo "$RESPONSE" | grep -o '"apiKey":"[^"]*' | cut -d'"' -f4)
  echo ""
  echo "$API_KEY"
  echo ""
  echo "======================================"
  echo ""

  # Extract key info
  KEY_PREFIX=$(echo "$RESPONSE" | grep -o '"key_prefix":"[^"]*' | cut -d'"' -f4)
  CREATED_AT=$(echo "$RESPONSE" | grep -o '"created_at":"[^"]*' | cut -d'"' -f4)

  echo "Key Name: $KEY_NAME"
  echo "Prefix: $KEY_PREFIX"
  echo "Created: $CREATED_AT"
  echo "Expires: 30 days"
  echo ""
  echo "To use this key:"
  echo "  export CACHEGPT_API_KEY='$API_KEY'"
  echo "  node test-api-key-auth.js"
  echo ""
else
  echo "❌ Error creating API key"
  echo ""
  echo "Response:"
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
  echo ""

  # Check for common errors
  if echo "$RESPONSE" | grep -q "Unauthorized"; then
    echo "Hint: Your SUPABASE_TOKEN may be invalid or expired"
  elif echo "$RESPONSE" | grep -q "ECONNREFUSED"; then
    echo "Hint: CacheGPT server is not running at $BASE_URL"
  fi

  exit 1
fi
