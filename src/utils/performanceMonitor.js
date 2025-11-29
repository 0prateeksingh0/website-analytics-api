/**
 * Performance Monitoring Utility
 * 
 * Provides real-time monitoring of:
 * - Database connection pools
 * - Cache performance
 * - Request/response times
 * - Memory usage
 */

const { healthCheck } = require('../database/db');
const { getCacheStats } = require('../config/redis');
const { getCacheStatistics } = require('../utils/cacheOptimizer');

// Request metrics
const requestMetrics = {
  total: 0,
  success: 0,
  errors: 0,
  totalResponseTime: 0,
  slowRequests: 0,
  byEndpoint: new Map(),
};

/**
 * Middleware to track request performance
 */
const performanceTracker = (req, res, next) => {
  const start = Date.now();
  const endpoint = `${req.method} ${req.route?.path || req.path}`;

  // Track response
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Update metrics
    requestMetrics.total++;
    requestMetrics.totalResponseTime += duration;
    
    if (res.statusCode < 400) {
      requestMetrics.success++;
    } else {
      requestMetrics.errors++;
    }

    if (duration > 1000) {
      requestMetrics.slowRequests++;
    }

    // Track by endpoint
    if (!requestMetrics.byEndpoint.has(endpoint)) {
      requestMetrics.byEndpoint.set(endpoint, {
        count: 0,
        totalTime: 0,
        errors: 0,
      });
    }

    const endpointStats = requestMetrics.byEndpoint.get(endpoint);
    endpointStats.count++;
    endpointStats.totalTime += duration;
    if (res.statusCode >= 400) {
      endpointStats.errors++;
    }

    // Log slow requests
    if (duration > 1000) {
      console.warn(`Slow request detected: ${endpoint} - ${duration}ms`);
    }
  });

  next();
};

/**
 * Get current performance metrics
 */
const getPerformanceMetrics = async () => {
  const avgResponseTime = requestMetrics.total > 0
    ? (requestMetrics.totalResponseTime / requestMetrics.total).toFixed(2)
    : 0;

  const successRate = requestMetrics.total > 0
    ? ((requestMetrics.success / requestMetrics.total) * 100).toFixed(2)
    : 100;

  // Get database health
  let dbHealth = null;
  try {
    dbHealth = await healthCheck();
  } catch (error) {
    console.error('Error checking database health:', error);
  }

  // Get cache stats
  let cacheStats = null;
  try {
    cacheStats = getCacheStatistics();
  } catch (error) {
    console.error('Error getting cache stats:', error);
  }

  // Get Redis stats
  let redisStats = null;
  try {
    redisStats = await getCacheStats();
  } catch (error) {
    // Redis might not be available
  }

  // Get memory usage
  const memUsage = process.memoryUsage();
  const memory = {
    heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    rss: `${(memUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    external: `${(memUsage.external / 1024 / 1024).toFixed(2)} MB`,
  };

  // Top endpoints by count
  const topEndpoints = Array.from(requestMetrics.byEndpoint.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([endpoint, stats]) => ({
      endpoint,
      count: stats.count,
      avgTime: `${(stats.totalTime / stats.count).toFixed(2)}ms`,
      errors: stats.errors,
      errorRate: `${((stats.errors / stats.count) * 100).toFixed(2)}%`,
    }));

  // Slowest endpoints
  const slowestEndpoints = Array.from(requestMetrics.byEndpoint.entries())
    .map(([endpoint, stats]) => ({
      endpoint,
      avgTime: stats.totalTime / stats.count,
      count: stats.count,
    }))
    .sort((a, b) => b.avgTime - a.avgTime)
    .slice(0, 10)
    .map(e => ({
      endpoint: e.endpoint,
      avgTime: `${e.avgTime.toFixed(2)}ms`,
      count: e.count,
    }));

  return {
    uptime: process.uptime(),
    requests: {
      total: requestMetrics.total,
      success: requestMetrics.success,
      errors: requestMetrics.errors,
      successRate: `${successRate}%`,
      avgResponseTime: `${avgResponseTime}ms`,
      slowRequests: requestMetrics.slowRequests,
    },
    database: dbHealth,
    cache: cacheStats,
    redis: redisStats,
    memory,
    topEndpoints,
    slowestEndpoints,
  };
};

/**
 * Reset metrics
 */
const resetMetrics = () => {
  requestMetrics.total = 0;
  requestMetrics.success = 0;
  requestMetrics.errors = 0;
  requestMetrics.totalResponseTime = 0;
  requestMetrics.slowRequests = 0;
  requestMetrics.byEndpoint.clear();
};

/**
 * Log metrics periodically
 */
const startPerformanceMonitoring = (intervalMs = 60000) => {
  setInterval(async () => {
    try {
      const metrics = await getPerformanceMetrics();
      console.log('\n=== Performance Metrics ===');
      console.log(`Uptime: ${(metrics.uptime / 60).toFixed(2)} minutes`);
      console.log(`Requests: ${metrics.requests.total} (Success: ${metrics.requests.successRate})`);
      console.log(`Avg Response Time: ${metrics.requests.avgResponseTime}`);
      console.log(`Slow Requests: ${metrics.requests.slowRequests}`);
      
      if (metrics.cache) {
        console.log(`Cache Hit Rate: ${metrics.cache.hitRate}`);
        console.log(`Memory Cache: ${metrics.cache.memorySize} entries (${metrics.cache.memoryHitRate} hit rate)`);
      }
      
      if (metrics.database) {
        console.log(`DB Write Pool: ${metrics.database.writePoolSize} connections (${metrics.database.writeIdleCount} idle)`);
        console.log(`DB Read Pool: ${metrics.database.readPoolSize} connections (${metrics.database.readIdleCount} idle)`);
      }
      
      console.log(`Memory: ${metrics.memory.heapUsed} / ${metrics.memory.heapTotal}`);
      console.log('==========================\n');
    } catch (error) {
      console.error('Error logging metrics:', error);
    }
  }, intervalMs);
};

module.exports = {
  performanceTracker,
  getPerformanceMetrics,
  resetMetrics,
  startPerformanceMonitoring,
};

