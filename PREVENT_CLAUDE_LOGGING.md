# How to Prevent CLI Chats from Appearing in Claude Web Console

## The Problem
If your CLI chats are appearing in the Claude web console, it means the CLI is using browser automation mode instead of API mode.

## Solution: Use API/Proxy Mode Only

### 1. Check Your Current Configuration

```bash
cat ~/.llm-cache/config.json
```

This should show:
```json
{
  "baseUrl": "http://localhost:8000",
  "apiKey": "sk-...",
  "defaultModel": "gpt-3.5-turbo",
  "timeout": 30
}
```

**Important**: There should be NO `"mode": "browser"` in this config.

### 2. Reinitialize if Needed

If you see `"mode": "browser"` or want to ensure you're using API mode:

```bash
# Remove old configs
rm -rf ~/.llm-cache/config.json
rm -rf ~/.cachegpt/config.json

# Reinitialize with API/proxy mode
cachegpt init
```

When prompted, choose:
- **Proxy mode** (NOT browser mode)
- Enter your API key
- Select your model

### 3. Use the Correct Chat Command

Always use:
```bash
cachegpt chat
```

**Never use** commands like:
- `cachegpt init-claude-web`
- `cachegpt init-browser`
- Any browser-related initialization

### 4. Verify You're Using API Mode

When you run `cachegpt chat`, you should see API-style responses with:
- [Cached response] or [Fresh response] indicators
- Cost savings information
- No browser windows opening

## How the Modes Work

### API/Proxy Mode (Recommended)
- Uses OpenAI-compatible API endpoints
- Goes through CacheGPT proxy server
- Never touches Claude's web interface
- Chats are stored locally and in your database
- **Does NOT appear in Claude web console**

### Browser Mode (Avoid)
- Automates the Claude web interface
- Opens actual browser sessions
- **WILL appear in Claude web console**
- Used for providers without API access

## Additional Privacy Steps

1. **Use Local Caching Only** (no cloud sync):
   ```bash
   # Don't login to CacheGPT
   cachegpt logout
   ```

2. **Clear Browser Profile** (if previously used):
   ```bash
   rm -rf ~/.cachegpt/browser-profile/
   ```

3. **Use Direct OpenAI API** (bypass any Claude integration):
   ```bash
   export OPENAI_API_KEY="your-openai-key"
   cachegpt init
   # Choose "direct" mode instead of proxy
   ```

## Verification

To verify you're NOT using browser mode:

1. Check no browser profile exists:
   ```bash
   ls ~/.cachegpt/browser-profile/
   # Should be empty or not exist
   ```

2. Check config doesn't have browser mode:
   ```bash
   grep -i "browser" ~/.llm-cache/config.json
   # Should return nothing
   ```

3. Run a test chat:
   ```bash
   cachegpt chat
   # Should NOT open any browser windows
   # Should NOT require Claude login
   ```

## Summary

- **Use API/Proxy mode** - Never appears in Claude console
- **Avoid Browser mode** - Always appears in Claude console
- **Check your config** - Ensure no `"mode": "browser"`
- **Reinitialize if needed** - Use `cachegpt init` and choose proxy mode