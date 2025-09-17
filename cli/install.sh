#!/bin/bash

# LLM Cache CLI Installation Script

set -e

echo "🚀 Installing LLM Cache CLI..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    echo "Please install Node.js (version 16 or higher) and try again."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version 16 or higher is required."
    echo "Current version: $(node --version)"
    echo "Please upgrade Node.js and try again."
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Install dependencies
echo "📦 Installing dependencies..."
if command -v yarn &> /dev/null; then
    echo "Using Yarn..."
    yarn install --no-bin-links
else
    echo "Using npm..."
    npm install --no-bin-links
fi

# Build the project
echo "🔨 Building CLI..."
npm run build

# Test the installation
echo "🧪 Testing installation..."
if ./bin/llm-cache --version &> /dev/null; then
    echo "✅ CLI built successfully!"
    echo ""
    echo "🎉 Installation complete!"
    echo ""
    echo "Quick start:"
    echo "  ./bin/llm-cache init    # Initialize configuration"
    echo "  ./bin/llm-cache test    # Test the connection"
    echo "  ./bin/llm-cache --help  # See all commands"
    echo ""
    echo "For global installation:"
    echo "  npm link                # Link globally"
    echo "  llm-cache --help        # Use from anywhere"
else
    echo "❌ Installation failed. CLI is not working."
    exit 1
fi