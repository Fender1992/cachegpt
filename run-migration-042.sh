#!/bin/bash
# Run migration 042: External Context-Aware Caching

set -e

# Check if SUPABASE_DB_PASSWORD is set
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "Error: SUPABASE_DB_PASSWORD environment variable is not set"
  echo "Set it with: export SUPABASE_DB_PASSWORD='your_password'"
  exit 1
fi

echo "Running migration 042: External Context-Aware Caching..."

PGPASSWORD="$SUPABASE_DB_PASSWORD" psql \
  -h "aws-0-us-east-1.pooler.supabase.com" \
  -p 6543 \
  -d "postgres" \
  -U "postgres.ntekfgvkbuzjwmftqchr" \
  -f "$(dirname "$0")/database-scripts/042_external_context_caching.sql"

echo "Migration completed successfully!"
