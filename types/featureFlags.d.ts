/**
 * Feature flag types for CacheGPT
 */

export type FlagKey =
  // UI Feature Flags
  | 'ui_casual_landing'
  | 'ui_casual_chat'
  | 'ui_modes'
  | 'ui_casual_dashboard'

  // UX Feature Flags
  | 'ux_gamified_toasts'
  | 'ux_voice_input'
  | 'ux_file_upload'
  | 'ux_cache_badges'
  | 'ux_example_prompts'

  // Growth Feature Flags
  | 'share_answer_enabled'
  | 'templates_gallery_trending'

  // A/B Test Flags
  | 'ab_landing_hero_copy_v1'
  | 'ab_example_prompts_layout_v1'
  | 'ab_onboarding_flow_v1';

export type FlagValue = boolean | string | number;

export interface FeatureFlags {
  ui_casual_landing: boolean;
  ui_casual_chat: boolean;
  ui_modes: boolean;
  ui_casual_dashboard: boolean;
  ux_gamified_toasts: boolean;
  ux_voice_input: boolean;
  ux_file_upload: boolean;
  ux_cache_badges: boolean;
  ux_example_prompts: boolean;
  share_answer_enabled: boolean;
  templates_gallery_trending: boolean;
  ab_landing_hero_copy_v1: 'A' | 'B';
  ab_example_prompts_layout_v1: 'grid' | 'list';
  ab_onboarding_flow_v1: 'old' | 'new';
}

export interface FlagOverride {
  key: FlagKey;
  value: FlagValue;
  userId?: string;
  reason?: string;
  expiresAt?: Date;
}
