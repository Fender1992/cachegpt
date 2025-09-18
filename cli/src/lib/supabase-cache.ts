import { createClient } from '@supabase/supabase-js';
import { HfInference } from '@huggingface/inference';
import * as dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Load environment variables from the main project's .env
// Try multiple paths to find the .env file
const possiblePaths = [
  path.join(process.cwd(), '..', '.env'),  // Parent directory (main project)
  path.join(process.cwd(), '.env'),         // Current directory
  path.join(__dirname, '..', '..', '..', '.env'), // Relative to this file
  '/root/cachegpt/.env'                     // Absolute path (for development)
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slxgfzlralwbpzafbufm.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNseGdmemxyYWx3YnB6YWZidWZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NzgwMzQsImV4cCI6MjA3MzU1NDAzNH0.0TRSpP_OxAde0WkVXJohGWIqlJ2CdpiYt6FAh2lz1so';

const supabase = createClient(supabaseUrl, supabaseKey);

// Silent connection - no logging in production

// Initialize Hugging Face client
const hfApiKey = process.env.HUGGINGFACE_API_KEY || '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'; // Default key for demo
const hf = new HfInference(hfApiKey);

interface CachedResponse {
  id?: string;
  query: string;
  response: string;
  model: string;
  embedding?: number[];
  similarity?: number;
  created_at?: string;
}

export class SupabaseCache {
  private userId: string;

  constructor(userId?: string) {
    this.userId = userId || 'cli-user';
  }

  /**
   * Generate a simple embedding for the query (placeholder for now)
   * In production, this should use the same embedding model as the web app
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Simple hash-based embedding for now
    // TODO: Use proper embedding service like OpenAI
    // Note: Database uses 384 dimensions for all-MiniLM-L6-v2
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < text.length; i++) {
      embedding[i % 384] = (text.charCodeAt(i) / 255) - 0.5;
    }
    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }
    return embedding;
  }

  /**
   * Adapt a cached response to a new context using Hugging Face
   */
  private async adaptResponseToContext(
    cachedResponse: string,
    originalQuery: string,
    newQuery: string
  ): Promise<string> {
    try {
      const adaptationPrompt = `
You are a response adaptation assistant. Adapt this cached response to answer a similar but slightly different question.

Original Question: "${originalQuery}"
Original Response: "${cachedResponse}"
New Question: "${newQuery}"

Please adapt the response to naturally answer the new question while keeping the core information accurate.
Adapted Response:`;

      const response = await hf.textGeneration({
        model: 'microsoft/DialoGPT-medium',
        inputs: adaptationPrompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7,
          top_p: 0.9,
          repetition_penalty: 1.2,
        }
      });

      return response.generated_text || cachedResponse;
    } catch (error) {
      // Silent error
      // Fallback: return original response
      return cachedResponse;
    }
  }

  /**
   * Aggregate multiple cached responses into a comprehensive answer
   */
  private async aggregateResponses(
    responses: CachedResponse[],
    newQuery: string
  ): Promise<string> {
    try {
      // Sort by similarity score
      const sorted = responses.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

      // Take top 3 most relevant
      const topResponses = sorted.slice(0, 3);

      const aggregationPrompt = `
You are an intelligent response aggregator. You have multiple cached responses to similar questions.
New Question: "${newQuery}"

Here are the relevant cached responses:
${topResponses.map((r, i) => `
Response ${i + 1} (Similarity: ${Math.round((r.similarity || 0) * 100)}%):
Question: "${r.query}"
Answer: "${r.response}"
`).join('\n')}

Please create a comprehensive answer to the new question by:
1. Combining relevant information from all responses
2. Removing any redundancy
3. Ensuring the answer directly addresses the new question
4. Maintaining accuracy and coherence

Comprehensive Answer:`;

      const response = await hf.textGeneration({
        model: 'google/flan-t5-large',
        inputs: aggregationPrompt,
        parameters: {
          max_new_tokens: 600,
          temperature: 0.5,
          top_p: 0.95,
        }
      });

      return response.generated_text || topResponses[0].response;
    } catch (error) {
      // Silent error
      // Fallback: return best match
      return responses[0]?.response || '';
    }
  }

  /**
   * Search for multiple similar cached responses in Supabase
   */
  async findMultipleSimilar(
    query: string,
    model: string,
    threshold: number = 0.7,
    maxResults: number = 5
  ): Promise<CachedResponse[]> {
    try {
      const embedding = await this.generateEmbedding(query);

      // First try exact match
      const { data: exactMatch } = await supabase
        .from('cached_responses')
        .select('*')
        .eq('query', query)
        .eq('model', model)
        .single();

      if (exactMatch) {
        return [{ ...exactMatch, similarity: 1.0 }];
      }

      // Try similarity search for multiple results
      // Note: Database might have different function name
      let { data, error } = await supabase
        .rpc('match_responses', {
          query_embedding: embedding,
          match_threshold: threshold,
          match_count: maxResults,
          model_filter: model
        });

      // Fallback to alternative function name if needed
      if (error?.message?.includes('match_cache_entries')) {
        const result = await supabase
          .rpc('match_cache_entries', {
            query_embedding: embedding,
            match_threshold: threshold,
            match_count: maxResults,
            model_filter: model
          });
        data = result.data;
        error = result.error;
      }

      if (error) {
        // Silent error - don't log in production
        // Fallback to text-based search
        const { data: textMatches } = await supabase
          .from('cached_responses')
          .select('*')
          .eq('model', model)
          .ilike('query', `%${query.slice(0, 30)}%`)
          .limit(maxResults);

        if (textMatches) {
          return textMatches.map(match => ({ ...match, similarity: 0.7 }));
        }
      }

      return data || [];
    } catch (error) {
      // Silent error
      return [];
    }
  }

  /**
   * Search for similar cached responses in Supabase (single best match with adaptation)
   */
  async findSimilar(query: string, model: string, threshold: number = 0.85): Promise<CachedResponse | null> {
    try {
      // Get multiple similar responses
      const multipleResponses = await this.findMultipleSimilar(query, model, threshold, 5);

      if (multipleResponses.length === 0) {
        return null;
      }

      // If exact match, return as is
      if (multipleResponses[0].similarity === 1.0) {
        return multipleResponses[0];
      }

      // If multiple good matches, aggregate them
      if (multipleResponses.length > 1 && multipleResponses[0].similarity! > threshold) {
        const aggregatedResponse = await this.aggregateResponses(multipleResponses, query);
        return {
          query: query,
          response: aggregatedResponse,
          model: model,
          similarity: multipleResponses[0].similarity,
          created_at: new Date().toISOString()
        };
      }

      // If single match above threshold, adapt it to the new query
      if (multipleResponses[0].similarity! > threshold) {
        const adaptedResponse = await this.adaptResponseToContext(
          multipleResponses[0].response,
          multipleResponses[0].query,
          query
        );
        return {
          ...multipleResponses[0],
          response: adaptedResponse
        };
      }

      return null;
    } catch (error) {
      // Silent error
      return null;
    }
  }

  /**
   * Cache a new response in Supabase
   */
  async set(query: string, response: string, model: string): Promise<void> {
    try {
      // Silently cache to Supabase
      const embedding = await this.generateEmbedding(query);

      // First try to insert with created_at
      let { data, error } = await supabase
        .from('cached_responses')
        .insert({
          query,
          response,
          embedding,
          model,
          created_at: new Date().toISOString(),
        })
        .select();

      // If partition error, try without created_at (let DB handle it)
      if (error?.message?.includes('no partition')) {
        // Retry without timestamp
        const result = await supabase
          .from('cached_responses')
          .insert({
            query,
            response,
            embedding,
            model,
            // Let database use DEFAULT NOW() for created_at
          })
          .select();
        data = result.data;
        error = result.error;
      }

      if (error) {
        // Cache failed silently
      } else {
        // Cached successfully
      }
    } catch (error) {
      // Silent error
    }
  }

  /**
   * Get cache statistics from Supabase
   */
  async getStats(): Promise<{
    entries: number;
    hitRate: number;
    totalSaved: number;
  }> {
    try {
      const { count } = await supabase
        .from('cached_responses')
        .select('*', { count: 'exact', head: true });

      // Get usage stats if available
      const { data: stats } = await supabase
        .from('usage')
        .select('cache_hit, cost_saved')
        .eq('user_id', this.userId);

      const hits = stats?.filter(s => s.cache_hit).length || 0;
      const total = stats?.length || 1;
      const totalSaved = stats?.reduce((acc, s) => acc + (s.cost_saved || 0), 0) || 0;

      return {
        entries: count || 0,
        hitRate: (hits / total) * 100,
        totalSaved
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        entries: 0,
        hitRate: 0,
        totalSaved: 0
      };
    }
  }

  /**
   * Track usage in Supabase
   */
  async trackUsage(data: {
    model: string;
    tokens_used: number;
    cache_hit: boolean;
    response_time_ms: number;
    cost: number;
    cost_saved: number;
  }): Promise<void> {
    try {
      await supabase
        .from('usage')
        .insert({
          user_id: this.userId,
          ...data,
          endpoint: '/cli/chat',
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Failed to track usage:', error);
    }
  }
}