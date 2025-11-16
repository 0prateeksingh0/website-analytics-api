const express = require('express');
const { body, query, validationResult } = require('express-validator');
const useragent = require('useragent');
const { verifyApiKey } = require('../middleware/apiKey');
const { isAuthenticated } = require('../middleware/auth');
const { eventCollectionLimiter, analyticsLimiter } = require('../middleware/rateLimiter');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const App = require('../models/App');
const { cacheGet, cacheSet, cacheDelPattern } = require('../config/redis');

const router = express.Router();

/**
 * @swagger
 * /api/analytics/collect:
 *   post:
 *     summary: Collect analytics event
 *     tags: [Analytics]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - event
 *             properties:
 *               event:
 *                 type: string
 *               url:
 *                 type: string
 *               referrer:
 *                 type: string
 *               device:
 *                 type: string
 *               ipAddress:
 *                 type: string
 *               userId:
 *                 type: string
 *               sessionId:
 *                 type: string
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Event collected successfully
 *       401:
 *         description: Invalid API key
 */
router.post(
  '/collect',
  verifyApiKey,
  eventCollectionLimiter,
  [
    body('event').notEmpty().withMessage('Event name is required'),
    body('timestamp').optional().isISO8601().withMessage('Invalid timestamp format'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const {
        event,
        url,
        referrer,
        device,
        ipAddress,
        userId,
        sessionId,
        timestamp,
        metadata,
      } = req.body;

      // Parse user agent
      const userAgent = req.headers['user-agent'];
      let browser, os, deviceType;
      
      if (userAgent) {
        const agent = useragent.parse(userAgent);
        browser = metadata?.browser || agent.toAgent();
        os = metadata?.os || agent.os.toString();
        deviceType = device || (agent.device.family !== 'Other' ? 'mobile' : 'desktop');
      }

      // Create event
      const analyticsEvent = await AnalyticsEvent.create({
        appId: req.appId,
        eventName: event,
        url,
        referrer,
        device: deviceType || device,
        ipAddress: ipAddress || req.ip,
        userId,
        sessionId,
        timestamp: timestamp || new Date().toISOString(),
        metadata,
        browser: browser || metadata?.browser,
        os: os || metadata?.os,
        screenSize: metadata?.screenSize,
        country: metadata?.country,
        city: metadata?.city,
      });

      // Clear cache
      await cacheDelPattern(`analytics:${req.appId}:*`);

      res.status(201).json({
        success: true,
        message: 'Event collected successfully',
        data: {
          id: analyticsEvent.id,
          event: analyticsEvent.event_name,
          timestamp: analyticsEvent.timestamp,
        },
      });
    } catch (error) {
      console.error('Error collecting event:', error);
      res.status(500).json({
        success: false,
        message: 'Error collecting event',
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/analytics/event-summary:
 *   get:
 *     summary: Get event summary
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: event
 *         schema:
 *           type: string
 *         description: Event name to filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date filter
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *         description: App ID to filter
 *     responses:
 *       200:
 *         description: Event summary retrieved successfully
 */
router.get(
  '/event-summary',
  isAuthenticated,
  analyticsLimiter,
  [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { event, startDate, endDate, app_id } = req.query;

      // Get apps
      let appIds;
      if (app_id) {
        // Verify ownership
        const isOwner = await App.isOwner(app_id, req.user.id);
        if (!isOwner) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to access this app',
          });
        }
        appIds = [app_id];
      } else {
        // Get all apps
        const apps = await App.findByUserId(req.user.id);
        appIds = apps.map((app) => app.id);
      }

      if (appIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          message: 'No apps found',
        });
      }

      // Check cache
      const cacheKey = `analytics:event-summary:${appIds.join(',')}:${event || 'all'}:${startDate || ''}:${endDate || ''}`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
        });
      }

      // Query events
      const summary = await AnalyticsEvent.getEventSummary({
        appIds,
        eventName: event,
        startDate,
        endDate,
      });

      // Format data
      const formattedSummary = summary.map((s) => ({
        event: s.event_name,
        count: parseInt(s.count),
        uniqueUsers: parseInt(s.unique_users),
        uniqueSessions: parseInt(s.unique_sessions),
        deviceData: {
          mobile: parseInt(s.mobile_count),
          desktop: parseInt(s.desktop_count),
          tablet: parseInt(s.tablet_count),
        },
      }));

      // Cache result
      await cacheSet(cacheKey, formattedSummary, 300);

      res.json({
        success: true,
        data: formattedSummary,
      });
    } catch (error) {
      console.error('Error fetching event summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching event summary',
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/analytics/user-stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get stats for
 *       - in: query
 *         name: app_id
 *         required: true
 *         schema:
 *           type: string
 *         description: App ID
 *     responses:
 *       200:
 *         description: User stats retrieved successfully
 */
router.get(
  '/user-stats',
  isAuthenticated,
  analyticsLimiter,
  [
    query('userId').notEmpty().withMessage('User ID is required'),
    query('app_id').notEmpty().withMessage('App ID is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { userId, app_id } = req.query;

      // Verify ownership
      const isOwner = await App.isOwner(app_id, req.user.id);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to access this app',
        });
      }

      // Check cache
      const cacheKey = `analytics:user-stats:${app_id}:${userId}`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
        });
      }

      // Get user stats
      const stats = await AnalyticsEvent.getUserStats({
        appId: app_id,
        userId,
      });

      if (!stats) {
        return res.status(404).json({
          success: false,
          message: 'No data found for this user',
        });
      }

      // Format response
      const formattedStats = {
        userId: stats.user_id,
        totalEvents: parseInt(stats.total_events),
        deviceDetails: {
          browser: stats.browser,
          os: stats.os,
          device: stats.device,
        },
        ipAddress: stats.ip_address,
        firstEvent: stats.first_event,
        lastEvent: stats.last_event,
        recentEvents: stats.recent_events ? stats.recent_events.slice(0, 10) : [],
      };

      // Cache the result
      await cacheSet(cacheKey, formattedStats, 300); // 5 minutes TTL

      res.json({
        success: true,
        data: formattedStats,
      });
    } catch (error) {
      console.error('Error fetching user stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching user stats',
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/analytics/top-events:
 *   get:
 *     summary: Get top events
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *         description: App ID to filter
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of top events to return
 *     responses:
 *       200:
 *         description: Top events retrieved successfully
 */
router.get(
  '/top-events',
  isAuthenticated,
  analyticsLimiter,
  async (req, res) => {
    try {
      const { app_id, startDate, endDate, limit } = req.query;

      // Get user's apps
      let appIds;
      if (app_id) {
        const isOwner = await App.isOwner(app_id, req.user.id);
        if (!isOwner) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to access this app',
          });
        }
        appIds = [app_id];
      } else {
        const apps = await App.findByUserId(req.user.id);
        appIds = apps.map((app) => app.id);
      }

      if (appIds.length === 0) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // Check cache
      const cacheKey = `analytics:top-events:${appIds.join(',')}:${startDate || ''}:${endDate || ''}:${limit || 10}`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
        });
      }

      const topEvents = await AnalyticsEvent.getTopEvents({
        appIds,
        startDate,
        endDate,
        limit: parseInt(limit) || 10,
      });

      // Cache the result
      await cacheSet(cacheKey, topEvents, 300);

      res.json({
        success: true,
        data: topEvents,
      });
    } catch (error) {
      console.error('Error fetching top events:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching top events',
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/analytics/device-distribution:
 *   get:
 *     summary: Get device distribution
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Device distribution retrieved successfully
 */
router.get(
  '/device-distribution',
  isAuthenticated,
  analyticsLimiter,
  async (req, res) => {
    try {
      const { app_id, startDate, endDate } = req.query;

      // Get user's apps
      let appIds;
      if (app_id) {
        const isOwner = await App.isOwner(app_id, req.user.id);
        if (!isOwner) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to access this app',
          });
        }
        appIds = [app_id];
      } else {
        const apps = await App.findByUserId(req.user.id);
        appIds = apps.map((app) => app.id);
      }

      if (appIds.length === 0) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // Check cache
      const cacheKey = `analytics:device-dist:${appIds.join(',')}:${startDate || ''}:${endDate || ''}`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
        });
      }

      const deviceDist = await AnalyticsEvent.getDeviceDistribution({
        appIds,
        startDate,
        endDate,
      });

      // Cache the result
      await cacheSet(cacheKey, deviceDist, 300);

      res.json({
        success: true,
        data: deviceDist,
      });
    } catch (error) {
      console.error('Error fetching device distribution:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching device distribution',
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /api/analytics/events-over-time:
 *   get:
 *     summary: Get events over time
 *     tags: [Analytics]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: app_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: event
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: interval
 *         schema:
 *           type: string
 *           enum: [hour, day]
 *     responses:
 *       200:
 *         description: Events over time retrieved successfully
 */
router.get(
  '/events-over-time',
  isAuthenticated,
  analyticsLimiter,
  async (req, res) => {
    try {
      const { app_id, event, startDate, endDate, interval } = req.query;

      // Get user's apps
      let appIds;
      if (app_id) {
        const isOwner = await App.isOwner(app_id, req.user.id);
        if (!isOwner) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to access this app',
          });
        }
        appIds = [app_id];
      } else {
        const apps = await App.findByUserId(req.user.id);
        appIds = apps.map((app) => app.id);
      }

      if (appIds.length === 0) {
        return res.json({
          success: true,
          data: [],
        });
      }

      // Check cache
      const cacheKey = `analytics:events-time:${appIds.join(',')}:${event || ''}:${startDate || ''}:${endDate || ''}:${interval || 'day'}`;
      const cachedData = await cacheGet(cacheKey);
      if (cachedData) {
        return res.json({
          success: true,
          data: cachedData,
          cached: true,
        });
      }

      const eventsOverTime = await AnalyticsEvent.getEventsOverTime({
        appIds,
        eventName: event,
        startDate,
        endDate,
        interval: interval || 'day',
      });

      // Cache the result
      await cacheSet(cacheKey, eventsOverTime, 300);

      res.json({
        success: true,
        data: eventsOverTime,
      });
    } catch (error) {
      console.error('Error fetching events over time:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching events over time',
        error: error.message,
      });
    }
  }
);

module.exports = router;

