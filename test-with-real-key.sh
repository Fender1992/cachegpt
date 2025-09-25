#!/bin/bash

echo "Testing with local server (port 3004) - should work:"
echo "======================================================"

# Set the local server URL
export CACHEGPT_API_URL=http://localhost:3004

# Run the chat command
cd /root/cachegpt/cli
echo "Test" | timeout 5 ./bin/llm-cache chat 2>&1 | grep -E "(Using direct session|Error:|Debug:|📥 Response Status)"

echo ""
echo "The local server successfully authenticates (would get 404 from Claude API with test key)"
echo ""
echo "Testing with production server (cachegpt.app) - will fail until deployed:"
echo "=========================================================================="

# Unset to use production
unset CACHEGPT_API_URL

# Run the chat command
echo "Test" | timeout 5 ./bin/llm-cache chat 2>&1 | grep -E "(Using direct session|Error:|Debug:|📥 Response Status)"

echo ""
echo "Production server still has old code that doesn't handle direct session"