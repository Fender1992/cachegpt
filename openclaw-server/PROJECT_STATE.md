# OpenClaw Server Deployment — Project State

## Purpose
Run CacheGPT monitoring and growth agents 24/7 on Ubuntu home server.

## Current Status
- [ ] Docker image built
- [ ] Monitoring agent deployed and healthy
- [ ] Growth agent deployed and healthy
- [ ] Telegram alerting verified
- [ ] Daily backups configured

## Architecture
- Host: Ubuntu home server
- Docker Compose with 2 isolated services
- Network egress restricted per agent
- Persistent volumes for config/memory/logs
- Daily backups via cron

## Access
- Monitoring agent gateway: http://127.0.0.1:18789
- Growth agent gateway: http://127.0.0.1:18790
- Logs: ~/openclaw-server/logs/
- Backups: ~/openclaw-backups/

## Security Checklist
- [ ] Non-root user in containers
- [ ] Read-only root filesystem
- [ ] All capabilities dropped
- [ ] Ports bound to loopback only
- [ ] Gateway password set
- [ ] API keys in .env (not in compose file)
- [ ] Network egress restricted per agent
- [ ] No Docker socket mounted
