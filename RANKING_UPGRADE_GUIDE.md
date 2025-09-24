# Progressive Query Ranking System - Upgrade Guide

## Current Implementation Path

### Phase 1: Simple Scoring (Now)
**When**: 0 - 10,000 queries
```sql
-- You are here!
-- Using simple weighted scoring
Score = 30% Access + 30% Recency + 20% Age + 20% Value
```

### Phase 2: Advanced Scoring with Metadata
**When**: 10,000+ queries OR 500+ daily queries
```sql
-- Upgrade command:
SELECT upgrade_ranking_system(2);

-- What changes:
- Collects hourly/daily/weekly patterns
- Tracks unique users per query
- Measures response time patterns
- Better trend detection
```

### Phase 3: Tiered Archival System
**When**: 50,000+ queries OR 2,000+ daily queries
```sql
-- Upgrade command:
SELECT upgrade_ranking_system(3);

-- What changes:
- Separate archive table
- 5-tier system (hot/warm/cool/cold/frozen)
- Partitioned archives by month
- Faster main table queries
```

### Phase 4: Predictive Caching
**When**: 100,000+ queries OR 5,000+ daily queries
```sql
-- Upgrade command:
SELECT upgrade_ranking_system(4);

-- What changes:
- ML-based predictions
- Time-series analysis
- Auto-scaling thresholds
- Predictive pre-warming
```

## How to Monitor Your Growth

### Check Current Status
```sql
-- See where you are
SELECT * FROM check_upgrade_readiness();

-- Example output:
-- current_phase: 1
-- ready_for_next: false
-- recommendation: "Continue with V1. Need 7,234 more queries."
-- metrics: {"total_queries": 2766, "daily_queries": 145}
```

### View Dashboard
```sql
-- Overall metrics
SELECT * FROM ranking_dashboard;

-- Shows:
-- - Query distribution by tier
-- - Cost savings by tier
-- - System performance
-- - Enabled features
```

### Monitor Performance
```sql
-- See what's being archived
SELECT
  tier,
  COUNT(*) as queries,
  AVG(popularity_score) as avg_score,
  SUM(cost_saved) as value
FROM cached_responses
WHERE NOT is_archived
GROUP BY tier
ORDER BY tier;
```

## Feature Flags (Control Without Code Changes)

### View Current Features
```sql
SELECT * FROM ranking_features;

-- Output:
-- feature_name         | is_enabled | config
-- use_v2_scoring      | false      | {"min_queries": 10000}
-- use_tier_archival   | false      | {"enabled_after_queries": 50000}
-- collect_metadata    | false      | {"sample_rate": 0.1}
-- predictive_caching  | false      | {"algorithm": "time_series"}
```

### Enable Features Manually
```sql
-- Turn on metadata collection early (if you want)
UPDATE ranking_features
SET is_enabled = true
WHERE feature_name = 'collect_metadata';

-- Increase metadata sampling rate
UPDATE ranking_features
SET config = jsonb_set(config, '{sample_rate}', '0.25')
WHERE feature_name = 'collect_metadata';
```

## Implementation Timeline

### Week 1 (Current)
```bash
# Apply progressive system
psql $DATABASE_URL < database-scripts/011_progressive_ranking_system.sql

# Initial setup
psql $DATABASE_URL -c "SELECT archive_unpopular_queries();"
```

### Month 1-3
- Monitor with `check_upgrade_readiness()`
- System auto-recommends when to upgrade
- No manual intervention needed

### Month 3-6
- Likely ready for Phase 2
- Run upgrade when recommended
- Metadata collection begins

### Month 6-12
- Phase 3 tier system activates
- Archive table created automatically
- Better performance at scale

### Year 2+
- Predictive features available
- ML-based optimizations
- Self-tuning system

## Automatic Scaling Triggers

The system watches for these signals:

