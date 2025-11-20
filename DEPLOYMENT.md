# 🌐 KK99 Exchange - Production Deployment

## 🚀 Dağıtım Seçenekleri

### 1️⃣ **Docker Compose (En Hızlı)**
Tek sunucuda tüm servisleri çalıştır.

```bash
# Production build
docker-compose -f docker-compose.prod.yml up -d

# Ölçeklendirme
docker-compose -f docker-compose.prod.yml up -d --scale backend=3
```

**Gereksinimler:**
- Docker 24+
- 8GB RAM
- 50GB Disk
- Domain adı (opsiyonel)

---

### 2️⃣ **Kubernetes (AWS EKS)**
Production-grade, otomatik ölçeklendirme.

```bash
# 1. Cluster oluştur
cd infra/terraform/aws
terraform init
terraform apply

# 2. Deploy
kubectl apply -f infra/kubernetes/

# 3. Ingress ayarla
kubectl apply -f infra/kubernetes/ingress/

# 4. Domain bağla
# DNS A Record: exchange.yourdomain.com → Load Balancer IP
```

**Gereksinimler:**
- AWS hesabı
- kubectl yüklü
- Domain adı
- SSL sertifikası (Let's Encrypt)

**Maliyet:** ~$150-500/ay

---

### 3️⃣ **Vercel + Railway (Serverless)**
Frontend Vercel'de, Backend Railway'de.

#### Frontend (Vercel):
```bash
cd apps/web

# Vercel CLI yükle
npm i -g vercel

# Deploy
vercel --prod
```

#### Backend (Railway):
```bash
# Railway CLI yükle
npm i -g @railway/cli

# Login
railway login

# Deploy
cd apps/backend
railway up
```

**Maliyet:** $0-50/ay (başlangıç için ücretsiz)

---

### 4️⃣ **DigitalOcean App Platform**
En basit, yönetilen servis.

1. GitHub repo'yu bağla
2. App Platform'da "Create App"
3. `apps/web` klasörünü seç (Frontend)
4. `apps/backend` klasörünü seç (Backend)
5. Environment variables ekle
6. Deploy!

**Maliyet:** ~$12-40/ay

---

## 🔐 Environment Variables (Tüm Platformlar)

### Backend (.env):
```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/exchange_db
REDIS_URL=redis://host:6379

# APIs
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
POLYGON_API_KEY=your_polygon_key

# Blockchain
ALCHEMY_API_KEY=your_alchemy_key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Security
JWT_SECRET=your-super-secret-jwt-key-change-this
VAULT_TOKEN=your-vault-token

# Kafka
KAFKA_BROKERS=kafka:9092
SCHEMA_REGISTRY=http://schema-registry:8081
```

### Frontend (.env):
```env
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
VITE_ENVIRONMENT=production
```

---

## 🌍 Domain Ayarları

### DNS Records:
```
# Frontend
Type: CNAME
Name: www
Value: yourdomain.vercel.app

# Backend
Type: A
Name: api
Value: <Load Balancer IP>

# WebSocket
Type: CNAME
Name: ws
Value: api.yourdomain.com
```

### SSL/TLS:
```bash
# Let's Encrypt (ücretsiz)
certbot certonly --dns-cloudflare \
  -d yourdomain.com \
  -d api.yourdomain.com \
  -d ws.yourdomain.com
```

---

## 📊 Monitoring (Production)

### Prometheus + Grafana:
```bash
# Prometheus
kubectl apply -f infra/kubernetes/monitoring/prometheus.yaml

# Grafana
kubectl apply -f infra/kubernetes/monitoring/grafana.yaml

# Access
kubectl port-forward svc/grafana 3000:3000
# http://localhost:3000
# User: admin / Pass: (check secret)
```

### Datadog:
```bash
# Install agent
helm install datadog-agent \
  --set datadog.apiKey=<YOUR_KEY> \
  datadog/datadog

# Dashboard
# https://app.datadoghq.com
```

### Sentry (Error Tracking):
```typescript
// Backend
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: "production",
});

// Frontend
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: "production",
});
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions:
```yaml
# .github/workflows/deploy.yml
name: Deploy Production

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build & Push Docker
        run: |
          docker build -t registry.digitalocean.com/kk99/backend:latest apps/backend
          docker push registry.digitalocean.com/kk99/backend:latest
      - name: Deploy to K8s
        run: kubectl rollout restart deployment/backend

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Vercel
        run: vercel --prod --token=${{ secrets.VERCEL_TOKEN }}
```

---

## 📈 Scalability

### Auto-scaling (K8s):
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Load Balancer:
```yaml
# NGINX Ingress
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: exchange-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: exchange-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 3000
```

---

## 🛡️ Security Checklist

- [ ] SSL/TLS sertifikası yüklü
- [ ] Firewall kuralları aktif
- [ ] Rate limiting ayarlı
- [ ] CORS doğru yapılandırılmış
- [ ] API anahtarları şifreli (Vault)
- [ ] Database şifreli bağlantı
- [ ] DDoS koruması (Cloudflare)
- [ ] WAF aktif (Web Application Firewall)
- [ ] Security headers ayarlı
- [ ] Secrets rotation aktif

---

## 💰 Maliyet Tahmini

### Starter (0-1000 kullanıcı):
| Servis | Maliyet |
|--------|---------|
| Vercel (Frontend) | $0 |
| Railway (Backend) | $20/ay |
| DigitalOcean (Database) | $15/ay |
| Cloudflare (CDN) | $0 |
| **TOPLAM** | **~$35/ay** |

### Growth (1K-10K kullanıcı):
| Servis | Maliyet |
|--------|---------|
| AWS EKS | $150/ay |
| RDS PostgreSQL | $100/ay |
| ElastiCache Redis | $50/ay |
| CloudFront CDN | $30/ay |
| Route 53 | $5/ay |
| **TOPLAM** | **~$335/ay** |

### Enterprise (10K+ kullanıcı):
| Servis | Maliyet |
|--------|---------|
| EKS Cluster | $500/ay |
| RDS Multi-AZ | $400/ay |
| ElastiCache Cluster | $200/ay |
| CloudFront | $150/ay |
| Datadog Monitoring | $100/ay |
| **TOPLAM** | **~$1,350/ay** |

---

## 🚀 Hızlı Başlangıç (En Basit)

### Option A: Render.com (ÜCRETSİZ)
```bash
# 1. GitHub'a push
git push origin main

# 2. Render.com'da hesap aç
# https://render.com

# 3. "New +" → "Web Service"
# - Backend: apps/backend
# - Build: npm install
# - Start: npm start

# 4. "New +" → "Static Site"
# - Frontend: apps/web
# - Build: npm run build
# - Publish: dist

# 5. Environment variables ekle
# Dashboard → Environment
```

**Ücretsiz Plan**: 750 saat/ay (1 servis için yeterli)

---

## 📞 Support

Deployment sorunları için:
- GitHub Issues
- Discord: [community link]
- Email: support@kk99.exchange

**Başarılı deployment kontrolü:**
```bash
# Health check
curl https://api.yourdomain.com/health

# Frontend
curl https://yourdomain.com

# WebSocket
wscat -c wss://api.yourdomain.com/ws/market/BTC-USDT
```

Tüm servisler çalışıyorsa: **🎉 PRODUCTION'DASINIZ!**
