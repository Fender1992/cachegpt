# CacheGPT Skill — ClawHub Publishing Guide

## Pre-Publish Checklist

- [x] SKILL.md frontmatter validates as proper YAML
- [x] All metadata fields populated (name, description, version, emoji, requires, install, tags)
- [x] Python script has no hardcoded secrets
- [x] config.json.example has placeholder values only
- [x] README.md is complete with installation, configuration, and FAQ
- [x] test-skill.sh passes all 25 checks
- [x] No security flags (no wallet access, no obfuscated code, no base64-encoded commands)

## Publishing Steps

### 1. Install ClawHub CLI

```bash
npm i -g clawhub
```

### 2. Authenticate

```bash
clawhub auth
```

This opens a browser for GitHub OAuth. Authorize ClawHub to access your GitHub account.

### 3. Copy Skill to OpenClaw Workspace (for local testing)

```bash
mkdir -p ~/.openclaw/workspace/skills/
cp -r ~/cachegpt/openclaw-skill/cachegpt ~/.openclaw/workspace/skills/cachegpt
```

Verify it loads:
```bash
openclaw skills list
```

### 4. Publish to ClawHub

```bash
clawhub publish ~/.openclaw/workspace/skills/cachegpt \
  --slug cachegpt \
  --name "CacheGPT" \
  --version 1.0.0 \
  --tags latest
```

### 5. Verify Publication

```bash
clawhub inspect cachegpt
```

Should show:
- Name: CacheGPT
- Version: 1.0.0
- Tags: caching, cost-savings, llm, api, tokens, optimization
- Install count: 0 (initially)

### 6. Test Install from ClawHub

```bash
# Remove local copy
rm -rf ~/.openclaw/workspace/skills/cachegpt

# Install from ClawHub
clawhub install cachegpt

# Verify
openclaw skills list
```

## Post-Publish

### Create GitHub Repository

```bash
# Create the repo
gh repo create Fender1992/openclaw-cachegpt-skill \
  --public \
  --description "OpenClaw skill for CacheGPT semantic LLM caching — saves up to 80% on token costs" \
  --clone

# Copy skill files
cp -r ~/cachegpt/openclaw-skill/cachegpt/* ./openclaw-cachegpt-skill/

# Add, commit, push
cd openclaw-cachegpt-skill
git add -A
git commit -m "Initial release: CacheGPT OpenClaw skill v1.0.0"
git push origin main
```

### Launch Post Template (Reddit)

Post to r/LocalLLaMA, r/selfhosted:

**Title:** "Built an OpenClaw skill that caches LLM API calls semantically — saves 40-80% on token costs"

**Body:**

```
Hey all — I built CacheGPT (cachegpt.app), a semantic caching layer that sits between you
and your LLM provider. When you ask something similar to a previous query, it returns the
cached response in <10ms instead of making a fresh API call.

Just published it as an OpenClaw skill so any OpenClaw user can install it:

    clawhub install cachegpt

How it works:
- Every prompt gets a 384-dim embedding via pgvector
- Cache checks use cosine similarity (configurable threshold, default 0.85)
- Cache hits return in <10ms vs 2-10s for fresh calls
- Misses fall through to your provider normally and get cached for next time

Free tier: 500 messages/day, all providers (OpenAI, Anthropic, Google, Groq, Perplexity),
all models, no credit card.

If CacheGPT is ever unreachable, the skill silently falls through — your prompts are never
blocked.

GitHub: github.com/Fender1992/openclaw-cachegpt-skill
Site: cachegpt.app

Happy to answer questions about the implementation or caching approach.
```

## Version Update Process

For future updates:

1. Update `version` in SKILL.md frontmatter
2. Update changelog in README.md
3. Run `bash test-skill.sh` to verify
4. Publish: `clawhub publish ~/.openclaw/workspace/skills/cachegpt --version X.Y.Z --tags latest`
5. Push to GitHub repo
