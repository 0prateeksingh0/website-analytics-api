# Website Analytics API

A scalable, production-ready backend API for website and mobile app analytics. Track user behavior, clicks, visits, and gain insights through powerful analytics endpoints.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

## 🚀 Features

### Core Functionality
- **API Key Management**: Secure API key generation, regeneration, and revocation
- **Google OAuth**: Seamless user authentication via Google OAuth 2.0
- **Event Collection**: High-performance analytics event ingestion
- **Real-time Analytics**: Event summaries, user statistics, and behavioral insights
- **Redis Caching**: Optimized query performance with intelligent caching
- **Rate Limiting**: Protection against abuse with configurable limits
- **Swagger Documentation**: Interactive API documentation

### Technical Highlights
- **Scalable Architecture**: Partitioned PostgreSQL tables for high-volume data
- **Containerized Deployment**: Docker & Docker Compose ready
- **Comprehensive Testing**: Unit and integration tests with Jest
- **Production-Ready**: Security headers, CORS, compression, and logging
- **Graceful Degradation**: Works even if Redis is unavailable

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Deployment](#deployment)
- [Challenges & Solutions](#challenges--solutions)
- [Future Enhancements](#future-enhancements)

## 🛠 Prerequisites

- **Node.js** 18+ 
- **PostgreSQL** 15+
- **Redis** 7+ (optional, for caching)
- **Docker & Docker Compose** (optional, for containerized deployment)
- **Google OAuth Credentials** (for authentication)

## 📦 Installation

### Option 1: Using Docker (Recommended)

1. **Clone the repository**
```bash
git clone <repository-url>
cd thealter
```

2. **Create environment file**
```bash
cp .env.example .env
```

3. **Configure Google OAuth** (see [Configuration](#configuration))

4. **Run setup script**
```bash
chmod +x setup.sh
./setup.sh
```

The application will be available at `http://localhost:3000`

### Option 2: Manual Setup

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd thealter
npm install
```

2. **Set up PostgreSQL database**
```bash
createdb analytics_db
npm run db:migrate
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start Redis** (optional)
```bash
redis-server
```

5. **Run the application**
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analytics_db
DB_USER=postgres
DB_PASSWORD=postgres

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Session Secret
SESSION_SECRET=your-secret-key-change-in-production

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# API Key Configuration
API_KEY_LENGTH=32
API_KEY_EXPIRY_DAYS=365

# Cache Configuration
CACHE_TTL=300
```

### Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth Client ID"
5. Choose "Web application"
6. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
7. Copy Client ID and Client Secret to `.env`

## 🏃 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

### With Docker
```bash
docker-compose up -d
```

### View Logs
```bash
# Docker
docker-compose logs -f api

# Local
npm start
```

### Stop Services
```bash
# Docker
docker-compose down

# Local
Ctrl+C
```

## 📡 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/auth/google` | Initiate Google OAuth | No |
| GET | `/api/auth/google/callback` | OAuth callback | No |
| GET | `/api/auth/me` | Get current user | Session |
| POST | `/api/auth/logout` | Logout user | Session |
| POST | `/api/auth/register` | Register new app & get API key | Session |
| GET | `/api/auth/api-key` | Get API keys | Session |
| POST | `/api/auth/revoke` | Revoke API key | Session |
| POST | `/api/auth/regenerate` | Generate new API key | Session |

### Analytics Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/analytics/collect` | Submit analytics event | API Key |
| GET | `/api/analytics/event-summary` | Get event summary | Session |
| GET | `/api/analytics/user-stats` | Get user statistics | Session |
| GET | `/api/analytics/top-events` | Get top events | Session |
| GET | `/api/analytics/device-distribution` | Get device distribution | Session |
| GET | `/api/analytics/events-over-time` | Get events over time | Session |

### API Documentation

Interactive API documentation is available at:
```
http://localhost:3000/api-docs
```

### Example Requests

#### 1. Register a New App
```bash
# First, authenticate via Google OAuth by visiting:
# http://localhost:3000/api/auth/google

# Then register your app:
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<your-session-cookie>" \
  -d '{
    "appName": "My Website",
    "appUrl": "https://mywebsite.com",
    "description": "My awesome website"
  }'
```

Response:
```json
{
  "success": true,
  "message": "App registered successfully",
  "data": {
    "app": {
      "id": "uuid",
      "name": "My Website",
      "url": "https://mywebsite.com"
    },
    "apiKey": {
      "id": "uuid",
      "key": "your-api-key-here",
      "prefix": "abcd1234",
      "expiresAt": "2025-11-16T00:00:00Z"
    }
  },
  "warning": "Store this API key securely. It will not be shown again."
}
```

#### 2. Collect Analytics Event
```bash
curl -X POST http://localhost:3000/api/analytics/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "event": "login_form_cta_click",
    "url": "https://example.com/login",
    "referrer": "https://google.com",
    "device": "mobile",
    "userId": "user123",
    "sessionId": "session456",
    "timestamp": "2024-02-20T12:34:56Z",
    "metadata": {
      "browser": "Chrome",
      "os": "Android",
      "screenSize": "1080x1920"
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Event collected successfully",
  "data": {
    "id": "uuid",
    "event": "login_form_cta_click",
    "timestamp": "2024-02-20T12:34:56Z"
  }
}
```

#### 3. Get Event Summary
```bash
curl -X GET "http://localhost:3000/api/analytics/event-summary?event=login_form_cta_click&startDate=2024-02-15&endDate=2024-02-20" \
  -H "Cookie: connect.sid=<your-session-cookie>"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "event": "login_form_cta_click",
      "count": 3400,
      "uniqueUsers": 1200,
      "uniqueSessions": 1500,
      "deviceData": {
        "mobile": 2200,
        "desktop": 1200,
        "tablet": 0
      }
    }
  ]
}
```

#### 4. Get User Statistics
```bash
curl -X GET "http://localhost:3000/api/analytics/user-stats?userId=user123&app_id=your-app-id" \
  -H "Cookie: connect.sid=<your-session-cookie>"
```

Response:
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "totalEvents": 150,
    "deviceDetails": {
      "browser": "Chrome",
      "os": "Android",
      "device": "mobile"
    },
    "ipAddress": "192.168.1.1",
    "firstEvent": "2024-02-01T10:00:00Z",
    "lastEvent": "2024-02-20T15:30:00Z",
    "recentEvents": [...]
  }
}
```

## 🗄 Database Schema

### Key Tables

#### Users
Stores registered app owners (authenticated via Google OAuth)
```sql
- id (UUID, PK)
- google_id (VARCHAR, UNIQUE)
- email (VARCHAR, UNIQUE)
- name (VARCHAR)
- profile_picture (TEXT)
- created_at, updated_at
```

#### Apps
Registered websites/mobile applications
```sql
- id (UUID, PK)
- user_id (UUID, FK → users)
- app_name (VARCHAR)
- app_url (VARCHAR)
- description (TEXT)
- created_at, updated_at
```

#### API Keys
API keys for authentication
```sql
- id (UUID, PK)
- app_id (UUID, FK → apps)
- key_hash (VARCHAR, UNIQUE)
- key_prefix (VARCHAR)
- is_active (BOOLEAN)
- expires_at (TIMESTAMP)
- last_used_at (TIMESTAMP)
- created_at, revoked_at
```

#### Analytics Events (Partitioned)
High-volume event storage with monthly partitions
```sql
- id (UUID, PK)
- app_id (UUID, FK → apps)
- event_name (VARCHAR)
- url, referrer (TEXT)
- device (VARCHAR)
- ip_address (VARCHAR)
- user_id, session_id (VARCHAR)
- timestamp (TIMESTAMP)
- metadata (JSONB)
- browser, os, screen_size
- country, city
```

### Indexes
Optimized indexes for:
- Event lookups by app_id, event_name, timestamp
- User lookups by user_id
- API key lookups by key_hash
- Composite indexes for common query patterns

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

### Run Specific Test File
```bash
npm test -- tests/auth.test.js
```

### Test Coverage
The test suite includes:
- ✅ API endpoint tests (authentication, analytics)
- ✅ Utility function tests
- ✅ Error handling tests
- ✅ Validation tests

## 🚢 Deployment

### Deploy to Render

1. **Create Render Account**: Sign up at [render.com](https://render.com)

2. **Create PostgreSQL Database**
   - New → PostgreSQL
   - Copy connection string

3. **Create Redis Instance**
   - New → Redis
   - Copy connection string

4. **Create Web Service**
   - New → Web Service
   - Connect your GitHub repository
   - Configure:
     - **Environment**: Docker
     - **Build Command**: (automatic)
     - **Start Command**: `npm start`

5. **Set Environment Variables**
   ```
   NODE_ENV=production
   DATABASE_URL=<postgres-connection-string>
   REDIS_URL=<redis-connection-string>
   GOOGLE_CLIENT_ID=<your-client-id>
   GOOGLE_CLIENT_SECRET=<your-client-secret>
   GOOGLE_CALLBACK_URL=<your-render-url>/api/auth/google/callback
   SESSION_SECRET=<random-secret>
   ```

6. **Deploy**: Render will automatically build and deploy

### Deploy to Railway

1. **Install Railway CLI**
```bash
npm install -g @railway/cli
railway login
```

2. **Initialize Project**
```bash
railway init
```

3. **Add PostgreSQL**
```bash
railway add postgresql
```

4. **Add Redis**
```bash
railway add redis
```

5. **Deploy**
```bash
railway up
```

6. **Set Environment Variables**
```bash
railway variables set GOOGLE_CLIENT_ID=<your-client-id>
railway variables set GOOGLE_CLIENT_SECRET=<your-client-secret>
railway variables set SESSION_SECRET=<random-secret>
```

### Deploy to AWS (ECS/Fargate)

See [AWS Deployment Guide](./docs/aws-deployment.md) (if created)

## 🎯 Challenges & Solutions

### Challenge 1: High-Volume Event Ingestion
**Problem**: Need to handle millions of analytics events efficiently

**Solution**: 
- Implemented PostgreSQL table partitioning by month
- Used batch inserts where possible
- Added proper indexes for query optimization
- Implemented connection pooling

### Challenge 2: Caching Strategy
**Problem**: Analytics queries can be expensive

**Solution**:
- Implemented Redis caching with TTL
- Graceful degradation when Redis is unavailable
- Cache invalidation on new events
- Separate cache keys for different query patterns

### Challenge 3: API Key Security
**Problem**: Secure API key generation and validation

**Solution**:
- Use cryptographically secure random generation
- Store only SHA-256 hashes in database
- Display only key prefix in UI
- Automatic expiration and revocation support

### Challenge 4: Rate Limiting at Scale
**Problem**: Prevent API abuse without blocking legitimate traffic

**Solution**:
- Implemented Redis-backed rate limiting
- Different limits for different endpoint types
- Per-API-key rate limiting for event collection
- Fallback to in-memory limiting

### Challenge 5: Google OAuth in Containerized Environment
**Problem**: Session management across container restarts

**Solution**:
- Proper session configuration
- Environment-aware callback URLs
- Secure cookie settings for production

## 🔮 Future Enhancements

### Planned Features
- [ ] Real-time WebSocket updates for analytics dashboards
- [ ] Geographical analytics with IP geolocation
- [ ] Custom event funnels and conversion tracking
- [ ] A/B testing support
- [ ] Email reports and alerts
- [ ] Data export (CSV, JSON)
- [ ] Multi-tenant support improvements
- [ ] GraphQL API
- [ ] Machine learning for anomaly detection
- [ ] GDPR compliance tools (data deletion, anonymization)

### Performance Optimizations
- [ ] TimescaleDB for time-series optimization
- [ ] ClickHouse for faster analytics queries
- [ ] Message queue (RabbitMQ/Kafka) for event buffering
- [ ] Read replicas for analytics queries
- [ ] CDN integration for static assets

### Monitoring & Observability
- [ ] Prometheus metrics
- [ ] Grafana dashboards
- [ ] ELK stack integration
- [ ] Distributed tracing with Jaeger
- [ ] Error tracking with Sentry

## 📚 Architecture Overview

```
┌─────────────┐
│   Client    │
│ (Web/Mobile)│
└──────┬──────┘
       │ API Key
       ▼
┌─────────────────────────────────┐
│       Load Balancer             │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│     Express.js API Server       │
│  ┌──────────┬────────────────┐  │
│  │ Passport │  Rate Limiter  │  │
│  └──────────┴────────────────┘  │
│  ┌──────────┬────────────────┐  │
│  │   Auth   │   Analytics    │  │
│  │  Routes  │    Routes      │  │
│  └──────────┴────────────────┘  │
└────┬──────────────────────┬─────┘
     │                      │
     ▼                      ▼
┌─────────────┐      ┌──────────┐
│ PostgreSQL  │      │  Redis   │
│ (Partitioned│      │ (Cache & │
│   Tables)   │      │  Sessions│
└─────────────┘      └──────────┘
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📧 Contact

For questions or support, please open an issue on GitHub.

## 🙏 Acknowledgments

- Express.js for the robust web framework
- PostgreSQL for reliable data storage
- Redis for high-performance caching
- Passport.js for authentication
- Swagger for API documentation

---

**Built with ❤️ for scalable analytics**

## Deployment URL

🌐 **Live Demo**: [Add your deployment URL here]

Example: `https://your-app.onrender.com` or `https://your-app.up.railway.app`

---

## Quick Start Guide

### 1. Get API Key
1. Visit the deployed URL
2. Click "Login with Google"
3. Register your app
4. Copy your API key (shown only once!)

### 2. Start Tracking
Add this to your website:
```html
<script>
  const API_KEY = 'your-api-key';
  const API_URL = 'https://your-deployment-url.com/api/analytics/collect';
  
  function trackEvent(eventName, metadata = {}) {
    fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        event: eventName,
        url: window.location.href,
        referrer: document.referrer,
        device: /Mobile/.test(navigator.userAgent) ? 'mobile' : 'desktop',
        timestamp: new Date().toISOString(),
        metadata: {
          browser: navigator.userAgent,
          screenSize: `${window.screen.width}x${window.screen.height}`,
          ...metadata
        }
      })
    });
  }
  
  // Track page view
  trackEvent('page_view');
  
  // Track button clicks
  document.querySelectorAll('[data-track]').forEach(el => {
    el.addEventListener('click', () => {
      trackEvent(el.dataset.track);
    });
  });
</script>

<!-- Track button clicks -->
<button data-track="cta_click">Sign Up</button>
<button data-track="login_click">Login</button>
```

### 3. View Analytics
1. Login to dashboard
2. View event summaries
3. Analyze user behavior
4. Export reports

---

**Made with 💻 by [Your Name]**

