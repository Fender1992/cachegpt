-- RLS Policies for Subscription Tables
-- Run this after setup_subscriptions.sql

-- Enable RLS on all subscription tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;

-- Subscription Plans Policies (public read for everyone)
CREATE POLICY "Anyone can view subscription plans"
  ON subscription_plans FOR SELECT
  USING (true);

-- User Subscriptions Policies
CREATE POLICY "Users can view their own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
  ON user_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Monthly Usage Policies
CREATE POLICY "Users can view their own usage"
  ON monthly_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage records"
  ON monthly_usage FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- User Features Policies
CREATE POLICY "Users can view their own features"
  ON user_features FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all features"
  ON user_features FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Billing History Policies
CREATE POLICY "Users can view their own billing history"
  ON billing_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all billing records"
  ON billing_history FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to get user's current subscription details
CREATE OR REPLACE FUNCTION get_user_subscription(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  plan_name TEXT,
  display_name TEXT,
  price_cents INTEGER,
  monthly_requests INTEGER,
  requests_used INTEGER,
  cache_retention_days INTEGER,
  features JSONB,
  status TEXT,
  current_period_end TIMESTAMP
)
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  RETURN QUERY
  SELECT
    sp.name,
    sp.display_name,
    sp.price_cents,
    sp.monthly_requests,
    COALESCE(mu.requests_used, 0) as requests_used,
    sp.cache_retention_days,
    sp.features || jsonb_build_object(
      'similarity_threshold_custom', sp.similarity_threshold_custom,
      'advanced_analytics', sp.advanced_analytics,
      'priority_support', sp.priority_support,
      'sso_integration', sp.sso_integration,
      'white_label', sp.white_label,
      'ab_testing', sp.ab_testing,
      'webhooks', sp.webhooks
    ) as features,
    us.status,
    us.current_period_end
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  LEFT JOIN monthly_usage mu ON mu.user_id = us.user_id
    AND mu.month_year = TO_CHAR(NOW(), 'YYYY-MM')
  WHERE us.user_id = v_user_id
    AND us.status IN ('active', 'trialing');
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_subscription TO authenticated;