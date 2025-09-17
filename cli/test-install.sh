#!/bin/bash

echo "Testing CacheGPT CLI Installation"
echo "=================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi
echo "✅ Node.js $(node -v) installed"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi
echo "✅ npm $(npm -v) installed"

# Check if the CLI can be built
echo ""
echo "Building CLI..."
if npm run build &> /dev/null; then
    echo "✅ CLI built successfully"
else
    echo "❌ CLI build failed"
    exit 1
fi

# Check if the CLI binary works
echo ""
echo "Testing CLI commands..."
if ./bin/llm-cache --version &> /dev/null; then
    echo "✅ CLI version: $(./bin/llm-cache --version)"
else
    echo "❌ CLI binary not working"
    exit 1
fi

# Check available commands
if ./bin/llm-cache --help &> /dev/null; then
    echo "✅ CLI help command works"
else
    echo "❌ CLI help command failed"
    exit 1
fi

# Test config command
if ./bin/llm-cache config --show &> /dev/null; then
    echo "✅ CLI config command works"
else
    echo "❌ CLI config command failed"
    exit 1
fi

echo ""
echo "=================================="
echo "✅ CLI installation test passed!"
echo ""
echo "To use the CLI globally, run:"
echo "  npm link"
echo ""
echo "Then you can use:"
echo "  llm-cache --help"