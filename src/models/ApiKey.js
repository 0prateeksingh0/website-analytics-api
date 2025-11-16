const { query } = require('../database/db');
const { hashApiKey, getApiKeyPrefix, getExpiryDate } = require('../utils/apiKeyUtils');

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
    return result.rows[0];
  }

  // Find by hash
  static async findByHash(keyHash) {
    const text = `
      SELECT ak.*, a.user_id, a.app_name 
      FROM api_keys ak
      JOIN apps a ON ak.app_id = a.id
      WHERE ak.key_hash = $1
    `;
    const result = await query(text, [keyHash]);
    return result.rows[0];
  }

  // Validate key
  static async validateAndGet(apiKey) {
    const keyHash = hashApiKey(apiKey);
    const apiKeyRecord = await this.findByHash(keyHash);

    if (!apiKeyRecord) {
      return null;
    }

    // Check if active
    if (!apiKeyRecord.is_active) {
      return null;
    }

    // Check if expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      return null;
    }

    // Update last used
    await this.updateLastUsed(apiKeyRecord.id);

    return apiKeyRecord;
  }

  // Update last used
  static async updateLastUsed(id) {
    const text = `
      UPDATE api_keys 
      SET last_used_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `;
    await query(text, [id]);
  }

  // Get keys for app
  static async findByAppId(appId) {
    const text = `
      SELECT id, app_id, key_prefix, name, is_active, expires_at, 
             last_used_at, created_at, revoked_at
      FROM api_keys 
      WHERE app_id = $1 
      ORDER BY created_at DESC
    `;
    const result = await query(text, [appId]);
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
    return result.rows[0];
  }

  // Delete key
  static async delete(id) {
    const text = 'DELETE FROM api_keys WHERE id = $1 RETURNING *';
    const result = await query(text, [id]);
    return result.rows[0];
  }

  // Find by ID
  static async findById(id) {
    const text = 'SELECT * FROM api_keys WHERE id = $1';
    const result = await query(text, [id]);
    return result.rows[0];
  }
}

module.exports = ApiKey;

