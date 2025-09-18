import fetch from 'node-fetch';

/**
 * Generate OpenAI embeddings for better semantic search
 * Uses text-embedding-ada-002 model (1536 dimensions)
 */
export class OpenAIEmbeddings {
  private apiKey: string;
  private model: string = 'text-embedding-ada-002';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  No OpenAI API key found. Using fallback embeddings.');
    }
  }

  /**
   * Generate embedding using OpenAI API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      // Fallback to simple embedding if no API key
      return this.generateSimpleEmbedding(text);
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: text.slice(0, 8000) // Limit to 8K chars
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('OpenAI embedding error:', error);
        return this.generateSimpleEmbedding(text);
      }

      const data = await response.json() as any;
      return data.data[0].embedding;

    } catch (error) {
      console.error('Failed to generate OpenAI embedding:', error);
      return this.generateSimpleEmbedding(text);
    }
  }

  /**
   * Fallback: Generate simple embedding (384 dimensions for Supabase)
   */
  private generateSimpleEmbedding(text: string): number[] {
    // Use 384 dimensions to match Supabase schema
    const dimensions = 384;
    const embedding = new Array(dimensions).fill(0);

    // Create a better hash-based embedding
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      // Distribute character information across dimensions
      embedding[i % dimensions] += charCode / 255 - 0.5;
      embedding[(i * 7) % dimensions] += (charCode % 17) / 17 - 0.5;
      embedding[(i * 13) % dimensions] += (charCode % 31) / 31 - 0.5;
    }

    // Add n-gram features
    for (let i = 0; i < text.length - 2; i++) {
      const trigram = text.slice(i, i + 3);
      const trigramHash = trigram.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0);
      embedding[Math.abs(trigramHash) % dimensions] += 0.1;
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }

    return embedding;
  }

  /**
   * Batch generate embeddings for multiple texts
   */
  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      return texts.map(text => this.generateSimpleEmbedding(text));
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          input: texts.map(t => t.slice(0, 8000))
        })
      });

      if (!response.ok) {
        return texts.map(text => this.generateSimpleEmbedding(text));
      }

      const data = await response.json() as any;
      return data.data.map((item: any) => item.embedding);

    } catch (error) {
      console.error('Batch embedding failed:', error);
      return texts.map(text => this.generateSimpleEmbedding(text));
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }
}