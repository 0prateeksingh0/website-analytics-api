const ApiKey = require('../models/ApiKey');
const { hashApiKey } = require('../utils/apiKeyUtils');
const { query } = require('../database/db');

// Middleware to verify API key from header
const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      // Log failed attempt
      await logSecurityEvent('api_key_missing', 'low', req.ip);
      
      return res.status(401).json({
        success: false,
        message: 'API key is required. Please provide X-API-Key header.',
      });
    }

    // Validate and get API key
    const apiKeyRecord = await ApiKey.validateAndGet(apiKey);

    if (!apiKeyRecord) {
      // Log failed attempt
      await logSecurityEvent('api_key_invalid', 'medium', req.ip);
      
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired API key',
      });
    }

    // Check IP whitelist if configured
    if (apiKeyRecord.allowed_ips && apiKeyRecord.allowed_ips.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress;
      if (!apiKeyRecord.allowed_ips.includes(clientIP) && !apiKeyRecord.allowed_ips.includes('*')) {
        // Log security event
        await logSecurityEvent('api_key_ip_blocked', 'high', req.ip, null, {
          apiKeyId: apiKeyRecord.id,
          allowedIPs: apiKeyRecord.allowed_ips,
        });
        
        return res.status(403).json({
          success: false,
          message: 'Access denied. Your IP address is not whitelisted for this API key.',
        });
      }
    }

    // Check rate limit per API key
    const rateLimitKey = `api_key_rate_limit:${apiKeyRecord.id}`;
    const { cacheIncr } = require('../config/redis');
    const requestCount = await cacheIncr(rateLimitKey, 3600); // 1 hour window
    
    if (requestCount && requestCount > (apiKeyRecord.rate_limit_per_hour || 10000)) {
      await logSecurityEvent('api_key_rate_limit', 'medium', req.ip, null, {
        apiKeyId: apiKeyRecord.id,
      });
      
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded for this API key. Please try again later.',
      });
    }

    // Attach app info to request
    req.appId = apiKeyRecord.app_id;
    req.apiKey = apiKeyRecord;
    req.apiKeyPermissions = apiKeyRecord.permissions || { read: true, write: true };

    next();
  } catch (error) {
    console.error('API key verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying API key',
      error: error.message,
    });
  }
};

// Middleware to check if API key has specific permission
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKeyPermissions) {
      return res.status(403).json({
        success: false,
        message: 'No permissions found for this API key',
      });
    }

    if (!req.apiKeyPermissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `API key does not have '${permission}' permission`,
      });
    }

    next();
  };
};

// Helper function to log security events
const logSecurityEvent = async (eventType, severity, ipAddress, userId = null, metadata = {}) => {
  try {
    await query(
      `SELECT log_security_event($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        severity,
        ipAddress,
        userId,
        `Security event: ${eventType}`,
        JSON.stringify(metadata),
      ]
    );
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

module.exports = {
  verifyApiKey,
  requirePermission,
};

