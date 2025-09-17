import { withUsageTracking } from '../middleware/usage-tracker.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function cacheHandler(req, res) {
  const { method } = req;

  const { data: subscription } = await supabase
    .rpc('get_user_subscription', { p_user_id: req.userId });

  const userPlan = subscription?.[0] || {};

  if (method === 'POST') {
    const { key, value, similarity_threshold } = req.body;

    if (userPlan.features?.similarity_threshold_custom === false && similarity_threshold) {
      return res.status(403).json({
        error: 'Custom similarity threshold not available in your plan',
        upgradeUrl: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`
      });
    }

    const ttl = userPlan.cache_retention_days * 24 * 60 * 60;

    const cacheData = {
      user_id: req.userId,
      key,
      value,
      ttl,
      similarity_threshold: similarity_threshold || 0.95
    };

    const { data, error } = await supabase
      .from('cache_entries')
      .insert(cacheData)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to cache data' });
    }

    return res.status(200).json({
      success: true,
      cached: data,
      cacheHit: false
    });
  }

  if (method === 'GET') {
    const { key } = req.query;

    const { data, error } = await supabase
      .from('cache_entries')
      .select('*')
      .eq('user_id', req.userId)
      .eq('key', key)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      return res.status(500).json({ error: 'Failed to retrieve cache' });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        error: 'Cache miss',
        cacheHit: false
      });
    }

    const cacheEntry = data[0];
    const tokensSaved = cacheEntry.value?.length || 0;
    const costSaved = (tokensSaved / 1000) * 0.0005;

    return res.status(200).json({
      ...cacheEntry,
      cacheHit: true,
      tokensSaved,
      costSaved: parseFloat(costSaved.toFixed(4))
    });
  }

  if (method === 'DELETE') {
    const { key } = req.query;

    const { error } = await supabase
      .from('cache_entries')
      .delete()
      .eq('user_id', req.userId)
      .eq('key', key);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete cache entry' });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  res.status(405).end(`Method ${method} Not Allowed`);
}

export default withUsageTracking(cacheHandler);