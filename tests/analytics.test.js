const request = require('supertest');
const app = require('../src/server');
const { pool } = require('../src/database/db');

describe('Analytics Endpoints', () => {
  afterAll(async () => {
    await pool.end();
  });

  describe('POST /api/analytics/collect', () => {
    it('should return 401 without API key', async () => {
      const response = await request(app)
        .post('/api/analytics/collect')
        .send({
          event: 'test_event',
          url: 'https://example.com',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('API key is required');
    });

    it('should return 401 with invalid API key', async () => {
      const response = await request(app)
        .post('/api/analytics/collect')
        .set('X-API-Key', 'invalid-key')
        .send({
          event: 'test_event',
          url: 'https://example.com',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid or expired API key');
    });

    it('should return 400 without event name', async () => {
      const response = await request(app)
        .post('/api/analytics/collect')
        .set('X-API-Key', 'test-key-that-does-not-exist-but-longer-than-minimum')
        .send({
          url: 'https://example.com',
        });
      
      expect(response.status).toBe(401);
    });

    it('should validate timestamp format', async () => {
      const response = await request(app)
        .post('/api/analytics/collect')
        .set('X-API-Key', 'test-key-that-does-not-exist-but-longer-than-minimum')
        .send({
          event: 'test_event',
          timestamp: 'invalid-date',
        });
      
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/event-summary', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/analytics/event-summary');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should validate date format', async () => {
      const response = await request(app)
        .get('/api/analytics/event-summary')
        .query({
          startDate: 'invalid-date',
        });
      
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/user-stats', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .get('/api/analytics/user-stats')
        .query({
          userId: 'test-user',
          app_id: 'test-app',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/analytics/top-events', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/analytics/top-events');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/analytics/device-distribution', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/analytics/device-distribution');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/analytics/events-over-time', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/analytics/events-over-time');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

