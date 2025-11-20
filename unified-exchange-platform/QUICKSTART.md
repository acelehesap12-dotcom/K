# KK99 Exchange Platform - Quick Start Guide

## ⚡ 60-Second Startup

### Local Development (Docker + Node.js)

```bash
# 1. Clone & setup
cd unified-exchange-platform
cp .env.example .env
pnpm install

# 2. Start all services
docker-compose up -d

# 3. Wait for services to be ready
sleep 10

# 4. Initialize databases
bash infra/vault/init.sh
bash infra/kafka/setup.sh

# 5. Start backend, frontend, and engine
npm run dev    # This runs all in parallel

# ✅ Done! Open http://localhost:3000
```

## 🌐 First Login

**Demo Credentials:**
```
Email: demo@kk99.io
Password: demo123
```

Or register new account:
1. Go to http://localhost:3000/register
2. Fill in email, username, password
3. Confirm registration

## 💰 Deposit Crypto

1. Go to Dashboard → "Deposit Crypto"
2. Select blockchain (ETH, SOL, TRX, BTC)
3. Send minimum 0.01 to displayed address
4. Wait for 3-12 confirmations
5. KK99 balance updates automatically!

## 📈 Place Your First Trade

1. Go to Trading page
2. Select asset (BTC-USD, ETH-USD, etc.)
3. Choose BUY or SELL
4. Select LIMIT order type
5. Enter quantity & price
6. Click "Place Order"
7. Watch order book in real-time

## 🔌 Service Status

Check all services are healthy:

```bash
# Backend API
curl http://localhost:3001/health

# Postgres
psql -h localhost -U exchange_user -d exchange_db -c "SELECT 1"

# Kafka
docker exec exchange-kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Vault
curl http://localhost:8200/v1/sys/health

# Redis
redis-cli -h localhost ping
```

## 📊 Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Register or demo@kk99.io/demo123 |
| Backend Docs | http://localhost:3001/api-docs | None |
| Grafana | http://localhost:3001/grafana | admin/admin |
| Vault | http://localhost:8200 | Token: root |
| Kafka Topics | `docker exec exchange-kafka kafka-topics --list --bootstrap-server localhost:9092` | N/A |

## 🛑 Stop Services

```bash
# Stop all containers
docker-compose down

# Remove volumes (⚠️ deletes data)
docker-compose down -v
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000
kill -9 <PID>
```

### Database Connection Error
```bash
# Check Postgres is running
docker ps | grep postgres

# Inspect logs
docker logs exchange-postgres
```

### Kafka Not Ready
```bash
# Check Kafka broker
docker logs exchange-kafka

# Test connection
kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

### Frontend Blank Screen
```bash
# Clear browser cache
# Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

# Check console for errors
# Open DevTools: F12
```

## 📚 Next Steps

1. **Read Architecture**: `docs/ARCHITECTURE.md`
2. **API Documentation**: `docs/openapi.yaml`
3. **Security Info**: `docs/SECURITY.md`
4. **Deployment**: `docs/DEPLOYMENT.md`
5. **Backend Code**: `apps/backend/src/`
6. **Rust Engine**: `apps/engine/src/`
7. **Frontend Code**: `apps/web/src/`

## 🚀 Production Deployment

For AWS EKS deployment:
```bash
bash scripts/deploy-eks.sh
```

For detailed instructions, see `docs/DEPLOYMENT.md`

## 💬 Support

- **Issues**: GitHub Issues
- **Docs**: See `docs/` folder
- **Email**: support@kk99.io
- **Chat**: Slack community

## 🎯 Key Commands

```bash
# Development
npm run dev              # Start all services
npm run dev:backend      # Start only backend
npm run dev:web          # Start only web
npm run dev:engine       # Start only Rust engine

# Building
npm run build            # Build all
pnpm run build -w apps/backend   # Build backend only

# Testing
npm run test             # Run all tests
npm run lint             # Lint code

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed test data

# Kubernetes
npm run k8s:up           # Deploy to K8s
npm run k8s:down         # Remove from K8s

# Docker
docker-compose logs -f   # Watch logs
docker-compose ps        # See running services
```

## 📋 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 8+ cores |
| **RAM** | 4GB | 16GB+ |
| **Storage** | 20GB | 100GB+ |
| **Network** | 100Mbps | 1Gbps |
| **OS** | Linux/Mac/Win | Linux (Ubuntu 22.04) |

## ✅ Checklist

Before going live:
- [ ] Set strong `.env` passwords
- [ ] Configure real blockchain nodes
- [ ] Set admin email in auth
- [ ] Enable HTTPS/TLS
- [ ] Configure database backups
- [ ] Set up monitoring alerts
- [ ] Run security audit
- [ ] Test disaster recovery
- [ ] Train support team
- [ ] Create runbooks

## 🎓 Learning Resources

1. **Fastify**: https://www.fastify.io/docs/
2. **React**: https://react.dev/
3. **Rust**: https://doc.rust-lang.org/
4. **Kubernetes**: https://kubernetes.io/docs/
5. **PostgreSQL**: https://www.postgresql.org/docs/
6. **Kafka**: https://kafka.apache.org/docs/
7. **Vault**: https://www.vaultproject.io/docs/

Enjoy trading! 🚀
