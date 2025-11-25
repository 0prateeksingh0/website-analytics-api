# Website Analytics API

A scalable backend API for website and mobile app analytics. Track user events, clicks, visits, and gain insights through powerful analytics endpoints.

## 🌐 Live Demo

**Deployment URL**: [Add your deployment URL here after deploying]

- API Documentation: [Your URL]/api-docs
- Health Check: [Your URL]/health

---

## 📋 Features

### ✅ Implemented Features

- **Google OAuth Authentication** - Secure user login and registration
- **API Key Management** - Create, revoke, and regenerate API keys
- **Event Collection** - Track clicks, visits, and custom events with API key authentication
- **Analytics & Reporting** - Event summaries, user stats, device distribution, and more
- **PostgreSQL Database** - Partitioned tables for scalability
- **Redis Caching** - Fast analytics queries with intelligent caching
- **Rate Limiting** - Protection against API abuse
- **Swagger Documentation** - Interactive API docs at `/api-docs`
- **Docker Support** - Easy deployment with Docker Compose

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+ (optional)
- Google OAuth credentials

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd thealter
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
# Create .env file (already created with your credentials)
# Make sure these are set:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - GOOGLE_CALLBACK_URL
# - DATABASE_URL (or DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
```

4. **Set up database**
```bash
createdb analytics_db
npm run db:migrate
```

5. **Start Redis (optional)**
```bash
redis-server --daemonize yes
```

6. **Start the server**
```bash
npm start
```

Server will be running at: http://localhost:3000

---

## 📡 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/google` | Initiate Google OAuth login |
| GET | `/api/auth/me` | Get current user info |
| POST | `/api/auth/register` | Register app & generate API key |
| GET | `/api/auth/api-key` | Get API keys for your apps |
| POST | `/api/auth/revoke` | Revoke an API key |
| POST | `/api/auth/regenerate` | Generate new API key |

### Analytics Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/analytics/collect` | Submit analytics event | API Key |
| GET | `/api/analytics/event-summary` | Get event summary | Session |
| GET | `/api/analytics/user-stats` | Get user statistics | Session |
| GET | `/api/analytics/top-events` | Get top events | Session |
| GET | `/api/analytics/device-distribution` | Get device breakdown | Session |
| GET | `/api/analytics/events-over-time` | Get time-series data | Session |

### Utility Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API information |
| GET | `/health` | Health check |
| GET | `/api-docs` | Swagger documentation |

---

## 💻 Usage Examples

### 1. Register Your App

```bash
# First, login via browser
open http://localhost:3000/api/auth/google

# Then register your app (use session cookie from browser)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "appName": "My Website",
    "appUrl": "https://mywebsite.com"
  }'

# Response will include your API key - SAVE IT!
```

### 2. Track Events

```bash
curl -X POST http://localhost:3000/api/analytics/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event": "button_click",
    "url": "https://mywebsite.com/page",
    "referrer": "https://google.com",
    "device": "mobile",
    "userId": "user123",
    "timestamp": "2024-11-16T12:00:00Z",
    "metadata": {
      "browser": "Chrome",
      "os": "Android",
      "buttonId": "signup-cta"
    }
  }'
```

### 3. Get Analytics

```bash
# Get event summary
curl "http://localhost:3000/api/analytics/event-summary?event=button_click&startDate=2024-11-01" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"

# Get user stats
curl "http://localhost:3000/api/analytics/user-stats?userId=user123&app_id=YOUR_APP_ID" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

### JavaScript Integration

```html
<script>
const API_KEY = 'your-api-key';
const API_URL = 'http://localhost:3000/api/analytics/collect';

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

<!-- Usage -->
<button data-track="signup_click">Sign Up</button>
<button data-track="cta_click">Get Started</button>
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

---

## 🚢 Deployment

### Deploy to Render (Recommended)

1. **Push to GitHub**
```bash
git remote add origin https://github.com/YOUR_USERNAME/website-analytics-api.git
git branch -M main
git push -u origin main
```

