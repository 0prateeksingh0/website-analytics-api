const { query } = require('../database/db');

// Middleware to check if user is authenticated
const isAuthenticated = async (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    // Check if user is active
    try {
      const result = await query(
        'SELECT is_active, role FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        // Log security event
        await logSecurityEvent('inactive_user_access', 'medium', req.ip, req.user.id);
        
        return res.status(403).json({
          success: false,
          message: 'Your account has been deactivated. Please contact support.',
        });
      }

      // Update last login
      await query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [req.user.id]
      );

      // Attach user role to request
      req.userRole = result.rows[0].role || 'user';
    } catch (error) {
      console.error('Error checking user status:', error);
    }

    return next();
  }

  // Log failed authentication attempt
  await logSecurityEvent('unauthenticated_access', 'low', req.ip);

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Please login with Google.',
  });
};

// Middleware to check if user owns the app
const isAppOwner = async (req, res, next) => {
  try {
    const appId = req.params.appId || req.body.appId;
    const userId = req.user.id;

    const App = require('../models/App');
    const isOwner = await App.isOwner(appId, userId);

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this app',
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking app ownership',
      error: error.message,
    });
  }
};

// Helper function to log security events
const logSecurityEvent = async (eventType, severity, ipAddress, userId = null, metadata = {}) => {
  try {
    await query(
      `SELECT log_security_event($1, $2, $3, $4, $5, $6)`,
      [
        eventType,
        severity,
        ipAddress,
        userId,
        `Security event: ${eventType}`,
        JSON.stringify(metadata),
      ]
    );
  } catch (error) {
    console.error('Error logging security event:', error);
  }
};

module.exports = {
  isAuthenticated,
  isAppOwner,
};

