import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import config from '../utils/configUtils';
import logger from '../utils/logger';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in minutes
  namespace?: string;
}

export class CacheService {
  private static readonly CACHE_DIR = path.join(__dirname, '../../cache');
  private static readonly DEFAULT_TTL = config.cache.ttlMinutes;
  private static readonly ENABLED = config.cache.enabled;

  /**
   * Initialize cache service
   */
  static async initialize(): Promise<void> {
    if (!this.ENABLED) {
      logger.info('Cache service is disabled');
      return;
    }

    try {
      // Create cache directory if it doesn't exist
      if (!fs.existsSync(this.CACHE_DIR)) {
        fs.mkdirSync(this.CACHE_DIR, { recursive: true });
        logger.info('Cache directory created', { path: this.CACHE_DIR });
      }

      // Clean up expired entries on startup
      await this.cleanupExpiredEntries();
      
      logger.info('Cache service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cache service', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Store data in cache
   */
  static async set<T>(
    key: string,
    data: T,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.ENABLED) return false;

    try {
      const ttl = options.ttl || this.DEFAULT_TTL;
      const namespace = options.namespace || 'default';
      const cacheKey = this.generateCacheKey(key, namespace);
      
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttl * 60 * 1000, // Convert minutes to milliseconds
        key: cacheKey
      };

      const filePath = this.getCacheFilePath(cacheKey);
      const serializedData = JSON.stringify(entry);
      
      fs.writeFileSync(filePath, serializedData, 'utf8');
      
      logger.debug('Data cached successfully', {
        key: cacheKey,
        ttl,
        size: serializedData.length
      });

      return true;
    } catch (error) {
      logger.error('Failed to cache data', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Retrieve data from cache
   */
  static async get<T>(
    key: string,
    options: CacheOptions = {}
  ): Promise<T | null> {
    if (!this.ENABLED) return null;

    try {
      const namespace = options.namespace || 'default';
      const cacheKey = this.generateCacheKey(key, namespace);
      const filePath = this.getCacheFilePath(cacheKey);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const entry: CacheEntry<T> = JSON.parse(fileContent);

      // Check if entry has expired
      if (this.isExpired(entry)) {
        await this.delete(key, options);
        return null;
      }

      logger.debug('Cache hit', {
        key: cacheKey,
        age: Date.now() - entry.timestamp
      });

      return entry.data;
    } catch (error) {
      logger.error('Failed to retrieve cached data', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Delete data from cache
   */
  static async delete(
    key: string,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.ENABLED) return false;

    try {
      const namespace = options.namespace || 'default';
      const cacheKey = this.generateCacheKey(key, namespace);
      const filePath = this.getCacheFilePath(cacheKey);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug('Cache entry deleted', { key: cacheKey });
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to delete cached data', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Check if data exists in cache
   */
  static async exists(
    key: string,
    options: CacheOptions = {}
  ): Promise<boolean> {
    if (!this.ENABLED) return false;

    const namespace = options.namespace || 'default';
    const cacheKey = this.generateCacheKey(key, namespace);
    const filePath = this.getCacheFilePath(cacheKey);

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const entry: CacheEntry<any> = JSON.parse(fileContent);
      
      if (this.isExpired(entry)) {
        await this.delete(key, options);
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to check cache existence', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  static async clear(namespace?: string): Promise<boolean> {
    if (!this.ENABLED) return false;

    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      let deletedCount = 0;

      for (const file of files) {
        if (namespace) {
          // Only delete files from specific namespace
          if (file.startsWith(`${namespace}_`)) {
            fs.unlinkSync(path.join(this.CACHE_DIR, file));
            deletedCount++;
          }
        } else {
          // Delete all cache files
          fs.unlinkSync(path.join(this.CACHE_DIR, file));
          deletedCount++;
        }
      }

      logger.info('Cache cleared', {
        namespace: namespace || 'all',
        deletedCount
      });

      return true;
    } catch (error) {
      logger.error('Failed to clear cache', {
        namespace,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    namespaces: string[];
    oldestEntry: number;
    newestEntry: number;
  }> {
    if (!this.ENABLED) {
      return {
        totalEntries: 0,
        totalSize: 0,
        namespaces: [],
        oldestEntry: 0,
        newestEntry: 0
      };
    }

    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      const namespaces = new Set<string>();
      let totalSize = 0;
      let oldestEntry = Date.now();
      let newestEntry = 0;

      for (const file of files) {
        const filePath = path.join(this.CACHE_DIR, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;

        // Extract namespace from filename
        const namespace = file.split('_')[0];
        namespaces.add(namespace);

        // Get entry timestamp
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const entry: CacheEntry<any> = JSON.parse(content);
          oldestEntry = Math.min(oldestEntry, entry.timestamp);
          newestEntry = Math.max(newestEntry, entry.timestamp);
        } catch (error) {
          // Skip invalid entries
        }
      }

      return {
        totalEntries: files.length,
        totalSize,
        namespaces: Array.from(namespaces),
        oldestEntry,
        newestEntry
      };
    } catch (error) {
      logger.error('Failed to get cache stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalEntries: 0,
        totalSize: 0,
        namespaces: [],
        oldestEntry: 0,
        newestEntry: 0
      };
    }
  }

  /**
   * Clean up expired cache entries
   */
  static async cleanupExpiredEntries(): Promise<number> {
    if (!this.ENABLED) return 0;

    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.CACHE_DIR, file);
        
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const entry: CacheEntry<any> = JSON.parse(content);
          
          if (this.isExpired(entry)) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (error) {
          // Delete corrupted cache files
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info('Expired cache entries cleaned up', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired entries', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  /**
   * Generate cache key with namespace
   */
  private static generateCacheKey(key: string, namespace: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return `${namespace}_${hash}`;
  }

  /**
   * Get file path for cache key
   */
  private static getCacheFilePath(cacheKey: string): string {
    return path.join(this.CACHE_DIR, `${cacheKey}.json`);
  }

  /**
   * Check if cache entry has expired
   */
  private static isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Cache OHLCV data with specific key format
   */
  static async cacheOHLCVData(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date,
    data: any
  ): Promise<boolean> {
    const key = `ohlcv_${symbol}_${timeframe}_${start.toISOString()}_${end.toISOString()}`;
    return this.set(key, data, { namespace: 'ohlcv', ttl: 60 });
  }

  /**
   * Retrieve cached OHLCV data
   */
  static async getCachedOHLCVData(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date
  ): Promise<any | null> {
    const key = `ohlcv_${symbol}_${timeframe}_${start.toISOString()}_${end.toISOString()}`;
    return this.get(key, { namespace: 'ohlcv' });
  }

  /**
   * Cache chart image with specific key format
   */
  static async cacheChartImage(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
    studiesHash: string,
    imageBase64: string
  ): Promise<boolean> {
    const key = `chart_${symbol}_${interval}_${start.toISOString()}_${end.toISOString()}_${studiesHash}`;
    return this.set(key, imageBase64, { namespace: 'charts', ttl: 120 });
  }

  /**
   * Retrieve cached chart image
   */
  static async getCachedChartImage(
    symbol: string,
    interval: string,
    start: Date,
    end: Date,
    studiesHash: string
  ): Promise<string | null> {
    const key = `chart_${symbol}_${interval}_${start.toISOString()}_${end.toISOString()}_${studiesHash}`;
    return this.get(key, { namespace: 'charts' });
  }

  /**
   * Cache AI analysis result
   */
  static async cacheAIAnalysis(
    analysisId: string,
    result: any
  ): Promise<boolean> {
    return this.set(analysisId, result, { namespace: 'ai_analysis', ttl: 1440 }); // 24 hours
  }

  /**
   * Retrieve cached AI analysis
   */
  static async getCachedAIAnalysis(analysisId: string): Promise<any | null> {
    return this.get(analysisId, { namespace: 'ai_analysis' });
  }

  /**
   * Generate hash for chart studies configuration
   */
  static generateStudiesHash(studies: any[]): string {
    const studiesString = JSON.stringify(studies);
    return crypto.createHash('md5').update(studiesString).digest('hex');
  }
}

export default CacheService;
