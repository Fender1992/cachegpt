-- =====================================================
-- PRICING TIERS & SUBSCRIPTION MANAGEMENT
-- Implements freemium model with Stripe integration
-- =====================================================

-- 1. Add subscription columns to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'business', 'enterprise')),
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'incomplete')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS monthly_request_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_request_limit INTEGER DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS request_count_reset_at TIMESTAMPTZ DEFAULT DATE_TRUNC('month', NOW()) + INTERVAL '1 month';

-- 2. Create index for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer
  ON public.user_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_tier
  ON public.user_profiles(subscription_tier);

-- 3. Create function to check if user is within usage limits
DROP FUNCTION IF EXISTS check_usage_limit(UUID);
CREATE OR REPLACE FUNCTION check_usage_limit(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_record RECORD;
BEGIN
  SELECT
    subscription_tier,
    monthly_request_count,
    monthly_request_limit,
    request_count_reset_at
  INTO user_record
  FROM public.user_profiles
  WHERE id = user_id_param;

  -- Reset counter if we're past the reset date
  IF user_record.request_count_reset_at < NOW() THEN
    UPDATE public.user_profiles
    SET
      monthly_request_count = 0,
      request_count_reset_at = DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
    WHERE id = user_id_param;

    RETURN TRUE; -- Fresh month, within limits
  END IF;

  -- Check if under limit
  RETURN user_record.monthly_request_count < user_record.monthly_request_limit;
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to increment usage count
CREATE OR REPLACE FUNCTION increment_usage_count(user_id_param UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_profiles
  SET monthly_request_count = monthly_request_count + 1
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Create function to update subscription tier and limits
CREATE OR REPLACE FUNCTION update_subscription_tier(
  user_id_param UUID,
  tier TEXT,
  stripe_customer_id_param TEXT DEFAULT NULL,
  stripe_subscription_id_param TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  new_limit INTEGER;
BEGIN
  -- Set limits based on tier
  CASE tier
    WHEN 'free' THEN new_limit := 1000;
    WHEN 'pro' THEN new_limit := 10000;
    WHEN 'business' THEN new_limit := 100000;
    WHEN 'enterprise' THEN new_limit := 999999999; -- Effectively unlimited
    ELSE new_limit := 1000;
  END CASE;

  UPDATE public.user_profiles
  SET
    subscription_tier = tier,
    monthly_request_limit = new_limit,
    stripe_customer_id = COALESCE(stripe_customer_id_param, stripe_customer_id),
    stripe_subscription_id = COALESCE(stripe_subscription_id_param, stripe_subscription_id),
    subscription_status = 'active',
    updated_at = NOW()
  WHERE id = user_id_param;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create subscriptions table for tracking payment history
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('pro', 'business', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 7. Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for subscriptions
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- 9. Grant permissions
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT EXECUTE ON FUNCTION check_usage_limit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION increment_usage_count TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_subscription_tier TO authenticated, anon;

-- 10. Create trigger for updated_at
DROP TRIGGER IF EXISTS handle_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER handle_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 11. Create view for subscription summary
CREATE OR REPLACE VIEW user_subscription_summary AS
SELECT
  up.id as user_id,
  up.email,
  up.subscription_tier,
  up.subscription_status,
  up.monthly_request_count,
  up.monthly_request_limit,
  ROUND(CAST((up.monthly_request_count::FLOAT / up.monthly_request_limit::FLOAT) * 100 AS NUMERIC), 2) as usage_percentage,
  up.request_count_reset_at,
  up.stripe_customer_id,
  s.current_period_end as subscription_end_date,
  s.cancel_at_period_end
FROM public.user_profiles up
LEFT JOIN public.subscriptions s ON up.id = s.user_id AND s.status = 'active';

-- Grant access to view
GRANT SELECT ON user_subscription_summary TO authenticated;

-- 12. Analyze tables
ANALYZE public.user_profiles;
ANALYZE public.subscriptions;

-- =====================================================
-- PRICING TIERS:
--
-- FREE: 1,000 requests/month (generous for growth)
-- PRO: 10,000 requests/month ($10/month)
-- BUSINESS: 100,000 requests/month ($49/month)
-- ENTERPRISE: Unlimited ($custom)
--
-- USAGE TRACKING:
-- - Resets monthly
-- - check_usage_limit() before processing request
-- - increment_usage_count() after successful request
--
-- STRIPE INTEGRATION:
-- - Webhook updates subscription status
-- - update_subscription_tier() called on payment success
-- =====================================================
