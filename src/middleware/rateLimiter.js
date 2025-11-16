const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use Redis store if available
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:api:',
      })
    : undefined,
});

// Stricter rate limiter for event collection
const eventCollectionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Allow more requests for high-volume event collection
  message: {
    success: false,
    message: 'Event collection rate limit exceeded. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by API key if available
    return req.headers['x-api-key'] || req.ip;
  },
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:events:',
      })
    : undefined,
});

// Rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit auth attempts
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:auth:',
      })
    : undefined,
});

// Rate limiter for analytics queries
const analyticsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60,
  message: {
    success: false,
    message: 'Too many analytics requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user if authenticated
    return req.user ? req.user.id : req.ip;
  },
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:analytics:',
      })
    : undefined,
});

module.exports = {
  apiLimiter,
  eventCollectionLimiter,
  authLimiter,
  analyticsLimiter,
};

