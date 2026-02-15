-- Donations table
CREATE TABLE IF NOT EXISTS donations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own donations" ON donations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage donations" ON donations
  FOR ALL USING (true) WITH CHECK (true);

-- Public donation stats view (no PII)
CREATE OR REPLACE VIEW public_donation_stats AS
SELECT
  COUNT(*) as total_donations,
  COALESCE(SUM(amount_cents), 0) as total_amount_cents,
  COUNT(DISTINCT user_id) as unique_donors,
  COALESCE(AVG(amount_cents), 0) as avg_donation_cents
FROM donations
WHERE status = 'completed';
