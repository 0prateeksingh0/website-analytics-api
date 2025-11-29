const { query, queryRead } = require('../database/db');
const { enhancedCacheGet, enhancedCacheSet, invalidateCacheByTag } = require('../utils/cacheOptimizer');

class App {
  // Create app
  static async create({ userId, appName, appUrl, description }) {
    const text = `
      INSERT INTO apps (user_id, app_name, app_url, description)
      VALUES ($1, $2, $3, $4)
      RETURNING id, user_id, app_name, app_url, description, created_at, updated_at
    `;
    const values = [userId, appName, appUrl, description];
    const result = await query(text, values);
    
    // Invalidate user's apps cache
    await invalidateCacheByTag(`user:${userId}`);
    
    return result.rows[0];
  }

  // Find app by ID (with caching)
  static async findById(id) {
    const cacheKey = `app:${id}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM apps WHERE id = $1';
    const result = await queryRead(text, [id]);
    const app = result.rows[0];

    // Cache for 5 minutes
    if (app) {
      await enhancedCacheSet(cacheKey, app, 300, {
        tags: [`app:${id}`, `user:${app.user_id}`],
      });
    }

    return app;
  }

  // Find apps by user ID (with caching)
  static async findByUserId(userId) {
    const cacheKey = `apps:user:${userId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM apps WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await queryRead(text, [userId]);

    // Cache for 2 minutes
    await enhancedCacheSet(cacheKey, result.rows, 120, {
      tags: [`user:${userId}`],
    });

    return result.rows;
  }

  // Update app
  static async update(id, { appName, appUrl, description }) {
    const text = `
      UPDATE apps 
      SET app_name = COALESCE($2, app_name),
          app_url = COALESCE($3, app_url),
          description = COALESCE($4, description),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    const values = [id, appName, appUrl, description];
    const result = await query(text, values);
    const updatedApp = result.rows[0];

    // Invalidate caches
    if (updatedApp) {
      await invalidateCacheByTag(`app:${id}`);
      await invalidateCacheByTag(`user:${updatedApp.user_id}`);
    }

    return updatedApp;
  }

  // Delete app
  static async delete(id) {
    const text = 'DELETE FROM apps WHERE id = $1 RETURNING *';
    const result = await query(text, [id]);
    const deletedApp = result.rows[0];

    // Invalidate caches
    if (deletedApp) {
      await invalidateCacheByTag(`app:${id}`);
      await invalidateCacheByTag(`user:${deletedApp.user_id}`);
      await invalidateCacheByTag(`analytics:${id}`);
    }

    return deletedApp;
  }

  // Check if user owns app (optimized with caching)
  static async isOwner(appId, userId) {
    const cacheKey = `app:owner:${appId}:${userId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const text = 'SELECT EXISTS(SELECT 1 FROM apps WHERE id = $1 AND user_id = $2) as is_owner';
    const result = await queryRead(text, [appId, userId]);
    const isOwner = result.rows[0]?.is_owner || false;

    // Cache for 5 minutes
    await enhancedCacheSet(cacheKey, isOwner, 300, {
      tags: [`app:${appId}`, `user:${userId}`],
    });

    return isOwner;
  }

  // Get app with statistics (optimized)
  static async getWithStats(id) {
    const cacheKey = `app:stats:${id}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = `
      SELECT 
        a.*,
        COUNT(DISTINCT ak.id) FILTER (WHERE ak.is_active = true) as active_api_keys,
        COUNT(DISTINCT ae.id) FILTER (WHERE ae.timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days') as events_last_30_days
      FROM apps a
      LEFT JOIN api_keys ak ON a.id = ak.app_id
      LEFT JOIN analytics_events ae ON a.id = ae.app_id
      WHERE a.id = $1
      GROUP BY a.id
    `;
    const result = await queryRead(text, [id]);
    const appStats = result.rows[0];

    // Cache for 2 minutes
    if (appStats) {
      await enhancedCacheSet(cacheKey, appStats, 120, {
        tags: [`app:${id}`, `analytics:${id}`],
      });
    }

    return appStats;
  }
}

module.exports = App;

