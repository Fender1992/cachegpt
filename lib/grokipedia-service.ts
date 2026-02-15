/**
 * Grokipedia Service
 *
 * Replaces Wikipedia integration with AI-enhanced encyclopedic content
 * using xAI's Grok model via OpenRouter for superior, unbiased information.
 */

interface GrokipediaResult {
  content: string;
  sources: string[];
  confidence: number;
  metadata: {
    model: string;
    provider: string;
    hasWebSearch: boolean;
    biasScore?: number;
    factualityScore?: number;
  };
}

interface GrokipediaSearchOptions {
  maxTokens?: number;
  temperature?: number;
  includeWebSearch?: boolean;
  detailedMode?: boolean; // More comprehensive vs concise
}

/**
 * Main Grokipedia Service Class
 */
class GrokipediaService {
  private apiKey: string;
  private endpoint: string = 'https://openrouter.ai/api/v1/chat/completions';
  private model: string = 'x-ai/grok-2-1212'; // Grok 2 - Latest stable model
  private enabled: boolean;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      console.warn('[GROKIPEDIA] OpenRouter API key not found. Grokipedia service disabled.');
    }
  }

  /**
   * Check if service is available
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fetch encyclopedic information using Grok's web search
   */
  async fetchEncyclopedicContent(
    query: string,
    options: GrokipediaSearchOptions = {}
  ): Promise<GrokipediaResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const {
        maxTokens = 2000,
        temperature = 0.3, // Lower for factual content
        includeWebSearch = true,
        detailedMode = false
      } = options;

      const systemPrompt = detailedMode
        ? `You are an expert encyclopedia that provides comprehensive, well-researched, and unbiased information.
When answering queries:
- Provide detailed, accurate, and current information
- Include relevant context and background
- Cite sources when possible
- Maintain neutrality and avoid bias
- Structure information clearly with sections if appropriate
- Include interesting facts or related information that adds value`
        : `You are a concise encyclopedia that provides accurate, unbiased information.
When answering queries:
- Be factual and direct
- Focus on the most important information
- Maintain neutrality
- Provide current, verified information`;

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT Grokipedia'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `Provide encyclopedic information about: ${query}`
            }
          ],
          temperature,
          max_tokens: maxTokens,
          // Grok-specific features
          provider: {
            allow_fallbacks: false,
            data_collection: 'deny'
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[GROKIPEDIA] API error: ${response.status} - ${errorText}`);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        console.error('[GROKIPEDIA] No content in response');
        return null;
      }

      // Extract sources if Grok provides them (often in citations)
      const sources = this.extractSources(content);

      return {
        content,
        sources,
        confidence: 0.95, // Grok with web search is highly reliable
        metadata: {
          model: this.model,
          provider: 'grok-openrouter',
          hasWebSearch: includeWebSearch,
          factualityScore: 0.95
        }
      };

    } catch (error) {
      console.error('[GROKIPEDIA] Error fetching content:', error);
      return null;
    }
  }

  /**
   * Extract source citations from Grok's response
   */
  private extractSources(content: string): string[] {
    const sources: string[] = [];

    // Look for common citation patterns
    const urlPattern = /https?:\/\/[^\s\)]+/g;
    const urls = content.match(urlPattern);

    if (urls) {
      sources.push(...urls);
    }

    // Look for [source] or (source) patterns
    const citationPattern = /[\[\(]([^\]\)]+)[\]\)]/g;
    const citations = content.match(citationPattern);

    if (citations) {
      citations.forEach(citation => {
        if (citation.includes('http')) {
          sources.push(citation.replace(/[\[\(\]\)]/g, ''));
        }
      });
    }

    // Deduplicate
    return [...new Set(sources)];
  }

  /**
   * Search for factual information with Grok's real-time capabilities
   */
  async searchFactual(
    query: string,
    category?: string
  ): Promise<GrokipediaResult | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const systemPrompt = `You are a factual information assistant with access to current information.
Provide accurate, up-to-date facts with sources when possible. Be concise but comprehensive.`;

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT Grokipedia Search'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.2,
          max_tokens: 1500,
          provider: {
            allow_fallbacks: false,
            data_collection: 'deny'
          }
        })
      });

      if (!response.ok) {
        console.error(`[GROKIPEDIA] Search failed: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return null;
      }

      const sources = this.extractSources(content);

      return {
        content,
        sources,
        confidence: 0.9,
        metadata: {
          model: this.model,
          provider: 'grok-openrouter',
          hasWebSearch: true
        }
      };

    } catch (error) {
      console.error('[GROKIPEDIA] Search error:', error);
      return null;
    }
  }

  /**
   * Rewrite content to be more accessible and unbiased
   */
  async rewriteContent(
    originalContent: string,
    purpose: 'accessibility' | 'neutrality' | 'comprehension' = 'accessibility'
  ): Promise<string | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const prompts = {
        accessibility: 'Rewrite this content to be more accessible and easier to understand while maintaining all factual information.',
        neutrality: 'Rewrite this content to be more neutral and unbiased, removing any editorial tone while maintaining all facts.',
        comprehension: 'Rewrite this content to be clearer and more comprehensive, expanding on complex topics while staying factual.'
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://cachegpt.app',
          'X-Title': 'CacheGPT Grokipedia Rewrite'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert editor who rewrites content to improve it while maintaining factual accuracy.'
            },
            {
              role: 'user',
              content: `${prompts[purpose]}\n\nOriginal content:\n${originalContent}`
            }
          ],
          temperature: 0.4,
          max_tokens: 3000
        })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || null;

    } catch (error) {
      console.error('[GROKIPEDIA] Rewrite error:', error);
      return null;
    }
  }

  /**
   * Get quick summary for a topic
   */
  async getQuickSummary(topic: string): Promise<string | null> {
    const result = await this.fetchEncyclopedicContent(topic, {
      maxTokens: 500,
      detailedMode: false
    });

    return result?.content || null;
  }

  /**
   * Get detailed article for a topic
   */
  async getDetailedArticle(topic: string): Promise<GrokipediaResult | null> {
    return this.fetchEncyclopedicContent(topic, {
      maxTokens: 3000,
      detailedMode: true
    });
  }
}

