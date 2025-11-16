const ApiKey = require('../models/ApiKey');
const { hashApiKey } = require('../utils/apiKeyUtils');

// Middleware to verify API key from header
const verifyApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key is required. Please provide X-API-Key header.',
      });
    }

    // Validate and get API key
    const apiKeyRecord = await ApiKey.validateAndGet(apiKey);

    if (!apiKeyRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired API key',
      });
    }

    // Attach app info to request
    req.appId = apiKeyRecord.app_id;
    req.apiKey = apiKeyRecord;

    next();
  } catch (error) {
    console.error('API key verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying API key',
      error: error.message,
    });
  }
};

module.exports = {
  verifyApiKey,
};

