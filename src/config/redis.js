const redis = require('redis');
require('dotenv').config();

let redisClient = null;

const initRedis = async () => {
  try {
    // Support both REDIS_URL (for production) and individual variables (for local dev)
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      // Use REDIS_URL if provided (Render, Railway, etc.)
      redisClient = redis.createClient({
        url: redisUrl,
      });
    } else {
      // Fall back to individual variables for local development
      redisClient = redis.createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
        },
        password: process.env.REDIS_PASSWORD || undefined,
      });
    }

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connection established');
    });

    await redisClient.connect();
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
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    return true;
  } catch (error) {
    console.error('Cache delete pattern error:', error);
    return false;
  }
};

module.exports = {
  initRedis,
  getRedisClient: () => redisClient,
  cacheGet,
  cacheSet,
  cacheDel,
  cacheDelPattern,
};

