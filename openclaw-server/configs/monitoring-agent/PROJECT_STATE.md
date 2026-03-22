# CacheGPT Monitoring Agent — Project State

## Purpose
24/7 health monitoring for cachegpt.app with Telegram alerting.

## Current Status
- [ ] Initial deployment
- [ ] Health checks running
- [ ] Synthetic cache tests running
- [ ] Telegram alerting configured
- [ ] Daily summaries working

## Architecture
- Runs on Ubuntu home server in Docker sandbox
- OpenClaw agent with Telegram channel
- Cron-based health checks every 5 min
- Synthetic cache tests every 30 min
- Daily digest at 8:00 AM CT

## Known Issues
(none yet — document issues as they arise)

## Configuration
- CacheGPT API URL: https://cachegpt.app/api
- Test prompt for synthetic checks: "What is semantic caching and how does it save money on LLM API calls?"
- Alert escalation: 15 min threshold
- Timezone: America/Chicago (CT)
