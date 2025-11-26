const redis = require('redis');
require('dotenv').config();

let redisClient = null;

const initRedis = async () => {
  try {
    // Support both REDIS_URL (for production) and individual variables (for local dev)
    const redisUrl = process.env.REDIS_URL;
    
    const redisConfig = {
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Too many reconnection attempts');
            return new Error('Too many retries');
          }
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms...
          return Math.min(retries * 50, 3000);
        },
        connectTimeout: 10000,
      },
      // Enable offline queue to buffer commands during disconnects
      enableOfflineQueue: true,
      // Disable ready check for faster startup
      disableOfflineQueue: false,
    };
    
    if (redisUrl) {
      // Use REDIS_URL if provided (Render, Railway, etc.)
      redisClient = redis.createClient({
        url: redisUrl,
        ...redisConfig,
      });
    } else {
      // Fall back to individual variables for local development
      redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          ...redisConfig.socket,
        },
        password: process.env.REDIS_PASSWORD || undefined,
        ...redisConfig,
      });
    }

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connection established');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    redisClient.on('ready', () => {
      console.log('Redis client ready');
    });

    await redisClient.connect();
    
    // Configure Redis for optimal performance
    try {
      // Set maxmemory policy to evict least recently used keys when memory is full
      await redisClient.configSet('maxmemory-policy', 'allkeys-lru');
    } catch (err) {
      console.warn('Could not set Redis maxmemory-policy:', err.message);
    }
    
    return redisClient;
  } catch (error) {
    console.error('Failed to initialize Redis:', error);
    // Return null if Redis is not available (graceful degradation)
    return null;
  }
};

// Cache helper functions
const cacheGet = async (key) => {
  if (!redisClient || !redisClient.isOpen) {
    return null;
  }
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

const cacheSet = async (key, value, ttl = 300) => {
  if (!redisClient || !redisClient.isOpen) {
    return false;
  }
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
};

const cacheDel = async (key) => {
  if (!redisClient || !redisClient.isOpen) {
    return false;
  }
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
};

const cacheDelPattern = async (pattern) => {
  if (!redisClient || !redisClient.isOpen) {
    return false;
  }
  try {
    // Use SCAN instead of KEYS for better performance in production
    let cursor = 0;
    let deletedCount = 0;
    
    do {
      const result = await redisClient.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      cursor = result.cursor;
      const keys = result.keys;
      
      if (keys.length > 0) {
        await redisClient.del(keys);
        deletedCount += keys.length;
      }
    } while (cursor !== 0);
    
    console.log(`Deleted ${deletedCount} keys matching pattern: ${pattern}`);
    return true;
  } catch (error) {
    console.error('Cache delete pattern error:', error);
    return false;
  }
};

// Batch get multiple keys
const cacheMGet = async (keys) => {
  if (!redisClient || !redisClient.isOpen || keys.length === 0) {
    return [];
  }
  try {
    const values = await redisClient.mGet(keys);
    return values.map(val => val ? JSON.parse(val) : null);
  } catch (error) {
    console.error('Cache mget error:', error);
    return keys.map(() => null);
  }
};

// Batch set multiple keys
const cacheMSet = async (keyValuePairs, ttl = 300) => {
  if (!redisClient || !redisClient.isOpen || keyValuePairs.length === 0) {
    return false;
  }
  try {
    const pipeline = redisClient.multi();
    
    for (const [key, value] of keyValuePairs) {
      pipeline.setEx(key, ttl, JSON.stringify(value));
    }
    
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error('Cache mset error:', error);
    return false;
  }
};

// Increment counter (useful for rate limiting)
const cacheIncr = async (key, ttl = 300) => {
  if (!redisClient || !redisClient.isOpen) {
    return null;
  }
  try {
    const value = await redisClient.incr(key);
    if (value === 1 && ttl) {
      await redisClient.expire(key, ttl);
    }
    return value;
  } catch (error) {
    console.error('Cache incr error:', error);
    return null;
  }
};

// Get cache statistics
const getCacheStats = async () => {
  if (!redisClient || !redisClient.isOpen) {
    return null;
  }
  try {
    const info = await redisClient.info('stats');
    const memory = await redisClient.info('memory');
    return {
      connected: redisClient.isOpen,
      stats: info,
      memory: memory,
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return null;
  }
};

// Graceful shutdown
const shutdownRedis = async () => {
  if (redisClient && redisClient.isOpen) {
    console.log('Closing Redis connection...');
    await redisClient.quit();
    console.log('Redis connection closed');
  }
};

module.exports = {
  initRedis,
  getRedisClient: () => redisClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
  cacheMGet,
  cacheMSet,
  cacheIncr,
  getCacheStats,
  shutdownRedis,
};

