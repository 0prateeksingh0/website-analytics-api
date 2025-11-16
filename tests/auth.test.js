const request = require('supertest');
const app = require('../src/server');
const { pool } = require('../src/database/db');

describe('Authentication Endpoints', () => {
  afterAll(async () => {
    await pool.end();
  });

  describe('GET /api/auth/google', () => {
    it('should redirect to Google OAuth', async () => {
      const response = await request(app).get('/api/auth/google');
      
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('google');
    });
  });

  describe('GET /api/auth/failure', () => {
    it('should return authentication failure', async () => {
      const response = await request(app).get('/api/auth/failure');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Authentication failed');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/me');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Authentication required');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          appName: 'Test App',
          appUrl: 'https://test.com',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/api-key', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/api-key');
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/revoke', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/auth/revoke')
        .send({
          keyId: 'test-key-id',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/regenerate', () => {
    it('should return 401 when not authenticated', async () => {
      const response = await request(app)
        .post('/api/auth/regenerate')
        .send({
          appId: 'test-app-id',
        });
      
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

