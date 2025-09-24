import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { logger } from './logger';

// Singleton instances
let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * Get Supabase client for public/anonymous operations
 * Uses the anon key - safe for client-side use
 */
export function getSupabaseAnon(): SupabaseClient {
  if (!anonClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      logger.error('Supabase configuration missing', { url: !!url, key: !!key });
      throw new Error('Supabase configuration missing');
    }

    anonClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    logger.info('Supabase anon client initialized');
  }

  return anonClient;
}

/**
 * Get Supabase client with service role key
 * ONLY use server-side - has full database access
 */
export function getSupabaseService(): SupabaseClient {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;

    if (!url || !key) {
      logger.error('Supabase service configuration missing');
      throw new Error('Supabase service configuration missing');
    }

    serviceClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    logger.info('Supabase service client initialized');
  }

  return serviceClient;
}

/**
 * Get Supabase client for route handlers
 * Uses cookies for authentication
 */
export function getSupabaseRouteHandler() {
  try {
    return createRouteHandlerClient({ cookies });
  } catch (error) {
    logger.error('Failed to create route handler client', error);
    throw error;
  }
}

/**
 * Test Supabase connection
 */
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabaseAnon();
    const { error } = await client.from('profiles').select('count').limit(1);

    if (error) {
      logger.warn('Supabase connection test failed', { error: error.message });
      return false;
    }

    logger.info('Supabase connection test successful');
    return true;
  } catch (error) {
    logger.error('Supabase connection test error', error);
    return false;
  }
}