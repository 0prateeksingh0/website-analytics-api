# API Examples

This document provides detailed examples for using the Website Analytics API.

## Authentication Flow

### 1. Login with Google

**Step 1**: Redirect user to Google OAuth
```
GET http://localhost:3000/api/auth/google
```

**Step 2**: User authenticates with Google and is redirected back

**Step 3**: Check authentication status
```bash
curl http://localhost:3000/api/auth/me \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "profilePicture": "https://..."
  }
}
```

## API Key Management

### Register a New App

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "appName": "My E-commerce Site",
    "appUrl": "https://shop.example.com",
    "description": "Analytics for my online store",
    "keyName": "Production Key"
  }'
```

Response:
```json
{
  "success": true,
  "message": "App registered successfully",
  "data": {
    "app": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "My E-commerce Site",
      "url": "https://shop.example.com"
    },
    "apiKey": {
      "id": "123e4567-e89b-12d3-a456-426614174001",
      "key": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
      "prefix": "a1b2c3d4",
      "name": "Production Key",
      "expiresAt": "2025-11-16T00:00:00.000Z"
    }
  },
  "warning": "Store this API key securely. It will not be shown again."
}
```

**⚠️ Important**: Save the API key immediately. It will not be displayed again.

### Get Your API Keys

```bash
curl http://localhost:3000/api/auth/api-key \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "app_name": "My E-commerce Site",
      "app_url": "https://shop.example.com",
      "apiKeys": [
        {
          "id": "uuid",
          "key_prefix": "a1b2c3d4",
          "name": "Production Key",
          "is_active": true,
          "expires_at": "2025-11-16T00:00:00.000Z",
          "last_used_at": "2024-11-16T10:30:00.000Z",
          "created_at": "2024-11-16T09:00:00.000Z"
        }
      ]
    }
  ]
}
```

### Revoke an API Key

```bash
curl -X POST http://localhost:3000/api/auth/revoke \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "keyId": "123e4567-e89b-12d3-a456-426614174001"
  }'
```

Response:
```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

### Regenerate API Key

```bash
curl -X POST http://localhost:3000/api/auth/regenerate \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE" \
  -d '{
    "appId": "123e4567-e89b-12d3-a456-426614174000",
    "keyName": "New Production Key"
  }'
```

## Analytics Event Collection

### Track Button Click

```bash
curl -X POST http://localhost:3000/api/analytics/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event": "checkout_button_click",
    "url": "https://shop.example.com/cart",
    "referrer": "https://shop.example.com/products",
    "device": "desktop",
    "userId": "user_12345",
    "sessionId": "session_67890",
    "timestamp": "2024-11-16T10:30:00.000Z",
    "metadata": {
      "browser": "Chrome",
      "os": "Windows",
      "screenSize": "1920x1080",
      "cartValue": 299.99,
      "itemCount": 3
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Event collected successfully",
  "data": {
    "id": "event-uuid",
    "event": "checkout_button_click",
    "timestamp": "2024-11-16T10:30:00.000Z"
  }
}
```

### Track Page View

```bash
curl -X POST http://localhost:3000/api/analytics/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event": "page_view",
    "url": "https://shop.example.com/products/laptop",
    "referrer": "https://google.com/search",
    "device": "mobile",
    "userId": "user_12345",
    "sessionId": "session_67890",
    "metadata": {
      "browser": "Safari",
      "os": "iOS",
      "screenSize": "375x667",
      "productId": "laptop-001"
    }
  }'
```

### Track Form Submission

```bash
curl -X POST http://localhost:3000/api/analytics/collect \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "event": "signup_form_submit",
    "url": "https://shop.example.com/signup",
    "device": "desktop",
    "userId": "user_new",
    "sessionId": "session_new",
    "metadata": {
      "browser": "Firefox",
      "os": "Linux",
      "referralSource": "organic",
      "formFields": ["email", "name", "password"]
    }
  }'
```

## Analytics Queries

### Get Event Summary

Get aggregated statistics for a specific event:

```bash
curl "http://localhost:3000/api/analytics/event-summary?event=checkout_button_click&startDate=2024-11-01&endDate=2024-11-16" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "event": "checkout_button_click",
      "count": 1245,
      "uniqueUsers": 892,
      "uniqueSessions": 1023,
      "deviceData": {
        "mobile": 623,
        "desktop": 592,
        "tablet": 30
      }
    }
  ]
}
```

