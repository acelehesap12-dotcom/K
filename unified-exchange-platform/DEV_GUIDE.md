# 🎯 Development Environment Guide - Complete Setup

## Quick Start (5 Minutes)

```bash
# 1. Clone repository
git clone <repo-url> && cd unified-exchange-platform

# 2. Run setup script
bash setup.sh

# 3. Start all services
docker-compose up -d

# 4. Wait for services
sleep 10

# 5. Initialize databases
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange < infra/postgres/init.sql

# 6. Start backend
cd apps/backend && npm run dev

# 7. Start frontend (new terminal)
cd apps/web && npm run dev

# 8. Open browser
open http://localhost:3000
```

---

## Prerequisites

### System Requirements
- **OS**: macOS, Linux, or WSL2 (Windows)
- **RAM**: 8GB minimum (16GB recommended)
- **Disk**: 20GB available
- **CPU**: 4+ cores

### Required Tools
- [Git](https://git-scm.com/downloads)
- [Docker](https://www.docker.com/products/docker-desktop) (Desktop or Engine)
- [Docker Compose](https://docs.docker.com/compose/install/) v2.0+
- [Node.js](https://nodejs.org/) 18.0+ (LTS)
- [npm](https://www.npmjs.com/) 9.0+
- [Rust](https://www.rust-lang.org/tools/install) 1.70+
- [pnpm](https://pnpm.io/installation) 8.0+

### Verify Installation
```bash
node --version        # v18.19.0 or higher
npm --version         # 9.0.0 or higher
docker --version      # Docker version 24.0+
docker-compose --version  # Docker Compose version 2.20+
rustc --version       # rustc 1.73.0 or higher
```

---

## Environment Configuration

### 1. Create `.env` File
```bash
cp .env.example .env
```

### 2. Edit `.env` with Your Values

```bash
# ============ DATABASE ============
POSTGRES_USER=kk99_user
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=kk99_exchange
POSTGRES_PORT=5432

# ============ VAULT ============
VAULT_ADDR=http://localhost:8200
VAULT_SKIP_VERIFY=true
VAULT_TOKEN=dev-root-token
VAULT_NAMESPACE=

# ============ JWT ============
JWT_SECRET=your_jwt_secret_at_least_32_chars_long_here
JWT_EXPIRES_IN=24h

# ============ API ============
ADMIN_EMAIL=berkecansuskun1998@gmail.com
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# ============ EXTERNAL APIs ============
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
POLYGON_API_KEY=your_polygon_api_key
FXCM_TOKEN=your_fxcm_token

# ============ BLOCKCHAIN RPC ============
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/your_alchemy_key
SOL_RPC_URL=https://api.mainnet-beta.solana.com
TRON_RPC_URL=https://api.trongrid.io
BTC_API_URL=https://mempool.space/api

# ============ KAFKA ============
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_SCHEMA_REGISTRY=http://localhost:8081

# ============ REDIS ============
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# ============ LOGGING ============
LOG_LEVEL=debug
LOG_FORMAT=json
```

---

## Step-by-Step Setup

### Step 1: Install Dependencies

```bash
# Install pnpm (if not already installed)
npm install -g pnpm

# Install root dependencies
pnpm install

# Install workspace dependencies
pnpm install -r

# Install specific workspace
cd apps/backend && pnpm install
cd ../engine && cargo build
cd ../web && pnpm install
```

### Step 2: Start Docker Services

```bash
# Start all services in background
docker-compose up -d

# Monitor startup
docker-compose logs -f

# Verify all containers running
docker-compose ps
```

Expected output:
```
STATUS          CONTAINER ID    IMAGE               NAMES
Up 2 minutes    ...              postgres:16         kk99-postgres
Up 2 minutes    ...              vault:latest        kk99-vault
Up 2 minutes    ...              zookeeper:latest    kk99-zookeeper
Up 1 minute     ...              kafka:latest        kk99-kafka (3 instances)
Up 1 minute     ...              redis:latest        kk99-redis
```

### Step 3: Initialize Databases

```bash
# Initialize PostgreSQL
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange < infra/postgres/init.sql

# Initialize TimescaleDB
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange < infra/timescaledb/init.sql

# Verify database
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange -c "SELECT COUNT(*) FROM users;"
# Should output: count = 0
```

### Step 4: Initialize Vault

```bash
# Initialize Vault with root token
bash infra/vault/init.sh

# Verify Vault is ready
curl -s http://localhost:8200/v1/sys/health | jq

# Check wallet secrets
curl -s -H "X-Vault-Token: dev-root-token" \
  http://localhost:8200/v1/secret/data/wallets | jq
```

### Step 5: Setup Kafka Topics

```bash
# Create topics and register schemas
bash infra/kafka/setup.sh

# Verify topics
docker-compose exec -T kafka kafka-topics.sh \
  --list \
  --bootstrap-server localhost:9092

# Expected topics:
# - user-events
# - deposit-events
# - order-events
# - trade-events
# - market-data
```

### Step 6: Start Backend API

```bash
# Terminal 1: Backend
cd apps/backend
pnpm run dev

# Expected output:
# [INFO] Server running on 0.0.0.0:3001
# [INFO] Connected to Vault
# [INFO] Kafka producer initialized
```

### Step 7: Start Frontend

```bash
# Terminal 2: Frontend
cd apps/web
pnpm run dev

# Expected output:
# ➜  Local:   http://127.0.0.1:5173/
# ➜  press h to show help
```

### Step 8: Start Matching Engine (Optional)

```bash
# Terminal 3: Engine
cd apps/engine
cargo run --release

# Expected output:
# Starting KK99 Exchange Matching Engine
# Matching Engine initialized
# Listening for orders
```

---

## Health Checks

### 1. API Health

```bash
# Basic health check
curl http://localhost:3001/health
# Response: {"status":"ok","timestamp":"..."}

# Readiness check
curl http://localhost:3001/ready
# Response: {"status":"ready"}
```

### 2. Database Connection

```bash
# Check PostgreSQL
docker-compose exec -T postgres psql -U kk99_user -c "SELECT 1;"

# Check TimescaleDB
docker-compose exec -T postgres psql -U kk99_user -c "SELECT * FROM hypertable_information;"
```

### 3. Services

```bash
# Check Vault
curl http://localhost:8200/v1/sys/seal-status

# Check Redis
docker-compose exec redis redis-cli ping
# Response: PONG

# Check Kafka
docker-compose exec -T kafka kafka-broker-api-versions.sh \
  --bootstrap-server localhost:9092 | grep "ApiVersion"
```

### 4. Frontend

```bash
open http://localhost:3000

# Or use curl
curl http://localhost:5173 -I
# Should return 200 OK
```

---

## Common Development Tasks

### Running Tests

```bash
# Test backend
cd apps/backend
pnpm test

# Watch mode
pnpm test --watch

# Test coverage
pnpm test --coverage

# Test specific file
pnpm test auth.test.ts

# Test engine
cd apps/engine
cargo test

# Test all with integration
cargo test --all --release
```

### Building

```bash
# Build backend
cd apps/backend
pnpm build

# Build frontend
cd apps/web
pnpm build
# Output: dist/ folder

# Build engine
cd apps/engine
cargo build --release
# Output: target/release/engine

# Build all
pnpm build -r
```

### Code Quality

```bash
# Lint TypeScript
pnpm lint

# Format code
pnpm format

# Type check
pnpm type-check

# Lint Rust
cd apps/engine
cargo clippy

# Format Rust
cargo fmt
```

### Database Operations

```bash
# Backup
bash scripts/kk99-cli.sh backup

# View backups
ls -lh backups/

# Restore
bash scripts/kk99-cli.sh restore backups/kk99_backup_*.sql

# Query database
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange

# Common queries
SELECT * FROM users;
SELECT COUNT(*) FROM orders;
SELECT * FROM trades ORDER BY created_at DESC LIMIT 10;
```

### Service Management

```bash
# View logs
docker-compose logs -f postgres
docker-compose logs -f backend

# Restart service
docker-compose restart postgres

# Stop all services
docker-compose stop

# Start services
docker-compose start

# Remove all containers (warning: data loss!)
docker-compose down

# Full reset (data + volumes)
docker-compose down -v
```

### Monitoring

```bash
# View metrics
curl http://localhost:3001/metrics

# Monitor in real-time
watch curl http://localhost:9090/api/v1/query?query=orders_created_total

# View logs with tail
docker-compose logs --tail=100 -f backend

# Check resource usage
docker stats
```

---

## Debugging Guide

### Backend Issues

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm run dev

# Check Vault connection
curl -v http://localhost:8200/v1/sys/health

# Test database pool
PGPASSWORD=your_password psql -h localhost -U kk99_user -d kk99_exchange -c "\dt"

# View raw HTTP requests
curl -v http://localhost:3001/health

# Check port in use
lsof -i :3001
```

### Frontend Issues

```bash
# Clear browser cache
# Settings → Clear Browsing Data (all time)

# Check browser console
# Ctrl+Shift+J (Windows/Linux) or Cmd+Option+J (Mac)

# View network requests
# Network tab in DevTools

# Check local storage
# Application → Local Storage → http://localhost:3000
```

### Docker Issues

```bash
# Rebuild images
docker-compose build --no-cache

# View container logs
docker-compose logs -f service_name

# Enter container shell
docker-compose exec service_name bash

# Check disk space
docker system df

# Prune unused images
docker system prune -a
```

### Database Issues

```bash
# Check connections
docker-compose exec -T postgres psql -U kk99_user -c "SELECT * FROM pg_stat_activity;"

# Kill idle connections
docker-compose exec -T postgres psql -U kk99_user -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle';"

# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;

# Check disk usage
docker-compose exec -T postgres df -h
```

---

## Performance Optimization

### Database

```bash
# Enable query logging
docker-compose exec -T postgres psql -U kk99_user -c \
  "ALTER SYSTEM SET log_min_duration_statement = 100;"

# Vacuum and analyze
docker-compose exec -T postgres psql -U kk99_user -c \
  "VACUUM ANALYZE;"

# Reindex
docker-compose exec -T postgres psql -U kk99_user -c \
  "REINDEX DATABASE kk99_exchange;"
```

### API

```bash
# Profile requests
curl -w "@/dev/stdin" -o /dev/null -s http://localhost:3001/health <<EOF
    time_namelookup:  %{time_namelookup}
    time_connect:     %{time_connect}
    time_appconnect:  %{time_appconnect}
    time_pretransfer: %{time_pretransfer}
    time_redirect:    %{time_redirect}
    time_starttransfer: %{time_starttransfer}
    ----------
    time_total:       %{time_total}
EOF
```

---

## Project Structure

```
unified-exchange-platform/
├── apps/
│   ├── backend/          # Node.js API
│   │   ├── src/          # TypeScript source
│   │   ├── tests/        # Test files
│   │   └── Dockerfile
│   ├── engine/           # Rust matching engine
│   │   ├── src/          # Rust source
│   │   └── Cargo.toml
│   └── web/              # React frontend
│       ├── src/          # React components
│       ├── vite.config.ts
│       └── dist/         # Built files
├── infra/
│   ├── kubernetes/       # K8s manifests
│   ├── terraform/        # IaC for AWS
│   ├── postgres/         # Database schema
│   ├── kafka/            # Message schemas
│   └── vault/            # Secrets setup
├── services/             # Supporting services
│   ├── market-surveillance/
│   └── quant-studio/
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── docker-compose.yml    # Local setup
├── package.json          # Workspace config
└── README.md
```

---

## Useful Commands

```bash
# Quick status check
kk99-cli.sh status

# View all services
docker-compose ps

# Follow logs
docker-compose logs -f

# API test
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'

# WebSocket test (node)
node -e "
const ws = new WebSocket('ws://localhost:3001/ws/user1');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log(e.data);
ws.onerror = (e) => console.error(e);
"

# Database backup
docker-compose exec -T postgres pg_dump -U kk99_user kk99_exchange > backup.sql

# Monitor metrics
watch 'curl -s http://localhost:3001/metrics | grep -E "^(orders|trades|http_requests)" | head -20'
```

---

## Troubleshooting Checklist

| Issue | Solution |
|-------|----------|
| Port already in use | `lsof -i :PORT` and kill process |
| Database won't start | `docker-compose down -v && docker-compose up -d postgres` |
| Can't connect to Vault | Check `VAULT_ADDR` in `.env` and `vault-init.sh` log |
| Kafka topics not created | Re-run `bash infra/kafka/setup.sh` |
| WebSocket errors | Check JWT token validity and admin email config |
| Build fails | Clear cache: `rm -rf node_modules && pnpm install` |
| Tests failing | Ensure all services running: `docker-compose up -d` |
| Performance issues | Check `docker stats` and `kubectl top pod` |

---

## Additional Resources

- **Backend API Docs**: http://localhost:3001/docs
- **Grafana Dashboards**: http://localhost:3001/grafana (admin/admin)
- **Prometheus**: http://localhost:9090
- **PostgreSQL**: localhost:5432 (psql)
- **Redis CLI**: `docker-compose exec redis redis-cli`
- **Vault UI**: http://localhost:8200/ui

---

## Getting Help

```bash
# View help
kk99-cli.sh help

# Check service status
kk99-cli.sh status

# View logs
kk99-cli.sh logs backend

# Submit issue
# GitHub: <repo-url>/issues
# Email: support@kk99.io
```

---

**Last Updated**: November 20, 2025  
**Version**: 2.0  
**Maintainer**: KK99 Platform Team
