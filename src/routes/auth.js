const express = require('express');
const passport = require('../config/passport');
const { isAuthenticated } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const App = require('../models/App');
const ApiKey = require('../models/ApiKey');
const { generateApiKey } = require('../utils/apiKeyUtils');

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
router.get('/me', isAuthenticated, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      profilePicture: req.user.profile_picture,
    },
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

    if (!appName) {
      return res.status(400).json({
        success: false,
        message: 'App name is required',
      });
    }

    // Create app
    const app = await App.create({
      userId: req.user.id,
      appName,
      appUrl,
      description,
    });

    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyRecord = await ApiKey.create({
      appId: app.id,
      apiKey,
      name: keyName || 'Default Key',
    });

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
      error: error.message,
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
router.get('/api-key', isAuthenticated, async (req, res) => {
  try {
    const { appId } = req.query;

    if (appId) {
      // Get keys for specific app
      const isOwner = await App.isOwner(appId, req.user.id);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this app',
        });
      }

      const apiKeys = await ApiKey.findByAppId(appId);
      return res.json({
        success: true,
        data: apiKeys,
      });
    }

    // Get all apps with their keys
    const apps = await App.findByUserId(req.user.id);
    const appsWithKeys = await Promise.all(
      apps.map(async (app) => {
        const keys = await ApiKey.findByAppId(app.id);
        return {
          ...app,
          apiKeys: keys,
        };
      })
    );

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
router.post('/revoke', isAuthenticated, authLimiter, async (req, res) => {
  try {
    const { keyId } = req.body;

    if (!keyId) {
      return res.status(400).json({
        success: false,
        message: 'Key ID is required',
      });
    }

    // Get the API key
    const apiKey = await ApiKey.findById(keyId);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found',
      });
    }

    // Check if user owns the app
    const isOwner = await App.isOwner(apiKey.app_id, req.user.id);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to revoke this key',
      });
    }

    // Revoke the key
    await ApiKey.revoke(keyId);

    res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking API key',
      error: error.message,
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
router.post('/regenerate', isAuthenticated, authLimiter, async (req, res) => {
  try {
    const { appId, keyName } = req.body;

    if (!appId) {
      return res.status(400).json({
        success: false,
        message: 'App ID is required',
      });
    }

    // Check if user owns the app
    const isOwner = await App.isOwner(appId, req.user.id);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to regenerate keys for this app',
      });
    }

    // Generate new API key
    const apiKey = generateApiKey();
    const apiKeyRecord = await ApiKey.create({
      appId,
      apiKey,
      name: keyName || 'Regenerated Key',
    });

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
      error: error.message,
    });
  }
});

module.exports = router;

