# CacheGPT — OpenClaw Skill

Semantic LLM response caching for OpenClaw. Save up to 80% on token costs automatically.

## What is CacheGPT?

[CacheGPT](https://cachegpt.app) is a semantic caching layer for LLM API calls. It stores responses using 384-dimensional vector embeddings (pgvector) and returns cached results for semantically similar prompts in under 10ms — instead of waiting 2-10 seconds for a fresh API call.

**Supported providers:** OpenAI, Anthropic, Google, Groq, Perplexity
**Free tier:** 500 messages/day, all features unlocked, all models

## How It Works

```
┌──────────┐     ┌──────────┐     ┌──────────────┐
│   You    │────▶│ OpenClaw │────▶│   CacheGPT   │
│          │     │          │     │  Cache Check  │
└──────────┘     └──────────┘     └──────┬───────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                         Cache HIT            Cache MISS
                         (<10ms)              │
                              │               ▼
                              │         ┌──────────┐
                              │         │   LLM    │
                              │         │ Provider │
                              │         └────┬─────┘
                              │              │
                              │         Store in cache
                              │              │
                              ▼              ▼
                         ┌──────────────────────┐
                         │    Response + Stats   │
                         │  (hit/miss, savings)  │
                         └──────────────────────┘
```

Every cache hit saves you the full cost of that API call. Over time, similar questions accumulate cache entries, and your hit rate climbs — most users see 40-80% savings within the first week.

## Installation

### Via ClawHub (recommended)

```bash
clawhub install cachegpt
```

### Manual

```bash
# Copy skill to your OpenClaw workspace
cp -r cachegpt/ ~/.openclaw/workspace/skills/cachegpt/

# Install Python dependencies
pip3 install requests numpy

# Configure
cp ~/.openclaw/workspace/skills/cachegpt/config.json.example \
   ~/.openclaw/workspace/skills/cachegpt/config.json

# Set your API key
export CACHEGPT_API_URL="https://cachegpt.app/api"
export CACHEGPT_API_KEY="your-api-key-here"
```

## Configuration

Copy `config.json.example` to `config.json` and edit. Environment variables override config file values.

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `cachegpt_api_url` | `CACHEGPT_API_URL` | `https://cachegpt.app/api` | CacheGPT API endpoint |
| `cachegpt_api_key` | `CACHEGPT_API_KEY` | *(required)* | Your API key from cachegpt.app |
| `similarity_threshold` | `CACHEGPT_THRESHOLD` | `0.85` | Min similarity for cache hits (0.0-1.0) |
| `default_ttl_seconds` | `CACHEGPT_TTL` | `3600` | Cache entry time-to-live |
| `timeout_ms` | `CACHEGPT_TIMEOUT` | `2000` | Request timeout in ms |
| `fallback_on_error` | `CACHEGPT_FALLBACK` | `true` | Fall through on cache errors |
| `log_file` | `CACHEGPT_LOG_FILE` | `~/.openclaw/logs/cachegpt.log` | Local log file path |
| `show_savings_in_chat` | — | `true` | Show savings inline |

### Similarity Threshold

- **0.80** — Aggressive caching. More hits, occasionally less precise matches.
- **0.85** — Balanced (default). Good hit rate with high precision.
- **0.90** — Conservative. Fewer hits, but very precise matches.
- **0.95+** — Near-exact matches only.

## FAQ

**Is it free?**
Yes. CacheGPT has a generous free tier: 500 messages/day, all features, all models. No credit card required. Optional donations via Stripe if you want to support the project.

**What LLM providers are supported?**
All of them — OpenAI, Anthropic, Google, Groq, and Perplexity. The cache is provider-agnostic; it stores and matches on prompt semantics, not provider-specific formats.

**What happens if CacheGPT goes down?**
Nothing bad. The skill silently falls through to your LLM provider. You won't get cache savings during the outage, but your prompts will never be blocked or delayed.

**How do I see my savings?**
Visit your analytics dashboard at [cachegpt.app](https://cachegpt.app). You can also check local logs at `~/.openclaw/logs/cachegpt.log` for per-request details.

**Does it work with BYOK (Bring Your Own Key)?**
Yes. CacheGPT supports BYOK for all providers. Your API keys are stored securely and never leave the server.

**Is my data private?**
Prompts and responses are stored encrypted. CacheGPT never shares your data with other users — your cache is yours.

## Links

- **Website:** [cachegpt.app](https://cachegpt.app)
- **GitHub:** [github.com/Fender1992/cachegpt](https://github.com/Fender1992/cachegpt)
- **Issues:** [github.com/Fender1992/openclaw-cachegpt-skill/issues](https://github.com/Fender1992/openclaw-cachegpt-skill/issues)
