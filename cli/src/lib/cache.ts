import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

interface CacheEntry {
  key: string;
  queryHash: string;
  query: string;
  response: string;
  model: string;
  timestamp: number;
  tokens: number;
  cost: number;
  embedding?: number[];
  accessCount: number;
  lastAccessed: number;
  userId?: string;
}

interface CacheStats {
  totalHits: number;
  totalMisses: number;
  totalSaved: number;
  entries: number;
  sizeBytes: number;
  exactHits: number;
  semanticHits: number;
  avgResponseTimeMs: number;
  hotCacheSize: number;
}

export class LocalCache {
  private cacheDir: string;
  private indexFile: string;
  private statsFile: string;
  private index: Map<string, CacheEntry>;
  private stats: CacheStats;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir || path.join(os.homedir(), '.cachegpt', 'cache');
    this.indexFile = path.join(this.cacheDir, 'index.json');
    this.statsFile = path.join(this.cacheDir, 'stats.json');
    this.index = new Map();
    this.stats = {
      totalHits: 0,
      totalMisses: 0,
      totalSaved: 0,
      entries: 0,
      sizeBytes: 0,
      exactHits: 0,
      semanticHits: 0,
      avgResponseTimeMs: 0,
      hotCacheSize: 0
    };

    this.initialize();
  }

  private initialize(): void {
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Load existing index
    if (fs.existsSync(this.indexFile)) {
      try {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        const entries = JSON.parse(data);
        entries.forEach((entry: CacheEntry) => {
          this.index.set(entry.key, entry);
        });
      } catch (error) {
        console.error('Failed to load cache index:', error);
      }
    }

    // Load stats
    if (fs.existsSync(this.statsFile)) {
      try {
        const data = fs.readFileSync(this.statsFile, 'utf-8');
        this.stats = JSON.parse(data);
      } catch (error) {
        console.error('Failed to load cache stats:', error);
      }
    }
  }

  private generateKey(query: string, model: string): string {
    const normalized = query.toLowerCase().trim();
    const hash = crypto.createHash('sha256');
    hash.update(`${model}:${normalized}`);
    return hash.digest('hex');
  }

  private generateQueryHash(query: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(query);
    return hash.digest('hex');
  }

  private saveIndex(): void {
    try {
      const entries = Array.from(this.index.values());
      fs.writeFileSync(this.indexFile, JSON.stringify(entries, null, 2));
    } catch (error) {
      console.error('Failed to save cache index:', error);
    }
  }

  private saveStats(): void {
    try {
      fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      console.error('Failed to save cache stats:', error);
    }
  }

  public get(query: string, model: string, threshold: number = 0.85, userId?: string): CacheEntry | null {
    // First try exact match using hash for O(1) lookup
    const key = this.generateKey(query, model);
    const queryHash = this.generateQueryHash(query);
    const exactMatch = this.index.get(key);

    if (exactMatch && exactMatch.queryHash === queryHash) {
      // Update access statistics
      exactMatch.accessCount++;
      exactMatch.lastAccessed = Date.now();
      this.stats.totalHits++;
      this.saveStats();
      this.saveIndex();
      return exactMatch;
    }

    // Try semantic similarity match only if no exact match
    const similar = this.findSimilar(query, model, threshold, userId);
    if (similar) {
      // Update access statistics
      similar.accessCount++;
      similar.lastAccessed = Date.now();
      this.stats.totalHits++;
      this.saveStats();
      this.saveIndex();
      return similar;
    }

    this.stats.totalMisses++;
    this.saveStats();
    return null;
  }

  public set(query: string, response: string, model: string, tokens: number = 0, cost: number = 0, userId?: string): void {
    const key = this.generateKey(query, model);
    const queryHash = this.generateQueryHash(query);

    // Check if entry exists to update access count
    const existing = this.index.get(key);

    const entry: CacheEntry = {
      key,
      queryHash,
      query,
      response,
      model,
      timestamp: existing?.timestamp || Date.now(),
      tokens,
      cost,
      embedding: this.generateSimpleEmbedding(query),
      accessCount: (existing?.accessCount || 0) + 1,
      lastAccessed: Date.now(),
      userId
    };

    this.index.set(key, entry);
    this.stats.entries = this.index.size;
    this.stats.totalSaved += cost;

    // Save entry to file with hash-based filename for faster lookup
    const entryFile = path.join(this.cacheDir, `${queryHash.substring(0, 2)}`, `${key}.json`);
    const entryDir = path.dirname(entryFile);
    if (!fs.existsSync(entryDir)) {
      fs.mkdirSync(entryDir, { recursive: true });
    }
    fs.writeFileSync(entryFile, JSON.stringify(entry, null, 2));

    this.saveIndex();
    this.saveStats();
  }

  private generateSimpleEmbedding(text: string): number[] {
    // Simple embedding based on character frequencies and n-grams
    // In production, use proper embeddings from OpenAI or HuggingFace
    const embedding = new Array(128).fill(0);
    const normalized = text.toLowerCase();

    // Character frequency
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      if (charCode < 128) {
        embedding[charCode] = (embedding[charCode] || 0) + 1;
      }
    }

    // Normalize
    const sum = embedding.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / sum;
      }
    }

    return embedding;
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  private findSimilar(query: string, model: string, threshold: number, userId?: string): CacheEntry | null {
    const queryEmbedding = this.generateSimpleEmbedding(query);
    let bestMatch: CacheEntry | null = null;
    let bestSimilarity = 0;

    // Sort by access count for hot cache optimization
    const sortedEntries = Array.from(this.index.values())
      .filter(entry => entry.model === model && (!userId || entry.userId === userId || !entry.userId))
      .sort((a, b) => (b.accessCount || 0) - (a.accessCount || 0));

    // Check top N entries first (hot cache)
    const hotCacheSize = Math.min(100, sortedEntries.length);
    for (let i = 0; i < hotCacheSize; i++) {
      const entry = sortedEntries[i];
      if (!entry.embedding) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity > bestSimilarity && similarity >= threshold) {
        bestSimilarity = similarity;
        bestMatch = entry;
        // If we find a very good match in hot cache, return early
        if (similarity > 0.95) return bestMatch;
      }
    }

    // If no good match in hot cache, check the rest
    if (!bestMatch || bestSimilarity < 0.9) {
      for (let i = hotCacheSize; i < sortedEntries.length; i++) {
        const entry = sortedEntries[i];
        if (!entry.embedding) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
        if (similarity > bestSimilarity && similarity >= threshold) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }
    }

    return bestMatch;
  }

  public clear(olderThanHours?: number): number {
    let cleared = 0;
    const now = Date.now();
    const cutoff = olderThanHours ? now - (olderThanHours * 60 * 60 * 1000) : 0;

    const entriesToRemove: string[] = [];

    for (const [key, entry] of this.index.entries()) {
      if (!olderThanHours || entry.timestamp < cutoff) {
        entriesToRemove.push(key);

        // Remove file
        const entryFile = path.join(this.cacheDir, `${key}.json`);
        if (fs.existsSync(entryFile)) {
          fs.unlinkSync(entryFile);
        }

        cleared++;
      }
    }

    // Remove from index
    entriesToRemove.forEach(key => this.index.delete(key));

    this.stats.entries = this.index.size;
    this.saveIndex();
    this.saveStats();

    return cleared;
  }

  public getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = total > 0 ? (this.stats.totalHits / total) * 100 : 0;

    return {
      ...this.stats,
      hitRate
    };
  }

  public export(): CacheEntry[] {
    return Array.from(this.index.values());
  }

  public import(entries: CacheEntry[]): void {
    entries.forEach(entry => {
      this.index.set(entry.key, entry);

      // Save to file
      const entryFile = path.join(this.cacheDir, `${entry.key}.json`);
      fs.writeFileSync(entryFile, JSON.stringify(entry, null, 2));
    });

    this.stats.entries = this.index.size;
    this.saveIndex();
    this.saveStats();
  }
}