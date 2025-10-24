#!/bin/bash

##
# Test CORS preflight for /v1/messages endpoint
##

BASE_URL="${CACHEGPT_URL:-http://localhost:3000}"

echo "======================================"
echo "CORS Preflight Test"
echo "======================================"
echo "URL: $BASE_URL/api/v1/messages"
echo ""

# Send OPTIONS request
echo "Sending OPTIONS request..."
echo ""

RESPONSE=$(curl -v -X OPTIONS "$BASE_URL/api/v1/messages" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-api-key,anthropic-version" \
  2>&1)

echo "$RESPONSE"
echo ""
echo "======================================"
echo "Analysis"
echo "======================================"

# Check status code
if echo "$RESPONSE" | grep -q "HTTP.*200"; then
  echo "✅ Status: 200 OK"
else
  echo "❌ Status: NOT 200"
fi

# Check CORS headers
if echo "$RESPONSE" | grep -qi "access-control-allow-origin"; then
  ORIGIN=$(echo "$RESPONSE" | grep -i "access-control-allow-origin" | cut -d':' -f2- | tr -d '\r\n' | xargs)
  echo "✅ Access-Control-Allow-Origin: $ORIGIN"
else
  echo "❌ Access-Control-Allow-Origin: MISSING"
fi

if echo "$RESPONSE" | grep -qi "access-control-allow-methods"; then
  METHODS=$(echo "$RESPONSE" | grep -i "access-control-allow-methods" | cut -d':' -f2- | tr -d '\r\n' | xargs)
  echo "✅ Access-Control-Allow-Methods: $METHODS"
else
  echo "❌ Access-Control-Allow-Methods: MISSING"
fi

if echo "$RESPONSE" | grep -qi "access-control-allow-headers"; then
  HEADERS=$(echo "$RESPONSE" | grep -i "access-control-allow-headers" | cut -d':' -f2- | tr -d '\r\n' | xargs)
  echo "✅ Access-Control-Allow-Headers: $HEADERS"

  # Check if x-api-key is included
  if echo "$HEADERS" | grep -qi "x-api-key"; then
    echo "   ✅ x-api-key is allowed"
  else
    echo "   ❌ x-api-key is NOT allowed"
  fi
else
  echo "❌ Access-Control-Allow-Headers: MISSING"
fi

echo ""
echo "======================================"
echo "Recommendations"
echo "======================================"

# Check if all required headers are present
MISSING=0

if ! echo "$RESPONSE" | grep -qi "access-control-allow-origin"; then
  echo "⚠️  Add: Access-Control-Allow-Origin: *"
  MISSING=1
fi

if ! echo "$RESPONSE" | grep -qi "access-control-allow-methods.*POST"; then
  echo "⚠️  Add: Access-Control-Allow-Methods: POST, OPTIONS"
  MISSING=1
fi

if ! echo "$RESPONSE" | grep -qi "access-control-allow-headers.*x-api-key"; then
  echo "⚠️  Add x-api-key to Access-Control-Allow-Headers"
  MISSING=1
fi

if [ $MISSING -eq 0 ]; then
  echo "✅ All CORS headers are correctly configured!"
else
  echo ""
  echo "Fix in: app/api/v1/messages/route.ts"
  echo ""
  echo "export async function OPTIONS(request: NextRequest) {"
  echo "  return new NextResponse(null, {"
  echo "    status: 200,"
  echo "    headers: {"
  echo "      'Access-Control-Allow-Origin': '*',"
  echo "      'Access-Control-Allow-Methods': 'POST, OPTIONS',"
  echo "      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version'"
  echo "    }"
  echo "  })"
  echo "}"
fi

echo ""
