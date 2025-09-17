-- Subscription and Billing Tables
-- Run this script after setup_database.sql

-- Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  yearly_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  monthly_requests INTEGER NOT NULL DEFAULT 0,
  max_cache_entries INTEGER NOT NULL DEFAULT 1000,
  api_keys_limit INTEGER NOT NULL DEFAULT 1,
  analytics_retention_days INTEGER NOT NULL DEFAULT 30,
  priority_support BOOLEAN DEFAULT FALSE,
  custom_models BOOLEAN DEFAULT FALSE,
  team_collaboration BOOLEAN DEFAULT FALSE,
  advanced_caching BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default subscription plans
INSERT INTO subscription_plans (
  name, display_name, description, monthly_price, yearly_price,
  monthly_requests, max_cache_entries, api_keys_limit,
  analytics_retention_days, priority_support, custom_models,
  team_collaboration, advanced_caching
) VALUES
(
  'free', 'Free Tier', 'Perfect for getting started',
  0.00, 0.00, 1000, 100, 1, 7,
  FALSE, FALSE, FALSE, FALSE
),
(
  'startup', 'Startup', 'For growing applications',
  29.00, 290.00, 50000, 5000, 3, 30,
  FALSE, FALSE, FALSE, TRUE
),
(
  'business', 'Business', 'For scaling businesses',
  99.00, 990.00, 500000, 50000, 10, 90,
  TRUE, TRUE, TRUE, TRUE
),
(
  'enterprise', 'Enterprise', 'For large organizations',
  299.00, 2990.00, -1, -1, -1, 365,
  TRUE, TRUE, TRUE, TRUE
) ON CONFLICT (name) DO NOTHING;

-- User Subscriptions Table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid')),
  billing_cycle TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMP DEFAULT NOW(),
  current_period_end TIMESTAMP DEFAULT (NOW() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  trial_end TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Monthly Usage Tracking Table
CREATE TABLE IF NOT EXISTS monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  subscription_id UUID REFERENCES user_subscriptions(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  requests_made INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  tokens_saved INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,4) DEFAULT 0,
  overage_requests INTEGER DEFAULT 0,
  overage_cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, year, month)
);

-- User Features Table (for feature flags)
CREATE TABLE IF NOT EXISTS user_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  feature_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  granted_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NULL,
  granted_by TEXT DEFAULT 'system',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, feature_name)
);

-- Billing Events Table (for audit trail)
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  subscription_id UUID REFERENCES user_subscriptions(id),
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  event_data JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage Alerts Table
CREATE TABLE IF NOT EXISTS usage_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('usage_warning', 'limit_exceeded', 'billing_issue')),
  threshold_percentage INTEGER DEFAULT 80,
  is_active BOOLEAN DEFAULT TRUE,
  last_triggered TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_id_date ON monthly_usage (user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_user_features_user_id ON user_features (user_id);
CREATE INDEX IF NOT EXISTS idx_user_features_feature_name ON user_features (feature_name);
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id ON billing_events (user_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event_id ON billing_events (stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_usage_alerts_user_id ON usage_alerts (user_id);

-- Function to get user's current subscription with plan details
CREATE OR REPLACE FUNCTION get_user_subscription_details(user_id_param UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  status TEXT,
  billing_cycle TEXT,
  monthly_requests INTEGER,
  max_cache_entries INTEGER,
  api_keys_limit INTEGER,
  analytics_retention_days INTEGER,
  priority_support BOOLEAN,
  custom_models BOOLEAN,
  team_collaboration BOOLEAN,
  advanced_caching BOOLEAN,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.id as subscription_id,
    sp.name as plan_name,
    sp.display_name as plan_display_name,
    us.status,
    us.billing_cycle,
    sp.monthly_requests,
    sp.max_cache_entries,
    sp.api_keys_limit,
    sp.analytics_retention_days,
    sp.priority_support,
    sp.custom_models,
    sp.team_collaboration,
    sp.advanced_caching,
    us.current_period_end,
    us.cancel_at_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = user_id_param
    AND us.status = 'active'
  ORDER BY us.created_at DESC
  LIMIT 1;
END;
$$;

-- Function to get or create current month usage
CREATE OR REPLACE FUNCTION get_or_create_monthly_usage(user_id_param UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  usage_id UUID;
  current_year INTEGER;
  current_month INTEGER;
  user_subscription_id UUID;
BEGIN
  current_year := EXTRACT(YEAR FROM NOW());
  current_month := EXTRACT(MONTH FROM NOW());

  -- Get user's current subscription
  SELECT id INTO user_subscription_id
  FROM user_subscriptions
  WHERE user_id = user_id_param AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Try to get existing usage record
  SELECT id INTO usage_id
  FROM monthly_usage
  WHERE user_id = user_id_param
    AND year = current_year
    AND month = current_month;

  -- Create if doesn't exist
  IF usage_id IS NULL THEN
    INSERT INTO monthly_usage (user_id, subscription_id, year, month)
    VALUES (user_id_param, user_subscription_id, current_year, current_month)
    RETURNING id INTO usage_id;
  END IF;

  RETURN usage_id;
END;
$$;

-- Function to increment usage counters
CREATE OR REPLACE FUNCTION increment_usage_counter(
  user_id_param UUID,
  is_cache_hit BOOLEAN DEFAULT FALSE,
  tokens_saved_param INTEGER DEFAULT 0,
  cost_saved_param DECIMAL DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  usage_id UUID;
BEGIN
  usage_id := get_or_create_monthly_usage(user_id_param);

  IF is_cache_hit THEN
    UPDATE monthly_usage
    SET
      cache_hits = cache_hits + 1,
      tokens_saved = tokens_saved + tokens_saved_param,
      cost_saved = cost_saved + cost_saved_param,
      updated_at = NOW()
    WHERE id = usage_id;
  ELSE
    UPDATE monthly_usage
    SET
      requests_made = requests_made + 1,
      cache_misses = cache_misses + 1,
      updated_at = NOW()
    WHERE id = usage_id;
  END IF;
END;
$$;

-- Update user_profiles table to reference subscription plans
ALTER TABLE user_profiles DROP COLUMN IF EXISTS plan_type;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS default_plan_id UUID REFERENCES subscription_plans(id);

-- Set default plan for existing users
UPDATE user_profiles
SET default_plan_id = (SELECT id FROM subscription_plans WHERE name = 'free' LIMIT 1)
WHERE default_plan_id IS NULL;

-- Create default subscriptions for existing users
INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_end)
SELECT
  up.id,
  sp.id,
  'active',
  NOW() + INTERVAL '1 year'
FROM user_profiles up
CROSS JOIN subscription_plans sp
WHERE sp.name = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM user_subscriptions us
    WHERE us.user_id = up.id
  )
ON CONFLICT DO NOTHING;