### Get Summary for All Events

```bash
curl "http://localhost:3000/api/analytics/event-summary?startDate=2024-11-01&endDate=2024-11-16" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "event": "page_view",
      "count": 15234,
      "uniqueUsers": 5432,
      "uniqueSessions": 8765,
      "deviceData": {
        "mobile": 8123,
        "desktop": 6234,
        "tablet": 877
      }
    },
    {
      "event": "checkout_button_click",
      "count": 1245,
      "uniqueUsers": 892,
      "uniqueSessions": 1023,
      "deviceData": {
        "mobile": 623,
        "desktop": 592,
        "tablet": 30
      }
    }
  ]
}
```

### Get User Statistics

```bash
curl "http://localhost:3000/api/analytics/user-stats?userId=user_12345&app_id=YOUR_APP_ID" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": {
    "userId": "user_12345",
    "totalEvents": 47,
    "deviceDetails": {
      "browser": "Chrome",
      "os": "Windows",
      "device": "desktop"
    },
    "ipAddress": "203.0.113.45",
    "firstEvent": "2024-11-01T08:23:15.000Z",
    "lastEvent": "2024-11-16T10:30:00.000Z",
    "recentEvents": [
      {
        "event_name": "checkout_button_click",
        "timestamp": "2024-11-16T10:30:00.000Z",
        "url": "https://shop.example.com/cart"
      },
      {
        "event_name": "add_to_cart",
        "timestamp": "2024-11-16T10:28:45.000Z",
        "url": "https://shop.example.com/products/laptop"
      }
    ]
  }
}
```

### Get Top Events

```bash
curl "http://localhost:3000/api/analytics/top-events?limit=5&startDate=2024-11-01&endDate=2024-11-16" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "event_name": "page_view",
      "count": "15234",
      "unique_users": "5432"
    },
    {
      "event_name": "product_click",
      "count": "3456",
      "unique_users": "2134"
    },
    {
      "event_name": "add_to_cart",
      "count": "1876",
      "unique_users": "1234"
    },
    {
      "event_name": "checkout_button_click",
      "count": "1245",
      "unique_users": "892"
    },
    {
      "event_name": "purchase_complete",
      "count": "856",
      "unique_users": "743"
    }
  ]
}
```

### Get Device Distribution

```bash
curl "http://localhost:3000/api/analytics/device-distribution?startDate=2024-11-01&endDate=2024-11-16" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "device": "mobile",
      "count": "12456",
      "unique_users": "4567"
    },
    {
      "device": "desktop",
      "count": "8934",
      "unique_users": "3456"
    },
    {
      "device": "tablet",
      "count": "1234",
      "unique_users": "567"
    }
  ]
}
```

### Get Events Over Time

```bash
curl "http://localhost:3000/api/analytics/events-over-time?event=page_view&interval=day&startDate=2024-11-01&endDate=2024-11-16" \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "period": "2024-11-01",
      "count": "1234",
      "unique_users": "567"
    },
    {
      "period": "2024-11-02",
      "count": "1345",
      "unique_users": "623"
    },
    {
      "period": "2024-11-03",
      "count": "1456",
      "unique_users": "678"
    }
  ]
}
```

## JavaScript Integration Examples

### Basic Tracking Script

```html
<script>
  const ANALYTICS_API_KEY = 'YOUR_API_KEY';
  const ANALYTICS_ENDPOINT = 'http://localhost:3000/api/analytics/collect';
  
  // Generate or retrieve session ID
  function getSessionId() {
    let sessionId = sessionStorage.getItem('analytics_session');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('analytics_session', sessionId);
    }
    return sessionId;
  }
  
  // Get or generate user ID (you might use your own user ID system)
  function getUserId() {
    let userId = localStorage.getItem('analytics_user');
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('analytics_user', userId);
    }
    return userId;
  }
  
  // Track event
  async function trackEvent(eventName, metadata = {}) {
    try {
      const response = await fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': ANALYTICS_API_KEY
        },
        body: JSON.stringify({
          event: eventName,
          url: window.location.href,
          referrer: document.referrer,
          device: /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'mobile' : 'desktop',
          userId: getUserId(),
          sessionId: getSessionId(),
          timestamp: new Date().toISOString(),
          metadata: {
            browser: navigator.userAgent,
            screenSize: `${window.screen.width}x${window.screen.height}`,
            ...metadata
          }
        })
      });
      
      if (!response.ok) {
        console.error('Analytics tracking failed:', await response.text());
      }
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }
  
  // Auto-track page views
  trackEvent('page_view');
  
  // Track button clicks
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-track]');
    if (button) {
      const eventName = button.getAttribute('data-track');
      const metadata = {};
      
      // Include any data attributes
      Object.keys(button.dataset).forEach(key => {
        if (key !== 'track') {
          metadata[key] = button.dataset[key];
        }
      });
      
      trackEvent(eventName, metadata);
    }
  });
</script>

<!-- Usage examples -->
<button data-track="cta_click" data-button-id="signup-hero">Sign Up Now</button>
<button data-track="product_click" data-product-id="123" data-product-name="Laptop">View Product</button>
<a href="/checkout" data-track="checkout_link_click">Proceed to Checkout</a>
```

