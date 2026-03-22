# CacheGPT Monitoring — Cron Jobs

## Health Check (every 5 minutes)

```cron
*/5 * * * *
```

**Action:** `health_check`
**Skill:** `cachegpt-monitor`

Run the full health check suite:
1. HTTP availability check on cachegpt.app
2. Cache pipeline endpoint test
3. Latency measurement and threshold check
4. SSL certificate expiration check
5. Log results to /var/log/openclaw/health-checks.jsonl

On failure, send Telegram alert per the alerting rules in the monitoring skill.

---

## Synthetic Cache Test (every 30 minutes)

```cron
*/30 * * * *
```

**Action:** `synthetic_test`
**Skill:** `cachegpt-monitor`

Run the synthetic cache test suite:
1. Cache miss verification (unique prompt)
2. Cache store verification
3. Cache hit verification (same prompt)
4. Semantic similarity verification (reworded prompt)
5. Log results to /var/log/openclaw/synthetic-tests.jsonl

Alert if hit rate drops below 50% across last 4 cycles.

---

## Daily Summary (8:00 AM CT)

```cron
0 8 * * *
```

**Action:** `daily_summary`
**Skill:** `cachegpt-monitor`

Compile 24-hour statistics from log files and send Telegram digest:
- Uptime percentage
- Average latency (site, cache hits, cache misses)
- Synthetic test hit rate and similarity scores
- Alert count by severity
- Current unresolved issues
