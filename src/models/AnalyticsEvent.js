const { query } = require('../database/db');

class AnalyticsEvent {
  // Create a new analytics event
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
      RETURNING *
    `;
    const values = [
      appId, eventName, url, referrer, device, ipAddress,
      userId, sessionId, timestamp, metadata ? JSON.stringify(metadata) : null,
      browser, os, screenSize, country, city,
    ];
    const result = await query(text, values);
    return result.rows[0];
  }

  // Get event summary
  static async getEventSummary({ appIds, eventName, startDate, endDate }) {
    let text = `
      SELECT 
        event_name,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT CASE WHEN device = 'mobile' THEN id END) as mobile_count,
        COUNT(DISTINCT CASE WHEN device = 'desktop' THEN id END) as desktop_count,
        COUNT(DISTINCT CASE WHEN device = 'tablet' THEN id END) as tablet_count,
        COUNT(DISTINCT session_id) as unique_sessions
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

    text += ' GROUP BY event_name';

    const result = await query(text, values);
    return result.rows;
  }

  // Get user stats
  static async getUserStats({ appId, userId }) {
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
        json_agg(
          json_build_object(
            'event_name', event_name,
            'timestamp', timestamp,
            'url', url
          ) ORDER BY timestamp DESC
        ) FILTER (WHERE event_name IS NOT NULL) as recent_events
      FROM analytics_events
      WHERE app_id = $1 AND user_id = $2
      GROUP BY user_id
    `;
    const result = await query(text, [appId, userId]);
    return result.rows[0];
  }

  // Get top events
  static async getTopEvents({ appIds, startDate, endDate, limit = 10 }) {
    let text = `
      SELECT 
        event_name,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
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

    const result = await query(text, values);
    return result.rows;
  }

  // Get events over time (for charts)
  static async getEventsOverTime({ appIds, eventName, startDate, endDate, interval = 'day' }) {
    const dateFormat = interval === 'hour' ? 'YYYY-MM-DD HH24:00:00' : 'YYYY-MM-DD';
    
    let text = `
      SELECT 
        TO_CHAR(timestamp, '${dateFormat}') as period,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
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

    const result = await query(text, values);
    return result.rows;
  }

  // Get device distribution
  static async getDeviceDistribution({ appIds, startDate, endDate }) {
    let text = `
      SELECT 
        device,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users
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

    text += ' GROUP BY device';

    const result = await query(text, values);
    return result.rows;
  }
}

module.exports = AnalyticsEvent;

