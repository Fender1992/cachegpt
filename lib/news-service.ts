import axios from 'axios';

interface NewsArticle {
  title: string;
  description: string;
  url: string;
  publishedAt: string;
  source: string;
}

interface NewsResult {
  articles: NewsArticle[];
  sources: string[];
}

/**
 * News Service - Aggregates news from multiple APIs
 * Supports: NewsAPI, NewsData.io, GNews
 */
export class NewsService {
  private newsApiKey: string;
  private newsDataKey: string;
  private gnewsKey: string;

  constructor() {
    this.newsApiKey = process.env.NEWS_API_KEY || '';
    this.newsDataKey = process.env.NEWSDATA_API_KEY || '';
    this.gnewsKey = process.env.GNEWS_API_KEY || '';
  }

  /**
   * Check if user query needs real-time news context
   */
  needsNewsContext(message: string): boolean {
    const keywords = [
      'today', 'latest', 'current', 'news', 'recent', 'now',
      'happening', 'breaking', 'update', 'this week', 'this month',
      'yesterday', 'currently', 'right now', 'at the moment',
      'what\'s going on', 'what happened', 'tell me about'
    ];

    const lowerMessage = message.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Extract search query from user message
   */
  private extractQuery(message: string): string {
    // Simple extraction - remove question words and keep main topic
    let query = message
      .replace(/^(what|who|when|where|why|how|tell me about|what's|whats)/i, '')
      .replace(/\?/g, '')
      .trim();

    // Limit to first 100 chars for API
    return query.substring(0, 100);
  }

  /**
   * Fetch from NewsAPI.org (100 req/day free)
   */
  private async fetchNewsAPI(query: string): Promise<NewsArticle[]> {
    if (!this.newsApiKey) return [];

    try {
      const response = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: query,
          sortBy: 'publishedAt',
          pageSize: 5,
          language: 'en',
          apiKey: this.newsApiKey
        },
        timeout: 5000
      });

      return response.data.articles?.map((article: any) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        publishedAt: article.publishedAt,
        source: `NewsAPI: ${article.source.name}`
      })) || [];
    } catch (error: any) {
      console.error('NewsAPI error:', error.message);
      return [];
    }
  }

  /**
   * Fetch from NewsData.io (200 req/day free)
   */
  private async fetchNewsData(query: string): Promise<NewsArticle[]> {
    if (!this.newsDataKey) return [];

    try {
      const response = await axios.get('https://newsdata.io/api/1/news', {
        params: {
          apikey: this.newsDataKey,
          q: query,
          language: 'en',
          size: 5
        },
        timeout: 5000
      });

      return response.data.results?.map((article: any) => ({
        title: article.title,
        description: article.description || '',
        url: article.link,
        publishedAt: article.pubDate,
        source: `NewsData: ${article.source_id}`
      })) || [];
    } catch (error: any) {
      console.error('NewsData error:', error.message);
      return [];
    }
  }


  /**
   * Fetch from GNews API (100 req/day free)
   */
  private async fetchGNews(query: string): Promise<NewsArticle[]> {
    if (!this.gnewsKey) return [];

    try {
      const response = await axios.get('https://gnews.io/api/v4/search', {
        params: {
          q: query,
          token: this.gnewsKey,
          lang: 'en',
          max: 5,
          sortby: 'publishedAt'
        },
        timeout: 5000
      });

      return response.data.articles?.map((article: any) => ({
        title: article.title,
        description: article.description || '',
        url: article.url,
        publishedAt: article.publishedAt,
        source: `GNews: ${article.source.name}`
      })) || [];
    } catch (error: any) {
      console.error('GNews error:', error.message);
      return [];
    }
  }

  /**
   * Aggregate news from all available APIs
   */
  async fetchNews(userMessage: string): Promise<NewsResult> {
    const query = this.extractQuery(userMessage);

    // Fetch from all APIs in parallel
    const [newsApiResults, newsDataResults, gnewsResults] = await Promise.all([
      this.fetchNewsAPI(query),
      this.fetchNewsData(query),
      this.fetchGNews(query)
    ]);

    // Combine all results
    const allArticles = [
      ...newsApiResults,
      ...newsDataResults,
      ...gnewsResults
    ];

    // Sort by published date (most recent first)
    allArticles.sort((a, b) => {
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    // Deduplicate by title similarity
    const uniqueArticles = this.deduplicateArticles(allArticles);

    // Get sources that provided data
    const sources = [];
    if (newsApiResults.length > 0) sources.push('NewsAPI');
    if (newsDataResults.length > 0) sources.push('NewsData.io');
    if (gnewsResults.length > 0) sources.push('GNews');

    return {
      articles: uniqueArticles.slice(0, 10), // Top 10 most recent
      sources
    };
  }

  /**
   * Remove duplicate articles based on title similarity
   */
  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    const unique: NewsArticle[] = [];

    for (const article of articles) {
      // Normalize title for comparison
      const normalizedTitle = article.title.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        unique.push(article);
      }
    }

    return unique;
  }

  /**
   * Format news articles for LLM context
   */
  formatNewsContext(newsResult: NewsResult): string {
    if (newsResult.articles.length === 0) {
      return '';
    }

    const timestamp = new Date().toISOString();
    let context = `\n\n=== REAL-TIME NEWS CONTEXT (${timestamp}) ===\n`;
    context += `Sources: ${newsResult.sources.join(', ')}\n\n`;

    newsResult.articles.forEach((article, index) => {
      context += `${index + 1}. ${article.title}\n`;
      if (article.description) {
        context += `   ${article.description}\n`;
      }
      context += `   Published: ${new Date(article.publishedAt).toLocaleString()}\n`;
      context += `   Source: ${article.source}\n`;
      context += `   URL: ${article.url}\n\n`;
    });

    context += '=== END NEWS CONTEXT ===\n\n';
    context += 'Instructions: Use the above real-time news articles to provide current, accurate information. ';
    context += 'Cite sources when referencing specific news items. If asked about recent events, ';
    context += 'prioritize information from these articles over your training data.\n';

    return context;
  }

  /**
   * Get news context if needed for the query
   */
  async getNewsContextIfNeeded(userMessage: string): Promise<string> {
    if (!this.needsNewsContext(userMessage)) {
      return '';
    }

    try {
      const newsResult = await this.fetchNews(userMessage);
      return this.formatNewsContext(newsResult);
    } catch (error: any) {
      console.error('Error fetching news context:', error.message);
      return '';
    }
  }
}

// Singleton instance
let newsServiceInstance: NewsService | null = null;

export function getNewsService(): NewsService {
  if (!newsServiceInstance) {
    newsServiceInstance = new NewsService();
  }
  return newsServiceInstance;
}
