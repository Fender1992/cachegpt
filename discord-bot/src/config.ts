import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

export const config = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },
  api: {
    port: parseInt(process.env.PORT || process.env.INTERNAL_API_PORT || '3100', 10),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://cachegpt.app')
      .split(',')
      .map((origin) => origin.trim()),
  },
} as const;

export function validateConfig(): void {
  if (!config.discord.botToken) {
    throw new Error('DISCORD_BOT_TOKEN is required');
  }
  // Supabase is optional — bot can run in cache-only mode
  if (config.supabase.url && !config.supabase.serviceKey) {
    console.warn('[Config] SUPABASE_URL is set but SUPABASE_SERVICE_KEY is missing — Supabase writes will be disabled');
  }
}
