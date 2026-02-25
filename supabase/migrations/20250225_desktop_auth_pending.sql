-- Temporary storage for desktop OAuth token exchange.
-- The callback page stores tokens here; the desktop app polls to retrieve them.
-- Rows auto-cleaned: tokens expire after 5 minutes (enforced in API).

CREATE TABLE IF NOT EXISTS desktop_auth_pending (
  state TEXT PRIMARY KEY,
  tokens JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow service role full access (API uses service key)
ALTER TABLE desktop_auth_pending ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed — only the service role key accesses this table.
-- Cleanup old rows periodically (optional cron, or API deletes on read).