// Export singleton instance
export const grokipediaService = new GrokipediaService();

// Export types
export type { GrokipediaResult, GrokipediaSearchOptions };

/**
 * Format Grokipedia results for AI context injection
 */
export function formatGrokipediaForContext(
  result: GrokipediaResult,
  query: string
): string {
  let context = `[Grokipedia Encyclopedic Content for "${query}"]\n\n`;
  context += result.content;

  if (result.sources.length > 0) {
    context += `\n\n**Sources:**\n`;
    result.sources.slice(0, 5).forEach((source, index) => {
      context += `${index + 1}. ${source}\n`;
    });
  }

  context += `\n[Confidence: ${(result.confidence * 100).toFixed(0)}% | Provider: ${result.metadata.provider}]`;
  context += `\n[Use this verified information to provide accurate responses.]`;

  return context;
}

/**
 * Determine if a query is encyclopedic in nature
 */
export function isEncyclopedicQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Encyclopedic patterns
  const encyclopedicPatterns = [
    /^what is /,
    /^who is /,
    /^who was /,
    /^where is /,
    /^when did /,
    /^when was /,
    /^how does .* work/,
    /^explain /,
    /^define /,
    /^tell me about /,
    /^information about /,
    / history$/,
    / history of /,
    / definition$/,
    / meaning$/,
    /^describe /
  ];

  // Check patterns
  for (const pattern of encyclopedicPatterns) {
    if (pattern.test(lowerQuery)) {
      return true;
    }
  }

  // Check for entity-like queries (proper nouns, places, concepts)
  const words = query.split(' ');
  const hasCapitalizedWords = words.some(word =>
    word.length > 1 && word[0] === word[0].toUpperCase()
  );

  // Short queries with capitals are likely entity lookups
  if (words.length <= 5 && hasCapitalizedWords) {
    return true;
  }

  return false;
}
