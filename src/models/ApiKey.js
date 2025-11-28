const { query, queryRead } = require('../database/db');
const { hashApiKey, getApiKeyPrefix, getExpiryDate } = require('../utils/apiKeyUtils');
const { enhancedCacheGet, enhancedCacheSet, invalidateCacheByTag } = require('../utils/cacheOptimizer');

class ApiKey {
  // Create key
  static async create({ appId, apiKey, name }) {
    const keyHash = hashApiKey(apiKey);
    const keyPrefix = getApiKeyPrefix(apiKey);
    const expiresAt = getExpiryDate();

    const text = `
      INSERT INTO api_keys (app_id, key_hash, key_prefix, name, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [appId, keyHash, keyPrefix, name, expiresAt];
    const result = await query(text, values);
    
    // Invalidate app cache
    await invalidateCacheByTag(`app:${appId}`);
    
    return result.rows[0];
  }

  // Find by hash (optimized with caching)
  static async findByHash(keyHash) {
    const cacheKey = `apikey:hash:${keyHash}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = `
      SELECT ak.*, a.user_id, a.app_name 
      FROM api_keys ak
      JOIN apps a ON ak.app_id = a.id
      WHERE ak.key_hash = $1
    `;
    const result = await queryRead(text, [keyHash]);
    const apiKey = result.rows[0];

    // Cache for 5 minutes (API keys don't change often)
    if (apiKey) {
      await enhancedCacheSet(cacheKey, apiKey, 300, {
        tags: [`app:${apiKey.app_id}`, `apikey:${apiKey.id}`],
      });
    }

    return apiKey;
  }

  // Validate key (optimized with aggressive caching)
  static async validateAndGet(apiKey) {
    const keyHash = hashApiKey(apiKey);
    
    // Cache validation result separately (more aggressive caching)
    const validationCacheKey = `apikey:valid:${keyHash}`;
    const cachedValidation = await enhancedCacheGet(validationCacheKey);
    
    if (cachedValidation !== null) {
      return cachedValidation === 'invalid' ? null : cachedValidation;
    }

    const apiKeyRecord = await this.findByHash(keyHash);

    if (!apiKeyRecord) {
      // Cache negative result for 1 minute
      await enhancedCacheSet(validationCacheKey, 'invalid', 60);
      return null;
    }

    // Check if active
    if (!apiKeyRecord.is_active) {
      await enhancedCacheSet(validationCacheKey, 'invalid', 60);
      return null;
    }

    // Check if expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      await enhancedCacheSet(validationCacheKey, 'invalid', 60);
      return null;
    }

    // Update last used (async, don't wait)
    this.updateLastUsed(apiKeyRecord.id).catch(err => 
      console.error('Error updating last_used_at:', err)
    );

    // Cache valid result for 5 minutes
    await enhancedCacheSet(validationCacheKey, apiKeyRecord, 300, {
      tags: [`apikey:${apiKeyRecord.id}`],
    });

    return apiKeyRecord;
  }

  // Update last used (optimized - batch updates)
  static async updateLastUsed(id) {
    // Use a shorter query for better performance
    const text = `
      UPDATE api_keys 
      SET last_used_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
    `;
    // Only update if last update was more than 5 minutes ago
    await query(text, [id]);
  }

  // Get keys for app (with caching)
  static async findByAppId(appId) {
    const cacheKey = `apikeys:app:${appId}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = `
      SELECT id, app_id, key_prefix, name, is_active, expires_at, 
             last_used_at, created_at, revoked_at, permissions, 
             allowed_ips, rate_limit_per_hour
      FROM api_keys 
      WHERE app_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await queryRead(text, [appId]);

    // Cache for 2 minutes
    await enhancedCacheSet(cacheKey, result.rows, 120, {
      tags: [`app:${appId}`],
    });

    return result.rows;
  }

  // Revoke key
  static async revoke(id) {
    const text = `
      UPDATE api_keys 
      SET is_active = false, revoked_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING *
    `;
    const result = await query(text, [id]);
    const revokedKey = result.rows[0];

    // Invalidate all caches for this key
    await invalidateCacheByTag(`apikey:${id}`);
    if (revokedKey) {
      await invalidateCacheByTag(`app:${revokedKey.app_id}`);
    }

    return revokedKey;
  }

  // Delete key
  static async delete(id) {
    const text = 'DELETE FROM api_keys WHERE id = $1 RETURNING *';
    const result = await query(text, [id]);
    const deletedKey = result.rows[0];

    // Invalidate all caches for this key
    await invalidateCacheByTag(`apikey:${id}`);
    if (deletedKey) {
      await invalidateCacheByTag(`app:${deletedKey.app_id}`);
    }

    return deletedKey;
  }

  // Find by ID (with caching)
  static async findById(id) {
    const cacheKey = `apikey:id:${id}`;
    
    // Try cache first
    const cached = await enhancedCacheGet(cacheKey);
    if (cached) {
      return cached;
    }

    const text = 'SELECT * FROM api_keys WHERE id = $1';
    const result = await queryRead(text, [id]);
    const apiKey = result.rows[0];

    // Cache for 5 minutes
    if (apiKey) {
      await enhancedCacheSet(cacheKey, apiKey, 300, {
        tags: [`apikey:${id}`, `app:${apiKey.app_id}`],
      });
    }

    return apiKey;
  }
}

module.exports = ApiKey;