2. **Create Render Account**: https://render.com

3. **Create PostgreSQL Database**
   - Dashboard → New → PostgreSQL
   - Name: `analytics-db`
   - Free plan → Create
   - Copy "Internal Database URL"

4. **Create Redis Instance**
   - Dashboard → New → Redis
   - Name: `analytics-redis`
   - Free plan → Create
   - Copy "Internal Redis URL"

5. **Create Web Service**
   - Dashboard → New → Web Service
   - Connect GitHub repository
   - Name: `analytics-api`
   - Environment: Docker
   - Add Environment Variables:
     ```
     NODE_ENV=production
     DATABASE_URL=<postgres-internal-url>
     REDIS_URL=<redis-internal-url>
     GOOGLE_CLIENT_ID=your-client-id
     GOOGLE_CLIENT_SECRET=your-client-secret
     GOOGLE_CALLBACK_URL=https://your-app.onrender.com/api/auth/google/callback
     SESSION_SECRET=random-secret-string
     API_BASE_URL=https://your-app.onrender.com
     ```
   - Deploy!

6. **Update Google OAuth**
   - Go to: https://console.cloud.google.com/apis/credentials
   - Add redirect URI: `https://your-app.onrender.com/api/auth/google/callback`

7. **Test Your Deployment**
   - Visit: `https://your-app.onrender.com/health`
   - Visit: `https://your-app.onrender.com/api-docs`

### Alternative: Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

---

## 🗄️ Database Schema

### Tables

- **users** - Authenticated users (Google OAuth)
- **apps** - Registered applications
- **api_keys** - API keys for authentication
- **analytics_events** - Event data (partitioned by month)

### Key Features

- Monthly table partitioning for scalability
- Composite indexes for fast queries
- Foreign key relationships with cascade delete
- JSONB metadata field for flexibility

---

## 🛡️ Security Features

- ✅ Google OAuth 2.0 authentication
- ✅ API key SHA-256 hashing
- ✅ Rate limiting (3 tiers)
- ✅ Input validation with express-validator
- ✅ SQL injection prevention
- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Secure session cookies

---

## 📁 Project Structure

```
thealter/
├── src/
│   ├── config/          # Configuration (Redis, Passport, Swagger)
│   ├── database/        # Database connection & schema
│   ├── middleware/      # Auth, API key, rate limiting
│   ├── models/          # Data models (User, App, ApiKey, AnalyticsEvent)
│   ├── routes/          # API routes (auth, analytics)
│   ├── utils/           # Utility functions
│   └── server.js        # Main application
├── tests/               # Test files
├── .env                 # Environment variables (not in git)
├── .gitignore           # Git ignore rules
├── docker-compose.yml   # Docker configuration
├── Dockerfile           # Docker image definition
├── package.json         # Dependencies
└── README.md            # This file
```

---

## 🔧 Environment Variables

Required variables in `.env`:

```env
# Server
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=analytics_db
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Session
SESSION_SECRET=your-secret-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

---

## 🎯 Challenges & Solutions

### Challenge 1: High-Volume Event Ingestion
**Solution**: Implemented PostgreSQL table partitioning by month for better query performance and easier data management.

### Challenge 2: Query Performance
**Solution**: Added Redis caching with 5-minute TTL and automatic cache invalidation on new events.

### Challenge 3: API Security
**Solution**: Implemented API key SHA-256 hashing, rate limiting, and comprehensive input validation.

### Challenge 4: Scalability
**Solution**: Designed stateless API, connection pooling, and horizontal scaling support.

---

## 📈 Future Enhancements

- [ ] Real-time WebSocket updates
- [ ] Geographical analytics with IP geolocation
- [ ] Custom dashboards
- [ ] Data export (CSV, JSON)
- [ ] Email alerts
- [ ] A/B testing support
- [ ] GraphQL API

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)

---

## 📄 License

This project is licensed under the MIT License.

---

## 📞 Support

- Documentation: http://localhost:3000/api-docs

# thealter
