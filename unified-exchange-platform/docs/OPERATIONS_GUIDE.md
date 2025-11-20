# 🚀 Complete Deployment & Operations Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Monitoring & Alerting](#monitoring--alerting)
5. [Backup & Disaster Recovery](#backup--disaster-recovery)
6. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] AWS Account with IAM permissions (EKS, RDS, ElastiCache, MSK)
- [ ] kubectl configured and authenticated
- [ ] Terraform CLI installed (v1.5+)
- [ ] Docker & Docker Compose (for local testing)
- [ ] Domain name (for production)
- [ ] SSL/TLS certificates

### Code Quality
- [ ] All tests passing: `npm run test && cargo test`
- [ ] No linting errors: `npm run lint`
- [ ] SAST scan passing: `trivy image kk99-backend`
- [ ] Security audit: `npm audit` and `cargo audit`

### Secrets & Configuration
- [ ] Admin email configured: `berkecansuskun1998@gmail.com`
- [ ] JWT secret generated (32+ chars, random)
- [ ] Database password generated (20+ chars, random)
- [ ] Vault encryption key backed up (safe location)
- [ ] API keys for external services (Binance, Polygon, etc.)

### Capacity Planning
- [ ] Estimate daily order volume
- [ ] Estimate concurrent users
- [ ] Estimate daily data ingestion (market data)
- [ ] Plan for 3x peak load

---

## Local Development Setup

### 1. Clone & Install

```bash
# Clone repository
git clone <repo-url>
cd unified-exchange-platform

# Install dependencies
bash setup.sh

# Copy environment template
cp .env.example .env
```

### 2. Configure `.env`

```bash
# Database
POSTGRES_USER=kk99_user
POSTGRES_PASSWORD=<random-32-char-password>
POSTGRES_DB=kk99_exchange

# Vault
VAULT_ADDR=http://localhost:8200
VAULT_TOKEN=<dev-token>

# JWT
JWT_SECRET=<random-32-char-key>
JWT_EXPIRES_IN=24h

# API
ADMIN_EMAIL=berkecansuskun1998@gmail.com
PORT=3001
HOST=0.0.0.0

# External APIs
BINANCE_API_KEY=<your-key>
BINANCE_API_SECRET=<your-secret>
POLYGON_API_KEY=<your-key>
FXCM_TOKEN=<your-token>

# Kafka
KAFKA_BROKERS=localhost:9092,localhost:9093,localhost:9094
KAFKA_SCHEMA_REGISTRY=http://localhost:8081

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain RPC
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<key>
SOL_RPC_URL=https://api.mainnet-beta.solana.com
TRON_RPC_URL=https://api.trongrid.io
BTC_API_URL=https://mempool.space/api
```

### 3. Start Services

```bash
# Start all services (Docker Compose)
docker-compose up -d

# Wait for services to be ready
sleep 30

# Initialize databases
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange < infra/postgres/init.sql
docker-compose exec -T postgres psql -U kk99_user -d kk99_exchange < infra/timescaledb/init.sql

# Initialize Vault
bash infra/vault/init.sh

# Initialize Kafka topics
bash infra/kafka/setup.sh

# Install backend dependencies
cd apps/backend && npm install && npm run build

# Install frontend dependencies
cd ../web && npm install && npm run build

# Start backend
npm run dev

# Start frontend (new terminal)
cd apps/web && npm run dev

# Start matching engine (new terminal)
cd apps/engine && cargo run --release
```

### 4. Verify Setup

```bash
# Check health
curl http://localhost:3001/health
# Response: {"status":"ok","timestamp":"..."}

# Check ready
curl http://localhost:3001/ready
# Response: {"status":"ready"}

# Access frontend
open http://localhost:3000

# Access Grafana
open http://localhost:3001/grafana
# Default: admin/admin

# Access Prometheus
open http://localhost:9090
```

---

## Production Deployment

### 1. Prepare AWS Infrastructure

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars << EOF
aws_region           = "us-east-1"
environment          = "prod"
cluster_name         = "kk99-exchange-prod"
node_count           = 5
node_instance_type   = "t3.xlarge"
postgres_instance    = "db.r5.2xlarge"
redis_instance       = "cache.r5.large"
EOF

# Plan deployment
terraform plan -out=tfplan

# Review plan, then apply
terraform apply tfplan

# Get outputs
terraform output

# Save output values for next steps
terraform output -json > outputs.json
```

### 2. Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region us-east-1 \
  --name kk99-exchange-prod

# Verify connection
kubectl get nodes
kubectl get all -n default
```

### 3. Create Namespace & Secrets

