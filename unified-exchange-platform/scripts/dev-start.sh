#!/bin/bash
# Development startup script - runs all services locally

set -e

echo "🚀 KK99 Exchange Platform - Development Environment"
echo "=================================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm is required"; exit 1; }
echo -e "${GREEN}✓ Prerequisites OK${NC}"

# Load environment
echo -e "${YELLOW}📦 Loading environment...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠️ .env file created from template - PLEASE UPDATE SECRETS${NC}"
fi
source .env

# Start Docker services
echo -e "${YELLOW}🐳 Starting Docker services...${NC}"
docker-compose up -d
sleep 5

# Initialize databases
echo -e "${YELLOW}🗄️ Initializing databases...${NC}"
bash infra/vault/init.sh
bash infra/kafka/setup.sh

# Install dependencies
echo -e "${YELLOW}📥 Installing dependencies...${NC}"
pnpm install

# Build backend
echo -e "${YELLOW}🔨 Building backend...${NC}"
pnpm run build -w apps/backend

# Build web
echo -e "${YELLOW}🔨 Building web...${NC}"
pnpm run build -w apps/web

# Build engine
echo -e "${YELLOW}🦀 Building Rust engine...${NC}"
cd apps/engine && cargo build --release && cd ../..

echo ""
echo -e "${GREEN}✅ All services ready!${NC}"
echo ""
echo "🌐 Access points:"
echo "  Frontend:        http://localhost:3000"
echo "  Backend API:     http://localhost:3001"
echo "  Vault:           http://localhost:8200 (token: root)"
echo "  Grafana:         http://localhost:3001/grafana"
echo "  Postgres:        localhost:5432"
echo ""
echo "📝 Start individual services:"
echo "  npm run dev:backend      # Backend API"
echo "  npm run dev:web          # Frontend"
echo "  npm run dev:engine       # Matching Engine"
echo ""
