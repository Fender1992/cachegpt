#!/bin/bash

# Sync Claude Code conversations to Supabase
echo "🔄 Syncing Claude Code conversations to Supabase..."

# Build the CLI first
cd /root/cachegpt/cli
yarn build

# Run the sync command
node dist/index.js sync-claude --recent

echo "✅ Sync complete!"