# Query Ranking & Archival System Options

## Overview
To improve database performance by archiving unpopular queries while keeping hot queries readily accessible.

## Option 1: Simple Popularity Score (Recommended for Start)

### How it Works
- Adds `popularity_score` column to `cached_responses`
- Score based on: access count (30%), recency (30%), age (20%), cost saved (20%)
- Queries below score 20 + 30 days inactive → archived

### Pros
- ✅ Easy to implement and understand
- ✅ Minimal database changes
- ✅ Can be rolled back easily
- ✅ Low computational overhead

### Cons
- ❌ Less sophisticated than ML approaches
- ❌ May miss seasonal patterns

### Implementation
```sql
-- Add to your database
psql $DATABASE_URL < database-scripts/010_query_ranking_system.sql

-- Manual archival
SELECT archive_unpopular_queries(20, 30, 1000);

-- Check stats
SELECT * FROM get_ranking_stats();
```

## Option 2: Tiered System with Separate Archive Table

### How it Works
- Moves cold queries to `cached_responses_archive` table
- 5 tiers: hot → warm → cool → cold → frozen
- Partitioned archive table for better performance

### Tiers Definition
| Tier | Score | Behavior | Cache TTL |
|------|-------|----------|-----------|
| **Hot** | 80+ | Keep in memory | 90 days |
| **Warm** | 60-79 | Standard cache | 60 days |
| **Cool** | 40-59 | Slower retrieval | 30 days |
| **Cold** | 20-39 | Archive candidate | 14 days |
| **Frozen** | <20 | Archive immediately | Move to archive |

### Pros
- ✅ Better performance for active queries
- ✅ Historical data preserved
- ✅ Can query archives when needed
- ✅ Reduces main table size

### Cons
- ❌ More complex to implement
- ❌ Requires archive table management
- ❌ Query changes for archive access

## Option 3: Smart Ranking with Predictive Features

### How it Works
- Dedicated `query_rankings` table with advanced metrics
- Tracks: hourly/daily/weekly access patterns
- Predicts future usage based on patterns
- Auto-adjusts thresholds based on capacity

### Advanced Metrics
```sql
-- Example scoring algorithm
Score = (
  0.4 × Recent_Activity_Score +    -- Last 24h hits
  0.3 × Usage_Trend_Score +         -- Growing/declining
  0.2 × Economic_Value_Score +      -- Cost savings
  0.1 × User_Diversity_Score        -- Unique users
) × Time_Decay_Factor
```

### Pros
- ✅ Most intelligent system
- ✅ Adapts to usage patterns
- ✅ Predictive capabilities
- ✅ Better for large scale

### Cons
- ❌ Complex implementation
- ❌ Higher computational cost
- ❌ Requires tuning

## Option 4: Hybrid Approach (Best Balance)

### Combines
1. **Simple scoring** for real-time decisions
2. **Tiered archival** for cold storage
3. **Monitoring views** for insights

### Implementation Strategy

#### Phase 1 (Week 1)
```sql
-- Add popularity scoring
ALTER TABLE cached_responses
ADD COLUMN popularity_score DECIMAL(10,4) DEFAULT 0;

-- Create scoring function
CREATE OR REPLACE FUNCTION calculate_popularity_score(...);
```

#### Phase 2 (Week 2)
```sql
-- Add archival flag
ALTER TABLE cached_responses
ADD COLUMN is_archived BOOLEAN DEFAULT false;

-- Create archival job
CREATE OR REPLACE FUNCTION archive_unpopular_queries(...);
```

#### Phase 3 (Week 3)
```sql
-- Create monitoring views
CREATE VIEW query_tier_distribution AS ...;
CREATE VIEW archival_candidates AS ...;
```

## Recommended Configuration

