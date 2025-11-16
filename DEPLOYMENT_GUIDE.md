# Deployment Guide - Website Analytics API

This guide covers deploying the Website Analytics API to various cloud platforms.

## Table of Contents
- [Render Deployment](#render-deployment)
- [Railway Deployment](#railway-deployment)
- [Heroku Deployment](#heroku-deployment)
- [AWS Deployment](#aws-deployment)
- [DigitalOcean Deployment](#digitalocean-deployment)

---

## Render Deployment

### Prerequisites
- Render account ([render.com](https://render.com))
- GitHub repository with your code

### Step 1: Create PostgreSQL Database

1. Log in to Render Dashboard
2. Click **New +** → **PostgreSQL**
3. Configure:
   - Name: `analytics-db`
   - Database: `analytics_db`
   - User: `postgres`
   - Region: Choose closest to your users
   - Plan: Free (or paid for production)
4. Click **Create Database**
5. Copy the **Internal Database URL** for later

### Step 2: Create Redis Instance

1. Click **New +** → **Redis**
2. Configure:
   - Name: `analytics-redis`
   - Region: Same as database
   - Plan: Free (or paid)
3. Click **Create Redis**
4. Copy the **Internal Redis URL**

### Step 3: Deploy Web Service

1. Click **New +** → **Web Service**
2. Connect your GitHub repository
3. Configure:
   - Name: `analytics-api`
   - Environment: **Docker**
   - Region: Same as database
   - Branch: `main`
   - Plan: Free (or paid)

### Step 4: Set Environment Variables

Add these environment variables:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=<internal-postgres-url-from-step-1>
REDIS_URL=<internal-redis-url-from-step-2>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_CALLBACK_URL=https://<your-app-name>.onrender.com/api/auth/google/callback
SESSION_SECRET=<generate-random-string>
API_BASE_URL=https://<your-app-name>.onrender.com
```

### Step 5: Deploy

1. Click **Create Web Service**
2. Wait for deployment to complete (5-10 minutes)
3. Visit your app at `https://<your-app-name>.onrender.com`

### Step 6: Run Database Migration

1. Go to your Web Service → **Shell**
2. Run: `npm run db:migrate`

### Step 7: Update Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Add authorized redirect URI: `https://<your-app-name>.onrender.com/api/auth/google/callback`

---

## Railway Deployment

### Prerequisites
- Railway account ([railway.app](https://railway.app))
- Railway CLI installed

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Step 2: Initialize Project

```bash
cd thealter
railway init
```

### Step 3: Add Services

```bash
# Add PostgreSQL
railway add --database postgresql

# Add Redis
railway add --database redis

# Link to your project
railway link
```

### Step 4: Set Environment Variables

Create a `railway.json` file:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

Set variables:

```bash
railway variables set NODE_ENV=production
railway variables set GOOGLE_CLIENT_ID=<your-client-id>
railway variables set GOOGLE_CLIENT_SECRET=<your-client-secret>
railway variables set SESSION_SECRET=<random-string>
```

### Step 5: Deploy

```bash
railway up
```

### Step 6: Get Your URL

```bash
railway domain
```

Update `GOOGLE_CALLBACK_URL`:
```bash
railway variables set GOOGLE_CALLBACK_URL=https://<your-url>/api/auth/google/callback
```

### Step 7: Run Migration

```bash
railway run npm run db:migrate
```

---

## Heroku Deployment

### Prerequisites
- Heroku account ([heroku.com](https://heroku.com))
- Heroku CLI installed

### Step 1: Install Heroku CLI

```bash
# macOS
brew tap heroku/brew && brew install heroku

# Linux
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login
```

### Step 2: Create Heroku App

```bash
cd thealter
heroku create analytics-api-yourname
```

### Step 3: Add Add-ons

```bash
# PostgreSQL
heroku addons:create heroku-postgresql:mini

# Redis
heroku addons:create heroku-redis:mini
```

### Step 4: Set Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set GOOGLE_CLIENT_ID=<your-client-id>
heroku config:set GOOGLE_CLIENT_SECRET=<your-client-secret>
heroku config:set SESSION_SECRET=<random-string>
heroku config:set API_BASE_URL=https://<your-app>.herokuapp.com

# Callback URL
heroku config:set GOOGLE_CALLBACK_URL=https://<your-app>.herokuapp.com/api/auth/google/callback
```

### Step 5: Deploy

```bash
# Set buildpack for Docker
heroku stack:set container

# Deploy
git push heroku main
```

### Step 6: Run Migration

```bash
heroku run npm run db:migrate
```

### Step 7: Open App

```bash
heroku open
```

---

## AWS Deployment (ECS with Fargate)

### Prerequisites
- AWS account
- AWS CLI configured
- Docker installed

### Step 1: Create RDS PostgreSQL Database

```bash
aws rds create-db-instance \
  --db-instance-identifier analytics-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username postgres \
  --master-user-password <your-password> \
  --allocated-storage 20 \
  --vpc-security-group-ids <security-group-id> \
  --publicly-accessible
```

### Step 2: Create ElastiCache Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id analytics-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### Step 3: Build and Push Docker Image

```bash
# Create ECR repository
aws ecr create-repository --repository-name analytics-api

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t analytics-api .

# Tag image
docker tag analytics-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/analytics-api:latest

# Push image
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/analytics-api:latest
```

### Step 4: Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name analytics-cluster
```

### Step 5: Create Task Definition

Create `task-definition.json`:

```json
{
  "family": "analytics-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "analytics-api",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/analytics-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        { "name": "NODE_ENV", "value": "production" },
        { "name": "PORT", "value": "3000" },
        { "name": "DB_HOST", "value": "<rds-endpoint>" },
        { "name": "REDIS_HOST", "value": "<elasticache-endpoint>" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/analytics-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

Register task:

```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### Step 6: Create Service

```bash
aws ecs create-service \
  --cluster analytics-cluster \
  --service-name analytics-api-service \
  --task-definition analytics-api \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-id>],securityGroups=[<security-group-id>],assignPublicIp=ENABLED}"
```

### Step 7: Set Up Load Balancer (Optional but Recommended)

Create Application Load Balancer and target group, then update ECS service to use it.

---

## DigitalOcean Deployment

### Prerequisites
- DigitalOcean account
- `doctl` CLI installed

### Step 1: Create PostgreSQL Database

1. Go to DigitalOcean Dashboard
2. **Databases** → **Create Database Cluster**
3. Choose PostgreSQL
4. Select region and plan
5. Create and note connection details

### Step 2: Create Redis Database

1. **Databases** → **Create Database Cluster**
2. Choose Redis
3. Same region as PostgreSQL
4. Create and note connection details

### Step 3: Create App

1. **Apps** → **Create App**
2. Connect GitHub repository
3. Choose Docker as build method
4. Configure:
   - Name: `analytics-api`
   - Region: Same as databases
   - Plan: Basic ($5/month or higher)

### Step 4: Add Environment Variables

In App settings, add:

```
NODE_ENV=production
DATABASE_URL=<postgres-connection-string>
REDIS_URL=<redis-connection-string>
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_CALLBACK_URL=https://<your-app>.ondigitalocean.app/api/auth/google/callback
SESSION_SECRET=<random-string>
```

### Step 5: Deploy

Click **Deploy** and wait for completion.

---

## Post-Deployment Checklist

After deploying to any platform:

- [ ] ✅ Update Google OAuth callback URL
- [ ] ✅ Run database migration
- [ ] ✅ Test health endpoint: `GET /health`
- [ ] ✅ Test Google login flow
- [ ] ✅ Register a test app and get API key
- [ ] ✅ Test event collection with API key
- [ ] ✅ Test analytics endpoints
- [ ] ✅ Check API documentation: `/api-docs`
- [ ] ✅ Set up monitoring/logging
- [ ] ✅ Configure custom domain (optional)
- [ ] ✅ Set up SSL certificate (automatic on most platforms)
- [ ] ✅ Configure backups for database
- [ ] ✅ Update README with deployment URL

---

## Monitoring & Maintenance

### Health Checks

Set up automated health checks to monitor:
- API availability: `GET /health`
- Database connectivity
- Redis connectivity
- Response times

### Logging

Most platforms provide built-in logging:
- **Render**: View logs in dashboard or `render logs`
- **Railway**: `railway logs`
- **Heroku**: `heroku logs --tail`
- **AWS**: CloudWatch Logs

### Scaling

#### Horizontal Scaling
- **Render/Railway/Heroku**: Increase number of instances
- **AWS**: Update ECS service desired count

#### Vertical Scaling
- Upgrade to larger instance/plan
- Increase database resources

### Backups

- **PostgreSQL**: Enable automated backups (7-30 days retention)
- **Redis**: Enable persistence (RDB/AOF)
- **Regular exports**: Schedule periodic data exports

### Security

- Keep dependencies updated: `npm audit`
- Rotate API keys regularly
- Monitor for suspicious activity
- Use strong SESSION_SECRET
- Enable 2FA on cloud platform accounts

---

## Troubleshooting

### App Won't Start

1. Check environment variables are set
2. View logs for error messages
3. Verify database/Redis connectivity
4. Check Docker build succeeded

### Database Connection Fails

1. Verify DATABASE_URL is correct
2. Check database is running
3. Verify network access (firewall/security groups)
4. Test connection from terminal

### Google OAuth Fails

1. Verify callback URL matches Google Console
2. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
3. Ensure Google+ API is enabled
4. Check redirect URI is whitelisted

### High Response Times

1. Check database query performance
2. Verify Redis is connected and working
3. Add more caching
4. Scale horizontally
5. Optimize database indexes

---

## Cost Optimization

### Free Tier Options

- **Render**: Free tier available (sleeps after 15 min inactivity)
- **Railway**: $5 credit/month on free plan
- **Heroku**: No longer offers free tier
- **AWS**: Free tier for 12 months (limited resources)

### Production Recommendations

**Small Scale (< 10k events/day)**:
- Render: Starter ($7/month) + PostgreSQL ($7/month) + Redis ($10/month)
- Railway: ~$10-20/month total
- Total: ~$15-25/month

**Medium Scale (10k-100k events/day)**:
- Render: Standard ($25/month) + PostgreSQL Pro ($15/month) + Redis Pro ($15/month)
- Railway: ~$40-60/month
- Total: ~$50-70/month

**Large Scale (100k+ events/day)**:
- AWS ECS: Fargate + RDS + ElastiCache
- DigitalOcean App Platform + Managed Databases
- Estimated: $100-300/month depending on traffic

---

## Support

For deployment issues:
- Check platform documentation
- Contact platform support
- Open issue on GitHub
- Review logs for error details

---

**Happy Deploying! 🚀**

