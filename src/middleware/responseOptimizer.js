/**
 * Response Optimization Middleware
 * 
 * Optimizes HTTP responses:
 * - ETag support for caching
 * - Response compression hints
 * - Cache-Control headers
 * - Remove unnecessary headers
 */

const crypto = require('crypto');

/**
 * Generate ETag from response body
 */
const generateETag = (body) => {
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  return crypto.createHash('md5').update(str).digest('hex');
};

/**
 * Response optimization middleware
 */
const optimizeResponse = (req, res, next) => {
  const originalJson = res.json.bind(res);
  
  res.json = function(data) {
    // Set cache headers for GET requests
    if (req.method === 'GET' && res.statusCode === 200) {
      // Generate ETag
      const etag = generateETag(data);
      res.setHeader('ETag', `"${etag}"`);
      
      // Check if client has cached version
      const clientETag = req.headers['if-none-match'];
      if (clientETag === `"${etag}"`) {
        return res.status(304).end(); // Not Modified
      }
      
      // Set cache control based on endpoint
      const path = req.path;
      if (path.includes('/me') || path.includes('/dashboard')) {
        res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes
      } else if (path.includes('/api-key')) {
        res.setHeader('Cache-Control', 'private, max-age=120'); // 2 minutes
      } else {
        res.setHeader('Cache-Control', 'no-cache'); // Don't cache by default
      }
    }
    
    // Remove unnecessary headers for better performance
    res.removeHeader('X-Powered-By');
    
    // Set content type if not already set
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    
    return originalJson(data);
  };
  
  next();
};

module.exports = optimizeResponse;