### Scoring Weights
```javascript
const SCORING_CONFIG = {
  weights: {
    access_frequency: 0.3,  // How often accessed
    recency: 0.3,          // How recently accessed
    age_penalty: 0.2,      // Penalize old queries
    economic_value: 0.2    // Cost savings generated
  },
  thresholds: {
    archive: 20,           // Score below this → archive
    inactive_days: 30,     // Days before considering archive
    batch_size: 1000       // Archive in batches
  },
  decay: {
    half_life_days: 7      // Score halves every 7 days
  }
};
```

### Archival Rules
1. **Never archive if**:
   - Accessed in last 7 days
   - Score > 40
   - Marked as "pinned"

2. **Always archive if**:
   - Score < 10
   - Not accessed in 60+ days
   - Error responses

3. **Consider archiving if**:
   - Score 10-20
   - Not accessed in 30+ days
   - Low cost savings

## Monitoring Queries

### Check Distribution
```sql
-- See query distribution by tier
SELECT * FROM query_tier_distribution;

-- Output:
-- tier  | query_count | avg_accesses | total_cost_saved
-- hot   | 245        | 523.4        | 125.43
-- warm  | 892        | 82.1         | 89.21
-- cool  | 2341       | 12.3         | 45.67
-- cold  | 5672       | 2.1          | 12.34
-- frozen| 8901       | 0.4          | 3.21
```

### Find Candidates
```sql
-- See what will be archived
SELECT * FROM archival_candidates LIMIT 10;
```

### Get Stats
```sql
-- Overall statistics
SELECT * FROM get_ranking_stats();

-- Output:
-- total_queries: 18051
-- active_queries: 9150
-- archived_queries: 8901
-- hot_queries: 245
-- avg_popularity_score: 42.3
-- total_cost_saved: 275.86
-- queries_to_archive: 1234
```

## Automation Options

### 1. PostgreSQL pg_cron (Built-in)
```sql
-- Updates every 6 hours
SELECT cron.schedule('update-rankings', '0 */6 * * *',
  'UPDATE cached_responses SET popularity_score = ...');

-- Archive daily at 3 AM
SELECT cron.schedule('archive-cold', '0 3 * * *',
  'SELECT archive_unpopular_queries()');
```

### 2. External Cron Job
```bash
# Add to crontab
0 */6 * * * psql $DATABASE_URL -c "SELECT update_all_rankings();"
0 3 * * * psql $DATABASE_URL -c "SELECT archive_unpopular_queries();"
```

### 3. Application-Level Job
```typescript
// In your Next.js API
import { cron } from 'node-cron';

cron.schedule('0 */6 * * *', async () => {
  await db.query('SELECT update_all_rankings()');
});
```

## Performance Impact

### Before Archival
- Table size: 500MB
- Average query: 45ms
- Index size: 120MB

### After Archival (Expected)
- Active table: 150MB (-70%)
- Average query: 12ms (-73%)
- Index size: 35MB (-71%)
- Archived: 350MB (compressed)

## Quick Start

```bash
# 1. Apply the migration
psql $DATABASE_URL < database-scripts/010_query_ranking_system.sql

# 2. Calculate initial scores
psql $DATABASE_URL -c "UPDATE cached_responses SET popularity_score = calculate_popularity_score(access_count, created_at, last_accessed, cost_saved);"

# 3. Check distribution
psql $DATABASE_URL -c "SELECT * FROM query_tier_distribution;"

# 4. Preview what will be archived
psql $DATABASE_URL -c "SELECT * FROM archival_candidates LIMIT 10;"

# 5. Run archival (dry run)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM archival_candidates;"

# 6. Execute archival
psql $DATABASE_URL -c "SELECT archive_unpopular_queries();"
```

## Rollback Plan

```sql
-- If needed, restore archived queries
UPDATE cached_responses
SET is_archived = false,
    archived_at = NULL
WHERE is_archived = true;

-- Or move from archive table back
INSERT INTO cached_responses
SELECT * FROM cached_responses_archive;

-- Remove the system
ALTER TABLE cached_responses
DROP COLUMN popularity_score,
DROP COLUMN is_archived,
DROP COLUMN archived_at;
```