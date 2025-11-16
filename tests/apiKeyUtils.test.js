const { generateApiKey, hashApiKey, getApiKeyPrefix, isValidApiKeyFormat } = require('../src/utils/apiKeyUtils');

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const apiKey = generateApiKey();
      
      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBe(64); // 32 bytes * 2 (hex)
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('hashApiKey', () => {
    it('should hash an API key', () => {
      const apiKey = 'test-api-key-12345';
      const hash = hashApiKey(apiKey);
      
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hash
    });

    it('should produce consistent hashes', () => {
      const apiKey = 'test-api-key-12345';
      const hash1 = hashApiKey(apiKey);
      const hash2 = hashApiKey(apiKey);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('key1');
      const hash2 = hashApiKey('key2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getApiKeyPrefix', () => {
    it('should extract the first 8 characters', () => {
      const apiKey = 'abcdefghijklmnop';
      const prefix = getApiKeyPrefix(apiKey);
      
      expect(prefix).toBe('abcdefgh');
    });

    it('should handle short keys', () => {
      const apiKey = 'abc';
      const prefix = getApiKeyPrefix(apiKey);
      
      expect(prefix).toBe('abc');
    });
  });

  describe('isValidApiKeyFormat', () => {
    it('should validate correct API key format', () => {
      const apiKey = generateApiKey();
      const isValid = isValidApiKeyFormat(apiKey);
      
      expect(isValid).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidApiKeyFormat('short')).toBe(false);
      expect(isValidApiKeyFormat('')).toBe(false);
      expect(isValidApiKeyFormat(null)).toBe(false);
      expect(isValidApiKeyFormat(undefined)).toBe(false);
    });
  });
});

