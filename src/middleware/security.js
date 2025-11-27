/**
 * Advanced Security Middleware
 * 
 * Provides:
 * - Role-based access control (RBAC)
 * - Input sanitization
 * - Request validation
 * - IP whitelisting
 * - Audit logging
 * - CSRF protection
 * - Content Security Policy
 */

const { body, validationResult } = require('express-validator');
const { query } = require('../database/db');
const crypto = require('crypto');

// Security Levels
const SECURITY_LEVELS = {
  PUBLIC: 0,      // No authentication required
  BASIC: 1,       // Requires valid API key or authentication
  USER: 2,        // Requires authenticated user
  ADMIN: 3,       // Requires admin privileges
  SUPER_ADMIN: 4, // Requires super admin privileges
};

// User Roles
const USER_ROLES = {
  GUEST: 'guest',
  USER: 'user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
};

// Role to security level mapping
const ROLE_SECURITY_LEVELS = {
  [USER_ROLES.GUEST]: SECURITY_LEVELS.PUBLIC,
  [USER_ROLES.USER]: SECURITY_LEVELS.USER,
  [USER_ROLES.ADMIN]: SECURITY_LEVELS.ADMIN,
  [USER_ROLES.SUPER_ADMIN]: SECURITY_LEVELS.SUPER_ADMIN,
};

/**
 * Input sanitization middleware
 * Prevents XSS attacks by sanitizing user input
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove potential XSS vectors
      return obj
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, ''); // Remove event handlers
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const key in obj) {
        sanitized[key] = sanitize(obj[key]);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize body, query, and params
  if (req.body) {
    req.body = sanitize(req.body);
  }
  if (req.query) {
    req.query = sanitize(req.query);
  }
  if (req.params) {
    req.params = sanitize(req.params);
  }

  next();
};

/**
 * SQL Injection prevention
 * Validates that inputs don't contain SQL injection patterns
 */
const preventSQLInjection = (req, res, next) => {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(--|;|\/\*|\*\/|xp_|sp_)/gi,
    /(\bUNION\b.*\bSELECT\b)/gi,
    /(\bOR\b.*=.*)/gi,
  ];

  const checkValue = (value) => {
    if (typeof value === 'string') {
      for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
          return true;
        }
      }
    }
    return false;
  };

  const checkObject = (obj) => {
    for (const key in obj) {
      const value = obj[key];
      if (checkValue(value)) {
        return true;
      }
      if (typeof value === 'object' && value !== null) {
        if (checkObject(value)) {
          return true;
        }
      }
    }
    return false;
  };

  // Check all inputs
  const inputs = [req.body, req.query, req.params].filter(Boolean);
  for (const input of inputs) {
    if (checkObject(input)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input detected. Please check your request.',
      });
    }
  }

  next();
};

/**
 * Request size limiter
 * Prevents large payload attacks
 */
const requestSizeLimiter = (maxSize = '1mb') => {
  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    const maxBytes = maxSize.includes('kb') 
      ? parseInt(maxSize) * 1024 
      : parseInt(maxSize) * 1024 * 1024;

    if (contentLength > maxBytes) {
      return res.status(413).json({
        success: false,
        message: `Request payload too large. Maximum size: ${maxSize}`,
      });
    }

    next();
  };
};

/**
 * IP Whitelisting middleware
 * Restricts access based on IP addresses
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.includes(clientIP) || allowedIPs.includes('*')) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied. Your IP address is not whitelisted.',
    });
  };
};

/**
 * Audit logging middleware
 * Logs all sensitive operations for security auditing
 */
const auditLog = async (req, res, next) => {
  const sensitiveRoutes = [
    '/api/auth/logout',
    '/api/auth/apps',
    '/api/auth/apps/:appId',
    '/api/auth/api-keys',
  ];

  const shouldLog = sensitiveRoutes.some(route => 
    req.path.includes(route.replace(':appId', ''))
  );

  if (shouldLog) {
    try {
      await query(
        `INSERT INTO audit_logs 
        (user_id, action, resource, ip_address, user_agent, created_at) 
        VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          req.user?.id || null,
          req.method,
          req.path,
          req.ip,
          req.headers['user-agent'],
        ]
      );
    } catch (error) {
      console.error('Audit log error:', error);
      // Don't block request if logging fails
    }
  }

  next();
};

/**
 * CSRF Token generation and validation
 */
const csrfTokens = new Map();

const generateCSRFToken = (req, res, next) => {
  if (req.session && req.user) {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokens.set(req.session.id, token);
    req.csrfToken = token;
    res.setHeader('X-CSRF-Token', token);
  }
  next();
};

const validateCSRFToken = (req, res, next) => {
  // Skip for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for API key authenticated requests
  if (req.apiKey) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const sessionToken = req.session && csrfTokens.get(req.session.id);

  if (!token || !sessionToken || token !== sessionToken) {
    return res.status(403).json({
      success: false,
      message: 'Invalid or missing CSRF token',
    });
  }

  next();
};

/**
 * Role-based access control middleware
 * Checks if user has required security level
 */
const requireSecurityLevel = (requiredLevel) => {
  return async (req, res, next) => {
    try {
      // Get user's security level
      let userLevel = SECURITY_LEVELS.PUBLIC;

      if (req.user) {
        // Get user role from database
        const result = await query(
          'SELECT role FROM users WHERE id = $1',
          [req.user.id]
        );

        if (result.rows.length > 0) {
          const userRole = result.rows[0].role || USER_ROLES.USER;
          userLevel = ROLE_SECURITY_LEVELS[userRole] || SECURITY_LEVELS.USER;
        } else {
          userLevel = SECURITY_LEVELS.USER;
        }
      } else if (req.apiKey) {
        userLevel = SECURITY_LEVELS.BASIC;
      }

      // Check if user has required level
      if (userLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this resource',
          required: Object.keys(SECURITY_LEVELS).find(
            key => SECURITY_LEVELS[key] === requiredLevel
          ),
        });
      }

      req.securityLevel = userLevel;
      next();
    } catch (error) {
      console.error('Security level check error:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
      });
    }
  };
};

/**
 * Check if user is admin
 */
const requireAdmin = requireSecurityLevel(SECURITY_LEVELS.ADMIN);

/**
 * Check if user is super admin
 */
const requireSuperAdmin = requireSecurityLevel(SECURITY_LEVELS.SUPER_ADMIN);

/**
 * Content Security Policy headers
 */
const setSecurityHeaders = (req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self'"
  );

  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  next();
};

/**
 * Validate UUID format
 */
const validateUUID = (paramName) => {
  return (req, res, next) => {
    const uuid = req.params[paramName] || req.query[paramName] || req.body[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (uuid && !uuidRegex.test(uuid)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
};

/**
 * Rate limit per user
 */
const perUserRateLimit = (maxRequests, windowMs) => {
  const userRequests = new Map();

  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();

    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }

    const requests = userRequests.get(userId);
    const recentRequests = requests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
      });
    }

    recentRequests.push(now);
    userRequests.set(userId, recentRequests);

    next();
  };
};

module.exports = {
  SECURITY_LEVELS,
  USER_ROLES,
  sanitizeInput,
  preventSQLInjection,
  requestSizeLimiter,
  ipWhitelist,
  auditLog,
  generateCSRFToken,
  validateCSRFToken,
  requireSecurityLevel,
  requireAdmin,
  requireSuperAdmin,
  setSecurityHeaders,
  validateUUID,
  perUserRateLimit,
};

