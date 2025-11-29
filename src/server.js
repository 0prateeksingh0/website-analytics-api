require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const { initRedis } = require('./config/redis');
const swaggerSpec = require('./config/swagger');
const { apiLimiter } = require('./middleware/rateLimiter');
const {
  sanitizeInput,
  preventSQLInjection,
  requestSizeLimiter,
  setSecurityHeaders,
  generateCSRFToken,
  auditLog,
} = require('./middleware/security');
const { performanceTracker, startPerformanceMonitoring } = require('./utils/performanceMonitor');

// Import routes
const authRoutes = require('./routes/auth');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// Additional security headers
app.use(setSecurityHeaders);

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Request size limiting (prevent large payload attacks)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestSizeLimiter('1mb'));

// Input sanitization (prevent XSS)
app.use(sanitizeInput);

// SQL Injection prevention
app.use(preventSQLInjection);

// Compression (optimized settings)
app.use(compression({
  level: 6, // Balance between speed and compression ratio
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
}));

// Logging (conditional)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Performance tracking
app.use(performanceTracker);

// Session configuration (optimized)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax', // CSRF protection
    },
    rolling: true, // Refresh session on activity
    name: 'sessionId', // Hide default connect.sid name
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// CSRF protection
app.use(generateCSRFToken);

// Audit logging for sensitive operations
app.use(auditLog);

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Analytics API Documentation',
}));

// Health check endpoint (enhanced with metrics)
app.get('/health', async (req, res) => {
  try {
    const { getPerformanceMetrics } = require('./utils/performanceMonitor');
    const detailed = req.query.detailed === 'true';

    const baseHealth = {
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      security: {
        csp: 'enabled',
        csrf: 'enabled',
        inputSanitization: 'enabled',
        sqlInjectionPrevention: 'enabled',
        rateLimiting: 'enabled',
      },
    };

    if (detailed) {
      const metrics = await getPerformanceMetrics();
      res.json({ ...baseHealth, metrics });
    } else {
      res.json(baseHealth);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Website Analytics API',
    version: '1.0.0',
    documentation: '/api-docs',
    endpoints: {
      authentication: '/api/auth',
      analytics: '/api/analytics',
    },
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/analytics', analyticsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

// Initialize Redis and start server (with optimizations)
const startServer = async () => {
  try {
    // Initialize Redis with error handling (graceful degradation)
    try {
      await initRedis();
      console.log('✓ Redis initialized');
    } catch (error) {
      console.warn('⚠ Redis initialization failed, continuing without cache:', error.message);
    }

    // Warm up critical caches on startup
    console.log('Warming up caches...');
    // Add cache warming logic here if needed

    // Start performance monitoring in production
    if (process.env.NODE_ENV === 'production') {
      startPerformanceMonitoring(300000); // Log every 5 minutes
      console.log('✓ Performance monitoring started');
    }

    // Start server
    const server = app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
      console.log(`⚡ Performance mode: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(60));
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('HTTP server closed');
        
        // Close database connections
        const { shutdown: dbShutdown } = require('./database/db');
        await dbShutdown();
        
        // Close Redis connection
        const { shutdownRedis } = require('./config/redis');
        await shutdownRedis();
        
        console.log('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.error('Forcing shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = app;

