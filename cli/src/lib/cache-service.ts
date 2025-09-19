import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthService } from './auth-service';
import chalk from 'chalk';

interface CacheEntry {
  id?: string;
  user_id?: string | null;  // null for anonymous users
  prompt: string;
  response: string;
  model?: string;
  provider?: string;
  timestamp: string;
  tokens_used?: number;
  response_time_ms?: number;
  cache_hit?: boolean;
}

interface LocalCache {
  entries: CacheEntry[];
}

export class CacheService {
  private supabase: SupabaseClient | null = null;
  private authService: AuthService;
  private localCachePath: string;
  private isAuthenticated: boolean = false;
  private currentUserId: string | null = null;

  constructor() {
    // Initialize auth service
    try {
      this.authService = new AuthService();

      // Try to get Supabase client if credentials are available
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (url && key) {
        this.supabase = createClient(url, key);
      }
    } catch (error) {
      // Auth service not available, will use local cache only
    }

    // Set up local cache directory
    const cacheDir = path.join(os.homedir(), '.cachegpt', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    }

    this.localCachePath = path.join(cacheDir, 'cache.json');

    // Check authentication status
    this.checkAuthStatus();
  }

  private async checkAuthStatus() {
    try {
      if (this.authService) {
        const user = await this.authService.getCurrentUser();
        if (user) {
          this.isAuthenticated = true;
          this.currentUserId = user.id;
        }
      }
    } catch (error) {
      // Not authenticated
      this.isAuthenticated = false;
      this.currentUserId = null;
    }
  }

