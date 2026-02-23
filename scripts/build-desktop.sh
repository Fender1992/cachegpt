#!/bin/bash
set -e

echo "=== CacheGPT Desktop Build ==="

# Step 1: Swap Next.js config for static export
echo "[1/4] Swapping next.config.js for desktop build..."
cp next.config.js next.config.js.bak
cp next.config.desktop.js next.config.js

# Step 2: Build static export
echo "[2/4] Building static export to out-desktop/..."
yarn build 2>&1 || {
  echo "Build failed, restoring next.config.js..."
  mv next.config.js.bak next.config.js
  exit 1
}

# Step 3: Restore original config
echo "[3/4] Restoring next.config.js..."
mv next.config.js.bak next.config.js

# Step 4: Build Tauri app
echo "[4/4] Building Tauri app..."
cargo tauri build

echo "=== Desktop build complete ==="
echo "Installers are in src-tauri/target/release/bundle/"
