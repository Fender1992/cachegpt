#!/usr/bin/env python3
"""
CacheGPT Proxy — Cache check and store operations for OpenClaw.

Usage:
  Check cache:  python3 cachegpt-proxy.py check --prompt "your prompt" --model "claude-sonnet-4-20250514"
  Store result:  python3 cachegpt-proxy.py store --prompt "your prompt" --model "claude-sonnet-4-20250514" --response "llm response text"

Outputs JSON to stdout. Logs to ~/.openclaw/logs/cachegpt.log.
"""

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print(json.dumps({
        "status": "error",
        "error": "requests library not installed. Run: pip3 install requests",
        "response": None
    }))
    sys.exit(1)

# ── Defaults ──────────────────────────────────────────────────
DEFAULT_API_URL = "https://cachegpt.app/api"
DEFAULT_THRESHOLD = 0.85
DEFAULT_TTL = 3600
DEFAULT_TIMEOUT_MS = 2000
DEFAULT_LOG_FILE = "~/.openclaw/logs/cachegpt.log"
DEFAULT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

# ── Cost estimates per 1K tokens by provider/model ────────────
COST_PER_1K_TOKENS = {
    "claude-opus-4-1-20250805": 0.075,
    "claude-sonnet-4-20250514": 0.015,
    "claude-haiku-4-5-20251001": 0.005,
    "gpt-4o": 0.015,
    "gpt-4-turbo": 0.030,
    "gpt-3.5-turbo": 0.002,
    "gemini-1.5-pro": 0.014,
    "gemini-1.5-flash": 0.0004,
    "llama-3.1-70b": 0.0035,
    "default": 0.010,
}


def setup_logging(log_file: str) -> logging.Logger:
    """Configure file logging."""
    log_path = Path(os.path.expanduser(log_file))
    log_path.parent.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("cachegpt-proxy")
    logger.setLevel(logging.DEBUG)

    if not logger.handlers:
        handler = logging.FileHandler(str(log_path), encoding="utf-8")
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))
        logger.addHandler(handler)

    return logger


def load_config(config_path: str) -> dict:
    """Load configuration from JSON file, falling back to env vars and defaults."""
    config = {
        "cachegpt_api_url": DEFAULT_API_URL,
        "cachegpt_api_key": "",
        "similarity_threshold": DEFAULT_THRESHOLD,
        "default_ttl_seconds": DEFAULT_TTL,
        "timeout_ms": DEFAULT_TIMEOUT_MS,
        "fallback_on_error": True,
        "log_file": DEFAULT_LOG_FILE,
        "show_savings_in_chat": True,
        "analytics": {
            "track_hits": True,
            "track_misses": True,
            "track_cost_savings": True,
            "daily_summary": True,
        },
    }

    # Load from config file if it exists
    expanded_path = os.path.expanduser(config_path)
    if os.path.isfile(expanded_path):
        try:
            with open(expanded_path, "r") as f:
                file_config = json.load(f)
            config.update(file_config)
        except (json.JSONDecodeError, OSError) as e:
            # Config file is malformed — use defaults
            pass

    # Environment variables override config file
    env_overrides = {
        "CACHEGPT_API_URL": "cachegpt_api_url",
        "CACHEGPT_API_KEY": "cachegpt_api_key",
        "CACHEGPT_THRESHOLD": "similarity_threshold",
        "CACHEGPT_TTL": "default_ttl_seconds",
        "CACHEGPT_TIMEOUT": "timeout_ms",
        "CACHEGPT_FALLBACK": "fallback_on_error",
        "CACHEGPT_LOG_FILE": "log_file",
    }

    for env_var, config_key in env_overrides.items():
        val = os.environ.get(env_var)
        if val is not None:
            # Type coercion
            if config_key in ("similarity_threshold",):
                config[config_key] = float(val)
            elif config_key in ("default_ttl_seconds", "timeout_ms"):
                config[config_key] = int(val)
            elif config_key in ("fallback_on_error",):
                config[config_key] = val.lower() in ("true", "1", "yes")
            else:
                config[config_key] = val

    return config


def estimate_cost_saved(response_text: str, model: str) -> float:
    """Estimate cost saved by returning a cached response."""
    # Rough estimate: 1 token ≈ 4 characters
    estimated_tokens = len(response_text) / 4
    cost_rate = COST_PER_1K_TOKENS.get(model, COST_PER_1K_TOKENS["default"])
    return round((estimated_tokens / 1000) * cost_rate, 6)


