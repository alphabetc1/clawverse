/**
 * Context cache for storing query results
 */

export interface CacheEntry {
  data: unknown;
  timestamp: number;
  key: string;
}

export interface ContextCacheOptions {
  /** Time-to-live in ms */
  ttlMs?: number;
  /** Maximum cache size */
  maxSize?: number;
}

const DEFAULT_OPTIONS: Required<ContextCacheOptions> = {
  ttlMs: 30000,
  maxSize: 100,
};

/**
 * LRU cache with TTL for context queries
 */
export class ContextCache {
  private cache: Map<string, CacheEntry> = new Map();
  private options: Required<ContextCacheOptions>;
  private hits = 0;
  private misses = 0;

  constructor(options: ContextCacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get an item from cache
   */
  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.options.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Move to end for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry;
  }

  /**
   * Set an item in cache
   */
  set(key: string, data: unknown): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, {
      key,
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete an item from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries with a given prefix
   */
  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.options.ttlMs) {
        this.cache.delete(key);
        pruned++;
      }
    }
    
    return pruned;
  }
}
