/**
 * Telemetry event types for CacheGPT
 * Used for tracking user interactions and funnel analytics
 */

export type TelemetryEvent =
  // Landing page events
  | { type: 'landing_view'; variant?: string; timestamp?: number }
  | { type: 'landing_cta_click_primary'; timestamp?: number }
  | { type: 'landing_cta_click_secondary'; timestamp?: number }
  | { type: 'landing_ab_variant'; variant: string; experiment: string; timestamp?: number }

  // Chat events
  | { type: 'chat_loaded'; timestamp?: number }
  | { type: 'example_prompt_clicked'; label: string; timestamp?: number }
  | { type: 'message_sent'; mode?: string; preset?: string; cached?: boolean; timestamp?: number }
  | { type: 'cache_hit_notice_shown'; saved_cents?: number; timestamp?: number }
  | { type: 'voice_input_used'; success: boolean; timestamp?: number }
  | { type: 'file_uploaded'; size: number; kind: string; timestamp?: number }

  // Modes/Templates events
  | { type: 'modes_view'; timestamp?: number }
  | { type: 'mode_selected'; slug: string; timestamp?: number }
  | { type: 'mode_used_in_chat'; slug: string; timestamp?: number }

  // Dashboard events
  | { type: 'dashboard_view'; timestamp?: number }
  | { type: 'badge_awarded'; key: string; timestamp?: number }
  | { type: 'stats_loaded'; cache_hit_rate?: number; timestamp?: number }

  // Settings events
  | { type: 'settings_view'; tab?: string; timestamp?: number }
  | { type: 'theme_changed'; theme: string; timestamp?: number }
  | { type: 'provider_key_added'; provider: string; timestamp?: number };

export interface TelemetryContext {
  userId?: string;
  sessionId?: string;
  userAgent?: string;
  platform?: 'web' | 'cli' | 'mobile';
  flags?: Record<string, any>;
}

export interface TelemetryPayload {
  events: TelemetryEvent[];
  context: TelemetryContext;
  timestamp: number;
}
