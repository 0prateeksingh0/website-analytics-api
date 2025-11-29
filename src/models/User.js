const { query, queryRead } = require('../database/db');
const { enhancedCacheGet, enhancedCacheSet, invalidateCacheByTag } = require('../utils/cacheOptimizer');

class User {
  // Create user (with automatic cache invalidation)
  static async create({ googleId, email, name, profilePicture }) {
    const text = `
      INSERT INTO users (google_id, email, name, profile_picture)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        profile_picture = EXCLUDED.profile_picture,
        updated_at = CURRENT_TIMESTAMP,
        last_login_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const values = [googleId, email, name, profilePicture];
    const result = await query(text, values);
    const user = result.rows[0];

    // Invalidate user caches
    if (user) {
      await invalidateCacheByTag(`user:${user.id}`);
    }

    return user;
  }

  // Find by Google ID (with caching)
  static async findByGoogleId(googleId) {
    const cacheKey = `user:googleId:${googleId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM users WHERE google_id = $1';
    const result = await queryRead(text, [googleId]);
    const user = result.rows[0];

    // Cache for 10 minutes (user data doesn't change often)
    if (user) {
      await enhancedCacheSet(cacheKey, user, 600, {
        tags: [`user:${user.id}`],
      });
    }

    return user;
  }

  // Find by email (with caching)
  static async findByEmail(email) {
    const cacheKey = `user:email:${email}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM users WHERE email = $1';
    const result = await queryRead(text, [email]);
    const user = result.rows[0];

    // Cache for 10 minutes
    if (user) {
      await enhancedCacheSet(cacheKey, user, 600, {
        tags: [`user:${user.id}`],
      });
    }

    return user;
  }

  // Find by ID (with caching)
  static async findById(id) {
    const cacheKey = `user:id:${id}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM users WHERE id = $1';
    const result = await queryRead(text, [id]);
    const user = result.rows[0];

    // Cache for 10 minutes
    if (user) {
      await enhancedCacheSet(cacheKey, user, 600, {
        tags: [`user:${id}`],
      });
    }

    return user;
  }

  // Get apps for user (optimized with better query)
  static async getApps(userId) {
    const cacheKey = `user:apps:${userId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = `
      SELECT 
        a.*,
        COUNT(ak.id) FILTER (WHERE ak.is_active = true) as active_api_keys,
        COUNT(DISTINCT ae.id) FILTER (WHERE ae.timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days') as events_last_7_days,
        MAX(ae.timestamp) as last_event_at
      FROM apps a
      LEFT JOIN api_keys ak ON a.id = ak.app_id
      LEFT JOIN analytics_events ae ON a.id = ae.app_id
      WHERE a.user_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `;
    const result = await queryRead(text, [userId]);

    // Cache for 2 minutes
    await enhancedCacheSet(cacheKey, result.rows, 120, {
      tags: [`user:${userId}`],
    });

    return result.rows;
  }

  // Get user dashboard stats (new method)
  static async getDashboardStats(userId) {
    const cacheKey = `user:dashboard:${userId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey, { decompress: true });
    if (cached) {
      return cached;
    }

    // Get all stats in one query
    const text = `
      SELECT 
        COUNT(DISTINCT a.id) as total_apps,
        COUNT(DISTINCT ak.id) FILTER (WHERE ak.is_active = true) as total_active_keys,
        COUNT(DISTINCT ae.id) FILTER (WHERE ae.timestamp > CURRENT_TIMESTAMP - INTERVAL '7 days') as events_last_7_days,
        COUNT(DISTINCT ae.id) FILTER (WHERE ae.timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days') as events_last_30_days
      FROM users u
      LEFT JOIN apps a ON u.id = a.user_id
      LEFT JOIN api_keys ak ON a.id = ak.app_id
      LEFT JOIN analytics_events ae ON a.id = ae.app_id
      WHERE u.id = $1
    `;
    const result = await queryRead(text, [userId]);
    const stats = result.rows[0];

    // Cache for 5 minutes with compression
    if (stats) {
      await enhancedCacheSet(cacheKey, stats, 300, {
        compress: true,
        tags: [`user:${userId}`],
      });
    }

    return stats;
  }
}

module.exports = User;

