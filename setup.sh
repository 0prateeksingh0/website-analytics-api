#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Website Analytics API Setup${NC}\n"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.example...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}⚠️  Please update .env file with your configuration before continuing.${NC}"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down

# Build and start containers
echo -e "${GREEN}🔨 Building Docker images...${NC}"
docker-compose build

echo -e "${GREEN}🚀 Starting containers...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 10

# Check if services are running
if [ "$(docker-compose ps -q | wc -l)" -eq 3 ]; then
    echo -e "${GREEN}✅ All services are running!${NC}\n"
    echo -e "${GREEN}📚 API Documentation: http://localhost:3000/api-docs${NC}"
    echo -e "${GREEN}🔗 API Base URL: http://localhost:3000/api${NC}"
    echo -e "${GREEN}💾 Database: PostgreSQL on localhost:5432${NC}"
    echo -e "${GREEN}🔴 Redis: localhost:6379${NC}\n"
    echo -e "${YELLOW}📋 View logs: docker-compose logs -f${NC}"
    echo -e "${YELLOW}🛑 Stop services: docker-compose down${NC}\n"
else
    echo -e "${RED}❌ Some services failed to start. Check logs: docker-compose logs${NC}"
    exit 1
fi

