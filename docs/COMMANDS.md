# CacheGPT Commands Documentation

## Quick Start

```bash
# Install CacheGPT CLI
npm install -g cachegpt-cli

# Create account and login
cachegpt login

# Start chatting
cachegpt chat
```

## Authentication Commands

### `cachegpt login`
Login to your CacheGPT account or create a new one.

**Options:**
- Creates new account if email doesn't exist
- Uses 6-digit email code for existing accounts
- Supports password authentication

**Example:**
```bash
cachegpt login
# Enter email: user@example.com
# Choose: Create new account or login
```

### `cachegpt logout`
Logout from all authenticated accounts.

```bash
cachegpt logout
# Clears stored authentication tokens
```

### `cachegpt auth-status`
Check your current authentication status.

```bash
cachegpt auth-status
# Shows logged in accounts and active sessions
```

## Chat Commands

### `cachegpt chat`
Start an interactive AI chat session using free providers with smart caching.

**Features:**
- No API keys required
- Automatic provider rotation
- Response caching for repeated questions
- Supports follow-up questions

**Example:**
```bash
cachegpt chat
# 🤖 Starting free AI chat...
# You: What is machine learning?
# Assistant: Machine learning is...
```

### `cachegpt claude`
Quick Claude chat - requires Anthropic API key.

**Example:**
```bash
cachegpt claude
# Paste your Anthropic API key
# Start chatting with Claude
```

### `cachegpt free`
Alias for `cachegpt chat` - free AI chat without API keys.

```bash
cachegpt free
```

## API Key Management

### `cachegpt api-keys [action]`
Manage your premium API keys for direct access to providers.

**Actions:**
- `add` - Add a new API key
- `view` - View your configured keys (masked)
- `remove` - Remove an API key
- `test` - Test if your keys are working

**Supported Providers:**
- OpenAI (GPT-4)
- Anthropic (Claude)
- Google (Gemini)
- Perplexity

**Examples:**
```bash
# Add new API key
cachegpt api-keys add
# Select provider: OpenAI
# Enter key: sk-...

# View your keys
cachegpt api-keys view

# Test keys
cachegpt api-keys test

# Remove a key
cachegpt api-keys remove
```

## Model Management

### `cachegpt models [action]`
Manage and validate AI models.

**Actions:**
- `list` - Show all available models
- `validate` - Check if models are accessible
- `update` - Update model configurations
- `check` - Quick validation of current model

**Example:**
```bash
cachegpt models list
# Shows all available models and their status

cachegpt models validate
# Tests each model's availability
```

## Template Management

### `cachegpt templates [action] [args]`
Manage prompt templates for common tasks.

**Actions:**
- `list` - Show available templates
- `use <name>` - Use a specific template
- `create <name>` - Create a new template
- `delete <name>` - Remove a template

**Built-in Templates:**
- `code-review` - Code review assistant
- `debug` - Debugging helper
- `explain` - Code explanation
- `optimize` - Performance optimization
- `test` - Test writing assistant

**Example:**
```bash
# List templates
cachegpt templates list

# Use code review template
cachegpt templates use code-review

# Create custom template
cachegpt templates create my-template
```

## Cache Management

### `cachegpt stats [options]`
Show cache statistics and usage metrics.

**Options:**
- `--detailed` - Show detailed breakdown
- `--tier <name>` - Stats for specific tier

**Example:**
```bash
cachegpt stats
# Cache Statistics:
# Total Entries: 1,245
# Cache Hits: 89.2%
# Storage Used: 45.3 MB
```

### `cachegpt clear [options]`
Clear cache entries.

**Options:**
- `--all` - Clear all cache entries
- `--tier <name>` - Clear specific tier
- `--older-than <days>` - Clear entries older than N days

**Example:**
```bash
# Clear all cache
cachegpt clear --all

# Clear entries older than 30 days
cachegpt clear --older-than 30
```

## Configuration Commands

### `cachegpt init`
Initialize CacheGPT configuration in your project.

```bash
cachegpt init
# Creates .cachegpt/config.json with default settings
```

### `cachegpt config [options]`
Manage configuration settings.

**Options:**
- `--show` - Display current configuration
- `--set <key=value>` - Set configuration value
- `--reset` - Reset to defaults

**Example:**
```bash
# Show configuration
cachegpt config --show

# Set cache directory
cachegpt config --set cache_dir=./my-cache

# Reset to defaults
cachegpt config --reset
```

## Testing & Diagnostics

### `cachegpt test [options]`
Test API connectivity and cache functionality.

**Options:**
- `--provider <name>` - Test specific provider
- `--cache` - Test cache operations
- `--all` - Run all tests

**Example:**
```bash
# Test all systems
cachegpt test --all

# Test specific provider
cachegpt test --provider openai
```

### `cachegpt version`
Check version and update information.

```bash
cachegpt version
# CacheGPT CLI v11.1.19
# Latest: v11.1.19 ✓ Up to date
```

## Advanced Commands

### `cachegpt sync-claude [options]`
Sync Claude Code conversations to Supabase database.

**Options:**
- `--days <n>` - Sync last N days (default: 7)
- `--all` - Sync all conversations

**Example:**
```bash
# Sync last 7 days
cachegpt sync-claude

# Sync all conversations
cachegpt sync-claude --all
```

## Environment Variables

You can set these in your environment or `.env` file:

```bash
# Supabase Configuration (optional - uses defaults)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# API Keys (optional - for premium access)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
PERPLEXITY_API_KEY=...
```

## Troubleshooting

### Login Issues

If you can't login:
1. Check your internet connection
2. Try `cachegpt logout` then login again
3. Make sure you're using the correct email
4. Check if email confirmation is required

### Chat Not Working

If chat doesn't respond:
1. Check `cachegpt auth-status`
2. Try `cachegpt test --all`
3. Clear cache with `cachegpt clear --all`
4. Re-login with `cachegpt login`

### API Key Issues

If your API keys aren't working:
1. Test with `cachegpt api-keys test`
2. Make sure keys are valid and have credits
3. Remove and re-add with `cachegpt api-keys remove` then `add`

## Tips & Best Practices

1. **Use Templates**: Speed up common tasks with templates
2. **Cache Benefits**: Repeated questions use cached responses (free & fast)
3. **API Keys**: Add your own keys for unlimited premium access
4. **Regular Updates**: Run `npm update -g cachegpt-cli` for latest features

## Getting Help

- **Documentation**: https://cachegpt.app/docs
- **GitHub Issues**: https://github.com/cachegpt/cachegpt-cli/issues
- **Email Support**: support@cachegpt.io

## Command Aliases

For convenience, these shortcuts are available:

- `cachegpt chat` = `cachegpt free`
- `cachegpt auth-status` = `cachegpt status`
- `cachegpt version` = `cachegpt v`

## Examples Gallery

### Quick Code Review
```bash
cachegpt templates use code-review
# Paste your code
# Get instant review with suggestions
```

### Debug an Error
```bash
cachegpt templates use debug
# Paste error message
# Get debugging steps and solutions
```

### Learn a Concept
```bash
cachegpt chat
# You: Explain Docker containers like I'm five
# Assistant: Imagine Docker containers like...
```

### Optimize Code
```bash
cachegpt templates use optimize
# Paste slow code
# Get performance improvements
```