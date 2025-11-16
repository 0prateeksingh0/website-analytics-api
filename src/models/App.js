const { query } = require('../database/db');

class App {
  // Create a new app
  static async create({ userId, appName, appUrl, description }) {
    const text = `
      INSERT INTO apps (user_id, app_name, app_url, description)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [userId, appName, appUrl, description];
    const result = await query(text, values);
    return result.rows[0];
  }

  // Find app by ID
  static async findById(id) {
    const text = 'SELECT * FROM apps WHERE id = $1';
    const result = await query(text, [id]);
    return result.rows[0];
  }

  // Find apps by user ID
  static async findByUserId(userId) {
    const text = 'SELECT * FROM apps WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await query(text, [userId]);
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
    return result.rows[0];
  }

  // Delete app
  static async delete(id) {
    const text = 'DELETE FROM apps WHERE id = $1 RETURNING *';
    const result = await query(text, [id]);
    return result.rows[0];
  }

  // Check if user owns app
  static async isOwner(appId, userId) {
    const text = 'SELECT id FROM apps WHERE id = $1 AND user_id = $2';
    const result = await query(text, [appId, userId]);
    return result.rows.length > 0;
  }
}

module.exports = App;

