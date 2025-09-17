-- Subscription and Pricing Tier Database Setup
-- Run this script in Supabase SQL Editor after setup_database.sql

-- Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, -- 'free', 'startup', 'business', 'enterprise'
  display_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL, -- Price in cents (0 for free)
  monthly_requests INTEGER, -- NULL means unlimited
  max_api_keys INTEGER, -- NULL means unlimited
  cache_retention_days INTEGER NOT NULL DEFAULT 1,
  similarity_threshold_custom BOOLEAN DEFAULT FALSE,
  advanced_analytics BOOLEAN DEFAULT FALSE,
  priority_support BOOLEAN DEFAULT FALSE,
  sso_integration BOOLEAN DEFAULT FALSE,
  white_label BOOLEAN DEFAULT FALSE,
  ab_testing BOOLEAN DEFAULT FALSE,
  webhooks BOOLEAN DEFAULT FALSE,
  features JSONB DEFAULT '{}', -- Additional feature flags
  stripe_price_id TEXT, -- Stripe price ID for billing
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Subscriptions Table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  plan_id UUID REFERENCES subscription_plans(id),
  status TEXT DEFAULT 'active', -- 'active', 'cancelled', 'past_due', 'trialing'
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancelled_at TIMESTAMP,
  trial_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Monthly Usage Tracking Table
CREATE TABLE IF NOT EXISTS monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  month_year TEXT NOT NULL, -- Format: 'YYYY-MM'
  requests_used INTEGER DEFAULT 0,
  cache_hits INTEGER DEFAULT 0,
  cache_misses INTEGER DEFAULT 0,
  tokens_saved INTEGER DEFAULT 0,
  cost_saved DECIMAL(10,4) DEFAULT 0,
  overage_requests INTEGER DEFAULT 0,
  overage_cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month_year)
);

-- User Feature Flags Table (for custom feature access)
CREATE TABLE IF NOT EXISTS user_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  feature_name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, feature_name)
);

-- Billing History Table
CREATE TABLE IF NOT EXISTS billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  invoice_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL, -- 'paid', 'pending', 'failed'
  description TEXT,
  stripe_invoice_id TEXT,
  billing_period_start TIMESTAMP,
  billing_period_end TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default subscription plans
INSERT INTO subscription_plans (
  name, display_name, price_cents, monthly_requests, max_api_keys,
  cache_retention_days, similarity_threshold_custom, advanced_analytics,
  priority_support, sso_integration, white_label, ab_testing, webhooks, features
) VALUES
  -- Free Tier
  ('free', 'Developer', 0, 1000, 1, 1, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
   '{"basic_analytics": true, "community_support": true}'),

  -- Startup Tier
  ('startup', 'Startup', 2900, 25000, 5, 7, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE,
   '{"email_support": true, "custom_similarity": true, "basic_webhooks": true}'),

  -- Business Tier
  ('business', 'Business', 19900, 500000, 25, 30, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE,
   '{"priority_support": true, "sso": true, "ab_testing": true, "advanced_webhooks": true}'),

  -- Enterprise Tier (0 = custom pricing/contact sales)
  ('enterprise', 'Enterprise', 0, NULL, NULL, 365, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
   '{"dedicated_support": true, "sla": true, "white_label": true, "on_premise": true, "custom_integrations": true, "custom_pricing": true}')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_month ON monthly_usage (user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_billing_history_user_id ON billing_history (user_id);
CREATE INDEX IF NOT EXISTS idx_user_features_user_id ON user_features (user_id);

-- Function to automatically create free subscription for new users
CREATE OR REPLACE FUNCTION create_free_subscription_for_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
  SELECT
    NEW.id,
    sp.id,
    'active',
    NOW(),
    NOW() + INTERVAL '30 days'
  FROM subscription_plans sp
  WHERE sp.name = 'free';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create free subscription on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_free_subscription_for_user();

-- Function to check if user has exceeded monthly limit
CREATE OR REPLACE FUNCTION check_usage_limit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_monthly_limit INTEGER;
  v_current_usage INTEGER;
BEGIN
  -- Get user's plan monthly limit
  SELECT sp.monthly_requests INTO v_monthly_limit
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id AND us.status = 'active';

  -- NULL means unlimited
  IF v_monthly_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Get current month usage
  SELECT requests_used INTO v_current_usage
  FROM monthly_usage
  WHERE user_id = p_user_id
    AND month_year = TO_CHAR(NOW(), 'YYYY-MM');

  -- If no usage record, user is within limits
  IF v_current_usage IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_current_usage < v_monthly_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_requests INTEGER DEFAULT 1)
RETURNS VOID AS $$
BEGIN
  INSERT INTO monthly_usage (user_id, month_year, requests_used)
  VALUES (p_user_id, TO_CHAR(NOW(), 'YYYY-MM'), p_requests)
  ON CONFLICT (user_id, month_year)
  DO UPDATE SET
    requests_used = monthly_usage.requests_used + p_requests,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

