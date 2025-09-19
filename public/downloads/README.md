# CacheGPT Downloads

This directory contains downloadable executables for CacheGPT.

## Available Downloads

- **Windows**: `cachegpt-windows-x64.exe`
- **macOS**: `cachegpt-macos.dmg`
- **Linux**: `cachegpt-linux-x64.AppImage`

## Building Executables

To build the executables:

1. **Windows (.exe)**:
   ```bash
   npm run build:windows
   ```

2. **macOS (.dmg)**:
   ```bash
   npm run build:macos
   ```

3. **Linux (.AppImage)**:
   ```bash
   npm run build:linux
   ```

## Note

The actual executable files should be placed in this directory after building.
For development, the download links will return 404 until the files are added.

## Alternative Installation

Users can also install via:
- npm: `npm install -g cachegpt`
- Docker: `docker run -p 3000:3000 cachegpt/cachegpt`
- Git: `git clone https://github.com/Fender1992/cachegpt.git`