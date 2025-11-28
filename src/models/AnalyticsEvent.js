const { query, queryRead, batchInsert } = require('../database/db');
const { enhancedCacheGet, enhancedCacheSet, invalidateCacheByTag } = require('../utils/cacheOptimizer');

class AnalyticsEvent {
  // Create a new analytics event (optimized)
  static async create(eventData) {
    const {
      appId,
      eventName,
      url,
      referrer,
      device,
      ipAddress,
      userId,
      sessionId,
      timestamp,
      metadata,
      browser,
      os,
      screenSize,
      country,
      city,
    } = eventData;

    const text = `
      INSERT INTO analytics_events (
        app_id, event_name, url, referrer, device, ip_address,
        user_id, session_id, timestamp, metadata, browser, os,
        screen_size, country, city
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, event_name, timestamp
    `;
    const values = [
      appId, eventName, url, referrer, device, ipAddress,
      userId, sessionId, timestamp, metadata ? JSON.stringify(metadata) : null,
      browser, os, screenSize, country, city,
    ];
    const result = await query(text, values);
    
    // Invalidate cache for this app
    await invalidateCacheByTag(`analytics:${appId}`);
    
    return result.rows[0];
  }

  // Batch create events (for high-throughput scenarios)
  static async batchCreate(events) {
    if (!events || events.length === 0) {
      return [];
    }

    const columns = [
      'app_id', 'event_name', 'url', 'referrer', 'device', 'ip_address',
      'user_id', 'session_id', 'timestamp', 'metadata', 'browser', 'os',
      'screen_size', 'country', 'city'
    ];

    const values = events.map(e => [
      e.appId, e.eventName, e.url, e.referrer, e.device, e.ipAddress,
      e.userId, e.sessionId, e.timestamp,
      e.metadata ? JSON.stringify(e.metadata) : null,
      e.browser, e.os, e.screenSize, e.country, e.city
    ]);

    await batchInsert('analytics_events', columns, values, 500);

    // Invalidate cache for affected apps
    const appIds = [...new Set(events.map(e => e.appId))];
    for (const appId of appIds) {
      await invalidateCacheByTag(`analytics:${appId}`);
    }

    return { count: events.length };
  }

