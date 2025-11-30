const express = require('express');
const passport = require('../config/passport');
const { isAuthenticated } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateUUID } = require('../middleware/security');
const App = require('../models/App');
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const { generateApiKey } = require('../utils/apiKeyUtils');
const { enhancedCacheGet, enhancedCacheSet, invalidateCacheByTag } = require('../utils/cacheOptimizer');

const router = express.Router();

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth authentication
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to Google OAuth page
 */
router.get(
  '/google',
  authLimiter,
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  })
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to dashboard or error page
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/failure',
  }),
  (req, res) => {
    res.redirect('/auth/success');
  }
);

/**
 * @swagger
 * /api/auth/success:
 *   get:
 *     summary: Authentication success page
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Authentication successful
 */
router.get('/success', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication successful',
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
    },
  });
});

/**
 * @swagger
 * /api/auth/failure:
 *   get:
 *     summary: Authentication failure page
 *     tags: [Authentication]
 *     responses:
 *       401:
 *         description: Authentication failed
 */
router.get('/failure', (req, res) => {
  res.status(401).json({
    success: false,
    message: 'Authentication failed',
  });
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'Error logging out',
      });
    }
    res.json({
      success: true,
      message: 'Logout successful',
    });
  });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: User information
 *       401:
 *         description: Not authenticated
 */
