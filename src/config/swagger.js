const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Website Analytics API',
      version: '1.0.0',
      description: 'Scalable backend API for Website Analytics - track clicks, visits, and user behavior across your websites and mobile apps',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie for authenticated users',
        },
      },
      schemas: {
        Event: {
          type: 'object',
          required: ['event'],
          properties: {
            event: {
              type: 'string',
              description: 'Event name',
              example: 'login_form_cta_click',
            },
            url: {
              type: 'string',
              description: 'Page URL where event occurred',
              example: 'https://example.com/page',
            },
            referrer: {
              type: 'string',
              description: 'Referrer URL',
              example: 'https://google.com',
            },
            device: {
              type: 'string',
              enum: ['mobile', 'desktop', 'tablet'],
              description: 'Device type',
            },
            ipAddress: {
              type: 'string',
              description: 'User IP address',
            },
            userId: {
              type: 'string',
              description: 'User identifier',
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Event timestamp',
            },
            metadata: {
              type: 'object',
              description: 'Additional event metadata',
              properties: {
                browser: {
                  type: 'string',
                  example: 'Chrome',
                },
                os: {
                  type: 'string',
                  example: 'Android',
                },
                screenSize: {
                  type: 'string',
                  example: '1080x1920',
                },
              },
            },
          },
        },
        EventSummary: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
            },
            count: {
              type: 'integer',
            },
            uniqueUsers: {
              type: 'integer',
            },
            deviceData: {
              type: 'object',
              properties: {
                mobile: {
                  type: 'integer',
                },
                desktop: {
                  type: 'integer',
                },
                tablet: {
                  type: 'integer',
                },
              },
            },
          },
        },
        UserStats: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
            },
            totalEvents: {
              type: 'integer',
            },
            deviceDetails: {
              type: 'object',
              properties: {
                browser: {
                  type: 'string',
                },
                os: {
                  type: 'string',
                },
              },
            },
            ipAddress: {
              type: 'string',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            message: {
              type: 'string',
            },
            error: {
              type: 'string',
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and API key management',
      },
      {
        name: 'Analytics',
        description: 'Analytics event collection and reporting',
      },
    ],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

