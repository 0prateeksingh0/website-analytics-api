// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
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

module.exports = {
  isAuthenticated,
  isAppOwner,
};

