import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AuthService } from './auth-service';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

// Load environment variables from .env.defaults
const envPath = path.join(__dirname, '..', '..', '.env.defaults');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

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
  tags?: string[];
}

interface ChatTag {
  name: string;
  chatCount: number;
  created: string;
  lastUsed: string;
}

interface LocalCache {
  entries: CacheEntry[];
}

export class CacheService {
  private supabase: SupabaseClient | null = null;
  private authService: AuthService | null = null;
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

    // Create a proper CacheEntry for local storage
    const cacheEntry: CacheEntry = {
      user_id: this.currentUserId,
      prompt,
      response,
      model: metadata?.model,
      provider: metadata?.provider,
      timestamp: new Date().toISOString(),
      tokens_used: metadata?.tokens_used,
      response_time_ms: metadata?.response_time_ms,
      cache_hit: metadata?.cache_hit || false
    };

    // Always save to local cache
    this.saveToLocalCache(cacheEntry);

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

  async getRecentActivity(days: number = 7): Promise<Array<{date: string, total: number, hits: number}>> {
    const results: Array<{date: string, total: number, hits: number}> = [];

    // Get local cache activity
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);

        const dayMap = new Map<string, {total: number, hits: number}>();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        cache.entries.forEach(entry => {
          const entryDate = new Date(entry.timestamp);
          if (entryDate >= cutoffDate) {
            const dateStr = entryDate.toISOString().split('T')[0];
            const existing = dayMap.get(dateStr) || {total: 0, hits: 0};
            existing.total++;
            if (entry.cache_hit) existing.hits++;
            dayMap.set(dateStr, existing);
          }
        });