  // Get event summary (optimized with caching and read replica)
  static async getEventSummary({ appIds, eventName, startDate, endDate }) {
    // Generate cache key
    const cacheKey = `analytics:summary:${appIds.join(',')}:${eventName || 'all'}:${startDate || ''}:${endDate || ''}`;

    // Try cache first
    const cached = await enhancedCacheGet(cacheKey, { decompress: true });
    if (cached) {
      return cached;
    }

    let text = `
      SELECT 
        event_name,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
        COUNT(*) FILTER (WHERE device = 'mobile') as mobile_count,
        COUNT(*) FILTER (WHERE device = 'desktop') as desktop_count,
        COUNT(*) FILTER (WHERE device = 'tablet') as tablet_count,
        COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) as unique_sessions
      FROM analytics_events
      WHERE app_id = ANY($1)
    `;
    
    const values = [appIds];
    let paramCount = 1;

    if (eventName) {
      paramCount++;
      text += ` AND event_name = $${paramCount}`;
      values.push(eventName);
    }

    if (startDate) {
      paramCount++;
      text += ` AND timestamp >= $${paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      paramCount++;
      text += ` AND timestamp <= $${paramCount}`;
      values.push(endDate);
    }

    text += ' GROUP BY event_name ORDER BY count DESC';

    // Use read replica for queries
    const result = await queryRead(text, values);

    // Cache result with compression and tags
    await enhancedCacheSet(cacheKey, result.rows, 300, {
      compress: true,
      tags: appIds.map(id => `analytics:${id}`),
    });

    return result.rows;
  }

  // Get user stats (optimized)
  static async getUserStats({ appId, userId }) {
    const cacheKey = `analytics:user:${appId}:${userId}`;

    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = `
      SELECT 
        user_id,
        COUNT(*) as total_events,
        MAX(browser) as browser,
        MAX(os) as os,
        MAX(device) as device,
        MAX(ip_address) as ip_address,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        (
          SELECT json_agg(sub ORDER BY sub.timestamp DESC)
          FROM (
            SELECT event_name, timestamp, url
            FROM analytics_events
            WHERE app_id = $1 AND user_id = $2
            ORDER BY timestamp DESC
            LIMIT 10
          ) sub
        ) as recent_events
      FROM analytics_events
      WHERE app_id = $1 AND user_id = $2
      GROUP BY user_id
    `;

    const result = await queryRead(text, [appId, userId]);
    const stats = result.rows[0];

    // Cache for 5 minutes
    if (stats) {
      await enhancedCacheSet(cacheKey, stats, 300, {
        tags: [`analytics:${appId}`],
      });
    }

    return stats;
  }

  // Get top events (optimized with materialized view fallback)
  static async getTopEvents({ appIds, startDate, endDate, limit = 10 }) {
    const cacheKey = `analytics:top:${appIds.join(',')}:${startDate || ''}:${endDate || ''}:${limit}`;

    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    // Try materialized view for recent data
    if (!startDate && !endDate) {
      const mvText = `
        SELECT event_name, SUM(event_count) as count, SUM(unique_users) as unique_users
        FROM daily_analytics_summary
        WHERE app_id = ANY($1)
        AND date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY event_name
        ORDER BY count DESC
        LIMIT $2
      `;

      try {
        const mvResult = await queryRead(mvText, [appIds, limit]);
        if (mvResult.rows.length > 0) {
          await enhancedCacheSet(cacheKey, mvResult.rows, 600);
          return mvResult.rows;
        }
      } catch (error) {
        console.warn('Materialized view query failed, falling back to main table:', error.message);
      }
    }

    // Fallback to main table
    let text = `
      SELECT 
        event_name,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_events
      WHERE app_id = ANY($1)
    `;
    
    const values = [appIds];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      text += ` AND timestamp >= $${paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      paramCount++;
      text += ` AND timestamp <= $${paramCount}`;
      values.push(endDate);
    }

    paramCount++;
    text += ` GROUP BY event_name ORDER BY count DESC LIMIT $${paramCount}`;
    values.push(limit);

    const result = await queryRead(text, values);

    // Cache result
    await enhancedCacheSet(cacheKey, result.rows, 300, {
      tags: appIds.map(id => `analytics:${id}`),
    });

    return result.rows;
  }

  // Get events over time (optimized for charts)
  static async getEventsOverTime({ appIds, eventName, startDate, endDate, interval = 'day' }) {
    const cacheKey = `analytics:timeline:${appIds.join(',')}:${eventName || 'all'}:${startDate || ''}:${endDate || ''}:${interval}`;

    // Try cache first
    const cached = await enhancedCacheGet(cacheKey, { decompress: true });
    if (cached) {
      return cached;
    }

    const dateFormat = interval === 'hour' ? 'YYYY-MM-DD HH24:00:00' : 'YYYY-MM-DD';
    
    let text = `
      SELECT 
        TO_CHAR(timestamp, '${dateFormat}') as period,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_events
      WHERE app_id = ANY($1)
    `;
    
    const values = [appIds];
    let paramCount = 1;

    if (eventName) {
      paramCount++;
      text += ` AND event_name = $${paramCount}`;
      values.push(eventName);
    }

    if (startDate) {
      paramCount++;
      text += ` AND timestamp >= $${paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      paramCount++;
      text += ` AND timestamp <= $${paramCount}`;
      values.push(endDate);
    }

    text += ' GROUP BY period ORDER BY period';

    const result = await queryRead(text, values);

    // Cache result with compression
    await enhancedCacheSet(cacheKey, result.rows, 600, {
      compress: true,
      tags: appIds.map(id => `analytics:${id}`),
    });

    return result.rows;
  }

  // Get device distribution (optimized)
  static async getDeviceDistribution({ appIds, startDate, endDate }) {
    const cacheKey = `analytics:devices:${appIds.join(',')}:${startDate || ''}:${endDate || ''}`;

    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    let text = `
      SELECT 
        device,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users
      FROM analytics_events
      WHERE app_id = ANY($1) AND device IS NOT NULL
    `;
    
    const values = [appIds];
    let paramCount = 1;

    if (startDate) {
      paramCount++;
      text += ` AND timestamp >= $${paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      paramCount++;
      text += ` AND timestamp <= $${paramCount}`;
      values.push(endDate);
    }

    text += ' GROUP BY device ORDER BY count DESC';

    const result = await queryRead(text, values);

    // Cache result
    await enhancedCacheSet(cacheKey, result.rows, 600, {
      tags: appIds.map(id => `analytics:${id}`),
    });

    return result.rows;
  }
}

module.exports = AnalyticsEvent;

