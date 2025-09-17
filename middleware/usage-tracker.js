import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export class UsageTracker {
  static async trackRequest(userId, metadata = {}) {
    try {
      const monthYear = new Date().toISOString().slice(0, 7);

      const { error } = await supabase.rpc('increment_usage', {
        p_user_id: userId,
        p_requests: 1
      });

      if (error) {
        console.error('Failed to track usage:', error);
      }

      if (metadata.cacheHit !== undefined) {
        const updateData = metadata.cacheHit
          ? { cache_hits: 1 }
          : { cache_misses: 1 };

        if (metadata.tokensSaved) {
          updateData.tokens_saved = metadata.tokensSaved;
        }

        if (metadata.costSaved) {
          updateData.cost_saved = metadata.costSaved;
        }

        const { error: updateError } = await supabase
          .from('monthly_usage')
          .update(updateData)
          .eq('user_id', userId)
          .eq('month_year', monthYear);

        if (updateError) {
          console.error('Failed to update cache stats:', updateError);
        }
      }

      return true;
    } catch (error) {
      console.error('Usage tracking error:', error);
      return false;
    }
  }

  static async checkLimit(userId) {
    try {
      const { data, error } = await supabase.rpc('check_usage_limit', {
        p_user_id: userId
      });

      if (error) {
        console.error('Failed to check usage limit:', error);
        return { withinLimit: true, error: error.message };
      }

      return { withinLimit: data };
    } catch (error) {
      console.error('Limit check error:', error);
      return { withinLimit: true, error: error.message };
    }
  }

  static async getUsageStats(userId) {
    try {
      const monthYear = new Date().toISOString().slice(0, 7);

      const { data: usage, error: usageError } = await supabase
        .from('monthly_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('month_year', monthYear)
        .single();

      if (usageError && usageError.code !== 'PGRST116') {
        throw usageError;
      }

      const { data: subscription } = await supabase
        .rpc('get_user_subscription', { p_user_id: userId });

      const sub = subscription?.[0] || {};
      const currentUsage = usage || {
        requests_used: 0,
        cache_hits: 0,
        cache_misses: 0,
        tokens_saved: 0,
        cost_saved: 0
      };

      return {
        current: currentUsage,
        limit: sub.monthly_requests || null,
        remaining: sub.monthly_requests
          ? Math.max(0, sub.monthly_requests - currentUsage.requests_used)
          : null,
        percentage: sub.monthly_requests
          ? (currentUsage.requests_used / sub.monthly_requests) * 100
          : 0,
        cacheHitRate: currentUsage.requests_used > 0
          ? (currentUsage.cache_hits / currentUsage.requests_used) * 100
          : 0
      };
    } catch (error) {
      console.error('Failed to get usage stats:', error);
      throw error;
    }
  }
}

export async function withUsageTracking(handler) {
  return async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { withinLimit, error: limitError } = await UsageTracker.checkLimit(user.id);

      if (!withinLimit) {
        const stats = await UsageTracker.getUsageStats(user.id);
        return res.status(429).json({
          error: 'Monthly request limit exceeded',
          limit: stats.limit,
          used: stats.current.requests_used,
          upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`
        });
      }

      req.userId = user.id;
      req.user = user;

      const originalJson = res.json;
      res.json = function(data) {
        const metadata = {
          cacheHit: data?.cacheHit,
          tokensSaved: data?.tokensSaved,
          costSaved: data?.costSaved
        };

        UsageTracker.trackRequest(req.userId, metadata);

        return originalJson.call(this, data);
      };

      return handler(req, res);
    } catch (error) {
      console.error('Usage tracking middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}