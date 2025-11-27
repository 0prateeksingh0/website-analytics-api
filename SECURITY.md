# Security Documentation

This document outlines the comprehensive security measures implemented in the Analytics API.

## Table of Contents

1. [Security Levels](#security-levels)
2. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
3. [Input Validation & Sanitization](#input-validation--sanitization)
4. [API Key Security](#api-key-security)
5. [Protection Mechanisms](#protection-mechanisms)
6. [Audit Logging](#audit-logging)
7. [Security Best Practices](#security-best-practices)
8. [Incident Response](#incident-response)

## Security Levels

The API implements a multi-level security system:

| Level | Name | Access | Use Case |
|-------|------|--------|----------|
| 0 | PUBLIC | No authentication | Public endpoints (health check) |
| 1 | BASIC | API key or session | Analytics event collection |
| 2 | USER | Authenticated user | Dashboard access, analytics viewing |
| 3 | ADMIN | Admin role | User management, system configuration |
| 4 | SUPER_ADMIN | Super admin role | Full system access, security logs |

## Role-Based Access Control (RBAC)

### User Roles

```javascript
const USER_ROLES = {
  GUEST: 'guest',       // No access
  USER: 'user',         // Standard user access
  ADMIN: 'admin',       // Administrative access
  SUPER_ADMIN: 'super_admin'  // Full system access
};
```

### Assigning Roles

Roles are stored in the `users` table:

```sql
ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
```

### Role Checks

Use middleware to enforce role requirements:

```javascript
const { requireSecurityLevel, SECURITY_LEVELS } = require('./middleware/security');

// Require admin access
router.post('/admin/users', requireSecurityLevel(SECURITY_LEVELS.ADMIN), ...);

// Require super admin access
router.delete('/admin/users/:id', requireSecurityLevel(SECURITY_LEVELS.SUPER_ADMIN), ...);
```

## Input Validation & Sanitization

### XSS Protection

All user inputs are automatically sanitized:

- Removes `<` and `>` characters
- Strips `javascript:` protocol
- Removes event handlers (`onclick`, `onerror`, etc.)

```javascript
// Automatically applied to all routes
app.use(sanitizeInput);
```

### SQL Injection Prevention

Multiple layers of protection:

1. **Parameterized queries**: All database queries use parameterized statements
2. **Pattern detection**: Blocks common SQL injection patterns
3. **Input validation**: Validates data types and formats

```javascript
// Automatically applied to all routes
app.use(preventSQLInjection);
```

### Input Validation Rules

Example validation for analytics events:

```javascript
[
  body('event')
    .notEmpty().withMessage('Event name is required')
    .isLength({ max: 255 }).withMessage('Event name too long')
    .matches(/^[a-zA-Z0-9_\-:.]+$/).withMessage('Invalid characters'),
  body('url')
    .optional()
    .isLength({ max: 2048 }).withMessage('URL too long'),
  body('timestamp')
    .optional()
    .isISO8601().withMessage('Invalid timestamp format'),
]
```

## API Key Security

### Features

1. **Permission-based access**: API keys have granular permissions
2. **IP whitelisting**: Restrict API key usage to specific IPs
3. **Rate limiting**: Per-API-key rate limits
4. **Expiration**: Time-based API key expiration
5. **Revocation**: Instant API key revocation

### API Key Structure

```javascript
{
  id: UUID,
  app_id: UUID,
  key_hash: STRING,              // Hashed key (never plain text)
  key_prefix: STRING,            // First 8 chars for identification
  permissions: {
    read: true,
    write: true
  },
  allowed_ips: ['192.168.1.1', '10.0.0.1'],  // IP whitelist
  rate_limit_per_hour: 10000,    // Requests per hour
  expires_at: TIMESTAMP,
  is_active: BOOLEAN
}
```

### Using Permissions

```javascript
const { requirePermission } = require('./middleware/apiKey');

// Require write permission
router.post('/analytics/collect', 
  verifyApiKey,
  requirePermission('write'),
  ...
);

// Require read permission
router.get('/analytics/stats', 
  verifyApiKey,
  requirePermission('read'),
  ...
);
```

### IP Whitelisting

Configure allowed IPs when creating API keys:

```javascript
POST /api/auth/api-keys
{
  "name": "Production API Key",
  "appId": "...",
  "allowed_ips": ["192.168.1.1", "10.0.0.1"],
  "rate_limit_per_hour": 5000
}
```

## Protection Mechanisms

### 1. CSRF Protection

**Cross-Site Request Forgery** protection is enabled for all session-based requests:

- CSRF tokens are automatically generated for authenticated users
- Tokens must be included in POST/PUT/DELETE requests
- Token validation is automatic for all non-GET requests

```javascript
// Client-side: Include CSRF token in requests
fetch('/api/auth/apps', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': document.querySelector('[name=csrf-token]').content,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```

### 2. Request Size Limiting

Prevents large payload attacks:

- Maximum request size: 1MB (configurable)
- Applied to all routes
- Returns 413 (Payload Too Large) if exceeded

### 3. Rate Limiting

Multiple layers of rate limiting:

**Global Rate Limiting:**
```javascript
// All API routes: 100 requests per 15 minutes
app.use('/api/', apiLimiter);
```

**Per-User Rate Limiting:**
```javascript
// Analytics routes: 100 requests per minute per user
router.get('/analytics/stats', 
  perUserRateLimit(100, 60000),
  ...
);
```

**Per-API-Key Rate Limiting:**
```javascript
// Configurable per API key (default: 10,000/hour)
rate_limit_per_hour: 10000
```

### 4. Content Security Policy (CSP)

Strict CSP headers prevent XSS attacks:

```javascript
Content-Security-Policy: 
  default-src 'self'; 
  script-src 'self' 'unsafe-inline'; 
  style-src 'self' 'unsafe-inline'; 
  img-src 'self' data: https:;
```

### 5. Additional Security Headers

```javascript
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

## Audit Logging

### Audit Log Table

All sensitive operations are logged:

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID,
  action VARCHAR(50),           -- GET, POST, PUT, DELETE
  resource TEXT,                -- /api/auth/apps/:id
  ip_address VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);
```

### Security Events

Failed authentication attempts and suspicious activities:

```sql
CREATE TABLE security_events (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100),      -- api_key_invalid, sql_injection_attempt, etc.
  severity VARCHAR(20),         -- low, medium, high, critical
  ip_address VARCHAR(45),
  user_id UUID,
  description TEXT,
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP
);
```

### Logged Events

- Failed login attempts
- Invalid API key usage
- IP address blocks
- Rate limit violations
- SQL injection attempts
- XSS attempts
- Account deactivation access
- Unauthorized access attempts

### Viewing Security Logs

```sql
-- Recent security events
SELECT * FROM security_events 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- High severity events
SELECT * FROM security_events 
WHERE severity IN ('high', 'critical') 
AND resolved = FALSE
ORDER BY created_at DESC;

-- Failed API key attempts by IP
SELECT ip_address, COUNT(*) as attempts
FROM security_events
WHERE event_type = 'api_key_invalid'
AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 10
ORDER BY attempts DESC;
```

## Security Best Practices

### For Developers

1. **Never commit secrets**: Use environment variables
2. **Use parameterized queries**: Never concatenate SQL
3. **Validate all inputs**: Use express-validator
4. **Sanitize outputs**: Prevent XSS in responses
5. **Keep dependencies updated**: Run `npm audit` regularly
6. **Use HTTPS in production**: Force secure connections
7. **Implement proper error handling**: Don't leak sensitive info

### For API Consumers

1. **Secure API keys**: Never expose in client-side code
2. **Use HTTPS**: Always use secure connections
3. **Rotate keys regularly**: Implement key rotation policy
4. **Implement IP whitelisting**: Restrict key usage
5. **Monitor usage**: Watch for anomalies
6. **Set appropriate permissions**: Use read-only when possible
7. **Handle rate limits**: Implement exponential backoff

### For Administrators

1. **Monitor security logs**: Review daily
2. **Set up alerts**: Notify on critical events
3. **Regular security audits**: Review access patterns
4. **Update user roles**: Follow principle of least privilege
5. **Backup audit logs**: Store for compliance
6. **Incident response plan**: Prepare for breaches
7. **Regular penetration testing**: Test security measures

## Environment Variables

Security-related configuration:

```bash
# Session Security
SESSION_SECRET=your-super-secret-key-change-in-production

# CORS
CORS_ORIGIN=https://yourdomain.com  # Restrict in production

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000         # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100         # Max requests per window

# API Keys
API_KEY_DEFAULT_RATE_LIMIT=10000    # Default rate limit per hour

# Security
ENABLE_CSRF=true                    # Enable CSRF protection
TRUST_PROXY=1                       # For rate limiting behind proxy
```

## Incident Response

### Security Incident Detection

Monitor for:
- Unusual spike in failed authentication attempts
- High volume of requests from single IP
- SQL injection patterns in logs
- Suspicious user agent strings
- API key usage from unexpected IPs

### Response Procedures

1. **Identify the threat**
   ```sql
   SELECT * FROM security_events 
   WHERE severity = 'critical' 
   ORDER BY created_at DESC;
   ```

2. **Block the source**
   ```sql
   -- Add IP to blocklist
   INSERT INTO ip_blocklist (ip_address, reason, blocked_until)
   VALUES ('x.x.x.x', 'Multiple failed attempts', NOW() + INTERVAL '24 hours');
   ```

3. **Revoke compromised keys**
   ```sql
   UPDATE api_keys 
   SET is_active = FALSE, revoked_at = NOW()
   WHERE id = 'compromised-key-id';
   ```

4. **Deactivate affected accounts**
   ```sql
   UPDATE users 
   SET is_active = FALSE
   WHERE id = 'affected-user-id';
   ```

5. **Document the incident**
   ```sql
   INSERT INTO audit_logs (action, resource, metadata)
   VALUES ('SECURITY_INCIDENT', 'system', 
     '{"type": "brute_force", "actions_taken": ["ip_blocked", "keys_revoked"]}'::jsonb);
   ```

6. **Notify affected users**

7. **Review and improve**: Update security measures based on incident

## Compliance

This implementation supports:

- **GDPR**: User data protection and audit trails
- **SOC 2**: Security monitoring and logging
- **ISO 27001**: Information security management
- **PCI DSS**: If handling payment data (additional measures needed)

## Security Checklist

- [x] Input validation on all endpoints
- [x] Output sanitization (XSS prevention)
- [x] SQL injection prevention
- [x] CSRF protection for session-based auth
- [x] Rate limiting (global, per-user, per-API-key)
- [x] API key permissions and IP whitelisting
- [x] Secure password handling (OAuth only, no passwords stored)
- [x] HTTPS enforcement (production)
- [x] Security headers (CSP, HSTS, etc.)
- [x] Audit logging
- [x] Security event monitoring
- [x] Role-based access control
- [x] Request size limiting
- [x] Error message sanitization
- [x] Dependency vulnerability scanning

## Support

For security issues, please email: security@yourdomain.com

**Do not** open public issues for security vulnerabilities.

---

**Last Updated:** November 2025  
**Version:** 2.0.0

