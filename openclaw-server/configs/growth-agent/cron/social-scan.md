# CacheGPT Growth Agent — Cron Jobs

## Reddit Scan (every 15 minutes)

```cron
*/15 * * * *
```

**Action:** `scan`
**Skill:** `cachegpt-growth`

Scan target subreddits for new posts/comments matching LLM cost keywords:
1. Rotate through keyword/subreddit combinations
2. Score new opportunities 1-10
3. Draft responses for opportunities scoring 7+
4. Log all results to /var/log/openclaw/growth-opportunities.jsonl
5. Max 20 search requests per cycle

---

## Opportunity Digest — Morning (8:00 AM CT)

```cron
0 8 * * *
```

**Action:** `digest`
**Skill:** `cachegpt-growth`

Compile and send Telegram digest of opportunities found since the last digest.

---

## Opportunity Digest — Noon (12:00 PM CT)

```cron
0 12 * * *
```

**Action:** `digest`
**Skill:** `cachegpt-growth`

---

## Opportunity Digest — Afternoon (4:00 PM CT)

```cron
0 16 * * *
```

**Action:** `digest`
**Skill:** `cachegpt-growth`

---

## Opportunity Digest — Evening (8:00 PM CT)

```cron
0 20 * * *
```

**Action:** `digest`
**Skill:** `cachegpt-growth`
