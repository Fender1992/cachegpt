---
name: draft-watcher
description: Watch for new drafted responses from the CacheGPT growth agent and send instant Telegram alerts with the full draft for review.
version: 1.0.0
metadata:
  openclaw:
    emoji: "🔔"
    requires:
      bins: ["python3", "curl", "jq"]
      env: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]
    tags: ["alerts", "monitoring", "drafts", "growth"]
---

# Draft Response Watcher

You monitor the growth agent's log file for new drafted responses and immediately send a Telegram alert with the full context so the operator can review and post them.

## How It Works

The growth agent writes opportunities to a JSONL log file. This watcher:
1. Reads the log file every 2 minutes
2. Tracks which entries have already been alerted on (by post_id)
3. For any NEW entry that has a `drafted_response`, sends an instant Telegram alert
4. Only alerts on entries with score >= 7 (actionable opportunities)

## Check Action (every 2 minutes)

When the `check` action is triggered:

1. **Read the log file:** `/var/log/openclaw/growth-opportunities.jsonl`
   - Fallback paths: `~/openclaw-server/logs/growth/growth-opportunities.jsonl`

2. **Load the alert state file:** `/var/log/openclaw/draft-alerts-sent.json`
   - This file contains a list of post_ids that have already been alerted
   - If the file doesn't exist, create it as an empty array `[]`

3. **Find new drafts:**
   - Parse each line of the JSONL log
   - Filter for entries where:
     - `drafted_response` is not null/empty
     - `score` >= 7
     - `post_id` is NOT in the already-alerted list
   - These are the new drafts to alert on

4. **Send Telegram alert for each new draft:**

   Format each alert as:

   ```
   🔔 New Draft Response Ready

   📊 Score: [score]/10
   📍 [subreddit] — "[title]"
   🔗 [url]
   👤 [author] | ⏰ [age]h old | 💬 [comments] comments
   🏷️ Keywords: [matched_keywords]
   😤 Sentiment: [sentiment]

   ✏️ Draft:
   [full drafted_response text]

   ⚠️ [subreddit_flags if any]

   Reply with "posted" to mark as actioned.
   ```

5. **Update the alert state:**
   - Add the post_ids of all newly alerted entries to `draft-alerts-sent.json`
   - Save the file

6. **If no new drafts found:** Do nothing. Don't send a "no new drafts" message — that would be noise.

## Rules

1. **Alert immediately on new drafts.** The whole point is speed — the operator wants to post while the Reddit thread is still active.

2. **Never alert on the same draft twice.** Track alerted post_ids persistently in the state file.

3. **Only alert on score >= 7.** Lower-scored entries are logged for analytics but don't need human attention.

4. **Include the FULL draft text.** The operator needs to read, possibly edit, and post directly from the Telegram message. Don't truncate.

5. **Include the Reddit URL.** The operator needs to click through and post the response.

6. **Be quiet when there's nothing.** No "all clear" messages, no summaries, no noise. Only alert when there's a new draft to review.

7. **Run lean.** This agent uses Claude Haiku (cheapest model) since it's just reading a file and sending messages. No complex reasoning needed.

## State Files

- **Log input:** `/var/log/openclaw/growth-opportunities.jsonl` (read-only, written by growth agent)
- **Alert state:** `/var/log/openclaw/draft-alerts-sent.json` (read-write, tracks what's been alerted)

## Implementation

Use this bash approach to check for new drafts:

```bash
# Read the log, filter for drafts with score >= 7
python3 -c "
import json, os

LOG = '/var/log/openclaw/growth-opportunities.jsonl'
STATE = '/var/log/openclaw/draft-alerts-sent.json'

# Fallback paths
for path in [LOG, os.path.expanduser('~/openclaw-server/logs/growth/growth-opportunities.jsonl')]:
    if os.path.isfile(path):
        LOG = path
        break

# Load already-alerted IDs
alerted = set()
state_path = STATE if os.path.isfile(STATE) else os.path.expanduser('~/openclaw-server/logs/growth/draft-alerts-sent.json')
if os.path.isfile(state_path):
    alerted = set(json.load(open(state_path)))

# Find new drafts
new_drafts = []
if os.path.isfile(LOG):
    for line in open(LOG):
        try:
            e = json.loads(line.strip())
            if (e.get('drafted_response')
                and e.get('score', 0) >= 7
                and e.get('post_id') not in alerted):
                new_drafts.append(e)
        except: pass

# Output new drafts as JSON
print(json.dumps(new_drafts, indent=2))
"
```

Then for each new draft, send a Telegram message using:
```bash
curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"...\", \"parse_mode\": \"Markdown\"}"
```

After sending all alerts, update the state file with the new post_ids.