def extract_provider(model: str) -> str:
    """Infer provider from model name."""
    model_lower = model.lower()
    if "claude" in model_lower:
        return "anthropic"
    elif "gpt" in model_lower:
        return "openai"
    elif "gemini" in model_lower:
        return "google"
    elif "llama" in model_lower or "mixtral" in model_lower:
        return "groq"
    elif "sonar" in model_lower or "perplexity" in model_lower:
        return "perplexity"
    return "unknown"


def cache_check(prompt: str, model: str, config: dict, logger: logging.Logger) -> dict:
    """Check CacheGPT cache for a semantic match."""
    start_time = time.time()
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    api_url = config["cachegpt_api_url"].rstrip("/")
    api_key = config["cachegpt_api_key"]
    timeout_s = config["timeout_ms"] / 1000

    if not api_key:
        logger.warning("No API key configured — skipping cache check")
        return {
            "status": "error",
            "error": "No CACHEGPT_API_KEY configured",
            "response": None,
            "cache_age_seconds": None,
            "similarity_score": None,
            "estimated_cost_saved": None,
            "provider": extract_provider(model),
            "model": model,
            "latency_ms": round((time.time() - start_time) * 1000),
        }

    try:
        resp = requests.post(
            f"{api_url}/cache/check",
            json={
                "prompt": prompt,
                "prompt_hash": prompt_hash,
                "model": model,
                "similarity_threshold": config["similarity_threshold"],
            },
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "cachegpt-openclaw-skill/1.0.0",
            },
            timeout=timeout_s,
        )

        latency_ms = round((time.time() - start_time) * 1000)

        if resp.status_code == 200:
            data = resp.json()

            if data.get("hit") and data.get("response"):
                cached_response = data["response"]
                similarity = data.get("similarity_score", 1.0)
                cache_age = data.get("cache_age_seconds", 0)
                cost_saved = estimate_cost_saved(cached_response, model)

                logger.info(
                    f"CACHE HIT | model={model} | similarity={similarity:.3f} | "
                    f"age={cache_age}s | saved=${cost_saved:.4f} | latency={latency_ms}ms"
                )

                return {
                    "status": "hit",
                    "response": cached_response,
                    "cache_age_seconds": cache_age,
                    "similarity_score": similarity,
                    "estimated_cost_saved": cost_saved,
                    "provider": extract_provider(model),
                    "model": model,
                    "latency_ms": latency_ms,
                }
            else:
                logger.info(f"CACHE MISS | model={model} | latency={latency_ms}ms")
                return {
                    "status": "miss",
                    "response": None,
                    "cache_age_seconds": None,
                    "similarity_score": data.get("similarity_score"),
                    "estimated_cost_saved": None,
                    "provider": extract_provider(model),
                    "model": model,
                    "latency_ms": latency_ms,
                }

        else:
            logger.error(f"CACHE ERROR | status={resp.status_code} | body={resp.text[:200]}")
            return {
                "status": "error",
                "error": f"CacheGPT returned HTTP {resp.status_code}",
                "response": None,
                "cache_age_seconds": None,
                "similarity_score": None,
                "estimated_cost_saved": None,
                "provider": extract_provider(model),
                "model": model,
                "latency_ms": latency_ms,
            }

    except requests.exceptions.Timeout:
        latency_ms = round((time.time() - start_time) * 1000)
        logger.error(f"CACHE TIMEOUT | model={model} | timeout={timeout_s}s | latency={latency_ms}ms")
        return {
            "status": "error",
            "error": f"CacheGPT timed out after {config['timeout_ms']}ms",
            "response": None,
            "cache_age_seconds": None,
            "similarity_score": None,
            "estimated_cost_saved": None,
            "provider": extract_provider(model),
            "model": model,
            "latency_ms": latency_ms,
        }

    except requests.exceptions.ConnectionError:
        latency_ms = round((time.time() - start_time) * 1000)
        logger.error(f"CACHE UNREACHABLE | model={model} | latency={latency_ms}ms")
        return {
            "status": "error",
            "error": "CacheGPT is unreachable",
            "response": None,
            "cache_age_seconds": None,
            "similarity_score": None,
            "estimated_cost_saved": None,
            "provider": extract_provider(model),
            "model": model,
            "latency_ms": latency_ms,
        }

    except Exception as e:
        latency_ms = round((time.time() - start_time) * 1000)
        logger.error(f"CACHE EXCEPTION | model={model} | error={str(e)}")
        return {
            "status": "error",
            "error": str(e),
            "response": None,
            "cache_age_seconds": None,
            "similarity_score": None,
            "estimated_cost_saved": None,
            "provider": extract_provider(model),
            "model": model,
            "latency_ms": latency_ms,
        }


