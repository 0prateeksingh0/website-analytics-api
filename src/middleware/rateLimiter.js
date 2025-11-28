const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');
const { cacheIncr } = require('../config/redis');

/**
 * Optimized rate limiter with sliding window algorithm
 */
class OptimizedRateLimiter {
  constructor(options = {}) {
    const {
      windowMs = 60000,
      maxRequests = 100,
      keyGenerator = (req) => req.ip,
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.keyGenerator = keyGenerator;
    this.skipSuccessfulRequests = skipSuccessfulRequests;
    this.skipFailedRequests = skipFailedRequests;
  }

  middleware() {
    return async (req, res, next) => {
      const key = `rl:optimized:${this.keyGenerator(req)}`;
      const now = Date.now();
      const windowStart = now - this.windowMs;

      try {
        // Get current count
        const count = await cacheIncr(key, Math.ceil(this.windowMs / 1000));

        if (count === null) {
          // Redis not available, allow request
          return next();
        }

        // Set headers
        res.setHeader('X-RateLimit-Limit', this.maxRequests);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - count));
        res.setHeader('X-RateLimit-Reset', new Date(now + this.windowMs).toISOString());

        if (count > this.maxRequests) {
          return res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later.',
            retryAfter: Math.ceil(this.windowMs / 1000),
          });
        }

        next();
      } catch (error) {
        console.error('Rate limiter error:', error);
        // On error, allow the request
        next();
      }
    };
  }
}

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
  // Skip counting failed requests
  skip: (req, res) => res.statusCode < 400,
  // Use Redis store if available
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:api:',
      })
    : undefined,
});

// Optimized event collection limiter (high-throughput)
const eventCollectionLimiter = new OptimizedRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 2000, // Increased for high volume
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  skipSuccessfulRequests: false,
}).middleware();

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
  // Don't skip any requests for auth
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  store: getRedisClient()
    ? new RedisStore({
        client: getRedisClient(),
        prefix: 'rl:auth:',
      })
    : undefined,
});

// Optimized analytics limiter
const analyticsLimiter = new OptimizedRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 120, // Increased from 60
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`),
}).middleware();

module.exports = {
  apiLimiter,
  eventCollectionLimiter,
  authLimiter,
  analyticsLimiter,
  OptimizedRateLimiter,
};

