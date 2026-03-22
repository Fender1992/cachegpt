# CacheGPT Growth Agent — Project State

## Purpose
Monitor Reddit for LLM API cost conversations and flag organic promotion opportunities for CacheGPT. Never auto-posts — only monitors, scores, and drafts for human review.

## Current Status
- [ ] Initial deployment
- [ ] Reddit scanning operational
- [ ] Opportunity scoring working
- [ ] Response drafting quality verified
- [ ] Telegram digests flowing
- [ ] De-duplication confirmed

## Architecture
- Runs on Ubuntu home server in Docker sandbox
- OpenClaw agent with Telegram channel
- Cron-based Reddit scanning every 15 min
- Telegram digests every 4 hours (8AM-8PM CT)
- All opportunities logged to JSONL for analysis

## Scan Targets
- Subreddits: r/LocalLLaMA, r/ChatGPT, r/artificial, r/MachineLearning, r/SaaS, r/webdev, r/selfhosted
- Keywords: LLM API costs, token costs, API spending, reduce AI costs, caching LLM, semantic cache, etc.
- Priority: OpenClaw-related cost discussions

## Known Issues
(none yet — document issues as they arise)

## Configuration
- Max searches per cycle: 20
- Minimum score for draft: 7
- Max post age: 48 hours
- Digest hours: 8AM, 12PM, 4PM, 8PM CT
- Timezone: America/Chicago (CT)