        dayMap.forEach((value, key) => {
          results.push({date: key, total: value.total, hits: value.hits});
        });
      } catch (error) {
        // Ignore errors
      }
    }

    return results.sort((a, b) => a.date.localeCompare(b.date));
  }

  async getTopQueries(limit: number = 10): Promise<Array<{prompt: string, count: number, lastUsed: string}>> {
    const queryMap = new Map<string, {count: number, lastUsed: string}>();

    // Analyze local cache
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);

        cache.entries.forEach(entry => {
          const existing = queryMap.get(entry.prompt) || {count: 0, lastUsed: entry.timestamp};
          existing.count++;
          if (new Date(entry.timestamp) > new Date(existing.lastUsed)) {
            existing.lastUsed = entry.timestamp;
          }
          queryMap.set(entry.prompt, existing);
        });
      } catch (error) {
        // Ignore errors
      }
    }

    return Array.from(queryMap.entries())
      .map(([prompt, data]) => ({prompt, ...data}))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getUsagePattern(): Promise<{peakHour: number, peakCount: number, mostActiveDay: string, avgDailyQueries: number}> {
    const hourCounts = new Array(24).fill(0);
    const dayCounts: {[key: string]: number} = {};
    let totalQueries = 0;

    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);

        cache.entries.forEach(entry => {
          const date = new Date(entry.timestamp);
          const hour = date.getHours();
          const dayName = date.toLocaleDateString('en-US', {weekday: 'long'});

          hourCounts[hour]++;
          dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
          totalQueries++;
        });
      } catch (error) {
        // Ignore errors
      }
    }

    const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
    const mostActiveDay = Object.keys(dayCounts).reduce((a, b) =>
      dayCounts[a] > dayCounts[b] ? a : b, 'Monday');

    const uniqueDays = new Set();
    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);
        cache.entries.forEach(entry => {
          uniqueDays.add(new Date(entry.timestamp).toDateString());
        });
      } catch (error) {
        // Ignore errors
      }
    }

    return {
      peakHour,
      peakCount: hourCounts[peakHour],
      mostActiveDay,
      avgDailyQueries: uniqueDays.size > 0 ? Math.round(totalQueries / uniqueDays.size) : 0
    };
  }

  // Tagging methods
  async addTagToChat(chatId: string, tagName: string): Promise<void> {
    if (!fs.existsSync(this.localCachePath)) return;

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      const chatIndex = parseInt(chatId);
      if (chatIndex >= 0 && chatIndex < cache.entries.length) {
        const entry = cache.entries[chatIndex];
        if (!entry.tags) entry.tags = [];
        if (!entry.tags.includes(tagName)) {
          entry.tags.push(tagName);

          // Save updated cache
          fs.writeFileSync(
            this.localCachePath,
            JSON.stringify(cache, null, 2),
            { mode: 0o600 }
          );
        }
      }
    } catch (error) {
      throw new Error('Failed to add tag to chat');
    }
  }

  async getAllTags(): Promise<ChatTag[]> {
    const tagMap = new Map<string, {count: number, created: string, lastUsed: string}>();

    if (fs.existsSync(this.localCachePath)) {
      try {
        const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
        const cache: LocalCache = JSON.parse(cacheContent);

        cache.entries.forEach(entry => {
          if (entry.tags) {
            entry.tags.forEach(tag => {
              const existing = tagMap.get(tag) || {
                count: 0,
                created: entry.timestamp,
                lastUsed: entry.timestamp
              };
              existing.count++;
              if (new Date(entry.timestamp) > new Date(existing.lastUsed)) {
                existing.lastUsed = entry.timestamp;
              }
              if (new Date(entry.timestamp) < new Date(existing.created)) {
                existing.created = entry.timestamp;
              }
              tagMap.set(tag, existing);
            });
          }
        });
      } catch (error) {
        // Ignore errors
      }
    }

    return Array.from(tagMap.entries()).map(([name, data]) => ({
      name,
      chatCount: data.count,
      created: data.created,
      lastUsed: data.lastUsed
    }));
  }

  async getChatsByTag(tagName: string): Promise<CacheEntry[]> {
    if (!fs.existsSync(this.localCachePath)) return [];

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      return cache.entries.filter(entry =>
        entry.tags && entry.tags.includes(tagName)
      );
    } catch (error) {
      return [];
    }
  }

  async getRecentChats(limit: number = 10): Promise<CacheEntry[]> {
    if (!fs.existsSync(this.localCachePath)) return [];

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      return cache.entries
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit)
        .map((entry, index) => ({...entry, id: index.toString()}));
    } catch (error) {
      return [];
    }
  }

  async getUntaggedChats(): Promise<CacheEntry[]> {
    if (!fs.existsSync(this.localCachePath)) return [];

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      return cache.entries
        .filter(entry => !entry.tags || entry.tags.length === 0)
        .map((entry, index) => ({...entry, id: index.toString()}));
    } catch (error) {
      return [];
    }
  }

  async getTotalChatCount(): Promise<number> {
    if (!fs.existsSync(this.localCachePath)) return 0;

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);
      return cache.entries.length;
    } catch (error) {
      return 0;
    }
  }

  async getAllChats(): Promise<CacheEntry[]> {
    if (!fs.existsSync(this.localCachePath)) return [];

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      // Sort by timestamp, newest first
      return cache.entries.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      return [];
    }
  }

  async getChatsByDateRange(startDate: string, endDate: string): Promise<CacheEntry[]> {
    if (!fs.existsSync(this.localCachePath)) return [];

    try {
      const cacheContent = fs.readFileSync(this.localCachePath, 'utf-8');
      const cache: LocalCache = JSON.parse(cacheContent);

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date

      return cache.entries
        .filter(entry => {
          const entryDate = new Date(entry.timestamp);
          return entryDate >= start && entryDate <= end;
        })
        .sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    } catch (error) {
      return [];
    }
  }

  async getUserInfo(): Promise<{ name: string; provider: string; email?: string } | null> {
    try {
      if (!this.authService) return null;

      const user = await this.authService.getCurrentUser();
      if (!user) return null;

      // Get user profile from database
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (data && !error) {
          return {
            name: data.full_name || user.email?.split('@')[0] || 'User',
            provider: data.provider || 'unknown',
            email: data.email || user.email
          };
        }
      }

      // Fallback to basic user info
      return {
        name: user.email?.split('@')[0] || 'User',
        provider: 'unknown',
        email: user.email
      };
    } catch (error) {
      return null;
    }
  }
}