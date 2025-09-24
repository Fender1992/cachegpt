# CacheGPT CLI - Quick Start Guide

## Installation

### Prerequisites
- Node.js 20+
- npm or yarn
- OS: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)

### Install from npm
```bash
npm install -g @cachegpt/cli
# or
yarn global add @cachegpt/cli
```

### Build from source
```bash
git clone https://github.com/yourusername/cachegpt.git
cd cachegpt
yarn install
yarn build
npm link apps/cli
```

## Authentication

### Standard Login (Browser-based PKCE)

**Windows:**
```powershell
# Open PowerShell or Command Prompt
cachegpt login

# Browser opens automatically
# Sign in with Google or GitHub
# Return to terminal when complete
```

**macOS:**
```bash
# Open Terminal
cachegpt login

# Browser opens automatically
# Sign in with Google or GitHub
# Return to terminal when complete
```

**Linux:**
```bash
# Open Terminal
cachegpt login

# Browser opens automatically (requires xdg-utils)
# Sign in with Google or GitHub
# Return to terminal when complete
```

### Headless/SSH Login (Device Code)

For SSH sessions, containers, or systems without browsers:

```bash
# Use device code flow
cachegpt login --device

# Output:
# Please visit: https://cachegpt.app/device
# And enter code: XXXX-YYYY

# Open the URL on any device, enter the code
# Return to terminal when authorized
```

## Essential Commands

### Check Authentication Status
```bash
cachegpt whoami
# Output:
# Current User:
#   Email: jo***@example.com
#   Name: John Doe
#   Verified: Yes
```

### View Token Details
```bash
cachegpt status
# Output:
# ┌─────────────────────┬────────────────────────┐
# │ Authenticated       │ Yes                    │
# │ Storage Backend     │ macOS Keychain         │
# │ Token Expires       │ 2024-01-23 (in 23h 45m)│
# │ Has Refresh Token   │ Yes                    │
# └─────────────────────┴────────────────────────┘
```

### Sign Out
```bash
cachegpt logout
# Revokes tokens and clears local credentials
```

### Run Diagnostics
```bash
cachegpt diag
# Checks connectivity, storage, permissions, etc.
```

## Platform-Specific Setup

### Windows

**First-time setup:**
```powershell
# Install CLI
npm install -g @cachegpt/cli

# Login (Credential Manager storage)
cachegpt login

# Verify
cachegpt whoami
```

**Troubleshooting Windows:**
```powershell
# If browser doesn't open
Start-Process "https://cachegpt.app/login"

# If Credential Manager fails
# Uses encrypted file fallback automatically

# Check permissions
icacls "$env:USERPROFILE\.cachegpt"
```

### macOS

**First-time setup:**
```bash
# Install CLI
npm install -g @cachegpt/cli

# Login (Keychain storage)
cachegpt login

# Verify
cachegpt whoami
```

**Troubleshooting macOS:**
```bash
# If Keychain access denied
security unlock-keychain

# If browser doesn't open
open https://cachegpt.app/login

# Check storage backend
cachegpt status | grep "Storage Backend"
```

### Linux (Ubuntu/Debian)

**First-time setup:**
```bash
# Install dependencies
sudo apt-get update
sudo apt-get install gnome-keyring xdg-utils

# Install CLI
npm install -g @cachegpt/cli

# Login (Secret Service storage)
cachegpt login

# Verify
cachegpt whoami
```

**Troubleshooting Linux:**
```bash
# If browser doesn't open
xdg-open https://cachegpt.app/login

# If keyring unavailable (falls back to encrypted file)
cachegpt status | grep "Storage Backend"

# Fix permissions if needed
chmod 700 ~/.cachegpt
chmod 600 ~/.cachegpt/tokens.json.enc
```

### WSL (Windows Subsystem for Linux)

```bash
# Set browser for WSL2
export BROWSER="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"

# Login (will use encrypted file storage)
cachegpt login

# Alternative: Use device code
cachegpt login --device
```

### Docker Container

```dockerfile
FROM node:20-alpine
RUN npm install -g @cachegpt/cli

# Option 1: Mount credentials
# docker run -v ~/.cachegpt:/root/.cachegpt myapp

# Option 2: Use device code
# docker run -it myapp cachegpt login --device
```

### SSH/Remote Server

```bash
# SSH into server
ssh user@server

# Use device code flow (no browser needed)
cachegpt login --device

# Complete auth on your local machine
# Return to SSH session - authenticated!
```

## Environment Variables

```bash
# Custom API endpoint (for self-hosted)
export CACHEGPT_ISSUER_URL=https://your-instance.com
export CACHEGPT_API_URL=https://your-instance.com/api

# Debug mode
export DEBUG=1
cachegpt login --verbose

# Proxy configuration
export HTTPS_PROXY=http://proxy:8080
export NO_PROXY=localhost,127.0.0.1
```

## Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Browser won't open | Use `cachegpt login --device` |
| "Not authenticated" | Run `cachegpt login` |
| Token expired | Automatic refresh, or re-login |
| Permission denied | Check `~/.cachegpt` permissions (700) |
| Clock skew error | Sync system time with NTP |
| Keychain/CredMan error | Falls back to encrypted file automatically |

## Migration from Legacy CLI

If you used the old DB polling authentication:

```bash
# Clear old credentials
rm -rf ~/.cachegpt/credentials.json

# Login with new PKCE flow
cachegpt login

# Verify migration
cachegpt status
```

## Security Notes

- Tokens stored in OS vault (Keychain/CredMan/Keyring) when available
- Fallback to AES-256-GCM encrypted file
- No passwords ever stored, only OAuth tokens
- Tokens auto-refresh before expiry
- Use `--device` on shared/untrusted systems

## Next Steps

1. **Configure LLM Provider Keys**: After login, visit the web dashboard to add API keys for ChatGPT/Claude/Gemini
2. **Explore Commands**: Run `cachegpt --help` for all available commands
3. **Check Status**: Use `cachegpt status` to monitor auth state
4. **Report Issues**: Run `cachegpt diag` and include output in bug reports

## Support

- Documentation: https://docs.cachegpt.app
- Issues: https://github.com/yourusername/cachegpt/issues
- Email: support@cachegpt.app