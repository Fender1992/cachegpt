/**
 * Client-side telemetry for CacheGPT
 *
 * Features:
 * - Batched event sending (reduces network requests)
 * - Automatic retry on failure
 * - Session tracking
 * - No PII collection
 */

'use client';

import { TelemetryEvent, TelemetryPayload, TelemetryContext } from '@/types/telemetry';

// Batch configuration
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 5000; // 5 seconds
const MAX_RETRIES = 3;

// Event queue
let eventQueue: TelemetryEvent[] = [];
let batchTimer: NodeJS.Timeout | null = null;
let sessionId: string | null = null;

/**
 * Initialize session tracking
 */
function getSessionId(): string {
  if (sessionId) return sessionId;

  // Try to get from sessionStorage
  if (typeof window !== 'undefined' && window.sessionStorage) {
    sessionId = sessionStorage.getItem('cachegpt_session_id');

    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem('cachegpt_session_id', sessionId);
    }
  } else {
    sessionId = generateSessionId();
  }

  return sessionId;
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Track a single event
 */
export function track(event: TelemetryEvent) {
  // Skip if running on server
  if (typeof window === 'undefined') return;

  // Add timestamp if not present
  const eventWithTimestamp = {
    ...event,
    timestamp: event.timestamp || Date.now(),
  };

  // Add to queue
  eventQueue.push(eventWithTimestamp);

  // Send immediately if batch size reached
  if (eventQueue.length >= BATCH_SIZE) {
    flushEvents();
  } else {
    // Schedule batch send
    scheduleBatchSend();
  }
}

/**
 * Schedule a batch send
 */
function scheduleBatchSend() {
  if (batchTimer) return;

  batchTimer = setTimeout(() => {
    flushEvents();
  }, BATCH_TIMEOUT);
}

/**
 * Flush all queued events
 */
export async function flushEvents() {
  if (eventQueue.length === 0) return;

  // Clear timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Get events to send
  const eventsToSend = [...eventQueue];
  eventQueue = [];

  // Build payload
  const payload: TelemetryPayload = {
    events: eventsToSend,
    context: getContext(),
    timestamp: Date.now(),
  };

  // Send to server
  await sendToServer(payload);
}

/**
 * Get telemetry context
 */
function getContext(): TelemetryContext {
  return {
    sessionId: getSessionId(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    platform: 'web',
  };
}

/**
 * Send events to server with retry
 */
async function sendToServer(payload: TelemetryPayload, retryCount = 0) {
  try {
    const response = await fetch('/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Telemetry request failed: ${response.status}`);
    }
  } catch (error) {
    console.error('[TELEMETRY] Error sending events:', error);

    // Retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = Math.pow(2, retryCount) * 1000;
      setTimeout(() => {
        sendToServer(payload, retryCount + 1);
      }, delay);
    } else {
      console.error('[TELEMETRY] Max retries reached, dropping events');
    }
  }
}

/**
 * Flush events before page unload
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (eventQueue.length > 0) {
      // Use sendBeacon for reliable delivery
      const payload: TelemetryPayload = {
        events: eventQueue,
        context: getContext(),
        timestamp: Date.now(),
      };

      navigator.sendBeacon('/api/telemetry', JSON.stringify(payload));
      eventQueue = [];
    }
  });
}

/**
 * Convenience functions for common events
 */
export const telemetry = {
  // Landing page
  landingView: (variant?: string) => track({ type: 'landing_view', variant }),
  landingCtaPrimary: () => track({ type: 'landing_cta_click_primary' }),
  landingCtaSecondary: () => track({ type: 'landing_cta_click_secondary' }),

  // Chat
  chatLoaded: () => track({ type: 'chat_loaded' }),
  examplePromptClicked: (label: string) => track({ type: 'example_prompt_clicked', label }),
  messageSent: (opts?: { mode?: string; preset?: string; cached?: boolean }) =>
    track({ type: 'message_sent', ...opts }),
  cacheHitShown: (savedCents?: number) =>
    track({ type: 'cache_hit_notice_shown', saved_cents: savedCents }),
  voiceInputUsed: (success: boolean) => track({ type: 'voice_input_used', success }),
  fileUploaded: (size: number, kind: string) =>
    track({ type: 'file_uploaded', size, kind }),

  // Modes
  modesView: () => track({ type: 'modes_view' }),
  modeSelected: (slug: string) => track({ type: 'mode_selected', slug }),
  modeUsedInChat: (slug: string) => track({ type: 'mode_used_in_chat', slug }),

  // Dashboard
  dashboardView: () => track({ type: 'dashboard_view' }),
  badgeAwarded: (key: string) => track({ type: 'badge_awarded', key }),
  statsLoaded: (cacheHitRate?: number) =>
    track({ type: 'stats_loaded', cache_hit_rate: cacheHitRate }),

  // Settings
  settingsView: (tab?: string) => track({ type: 'settings_view', tab }),
  themeChanged: (theme: string) => track({ type: 'theme_changed', theme }),
  providerKeyAdded: (provider: string) => track({ type: 'provider_key_added', provider }),
};
