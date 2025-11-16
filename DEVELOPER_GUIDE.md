# Website Analytics API - Developer Guide

## Table of Contents
1. [Architecture](#architecture)
2. [Development Workflow](#development-workflow)
3. [API Design Principles](#api-design-principles)
4. [Database Design](#database-design)
5. [Security Considerations](#security-considerations)
6. [Performance Optimization](#performance-optimization)

## Architecture

### System Components

#### 1. API Layer (Express.js)
- **Routes**: Handle HTTP requests and responses
- **Middleware**: Authentication, rate limiting, validation
- **Controllers**: Business logic for each endpoint

#### 2. Data Layer
- **PostgreSQL**: Primary data store with partitioned tables
- **Redis**: Caching and rate limiting store
- **Models**: Database query abstractions

#### 3. Authentication Layer
- **Passport.js**: OAuth 2.0 implementation
- **Session Management**: Express sessions with secure cookies
- **API Key Auth**: Custom middleware for API key verification

### Design Patterns

#### Repository Pattern
Models encapsulate all database operations:
```javascript
class User {
  static async findById(id) { /* ... */ }
  static async create(data) { /* ... */ }
}
```

#### Middleware Pattern
Composable request processing:
```javascript
app.use(helmet());
app.use(cors());
app.use(rateLimiter);
app.use('/api/analytics', verifyApiKey);
```

#### Cache-Aside Pattern
Check cache → Query DB → Update cache:
```javascript
const cached = await cacheGet(key);
if (cached) return cached;
const data = await db.query(...);
await cacheSet(key, data);
return data;
```

## Development Workflow

### Setting Up Development Environment

```bash
# Install dependencies
npm install

# Set up database
npm run db:migrate

# Start development server
npm run dev
```

### Code Style

- **ESLint**: Enforce code quality
- **Prettier**: Code formatting
- **Naming Conventions**:
  - camelCase for variables and functions
  - PascalCase for classes and models
  - UPPER_SNAKE_CASE for constants

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/my-feature
```

### Commit Message Convention
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

## API Design Principles

### RESTful Design
- Use proper HTTP methods (GET, POST, PUT, DELETE)
- Resource-based URLs
- Consistent response format

### Response Format
```json
{
  "success": true,
  "message": "Operation completed",
  "data": { /* ... */ }
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (dev mode only)"
}
```

### Pagination
For endpoints returning lists:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

## Database Design

### Partitioning Strategy

Analytics events table is partitioned by month:
```sql
CREATE TABLE analytics_events_2024_11 PARTITION OF analytics_events
  FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
```

**Benefits**:
- Faster queries (smaller table scans)
- Easier data archival (drop old partitions)
- Better performance for time-range queries

### Index Strategy

```sql
-- Single column indexes
CREATE INDEX idx_analytics_app_id ON analytics_events(app_id);
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp);

-- Composite indexes for common queries
CREATE INDEX idx_analytics_composite 
  ON analytics_events(app_id, event_name, timestamp);
```

### Normalization
- Users → Apps (1:N)
- Apps → API Keys (1:N)
- Apps → Events (1:N)

## Security Considerations

### API Key Security

1. **Generation**: Cryptographically secure random bytes
2. **Storage**: Only SHA-256 hash stored in DB
3. **Transmission**: HTTPS only in production
4. **Expiration**: Configurable expiry dates
5. **Revocation**: Soft delete with revoked_at timestamp

### Authentication

- **Google OAuth**: Secure third-party authentication
- **Session Management**: HttpOnly cookies, secure in production
- **CSRF Protection**: Session-based protection

### Rate Limiting

```javascript
// Different limits for different endpoints
const authLimiter = rateLimit({ max: 10 });
const apiLimiter = rateLimit({ max: 100 });
const eventLimiter = rateLimit({ max: 1000 });
```

### Input Validation

Using express-validator:
```javascript
body('event').notEmpty().withMessage('Event name required'),
body('timestamp').optional().isISO8601(),
```

### SQL Injection Prevention

- Parameterized queries only
- Never concatenate SQL strings
- Use ORM/query builder where appropriate

## Performance Optimization

### Caching Strategy

**What to cache**:
- Event summaries (high computation cost)
- User statistics (aggregated data)
- Device distributions (rarely changes)

**TTL Configuration**:
- Analytics queries: 5 minutes
- User data: 15 minutes
- Config data: 1 hour

**Cache Invalidation**:
```javascript
// On new event
await cacheDelPattern(`analytics:${appId}:*`);
```

### Query Optimization

1. **Use indexes effectively**
2. **Limit result sets** (pagination)
3. **Aggregate in database** (not in application)
4. **Use EXPLAIN ANALYZE** to optimize slow queries

### Connection Pooling

```javascript
const pool = new Pool({
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Compression

- Gzip compression for responses
- Reduces bandwidth by ~70%

### Database Optimization

1. **Vacuuming**: Regular VACUUM ANALYZE
2. **Statistics**: Keep table statistics up to date
3. **Partitioning**: Monthly partitions for events
4. **Archival**: Move old data to cold storage

## Monitoring

### Logging

```javascript
// Morgan for HTTP requests
app.use(morgan('combined'));

// Custom application logs
console.log('Info:', message);
console.error('Error:', error);
```

### Metrics to Track

- Request rate (requests/second)
- Response time (p50, p95, p99)
- Error rate (errors/total requests)
- Cache hit rate
- Database connection pool usage
- Event ingestion rate

### Health Checks

```javascript
GET /health
{
  "success": true,
  "timestamp": "2024-11-16T12:00:00Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

## Testing Strategy

### Test Pyramid

1. **Unit Tests** (70%): Functions, utilities
2. **Integration Tests** (20%): API endpoints
3. **E2E Tests** (10%): Full user flows

### Test Coverage Goals

- Overall: > 80%
- Critical paths: > 95%
- New code: 100%

### Running Tests

```bash
# All tests
npm test

# With coverage
npm test -- --coverage

# Watch mode
npm run test:watch

# Specific file
npm test -- tests/auth.test.js
```

## Deployment Checklist

- [ ] Set NODE_ENV=production
- [ ] Use strong SESSION_SECRET
- [ ] Configure Google OAuth callback URL
- [ ] Set up database with SSL
- [ ] Enable Redis persistence
- [ ] Configure rate limits appropriately
- [ ] Set up monitoring and alerts
- [ ] Enable HTTPS
- [ ] Set CORS_ORIGIN to specific domain
- [ ] Review and minimize logs in production
- [ ] Set up automated backups
- [ ] Configure health checks
- [ ] Document deployment URL

## Troubleshooting

### Common Issues

**Database connection fails**:
- Check DATABASE_URL format
- Verify database is running
- Check firewall/security groups

**Redis connection fails**:
- Application should work without Redis (graceful degradation)
- Check REDIS_URL format
- Verify Redis is accessible

**Google OAuth fails**:
- Verify callback URL matches Google Console
- Check CLIENT_ID and CLIENT_SECRET
- Ensure Google+ API is enabled

**Rate limit too strict**:
- Adjust RATE_LIMIT_MAX_REQUESTS
- Consider per-user vs per-IP limiting
- Use Redis for distributed rate limiting

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Redis Documentation](https://redis.io/docs/)
- [Passport.js Documentation](http://www.passportjs.org/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