def cache_store(prompt: str, model: str, response_text: str, config: dict, logger: logging.Logger) -> dict:
    """Store a new response in CacheGPT's cache."""
    start_time = time.time()
    prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    api_url = config["cachegpt_api_url"].rstrip("/")
    api_key = config["cachegpt_api_key"]
    timeout_s = config["timeout_ms"] / 1000

    if not api_key:
        logger.warning("No API key configured — skipping cache store")
        return {"status": "error", "error": "No CACHEGPT_API_KEY configured"}

    # Don't cache empty responses
    if not response_text or not response_text.strip():
        logger.info("Skipping cache store — empty response")
        return {"status": "skipped", "reason": "empty response"}

    try:
        resp = requests.post(
            f"{api_url}/cache/put",
            json={
                "prompt": prompt,
                "prompt_hash": prompt_hash,
                "model": model,
                "response": response_text,
                "ttl_seconds": config["default_ttl_seconds"],
            },
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "cachegpt-openclaw-skill/1.0.0",
            },
            timeout=timeout_s,
        )

        latency_ms = round((time.time() - start_time) * 1000)

        if resp.status_code in (200, 201):
            logger.info(f"CACHE STORE | model={model} | latency={latency_ms}ms")
            return {"status": "stored", "latency_ms": latency_ms}
        else:
            logger.error(f"CACHE STORE ERROR | status={resp.status_code} | body={resp.text[:200]}")
            return {"status": "error", "error": f"HTTP {resp.status_code}", "latency_ms": latency_ms}

    except requests.exceptions.Timeout:
        logger.error(f"CACHE STORE TIMEOUT | model={model}")
        return {"status": "error", "error": "timeout"}

    except requests.exceptions.ConnectionError:
        logger.error(f"CACHE STORE UNREACHABLE | model={model}")
        return {"status": "error", "error": "unreachable"}

    except Exception as e:
        logger.error(f"CACHE STORE EXCEPTION | model={model} | error={str(e)}")
        return {"status": "error", "error": str(e)}


def main():
    parser = argparse.ArgumentParser(
        description="CacheGPT Proxy — Check and store LLM response cache",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Check cache for a prompt
  %(prog)s check --prompt "What is Python?" --model "claude-sonnet-4-20250514"

  # Store a response in cache
  %(prog)s store --prompt "What is Python?" --model "claude-sonnet-4-20250514" --response "Python is..."

  # Use custom config
  %(prog)s check --prompt "Hello" --model "gpt-4o" --config /path/to/config.json
        """
    )

    subparsers = parser.add_subparsers(dest="command", help="Operation to perform")

    # Check subcommand
    check_parser = subparsers.add_parser("check", help="Check cache for a prompt")
    check_parser.add_argument("--prompt", required=True, help="The prompt to check")
    check_parser.add_argument("--model", required=True, help="The model name")
    check_parser.add_argument("--config", default=DEFAULT_CONFIG_PATH, help="Path to config.json")

    # Store subcommand
    store_parser = subparsers.add_parser("store", help="Store a response in cache")
    store_parser.add_argument("--prompt", required=True, help="The original prompt")
    store_parser.add_argument("--model", required=True, help="The model name")
    store_parser.add_argument("--response", required=True, help="The LLM response to cache")
    store_parser.add_argument("--config", default=DEFAULT_CONFIG_PATH, help="Path to config.json")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    config = load_config(args.config)
    logger = setup_logging(config["log_file"])

    if args.command == "check":
        result = cache_check(args.prompt, args.model, config, logger)
    elif args.command == "store":
        result = cache_store(args.prompt, args.model, args.response, config, logger)
    else:
        parser.print_help()
        sys.exit(1)

    # Output JSON to stdout (this is what OpenClaw reads)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
