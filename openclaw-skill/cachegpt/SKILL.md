---
name: cachegpt
description: Route LLM API calls through CacheGPT's semantic caching layer. Saves up to 80% on token costs by returning cached responses for semantically similar prompts in <10ms.
version: 1.0.0
metadata:
  openclaw:
    emoji: "⚡"
    requires:
      bins: ["python3", "curl"]
      env: ["CACHEGPT_API_URL", "CACHEGPT_API_KEY"]
    install:
      - id: pip
        kind: exec
        command: "pip3 install requests numpy"
        label: "Install Python dependencies"
    tags: ["caching", "cost-savings", "llm", "api", "tokens", "optimization"]
---

# CacheGPT — Semantic LLM Response Caching

CacheGPT sits between you and your LLM providers. It caches responses using semantic similarity (384-dimensional embeddings via pgvector), so when you or anyone asks a similar question, the cached response comes back in under 10ms instead of waiting 2-10 seconds for a fresh API call. This saves up to 80% on token costs with zero quality loss.

## Setup

1. **Create a free account** at [cachegpt.app](https://cachegpt.app)
2. **Get your API key** from Settings → API Keys
3. **Set environment variables:**

```bash
export CACHEGPT_API_URL="https://cachegpt.app/api/v1"
export CACHEGPT_API_KEY="your-api-key-here"
```

4. **Install the skill** in your OpenClaw workspace:

```bash
clawhub install cachegpt
```

Or manually copy this directory to `~/.openclaw/workspace/skills/cachegpt/`.

## Usage

Once installed, the skill automatically intercepts LLM calls. You can also use these commands:

- **"Check if this prompt is cached: [your prompt]"** — Manually check the cache for a specific prompt
- **"Show my cache savings"** — Display cumulative cost savings from cache hits
- **"Set cache similarity to 0.90"** — Adjust the similarity threshold (higher = stricter matching)
- **"Clear my cache"** — Flush your cached responses
- **"Show cache stats"** — Display hit rate, average latency, and cost breakdown

## Rules

1. **Always check cache first.** Before making any fresh LLM API call, check CacheGPT's cache for a semantic match. Only call the LLM provider on a confirmed cache miss.

2. **Show cache status after every response.** After each response, briefly indicate:
   - Whether it was a cache HIT or MISS
   - If HIT: similarity score, cache age, and estimated cost saved
   - If MISS: note that the response has been cached for future use

3. **Never cache errors or empty responses.** If the LLM provider returns an error, timeout, or empty content, do not store it in the cache.

4. **Respect the similarity threshold.** Default is 0.85. Only return cache hits where the semantic similarity score meets or exceeds this threshold. Users can adjust this in their config.

5. **Silent fallback on failure.** If CacheGPT is unreachable, returns an error, or times out (default 2s), silently fall through to the LLM provider. Never let a caching failure block or delay the user's prompt.

6. **Log all cache interactions.** Write cache check results (hit/miss/error, latency, similarity score, cost saved) to the local log file at `~/.openclaw/logs/cachegpt.log` for analytics.

7. **Use the proxy script for cache operations.** Call `cachegpt-proxy.py` for all cache check and store operations:
   - Check: `python3 cachegpt-proxy.py check --prompt "user prompt" --model "model-name"`
   - Store: `python3 cachegpt-proxy.py store --prompt "user prompt" --model "model-name" --response "llm response"`

## Configuration

All settings can be configured in `config.json` or via environment variables:

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `cachegpt_api_url` | `CACHEGPT_API_URL` | `https://cachegpt.app/api/v1` | CacheGPT API endpoint |
| `cachegpt_api_key` | `CACHEGPT_API_KEY` | (required) | Your CacheGPT API key |
| `similarity_threshold` | `CACHEGPT_THRESHOLD` | `0.85` | Minimum similarity score for cache hits (0.0-1.0) |
| `default_ttl_seconds` | `CACHEGPT_TTL` | `3600` | Cache entry time-to-live in seconds |
| `timeout_ms` | `CACHEGPT_TIMEOUT` | `2000` | Request timeout in milliseconds |
| `fallback_on_error` | `CACHEGPT_FALLBACK` | `true` | Fall through to provider on cache errors |
| `log_file` | `CACHEGPT_LOG_FILE` | `~/.openclaw/logs/cachegpt.log` | Path to local log file |
| `show_savings_in_chat` | — | `true` | Show cost savings inline after responses |
