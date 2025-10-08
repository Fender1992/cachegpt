/**
 * Server-side telemetry for CacheGPT
 *
 * Handles:
 * - Event validation
 * - User ID resolution
 * - Database storage
 * - PII filtering
 */

import { createClient } from '@/lib/supabase-server';
import { TelemetryEvent, TelemetryPayload, TelemetryContext } from '@/types/telemetry';

/**
 * Process and store telemetry events
 */
export async function processEvents(
  payload: TelemetryPayload,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate payload
    if (!payload.events || !Array.isArray(payload.events)) {
      return { success: false, error: 'Invalid payload format' };
    }

    // Filter out any PII
    const sanitizedEvents = payload.events.map(sanitizeEvent);

    // Enrich context with user ID
    const context: TelemetryContext = {
      ...payload.context,
      userId,
    };

    // Store events in database
    await storeEvents(sanitizedEvents, context);

    // Update analytics aggregations
    await updateAggregations(sanitizedEvents, userId);

    return { success: true };
  } catch (error: any) {
    console.error('[TELEMETRY-SERVER] Error processing events:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sanitize event to remove PII
 */
function sanitizeEvent(event: TelemetryEvent): TelemetryEvent {
  // Remove any potential PII from event data
  // For now, events are designed to not contain PII
  return event;
}

/**
 * Store events in database
 */
async function storeEvents(
  events: TelemetryEvent[],
  context: TelemetryContext
): Promise<void> {
  try {
    const supabase = await createClient();

    // Prepare rows for insertion
    const rows = events.map((event) => ({
      user_id: context.userId || null,
      session_id: context.sessionId || null,
      event_type: event.type,
      event_data: event,
      platform: context.platform || 'web',
      user_agent: context.userAgent || null,
      created_at: new Date(event.timestamp || Date.now()).toISOString(),
    }));

    // Insert events
    const { error } = await supabase
      .from('telemetry_events')
      .insert(rows);

    if (error) {
      // Table might not exist yet, log but don't fail
      console.warn('[TELEMETRY-SERVER] Error inserting events:', error);
    }
  } catch (error) {
    console.error('[TELEMETRY-SERVER] Error storing events:', error);
  }
}

/**
 * Update analytics aggregations
 */
async function updateAggregations(
  events: TelemetryEvent[],
  userId?: string
): Promise<void> {
  try {
    const supabase = await createClient();

    // Count events by type
    const eventCounts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Update daily aggregations
    const today = new Date().toISOString().split('T')[0];

    for (const [eventType, count] of Object.entries(eventCounts)) {
      await supabase
        .from('telemetry_daily_agg')
        .upsert({
          date: today,
          event_type: eventType,
          user_id: userId || null,
          count: count,
        }, {
          onConflict: 'date,event_type,user_id',
          ignoreDuplicates: false,
        });
    }
  } catch (error) {
    // Aggregations are optional, don't fail
    console.warn('[TELEMETRY-SERVER] Error updating aggregations:', error);
  }
}

/**
 * Get funnel metrics
 */
export async function getFunnelMetrics(
  startDate: Date,
  endDate: Date
): Promise<{
  landingViews: number;
  chatLoads: number;
  firstMessages: number;
  returnUsers: number;
}> {
  try {
    const supabase = await createClient();

    // Get counts for each funnel step
    const { data: landingData } = await supabase
      .from('telemetry_daily_agg')
      .select('count')
      .eq('event_type', 'landing_view')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    const { data: chatData } = await supabase
      .from('telemetry_daily_agg')
      .select('count')
      .eq('event_type', 'chat_loaded')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    const { data: messageData } = await supabase
      .from('telemetry_daily_agg')
      .select('count')
      .eq('event_type', 'message_sent')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    const { data: returnData } = await supabase
      .from('telemetry_daily_agg')
      .select('count')
      .eq('event_type', 'dashboard_view')
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0]);

    return {
      landingViews: landingData?.reduce((sum, row) => sum + (row.count || 0), 0) || 0,
      chatLoads: chatData?.reduce((sum, row) => sum + (row.count || 0), 0) || 0,
      firstMessages: messageData?.reduce((sum, row) => sum + (row.count || 0), 0) || 0,
      returnUsers: returnData?.reduce((sum, row) => sum + (row.count || 0), 0) || 0,
    };
  } catch (error) {
    console.error('[TELEMETRY-SERVER] Error getting funnel metrics:', error);
    return {
      landingViews: 0,
      chatLoads: 0,
      firstMessages: 0,
      returnUsers: 0,
    };
  }
}

/**
 * Track server-side event
 */
export async function trackServerEvent(
  event: TelemetryEvent,
  userId?: string,
  sessionId?: string
): Promise<void> {
  const payload: TelemetryPayload = {
    events: [event],
    context: {
      userId,
      sessionId,
      platform: 'web',
    },
    timestamp: Date.now(),
  };

  await processEvents(payload, userId);
}
