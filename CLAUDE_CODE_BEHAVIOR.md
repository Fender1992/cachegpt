# How to Get Claude Code-Like Behavior (OAuth Login + Private Chats)

## Understanding Claude Code's Approach

Claude Code (the terminal you're using) works like this:
1. **OAuth for Authentication**: Opens browser for secure login
2. **API for Communication**: Uses Claude API directly after auth
3. **Result**: Chats don't appear in Claude web console

## How to Achieve This with CacheGPT

### Option 1: Use Claude API Directly (Recommended)

This is the closest to Claude Code's behavior:

```bash
# 1. Get your Anthropic API key
# Visit: https://console.anthropic.com/
# Create an API key

# 2. Set the API key
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# 3. Use the API chat command
cachegpt chat-api
```

**Benefits:**
- Uses Claude API directly (just like Claude Code)
- Chats never appear in web console
- Full conversation context maintained
- Responses are fast and private

### Option 2: Use OpenAI API with CacheGPT Proxy

```bash
# Configure for OpenAI
cachegpt init
# Choose "proxy" mode
# Use OpenAI API key
# Select GPT model

cachegpt chat
```

**Benefits:**
- Never touches Claude at all
- Complete privacy
- Cost savings through caching

### Option 3: Build Custom OAuth + API Integration

If you want exact Claude Code behavior with OAuth login:

```javascript
// This is what Claude Code essentially does:
async function authenticateWithOAuth() {
  // 1. OAuth flow for authentication
  const tokens = await oauth.authenticate({
    provider: 'anthropic',
    scopes: ['api.access']
  });

  // 2. Use tokens to call API directly
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      messages: [...conversation]
    })
  });

  // 3. Chats go through API, not web interface
  // Result: No web console logging
}
```

## Key Differences Between Modes

### Browser Mode (What to Avoid)
- **How it works**: Puppeteer/Playwright automates Claude.ai website
- **Authentication**: Logs into Claude.ai web interface
- **Chat method**: Types into web chat interface
- **Result**: ALL chats appear in Claude web console
- **Commands**: `init-browser`, `init-claude-web`

### API Mode (What Claude Code Uses)
- **How it works**: Direct API calls to api.anthropic.com
- **Authentication**: API key or OAuth tokens
- **Chat method**: HTTP POST to API endpoints
- **Result**: Chats NEVER appear in web console
- **Commands**: `chat-api`, `chat` (with API config)

## Implementation in CacheGPT

We've added a `chat-api` command that mimics Claude Code's behavior:

```bash
# Install latest version
npm update -g cachegpt-cli

# Set your Anthropic API key
export ANTHROPIC_API_KEY="your-key"

# Use API-only chat
cachegpt chat-api
```

This gives you:
- ✅ Direct API communication (no web interface)
- ✅ Private chats (don't appear in console)
- ✅ Full conversation context
- ✅ Local caching for history
- ✅ No browser automation

## Environment Variables

Add to your `.bashrc` or `.zshrc`:

```bash
# For Claude API
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# For OpenAI (alternative)
export OPENAI_API_KEY="sk-..."

# For CacheGPT database (optional)
export NEXT_PUBLIC_SUPABASE_URL="..."
export NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

## Summary

**Claude Code's Secret**: It uses OAuth for login but then switches to API calls for chat.

**CacheGPT Solution**: Use `cachegpt chat-api` with your Anthropic API key for the same private, API-only behavior.

**Never Use**: Browser mode commands if you want to keep chats private.