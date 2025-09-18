# CacheGPT Long-term Data Retention Plan

## Current Situation
- **Free Tier Limit**: 1GB database storage
- **Row Size**: ~3-5KB per cached response
- **Max Capacity**: ~200,000-300,000 responses before hitting limits
- **Growth Rate**: Depends on usage, but could fill in 3-6 months with heavy use

## Immediate Actions Needed

### 1. Enable Supabase pg_cron Extension
Go to Supabase Dashboard → Database → Extensions → Enable `pg_cron`

### 2. Run Initial Setup
```sql
-- Create the first 3 months of partitions
SELECT auto_create_partitions();

-- Set up weekly maintenance
SELECT cron.schedule('weekly-maintenance', '0 2 * * 0', 'SELECT * FROM weekly_maintenance();');

-- Set up monthly partition creation
SELECT cron.schedule('create-partitions', '0 0 1 * *', 'SELECT auto_create_partitions();');
```

## Data Retention Tiers

### Tier 1: Hot Cache (0-30 days)
- **Keep**: Everything
- **Access**: Full vector search + embeddings
- **Purpose**: Active working set

### Tier 2: Warm Cache (31-90 days)
- **Keep**: Frequently accessed (access_count > 2)
- **Remove**: Single-access entries older than 30 days
- **Purpose**: Popular recurring queries

### Tier 3: Cold Storage (91-180 days)
- **Archive**: Compress and move to archive table
- **Keep**: Only high-value responses (long, frequently accessed)
- **Purpose**: Historical reference

### Tier 4: Deletion (>180 days)
- **Delete**: All except extremely high-value content
- **Purpose**: Space management

## Automatic Maintenance Schedule

### Daily
- Monitor space usage
- Alert if >80% capacity

### Weekly
- Deduplicate entries
- Clean low-value cache
- Archive old responses
- Update statistics

### Monthly
- Create new partitions
- Drop old empty partitions
- Full vacuum if needed

## Space Optimization Strategies

### 1. Response Compression
- Compress responses >1KB
- Use PostgreSQL's built-in compression
- Saves ~50-70% space

### 2. Embedding Optimization
- Consider smaller models (384 → 256 dimensions)
- Remove embeddings from old entries
- Saves ~40% space per row

### 3. Intelligent Caching
- Don't cache short responses (<100 chars)
- Don't cache error messages
- Cache only valuable queries

## Monitoring Dashboard Queries

### Space Usage
```sql
SELECT * FROM cache_metrics;
SELECT * FROM partition_sizes;
```

### Cache Effectiveness
```sql
SELECT * FROM usage_patterns;
```

### When to Take Action
```sql
-- Check if cleanup needed
SELECT
  pg_size_pretty(pg_database_size(current_database())) as db_size,
  CASE
    WHEN pg_database_size(current_database()) > 900000000 THEN 'CRITICAL - Run emergency_cleanup()'
    WHEN pg_database_size(current_database()) > 750000000 THEN 'WARNING - Run weekly_maintenance()'
    ELSE 'OK'
  END as status;
```

## Emergency Procedures

### If approaching 1GB limit:
```sql
-- Remove 30% of least valuable content
SELECT emergency_cleanup(30);
```

### If over 1GB:
```sql
-- Aggressive cleanup - keep only top 100k entries
SELECT keep_top_cache_entries(100000);
```

## Long-term Scaling Options

### Option 1: Upgrade Supabase Plan ($25/month)
- 8GB database storage
- 2M vector embeddings
- ~1.6M cached responses capacity

### Option 2: External Storage
- Move old data to S3/CloudFlare R2
- Keep only recent 30 days in Supabase
- Implement two-tier cache

### Option 3: Distributed Caching
- Use Redis for hot cache
- Supabase for warm cache
- S3 for cold archive

## Implementation Priority

1. **Week 1**: Set up automated cleanup functions
2. **Week 2**: Enable monitoring and alerts
3. **Month 1**: Implement compression
4. **Month 2**: Add intelligent cache scoring
5. **Month 3**: Evaluate need for plan upgrade

## Expected Outcomes

With this strategy:
- **Storage Efficiency**: 3x more responses in same space
- **Performance**: Faster queries on smaller dataset
- **Cost**: Stay within free tier for 6-12 months
- **Reliability**: Automatic prevention of space issues

## CLI Integration

The CLI (v6.2.0+) already handles:
- Missing partitions gracefully
- Multiple function name variants
- Automatic retries

Future CLI updates will add:
- Cache-Control headers
- TTL hints for responses
- Skip-cache flags for non-valuable queries