```bash
# Create namespace
kubectl create namespace exchange-prod

# Create secrets
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret="<32-char-secret>" \
  --from-literal=postgres-password="<db-password>" \
  --from-literal=vault-token="<vault-token>" \
  -n exchange-prod

kubectl create secret generic api-keys \
  --from-literal=binance-key="<key>" \
  --from-literal=binance-secret="<secret>" \
  --from-literal=polygon-key="<key>" \
  -n exchange-prod

# Verify secrets
kubectl get secrets -n exchange-prod
```

### 4. Deploy Services

```bash
# Deploy Vault
kubectl apply -f infra/kubernetes/01-vault.yaml -n exchange-prod
kubectl wait --for=condition=ready pod -l app=vault -n exchange-prod --timeout=300s

# Deploy PostgreSQL
kubectl apply -f infra/kubernetes/02-postgres.yaml -n exchange-prod
kubectl wait --for=condition=ready pod -l app=postgres -n exchange-prod --timeout=300s

# Initialize PostgreSQL
kubectl exec -it postgres-0 -n exchange-prod -- \
  psql -U postgres -f /docker-entrypoint-initdb.d/init.sql

# Deploy Kafka
kubectl apply -f infra/kubernetes/03-kafka.yaml -n exchange-prod
kubectl wait --for=condition=ready pod -l app=kafka -n exchange-prod --timeout=300s

# Deploy Backend API
kubectl apply -f infra/kubernetes/04-backend.yaml -n exchange-prod
kubectl wait --for=condition=ready pod -l app=backend -n exchange-prod --timeout=300s

# Deploy Redis
kubectl apply -f infra/kubernetes/05-redis.yaml -n exchange-prod
kubectl wait --for=condition=ready pod -l app=redis -n exchange-prod --timeout=300s
```

### 5. Configure Load Balancer & DNS

```bash
# Get Load Balancer IP
LB_IP=$(kubectl get svc backend-api -n exchange-prod -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Load Balancer: $LB_IP"

# Update Route53 (or your DNS provider)
# Create A record pointing to Load Balancer IP

# Get certificate (optional - if using ACM)
aws acm request-certificate \
  --domain-name api.kk99.io \
  --validation-method DNS \
  --region us-east-1
```

### 6. Verify Production Deployment

```bash
# Check all pods running
kubectl get pods -n exchange-prod -w

# Check services
kubectl get svc -n exchange-prod

# Check ingress
kubectl get ingress -n exchange-prod

# Test API endpoint
curl https://api.kk99.io/health

# Check logs
kubectl logs -f deployment/backend-api -n exchange-prod

# Monitor metrics
kubectl port-forward -n exchange-prod svc/prometheus 9090:9090
# Open http://localhost:9090
```

---

## Monitoring & Alerting

### 1. Prometheus Configuration

```bash
# Update prometheus config
kubectl create configmap prometheus-config \
  --from-file=infra/prometheus/prometheus.yml \
  -n exchange-prod \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart Prometheus
kubectl rollout restart deployment/prometheus -n exchange-prod
```

### 2. Grafana Dashboards

```bash
# Port-forward Grafana
kubectl port-forward -n exchange-prod svc/grafana 3000:3000

# Access at http://localhost:3000
# Default: admin/admin

# Add Prometheus as data source
# URL: http://prometheus:9090

# Import dashboards from infra/grafana/dashboards/
```

### 3. Set Up Alerts

```bash
# Create alert rules ConfigMap
kubectl create configmap alert-rules \
  --from-file=infra/prometheus/alert-rules.yml \
  -n exchange-prod

# Configure alertmanager for email/Slack
kubectl create secret generic alertmanager-config \
  --from-literal=alertmanager.yml="<config>" \
  -n exchange-prod
```

### Key Metrics to Monitor

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| Pod CPU | > 80% | Scale up |
| Pod Memory | > 85% | Scale up |
| DB Connections | > 80% of max | Investigate slow queries |
| Kafka Lag | > 10,000 msgs | Check consumer |
| Order Latency | > 100ms | Check engine |
| API Error Rate | > 1% | Page on-call |
| Trade Execution | > 1000µs | Investigate engine |

---

## Backup & Disaster Recovery

### 1. Database Backups

```bash
# Manual backup
bash scripts/kk99-cli.sh backup

# Automated backups (daily at 2 AM)
# Add to crontab:
# 0 2 * * * /usr/local/bin/kk99-cli.sh backup

# Verify backup
ls -lh backups/
```

### 2. Restore from Backup

```bash
# Restore specific backup
bash scripts/kk99-cli.sh restore backups/kk99_backup_20250120_020000.sql

# Time to restore: ~10-30 minutes depending on size
```

