const { query } = require('../database/db');

class User {
  // Create a new user
  static async create({ googleId, email, name, profilePicture }) {
    const text = `
      INSERT INTO users (google_id, email, name, profile_picture)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (google_id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        profile_picture = EXCLUDED.profile_picture,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const values = [googleId, email, name, profilePicture];
    const result = await query(text, values);
    return result.rows[0];
  }

  // Find user by Google ID
  static async findByGoogleId(googleId) {
    const text = 'SELECT * FROM users WHERE google_id = $1';
    const result = await query(text, [googleId]);
    return result.rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const text = 'SELECT * FROM users WHERE email = $1';
    const result = await query(text, [email]);
    return result.rows[0];
  }

  // Find user by ID
  static async findById(id) {
    const text = 'SELECT * FROM users WHERE id = $1';
    const result = await query(text, [id]);
    return result.rows[0];
  }

  // Get all apps for a user
  static async getApps(userId) {
    const text = `
      SELECT a.*, COUNT(ak.id) as api_key_count
      FROM apps a
      LEFT JOIN api_keys ak ON a.id = ak.app_id AND ak.is_active = true
      WHERE a.user_id = $1
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `;
    const result = await query(text, [userId]);
    return result.rows;
  }
}

module.exports = User;