### Load Indicators
```sql
-- Built-in monitoring
CREATE OR REPLACE FUNCTION auto_upgrade_check()
RETURNS VOID AS $$
DECLARE
  v_recommendation RECORD;
BEGIN
  SELECT * INTO v_recommendation FROM check_upgrade_readiness();

  IF v_recommendation.ready_for_next THEN
    -- Log recommendation (or auto-upgrade if configured)
    INSERT INTO system_events (event_type, details)
    VALUES ('upgrade_ready', v_recommendation.metrics);

    -- Optional: Auto-upgrade
    -- PERFORM upgrade_ranking_system(v_recommendation.current_phase + 1);
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Performance Thresholds
- Query time > 50ms → Consider Phase 2
- Table size > 1GB → Consider Phase 3
- Cache hit rate < 60% → Consider Phase 4

## Rollback Options

### Downgrade If Needed
```sql
-- Go back to simple scoring
UPDATE cached_responses SET ranking_version = 1;
UPDATE ranking_features SET is_enabled = false;

-- Keep the columns/data, just use simpler algorithm
```

### Emergency Archive Restore
```sql
-- Bring back archived queries if needed
UPDATE cached_responses
SET is_archived = false
WHERE archived_at > NOW() - INTERVAL '7 days';
```

## Configuration Examples

### Conservative Settings (Safe)
```sql
-- Archive very cautiously
SELECT archive_unpopular_queries(
  p_score_threshold := 10,    -- Very low score only
  p_days_inactive := 60,      -- 2 months inactive
  p_batch_size := 100         -- Small batches
);
```

### Aggressive Settings (Max Performance)
```sql
-- Archive aggressively
SELECT archive_unpopular_queries(
  p_score_threshold := 40,    -- Higher threshold
  p_days_inactive := 14,      -- 2 weeks inactive
  p_batch_size := 5000        -- Large batches
);
```

### Custom Schedule
```sql
-- Modify cron schedule for more frequent updates
SELECT cron.alter('update-basic-rankings', '0 * * * *');  -- Every hour
SELECT cron.alter('archive-queries', '0 */12 * * *');     -- Twice daily
```

## API Integration

### Add to your Next.js API
```typescript
// app/api/ranking/status/route.ts
import { getSupabaseService } from '@/lib/supabase-factory';

export async function GET() {
  const supabase = getSupabaseService();

  const { data: readiness } = await supabase
    .rpc('check_upgrade_readiness');

  const { data: dashboard } = await supabase
    .from('ranking_dashboard')
    .select('*')
    .single();

  return Response.json({
    readiness,
    dashboard,
    recommendation: readiness.recommendation
  });
}
```

### Dashboard Component
```tsx
// components/RankingStatus.tsx
export function RankingStatus() {
  const { data } = useSWR('/api/ranking/status');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Query Ranking System</CardTitle>
        <Badge>{`Phase ${data?.readiness.current_phase}`}</Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Progress value={data?.dashboard.archived_percentage} />
          <p className="text-sm text-muted-foreground">
            {data?.readiness.recommendation}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

## Quick Commands Reference

```bash
# Check status
psql $DATABASE_URL -c "SELECT * FROM check_upgrade_readiness();"

# View dashboard
psql $DATABASE_URL -c "SELECT * FROM ranking_dashboard;"

# Manual archive run
psql $DATABASE_URL -c "SELECT * FROM archive_unpopular_queries();"

# Force upgrade (when ready)
psql $DATABASE_URL -c "SELECT upgrade_ranking_system(2);"

# Check feature flags
psql $DATABASE_URL -c "SELECT * FROM ranking_features;"
```

## Growth Milestones

| Queries | Phase | Key Benefit |
|---------|-------|-------------|
| 0-10K | 1 | Simple, effective archival |
| 10K-50K | 2 | Smart metadata tracking |
| 50K-100K | 3 | Tiered performance optimization |
| 100K+ | 4 | Predictive, self-optimizing |

The system will guide you at each step! 🚀