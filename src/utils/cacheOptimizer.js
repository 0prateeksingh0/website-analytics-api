/**
 * Optimized Caching Layer with Advanced Strategies
 * 
 * Features:
 * - Multi-level caching (memory + Redis)
 * - Cache warming
 * - Conditional caching
 * - Cache tags for bulk invalidation
 * - Compression for large values
 * - Cache analytics
 */

const { 
  cacheGet, 
  cacheSet, 
  cacheDel, 
  cacheDelPattern,
  cacheMGet,
  cacheMSet,
} = require('../config/redis');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// In-memory cache for hot data (L1 cache)
const memoryCache = new Map();
const MEMORY_CACHE_SIZE = 1000;
const MEMORY_CACHE_TTL = 60 * 1000; // 1 minute

// Cache statistics
const cacheStats = {
  hits: 0,
  misses: 0,
  memoryHits: 0,
  redisHits: 0,
  sets: 0,
  deletes: 0,
};

/**
 * Enhanced cache get with multi-level caching
 */
const enhancedCacheGet = async (key, options = {}) => {
  const { skipMemory = false, decompress = false } = options;

  // Check memory cache first (L1)
  if (!skipMemory) {
    const memResult = memoryCache.get(key);
    if (memResult && memResult.expires > Date.now()) {
      cacheStats.hits++;
      cacheStats.memoryHits++;
      return memResult.value;
    } else if (memResult) {
      memoryCache.delete(key);
    }
  }

  // Check Redis cache (L2)
  let value = await cacheGet(key);

  if (value) {
    cacheStats.hits++;
    cacheStats.redisHits++;

    // Decompress if needed
    if (decompress && value.__compressed) {
      const buffer = Buffer.from(value.data, 'base64');
      const decompressed = await gunzip(buffer);
      value = JSON.parse(decompressed.toString());
    }

    // Populate memory cache
    if (!skipMemory && memoryCache.size < MEMORY_CACHE_SIZE) {
      memoryCache.set(key, {
        value,
        expires: Date.now() + MEMORY_CACHE_TTL,
      });
    }

    return value;
  }

  cacheStats.misses++;
  return null;
};

/**
 * Enhanced cache set with compression and multi-level caching
 */
const enhancedCacheSet = async (key, value, ttl = 300, options = {}) => {
  const { skipMemory = false, compress = false, tags = [] } = options;

  let finalValue = value;

  // Compress large values
  if (compress || JSON.stringify(value).length > 1024) {
    const compressed = await gzip(JSON.stringify(value));
    finalValue = {
      __compressed: true,
      data: compressed.toString('base64'),
    };
  }

  // Set in Redis
  const success = await cacheSet(key, finalValue, ttl);

  // Set in memory cache
  if (!skipMemory && success && memoryCache.size < MEMORY_CACHE_SIZE) {
    memoryCache.set(key, {
      value,
      expires: Date.now() + Math.min(ttl * 1000, MEMORY_CACHE_TTL),
    });
  }

  // Store cache tags for bulk invalidation
  if (tags.length > 0) {
    const tagKeys = tags.map(tag => `cache:tag:${tag}`);
    for (const tagKey of tagKeys) {
      const existingKeys = (await cacheGet(tagKey)) || [];
      existingKeys.push(key);
      await cacheSet(tagKey, existingKeys, ttl);
    }
  }

  if (success) {
    cacheStats.sets++;
  }

  return success;
};

/**
 * Invalidate cache by tag
 */
const invalidateCacheByTag = async (tag) => {
  const tagKey = `cache:tag:${tag}`;
  const keys = await cacheGet(tagKey);

  if (keys && Array.isArray(keys)) {
    // Delete from memory cache
    keys.forEach(key => memoryCache.delete(key));

    // Delete from Redis
    for (const key of keys) {
      await cacheDel(key);
      cacheStats.deletes++;
    }

    // Delete tag itself
    await cacheDel(tagKey);
  }
};

/**
 * Cache wrapper for functions
 */
const cacheWrapper = (fn, options = {}) => {
  const {
    keyGenerator,
    ttl = 300,
    compress = false,
    tags = [],
  } = options;

  return async (...args) => {
    const key = keyGenerator ? keyGenerator(...args) : `fn:${fn.name}:${JSON.stringify(args)}`;

    // Try to get from cache
    const cached = await enhancedCacheGet(key, { decompress: compress });
    if (cached !== null) {
      return cached;
    }

    // Execute function
    const result = await fn(...args);

    // Cache result
    await enhancedCacheSet(key, result, ttl, { compress, tags });

    return result;
  };
};

/**
 * Batch cache get (optimized for multiple keys)
 */
const batchCacheGet = async (keys) => {
  // Check memory cache first
  const memResults = [];
  const missingKeys = [];

  for (const key of keys) {
    const memResult = memoryCache.get(key);
    if (memResult && memResult.expires > Date.now()) {
      memResults.push(memResult.value);
      cacheStats.memoryHits++;
    } else {
      memResults.push(null);
      missingKeys.push(key);
    }
  }

  // Get missing keys from Redis
  if (missingKeys.length > 0) {
    const redisResults = await cacheMGet(missingKeys);

    let missingIdx = 0;
    for (let i = 0; i < memResults.length; i++) {
      if (memResults[i] === null) {
        memResults[i] = redisResults[missingIdx];
        if (redisResults[missingIdx] !== null) {
          cacheStats.redisHits++;
          // Populate memory cache
          if (memoryCache.size < MEMORY_CACHE_SIZE) {
            memoryCache.set(keys[i], {
              value: redisResults[missingIdx],
              expires: Date.now() + MEMORY_CACHE_TTL,
            });
          }
        }
        missingIdx++;
      }
    }
  }

  return memResults;
};

/**
 * Cache warming - preload commonly accessed data
 */
const warmCache = async (dataLoader, keys, ttl = 300) => {
  const keyValuePairs = [];

  for (const key of keys) {
    const value = await dataLoader(key);
    if (value !== null) {
      keyValuePairs.push([key, value]);
    }
  }

  if (keyValuePairs.length > 0) {
    await cacheMSet(keyValuePairs, ttl);
    cacheStats.sets += keyValuePairs.length;
  }
};

/**
 * Clear memory cache
 */
const clearMemoryCache = () => {
  memoryCache.clear();
};

/**
 * Clean expired memory cache entries
 */
const cleanMemoryCache = () => {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expires <= now) {
      memoryCache.delete(key);
    }
  }
};

// Clean memory cache every 30 seconds
setInterval(cleanMemoryCache, 30000);

/**
 * Get cache statistics
 */
const getCacheStatistics = () => {
  const hitRate = cacheStats.hits + cacheStats.misses > 0
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(2)
    : 0;

  return {
    ...cacheStats,
    hitRate: `${hitRate}%`,
    memorySize: memoryCache.size,
    memoryHitRate: cacheStats.memoryHits > 0
      ? `${(cacheStats.memoryHits / cacheStats.hits * 100).toFixed(2)}%`
      : '0%',
  };
};

/**
 * Reset cache statistics
 */
const resetCacheStatistics = () => {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.memoryHits = 0;
  cacheStats.redisHits = 0;
  cacheStats.sets = 0;
  cacheStats.deletes = 0;
};

module.exports = {
  enhancedCacheGet,
  enhancedCacheSet,
  invalidateCacheByTag,
  cacheWrapper,
  batchCacheGet,
  warmCache,
  clearMemoryCache,
  cleanMemoryCache,
  getCacheStatistics,
  resetCacheStatistics,
};

