# CacheGPT CLI

Intelligent LLM caching proxy CLI - Save costs and improve response times by caching similar LLM queries.

## Installation

```bash
npm install -g cachegpt-cli
# or
yarn global add cachegpt-cli
```

## Features

- 🚀 **Intelligent Caching**: Automatically cache and reuse similar LLM responses
- 💰 **Cost Savings**: Reduce API costs by up to 70% through smart caching
- ⚡ **Faster Responses**: Retrieve cached responses in milliseconds
- 🔌 **Multiple Providers**: Support for OpenAI, Anthropic, and other LLM providers
- 📊 **Usage Analytics**: Track requests, cache hits, and cost savings
- 🎯 **Semantic Search**: Find similar queries using vector embeddings
- 🔒 **Secure**: API key encryption and secure storage

## Quick Start

### 1. Initialize Configuration

```bash
cachegpt init
```

This will guide you through setting up:
- API endpoint URL
- Authentication credentials
- Cache preferences

### 2. Test Connection

```bash
cachegpt test
```

### 3. Start Using

```bash
# Interactive chat
cachegpt chat

# View statistics
cachegpt stats

# Clear cache
cachegpt clear --older-than 24h
```

## Commands

### `init`
Initialize CacheGPT configuration with interactive setup.

### `test`
Test API connectivity and cache functionality.

```bash
cachegpt test
cachegpt test --verbose
```

### `stats`
Display cache statistics and usage metrics.

```bash
cachegpt stats
cachegpt stats --format json
cachegpt stats --days 30
```

### `clear`
Clear cache entries.

```bash
cachegpt clear
cachegpt clear --older-than 24h
cachegpt clear --all
```

### `config`
Manage configuration settings.

```bash
cachegpt config get api-url
cachegpt config set api-url https://api.cachegpt.io
cachegpt config list
```

### `chat`
Start an interactive chat session with your LLM.

```bash
cachegpt chat
cachegpt chat --model gpt-4
```

## Configuration

Configuration is stored in `~/.cachegpt/config.json`:

```json
{
  "apiUrl": "https://api.cachegpt.io",
  "apiKey": "cgpt_...",
  "defaultModel": "gpt-3.5-turbo",
  "cacheEnabled": true,
  "logLevel": "info"
}
```

### Environment Variables

You can also use environment variables:

```bash
export CACHEGPT_API_URL=https://api.cachegpt.io
export CACHEGPT_API_KEY=cgpt_your_api_key
```

## API Usage

The CLI can be used programmatically:

```javascript
const { CacheGPT } = require('cachegpt-cli');

const client = new CacheGPT({
  apiKey: 'cgpt_...',
  apiUrl: 'https://api.cachegpt.io'
});

// Send a query
const response = await client.chat('What is machine learning?');
console.log(response.content);

// Check if response was cached
if (response.cached) {
  console.log(`Cache hit! Saved: $${response.costSaved}`);
}
```

## Examples

### Basic Chat

```bash
$ cachegpt chat
> What is artificial intelligence?

AI is the simulation of human intelligence by machines...
[Cached: No | Response time: 1.2s | Cost: $0.002]

> What is AI?

AI is the simulation of human intelligence by machines...
[Cached: Yes | Similarity: 95% | Response time: 0.05s | Saved: $0.002]
```

### View Statistics

```bash
$ cachegpt stats

┌─────────────────┬──────────┐
│ Metric          │ Value    │
├─────────────────┼──────────┤
│ Total Requests  │ 1,234    │
│ Cache Hits      │ 892      │
│ Hit Rate        │ 72.3%    │
│ Total Saved     │ $45.67   │
│ Avg Response    │ 145ms    │
└─────────────────┴──────────┘
```

### Clear Old Cache

```bash
$ cachegpt clear --older-than 7d

Cleared 156 cache entries older than 7 days.
```

## Troubleshooting

### Connection Issues

If you're having connection issues:

1. Check your API key: `cachegpt config get api-key`
2. Verify the API URL: `cachegpt config get api-url`
3. Test connectivity: `cachegpt test --verbose`

### Cache Not Working

1. Ensure cache is enabled: `cachegpt config get cache-enabled`
2. Check cache statistics: `cachegpt stats`
3. Clear and rebuild cache: `cachegpt clear --all`

## Support

- Documentation: https://cachegpt.io/docs
- Issues: https://github.com/cachegpt/cachegpt-cli/issues
- Email: support@cachegpt.io

## License

MIT © CacheGPT Team