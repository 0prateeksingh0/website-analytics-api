const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// Generate a secure API key
const generateApiKey = () => {
  const length = parseInt(process.env.API_KEY_LENGTH) || 32;
  return crypto.randomBytes(length).toString('hex');
};

// Hash API key for storage
const hashApiKey = (apiKey) => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

// Get API key prefix for display (first 8 characters)
const getApiKeyPrefix = (apiKey) => {
  return apiKey.substring(0, 8);
};

// Calculate expiry date
const getExpiryDate = () => {
  const days = parseInt(process.env.API_KEY_EXPIRY_DAYS) || 365;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  return expiryDate;
};

// Validate API key format
const isValidApiKeyFormat = (apiKey) => {
  const length = parseInt(process.env.API_KEY_LENGTH) || 32;
  return apiKey && typeof apiKey === 'string' && apiKey.length === length * 2;
};

module.exports = {
  generateApiKey,
  hashApiKey,
  getApiKeyPrefix,
  getExpiryDate,
  isValidApiKeyFormat,
};

