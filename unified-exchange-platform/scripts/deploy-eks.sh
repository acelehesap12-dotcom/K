#!/bin/bash
# Production deployment script for EKS

set -e

CLUSTER_NAME="${CLUSTER_NAME:-kk99-exchange}"
REGION="${AWS_REGION:-us-east-1}"
NAMESPACE="exchange"

echo "🚀 Deploying KK99 Exchange to EKS"
echo "=================================="

# Update kubeconfig
echo "📋 Connecting to EKS cluster..."
aws eks update-kubeconfig --name $CLUSTER_NAME --region $REGION

# Create namespace
echo "📦 Creating namespace..."
kubectl create namespace $NAMESPACE || true

# Create secrets
echo "🔐 Creating secrets..."
kubectl create secret generic exchange-secrets \
  --from-literal=DB_PASSWORD=$(openssl rand -base64 32) \
  --from-literal=JWT_SECRET=$(openssl rand -base64 32) \
  -n $NAMESPACE || true

# Apply Vault
echo "🔓 Deploying Vault..."
kubectl apply -f infra/kubernetes/01-vault.yaml

# Wait for Vault
kubectl wait --for=condition=Ready pod -l app=vault -n $NAMESPACE --timeout=300s

# Apply PostgreSQL
echo "🗄️ Deploying PostgreSQL..."
kubectl apply -f infra/kubernetes/02-postgres.yaml
kubectl wait --for=condition=Ready pod -l app=postgres -n $NAMESPACE --timeout=300s

# Apply Kafka
echo "📨 Deploying Kafka..."
kubectl apply -f infra/kubernetes/03-kafka.yaml
kubectl wait --for=condition=Ready pod -l app=kafka -n $NAMESPACE --timeout=600s

# Apply Backend
echo "⚙️ Deploying Backend API..."
kubectl apply -f infra/kubernetes/04-backend.yaml
kubectl wait --for=condition=Ready deployment/backend-api -n $NAMESPACE --timeout=600s

# Apply Redis
echo "💾 Deploying Redis..."
kubectl apply -f infra/kubernetes/05-redis.yaml
kubectl wait --for=condition=Ready deployment/redis -n $NAMESPACE --timeout=300s

# Get endpoints
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Service endpoints:"
kubectl get service -n $NAMESPACE

echo ""
echo "🎯 Next steps:"
echo "  1. Update DNS CNAME to: $(kubectl get svc backend-api -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"
echo "  2. Configure SSL certificate"
echo "  3. Monitor: kubectl logs -n $NAMESPACE -f deployment/backend-api"