### 3. Point-in-Time Recovery (PITR)

```bash
# AWS RDS PITR (if using RDS)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier kk99-prod \
  --target-db-instance-identifier kk99-prod-pitr \
  --restore-time 2025-01-20T10:00:00Z
```

### 4. Kubernetes State Backup

```bash
# Backup all K8s resources
kubectl get all --all-namespaces -o yaml > k8s-backup.yaml

# Backup ConfigMaps/Secrets
kubectl get configmaps --all-namespaces -o yaml > configmaps-backup.yaml
kubectl get secrets --all-namespaces -o yaml > secrets-backup.yaml

# Store in S3
aws s3 cp k8s-backup.yaml s3://kk99-backups/
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```bash
# Check database pod
kubectl logs postgres-0 -n exchange-prod

# Check database service
kubectl describe svc postgres -n exchange-prod

# Test connection
kubectl run -it --rm debug --image=postgres:16 --restart=Never -- \
  psql -h postgres -U postgres -d kk99_exchange
```

#### 2. Kafka Consumer Lag Increasing

```bash
# Check consumer group
kafka-consumer-groups --bootstrap-server kafka-0:9092 --describe --group backend-consumer

# Reset consumer offset (if needed)
kafka-consumer-groups --bootstrap-server kafka-0:9092 --group backend-consumer --reset-offsets --to-latest --execute --topic order-events
```

#### 3. High Memory Usage

```bash
# Check pod memory
kubectl top pod -n exchange-prod

# Check node memory
kubectl top nodes

# Increase pod memory limit (edit deployment)
kubectl edit deployment backend-api -n exchange-prod
```

#### 4. Order Processing Slow

```bash
# Check engine metrics
kubectl port-forward -n exchange-prod svc/prometheus 9090:9090

# Query: rate(order_processing_time_ms[5m])
# Check if > 100ms

# Scale engine if needed
kubectl scale deployment engine --replicas=3 -n exchange-prod
```

#### 5. Storage Running Out

```bash
# Check disk usage
kubectl exec -it postgres-0 -n exchange-prod -- df -h

# Archive old data
kubectl exec -it postgres-0 -n exchange-prod -- \
  psql -U postgres -c "DELETE FROM market_data WHERE timestamp < NOW() - INTERVAL '1 YEAR';"

# Add more storage to PVC
kubectl edit pvc postgres-pvc -n exchange-prod
```

### Useful Commands

```bash
# Get all resources
kubectl get all -n exchange-prod

# Describe resource
kubectl describe pod <pod-name> -n exchange-prod

# View logs
kubectl logs <pod-name> -n exchange-prod
kubectl logs -f <pod-name> -n exchange-prod  # tail

# Execute command
kubectl exec -it <pod-name> -n exchange-prod -- bash

# Port forward
kubectl port-forward -n exchange-prod svc/<service> 9090:9090

# Scale deployment
kubectl scale deployment <name> --replicas=3 -n exchange-prod

# Update image
kubectl set image deployment/backend-api \
  backend-api=kk99:backend-v1.2.0 -n exchange-prod

# Get metrics
kubectl top nodes
kubectl top pod -n exchange-prod

# View events
kubectl get events -n exchange-prod

# View logs from multiple pods
kubectl logs -l app=backend -n exchange-prod --tail=100 -f
```

---

## Quick Reference

### CLI Commands

```bash
# Check status
kk99-cli.sh status

# View logs
kk99-cli.sh logs backend

# Restart service
kk99-cli.sh restart postgres

# Database backup
kk99-cli.sh backup

# Restore from backup
kk99-cli.sh restore backups/latest.sql

# Run tests
kk99-cli.sh test

# Show metrics
kk99-cli.sh metrics

# Deploy
kk99-cli.sh deploy prod
```

### Emergency Procedures

**Service Down?**
1. `kubectl get pods -n exchange-prod` - Check pod status
2. `kubectl logs <pod> -n exchange-prod` - Check errors
3. `kubectl describe pod <pod> -n exchange-prod` - Get details
4. `kubectl delete pod <pod> -n exchange-prod` - Force restart

**Database Locked?**
1. `kubectl exec -it postgres-0 -- psql -U postgres`
2. `SELECT * FROM pg_locks;` - View locks
3. `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='active';` - Kill sessions

**Out of Disk?**
1. `kubectl exec -it postgres-0 -- df -h`
2. Archive old data or add storage
3. Monitor with `watch kubectl top pod`

---

**Last Updated**: 2025-01-20  
**Maintained By**: KK99 Platform Team  
**Contact**: support@kk99.io