  async saveChat(
    prompt: string,
    response: string,
    metadata?: {
      model?: string;
      provider?: string;
      tokens_used?: number;
      response_time_ms?: number;
      cache_hit?: boolean;
    }
  ): Promise<void> {
    const entry = {
      user_id: this.currentUserId, // Will be null if not logged in
      prompt,
      response,
      model: metadata?.model,
      provider: metadata?.provider,
      endpoint: '/v1/chat/completions',
      method: 'POST',
      metadata: {
        tokens_used: metadata?.tokens_used,
        response_time_ms: metadata?.response_time_ms,
        cache_hit: metadata?.cache_hit || false
      },
      tokens_used: metadata?.tokens_used,
      response_time_ms: metadata?.response_time_ms,
      cache_hit: metadata?.cache_hit || false,
      created_at: new Date().toISOString()
    };

    // Save to remote database if available
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('usage')  // Using the existing usage table
          .insert([entry]);

        if (error && error.code !== '42P01') { // Ignore if table doesn't exist
          console.error(chalk.yellow('Warning: Could not save to cloud cache:'), error.message);
        }
      } catch (error) {
        // Silently fail remote save, continue with local save
      }
    }

    // Always save to local cache
    this.saveToLocalCache(entry);

    // Show user status message
    if (!this.isAuthenticated && !this.hasShownAuthPrompt) {
      console.log(chalk.dim('\n💡 Sign in with `cachegpt login` to save your chats to your account and sync across devices.'));
      this.hasShownAuthPrompt = true;
    }
  }

  private hasShownAuthPrompt = false;

  private saveToLocalCache(entry: CacheEntry): void {
    let cache: LocalCache = { entries: [] };

    // Load existing cache
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        cache = JSON.parse(cacheContent);
      } catch (error) {
        // Invalid cache file, start fresh
        cache = { entries: [] };
      }
    }

    // Add new entry
    cache.entries.push(entry);

    // Keep only last 1000 entries in local cache
    if (cache.entries.length > 1000) {
      cache.entries = cache.entries.slice(-1000);
    }

    // Save cache
    fs.writeFileSync(
      this.localCachePath,
      JSON.stringify(cache, null, 2),
      { mode: 0o600 }
    );
  }

  async searchCache(query: string, limit: number = 10): Promise<CacheEntry[]> {
    const results: CacheEntry[] = [];

    // Search remote cache
    if (this.supabase) {
      try {
        // Build query based on auth status
        let dbQuery = this.supabase
          .from('usage')
          .select('*')
          .or(`prompt.ilike.%${query}%,response.ilike.%${query}%`)
          .not('prompt', 'is', null)
          .not('response', 'is', null)
          .limit(limit);

        // If authenticated, get user's entries and anonymous entries
        // If not authenticated, only get anonymous entries
        if (this.isAuthenticated && this.currentUserId) {
          dbQuery = dbQuery.or(`user_id.eq.${this.currentUserId},user_id.is.null`);
        } else {
          dbQuery = dbQuery.is('user_id', null);
        }

        const { data, error } = await dbQuery;

        if (data && !error) {
          results.push(...data);
        }
      } catch (error) {
        // Fall back to local search
      }
    }

    // Also search local cache
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);

        const localResults = cache.entries
          .filter(entry => {
            const searchText = `${entry.prompt} ${entry.response}`.toLowerCase();
            return searchText.includes(query.toLowerCase());
          })
          .slice(0, limit);

        // Merge with remote results, avoiding duplicates
        for (const localEntry of localResults) {
          const isDuplicate = results.some(r =>
            r.prompt === localEntry.prompt &&
            r.timestamp === localEntry.timestamp
          );

          if (!isDuplicate) {
            results.push(localEntry);
          }
        }
      } catch (error) {
        // Ignore local cache errors
      }
    }

    return results.slice(0, limit);
  }

  async getCacheStats(): Promise<{
    total_entries: number;
    authenticated: boolean;
    user_id: string | null;
    local_entries: number;
    cloud_entries: number;
  }> {
    let localEntries = 0;
    let cloudEntries = 0;

    // Count local entries
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);
        localEntries = cache.entries.length;
      } catch (error) {
        // Ignore errors
      }
    }

    // Count cloud entries
    if (this.supabase) {
      try {
        let countQuery = this.supabase
          .from('usage')
          .select('*', { count: 'exact', head: true })
          .not('prompt', 'is', null)
          .not('response', 'is', null);

        // If authenticated, count user's entries
        // If not authenticated, count anonymous entries
        if (this.isAuthenticated && this.currentUserId) {
          countQuery = countQuery.eq('user_id', this.currentUserId);
        } else {
          countQuery = countQuery.is('user_id', null);
        }

        const { count, error } = await countQuery;

        if (!error && count !== null) {
          cloudEntries = count;
        }
      } catch (error) {
        // Ignore errors
      }
    }

    return {
      total_entries: localEntries + cloudEntries,
      authenticated: this.isAuthenticated,
      user_id: this.currentUserId,
      local_entries: localEntries,
      cloud_entries: cloudEntries
    };
  }

  async clearCache(local: boolean = true, cloud: boolean = false): Promise<void> {
    // Clear local cache
    if (local && fs.existsSync(this.localCachePath)) {
      fs.writeFileSync(
        this.localCachePath,
        JSON.stringify({ entries: [] }, null, 2),
        { mode: 0o600 }
      );
      console.log(chalk.green('✓ Local cache cleared'));
    }

    // Clear cloud cache
    if (cloud && this.supabase) {
      try {
        let deleteQuery = this.supabase
          .from('usage')
          .delete()
          .not('prompt', 'is', null)
          .not('response', 'is', null);

        // If authenticated, delete user's entries
        // If not authenticated, only allow deleting anonymous entries
        if (this.isAuthenticated && this.currentUserId) {
          deleteQuery = deleteQuery.eq('user_id', this.currentUserId);
        } else {
          deleteQuery = deleteQuery.is('user_id', null);
        }

        const { error } = await deleteQuery;

        if (!error) {
          console.log(chalk.green('✓ Cloud cache cleared'));
        } else {
          console.error(chalk.red('Failed to clear cloud cache:'), error.message);
        }
      } catch (error) {
        console.error(chalk.red('Failed to clear cloud cache:'), error);
      }
    } else if (cloud && !this.supabase) {
      console.log(chalk.yellow('Note: Cloud cache is not available'));
    }
  }
}