### React Integration

```jsx
// analytics.js
const ANALYTICS_API_KEY = process.env.REACT_APP_ANALYTICS_KEY;
const ANALYTICS_ENDPOINT = process.env.REACT_APP_ANALYTICS_URL;

export const trackEvent = async (eventName, metadata = {}) => {
  try {
    await fetch(ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': ANALYTICS_API_KEY
      },
      body: JSON.stringify({
        event: eventName,
        url: window.location.href,
        referrer: document.referrer,
        device: /Mobile/.test(navigator.userAgent) ? 'mobile' : 'desktop',
        userId: localStorage.getItem('userId'),
        sessionId: sessionStorage.getItem('sessionId'),
        timestamp: new Date().toISOString(),
        metadata
      })
    });
  } catch (error) {
    console.error('Analytics error:', error);
  }
};

// Usage in components
import { useEffect } from 'react';
import { trackEvent } from './analytics';

function ProductPage({ productId }) {
  useEffect(() => {
    trackEvent('product_page_view', { productId });
  }, [productId]);
  
  const handleAddToCart = () => {
    trackEvent('add_to_cart_click', { productId });
    // Your add to cart logic
  };
  
  return (
    <div>
      <h1>Product</h1>
      <button onClick={handleAddToCart}>Add to Cart</button>
    </div>
  );
}
```

### Vue Integration

```javascript
// plugins/analytics.js
export default {
  install(app, options) {
    app.config.globalProperties.$trackEvent = async (eventName, metadata = {}) => {
      try {
        await fetch(options.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': options.apiKey
          },
          body: JSON.stringify({
            event: eventName,
            url: window.location.href,
            userId: localStorage.getItem('userId'),
            sessionId: sessionStorage.getItem('sessionId'),
            timestamp: new Date().toISOString(),
            metadata
          })
        });
      } catch (error) {
        console.error('Analytics error:', error);
      }
    };
  }
};

// main.js
import analyticsPlugin from './plugins/analytics';

app.use(analyticsPlugin, {
  apiKey: process.env.VUE_APP_ANALYTICS_KEY,
  endpoint: process.env.VUE_APP_ANALYTICS_URL
});

// Usage in components
export default {
  methods: {
    handleClick() {
      this.$trackEvent('button_click', { buttonId: 'checkout' });
    }
  },
  mounted() {
    this.$trackEvent('page_view');
  }
};
```

## Error Handling

### Invalid API Key
```json
{
  "success": false,
  "message": "Invalid or expired API key"
}
```

### Missing Required Fields
```json
{
  "success": false,
  "errors": [
    {
      "msg": "Event name is required",
      "param": "event",
      "location": "body"
    }
  ]
}
```

### Rate Limit Exceeded
```json
{
  "success": false,
  "message": "Event collection rate limit exceeded. Please slow down."
}
```

### Unauthorized Access
```json
{
  "success": false,
  "message": "Authentication required. Please login with Google."
}
```

## Best Practices

1. **Batch Events**: For high-traffic sites, consider batching events client-side and sending in bulk
2. **Error Handling**: Always wrap tracking calls in try-catch to prevent breaking your app
3. **Privacy**: Don't track PII without user consent
4. **Performance**: Use async/non-blocking requests
5. **Sampling**: For very high traffic, consider sampling (tracking only X% of events)
6. **Testing**: Test with actual API key but use test events during development

