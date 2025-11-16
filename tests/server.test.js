const request = require('supertest');
const app = require('../src/server');
const { pool } = require('../src/database/db');

describe('API Health and Basic Endpoints', () => {
  afterAll(async () => {
    await pool.end();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Server is running');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('GET /', () => {
    it('should return API information', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Website Analytics API');
      expect(response.body.version).toBeDefined();
      expect(response.body.documentation).toBe('/api-docs');
    });
  });

  describe('GET /api-docs', () => {
    it('should serve Swagger documentation', async () => {
      const response = await request(app).get('/api-docs/');
      
      expect(response.status).toBe(301); // Redirects to /api-docs/
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');
      
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Endpoint not found');
    });
  });
});