router.get('/me', isAuthenticated, async (req, res) => {
  // Cache user data (rarely changes)
  const cacheKey = `user:me:${req.user.id}`;
  const cached = await enhancedCacheGet(cacheKey);
  
  if (cached) {
    return res.json({
      success: true,
      user: cached,
      cached: true,
    });
  }

  const userData = {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    profilePicture: req.user.profile_picture,
    role: req.user.role || 'user',
  };

  // Cache for 5 minutes
  await enhancedCacheSet(cacheKey, userData, 300, {
    tags: [`user:${req.user.id}`],
  });

  res.json({
    success: true,
    user: userData,
  });
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new app and generate API key
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *             properties:
 *               appName:
 *                 type: string
 *               appUrl:
 *                 type: string
 *               description:
 *                 type: string
 *               keyName:
 *                 type: string
 *     responses:
 *       201:
 *         description: App registered successfully
 *       401:
 *         description: Not authenticated
 */
router.post('/register', isAuthenticated, authLimiter, async (req, res) => {
  try {
    const { appName, appUrl, description, keyName } = req.body;

    if (!appName || !appName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'App name is required',
      });
    }

    // Create app and generate key in parallel (if possible) or sequential
    const app = await App.create({
      userId: req.user.id,
      appName: appName.trim(),
      appUrl: appUrl?.trim(),
      description: description?.trim(),
    });

    // Generate key
    const apiKey = generateApiKey();
    const apiKeyRecord = await ApiKey.create({
      appId: app.id,
      apiKey,
      name: (keyName || 'Default Key').trim(),
    });

    // Invalidate user cache
    await invalidateCacheByTag(`user:${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'App registered successfully',
      data: {
        app: {
          id: app.id,
          name: app.app_name,
          url: app.app_url,
        },
        apiKey: {
          id: apiKeyRecord.id,
          key: apiKey, // Only returned once!
          prefix: apiKeyRecord.key_prefix,
          name: apiKeyRecord.name,
          expiresAt: apiKeyRecord.expires_at,
        },
      },
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Error registering app:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering app',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/auth/api-key:
 *   get:
 *     summary: Get API keys for user's apps
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: appId
 *         schema:
 *           type: string
 *         description: Optional app ID to filter keys
 *     responses:
 *       200:
 *         description: API keys retrieved successfully
 */
router.get('/api-key', isAuthenticated, validateUUID('appId'), async (req, res) => {
  try {
    const { appId } = req.query;

    if (appId) {
      // Get keys for specific app (optimized - uses cached isOwner)
      const isOwner = await App.isOwner(appId, req.user.id);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this app',
        });
      }

      // Use cached findByAppId
      const apiKeys = await ApiKey.findByAppId(appId);
      return res.json({
        success: true,
        data: apiKeys,
      });
    }

    // Get all apps with keys in single optimized query
    const cacheKey = `user:apps-keys:${req.user.id}`;
    const cached = await enhancedCacheGet(cacheKey);
    
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true,
      });
    }

    // Use optimized getApps which includes stats
    const apps = await User.getApps(req.user.id);
    
    // Batch fetch all API keys in parallel
    const appsWithKeys = await Promise.all(
      apps.map(async (app) => {
        const keys = await ApiKey.findByAppId(app.id);
        return {
          id: app.id,
          app_name: app.app_name,
          app_url: app.app_url,
          description: app.description,
          created_at: app.created_at,
          updated_at: app.updated_at,
          active_api_keys: app.active_api_keys || 0,
          events_last_7_days: app.events_last_7_days || 0,
          last_event_at: app.last_event_at,
          apiKeys: keys.map(k => ({
            id: k.id,
            key_prefix: k.key_prefix,
            name: k.name,
            is_active: k.is_active,
            expires_at: k.expires_at,
            last_used_at: k.last_used_at,
            created_at: k.created_at,
            permissions: k.permissions,
            rate_limit_per_hour: k.rate_limit_per_hour,
          })),
        };
      })
    );

    // Cache for 2 minutes
    await enhancedCacheSet(cacheKey, appsWithKeys, 120, {
      tags: [`user:${req.user.id}`],
    });

    res.json({
      success: true,
      data: appsWithKeys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching API keys',
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/auth/revoke:
 *   post:
 *     summary: Revoke an API key
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keyId
 *             properties:
 *               keyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: API key revoked successfully
 */
router.post('/revoke', isAuthenticated, authLimiter, validateUUID('keyId'), async (req, res) => {
  try {
    const { keyId } = req.body;

    if (!keyId) {
      return res.status(400).json({
        success: false,
        message: 'Key ID is required',
      });
    }

    // Get key (uses cached findById)
    const apiKey = await ApiKey.findById(keyId);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found',
      });
    }

    // Check ownership (uses cached isOwner)
    const isOwner = await App.isOwner(apiKey.app_id, req.user.id);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to revoke this key',
      });
    }

    // Revoke key (handles cache invalidation internally)
    await ApiKey.revoke(keyId);

    // Invalidate user cache
    await invalidateCacheByTag(`user:${req.user.id}`);

    res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking API key',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/auth/regenerate:
 *   post:
 *     summary: Regenerate a new API key for an app
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appId
 *             properties:
 *               appId:
 *                 type: string
 *               keyName:
 *                 type: string
 *     responses:
 *       201:
 *         description: New API key generated successfully
 */
router.post('/regenerate', isAuthenticated, authLimiter, validateUUID('appId'), async (req, res) => {
  try {
    const { appId, keyName } = req.body;

    if (!appId) {
      return res.status(400).json({
        success: false,
        message: 'App ID is required',
      });
    }

    // Check ownership (uses cached isOwner)
    const isOwner = await App.isOwner(appId, req.user.id);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to regenerate keys for this app',
      });
    }

    // Generate key
    const apiKey = generateApiKey();
    const apiKeyRecord = await ApiKey.create({
      appId,
      apiKey,
      name: (keyName || 'Regenerated Key').trim(),
    });

    // Invalidate user cache
    await invalidateCacheByTag(`user:${req.user.id}`);

    res.status(201).json({
      success: true,
      message: 'New API key generated successfully',
      data: {
        id: apiKeyRecord.id,
        key: apiKey, // Only returned once!
        prefix: apiKeyRecord.key_prefix,
        name: apiKeyRecord.name,
        expiresAt: apiKeyRecord.expires_at,
      },
      warning: 'Store this API key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Error regenerating API key:', error);
    res.status(500).json({
      success: false,
      message: 'Error regenerating API key',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /api/auth/dashboard:
 *   get:
 *     summary: Get user dashboard statistics
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 */
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    // Get dashboard stats (uses optimized User.getDashboardStats)
    const stats = await User.getDashboardStats(req.user.id);
    
    // Get apps with keys (cached)
    const apps = await User.getApps(req.user.id);

    res.json({
      success: true,
      data: {
        stats: {
          totalApps: stats?.total_apps || 0,
          totalActiveKeys: stats?.total_active_keys || 0,
          eventsLast7Days: stats?.events_last_7_days || 0,
          eventsLast30Days: stats?.events_last_30_days || 0,
        },
        apps: apps.map(app => ({
          id: app.id,
          app_name: app.app_name,
          app_url: app.app_url,
          active_api_keys: app.active_api_keys || 0,
          events_last_7_days: app.events_last_7_days || 0,
          last_event_at: app.last_event_at,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
});

module.exports = router;

