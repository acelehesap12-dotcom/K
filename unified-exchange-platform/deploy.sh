#!/bin/bash

# KK99 Exchange - Production Deployment Script
# Usage: ./deploy.sh [render|vercel|docker]

set -e

echo "🚀 KK99 Exchange - Production Deployment"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if deployment type is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Deployment type required${NC}"
    echo ""
    echo "Usage: ./deploy.sh [render|vercel|docker|k8s]"
    echo ""
    echo "Options:"
    echo "  render  - Deploy to Render.com (FREE tier available)"
    echo "  vercel  - Deploy to Vercel + Railway"
    echo "  docker  - Deploy with Docker Compose (VPS/Dedicated server)"
    echo "  k8s     - Deploy to Kubernetes (AWS EKS/GCP GKE)"
    exit 1
fi

DEPLOYMENT_TYPE=$1

# Functions
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed${NC}"
        exit 1
    fi
}

# ============ RENDER.COM DEPLOYMENT ============
deploy_render() {
    echo -e "${GREEN}📦 Deploying to Render.com...${NC}"
    
    # Check if render CLI is installed
    if ! command -v render &> /dev/null; then
        echo -e "${YELLOW}⚠️  Render CLI not found. Installing...${NC}"
        npm install -g render-cli
    fi
    
    echo ""
    echo "📋 Next steps:"
    echo "1. Push code to GitHub: git push origin main"
    echo "2. Go to https://render.com"
    echo "3. Click 'New +' → 'Web Service'"
    echo "4. Connect your GitHub repo"
    echo "5. Configure services:"
    echo ""
    echo "   Backend:"
    echo "   - Root Directory: apps/backend"
    echo "   - Build Command: npm install"
    echo "   - Start Command: npm start"
    echo "   - Add environment variables from .env.production.example"
    echo ""
    echo "   Frontend:"
    echo "   - Root Directory: apps/web"
    echo "   - Build Command: npm install && npm run build"
    echo "   - Publish Directory: dist"
    echo ""
    echo "✅ Free tier includes: 750 hours/month, custom domains, SSL"
}

# ============ VERCEL + RAILWAY DEPLOYMENT ============
deploy_vercel() {
    echo -e "${GREEN}📦 Deploying to Vercel + Railway...${NC}"
    
    # Check Vercel CLI
    if ! command -v vercel &> /dev/null; then
        echo -e "${YELLOW}⚠️  Vercel CLI not found. Installing...${NC}"
        npm install -g vercel
    fi
    
    # Check Railway CLI
    if ! command -v railway &> /dev/null; then
        echo -e "${YELLOW}⚠️  Railway CLI not found. Installing...${NC}"
        npm install -g @railway/cli
    fi
    
    # Deploy frontend to Vercel
    echo -e "${GREEN}🌐 Deploying frontend to Vercel...${NC}"
    cd apps/web
    vercel --prod
    cd ../..
    
    # Deploy backend to Railway
    echo -e "${GREEN}🚂 Deploying backend to Railway...${NC}"
    railway login
    cd apps/backend
    railway up
    cd ../..
    
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set environment variables in Railway dashboard"
    echo "2. Update VITE_API_URL in Vercel settings"
    echo "3. Configure custom domain (optional)"
}

# ============ DOCKER COMPOSE DEPLOYMENT ============
deploy_docker() {
    echo -e "${GREEN}🐳 Deploying with Docker Compose...${NC}"
    
    # Check Docker
    check_command docker
    check_command docker-compose
    
    # Check if .env.production exists
    if [ ! -f .env.production ]; then
        echo -e "${YELLOW}⚠️  .env.production not found. Creating from example...${NC}"
        cp .env.production.example .env.production
        echo -e "${RED}❌ Please edit .env.production with your values before continuing${NC}"
        exit 1
    fi
    
    # Build images
    echo -e "${GREEN}🔨 Building Docker images...${NC}"
    docker-compose -f docker-compose.prod.yml build
    
    # Start services
    echo -e "${GREEN}🚀 Starting services...${NC}"
    docker-compose -f docker-compose.prod.yml up -d
    
    # Show status
    echo ""
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo ""
    docker-compose -f docker-compose.prod.yml ps
    
    echo ""
    echo "📋 Service URLs:"
    echo "  Frontend: http://localhost"
    echo "  Backend API: http://localhost:3000"
    echo "  Grafana: http://localhost:3001"
    echo "  Prometheus: http://localhost:9090"
    echo ""
    echo "📝 Logs: docker-compose -f docker-compose.prod.yml logs -f"
    echo "🛑 Stop: docker-compose -f docker-compose.prod.yml down"
}

# ============ KUBERNETES DEPLOYMENT ============
deploy_k8s() {
    echo -e "${GREEN}☸️  Deploying to Kubernetes...${NC}"
    
    # Check kubectl
    check_command kubectl
    
    # Check if infra/kubernetes exists
    if [ ! -d "infra/kubernetes" ]; then
        echo -e "${RED}❌ Kubernetes manifests not found in infra/kubernetes/${NC}"
        echo "Please create Kubernetes manifests first."
        exit 1
    fi
    
    # Apply manifests
    echo -e "${GREEN}📦 Applying Kubernetes manifests...${NC}"
    kubectl apply -f infra/kubernetes/
    
    # Wait for deployments
    echo -e "${GREEN}⏳ Waiting for deployments...${NC}"
    kubectl wait --for=condition=available --timeout=300s deployment/backend
    kubectl wait --for=condition=available --timeout=300s deployment/frontend
    
    # Get service URLs
    echo ""
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo ""
    kubectl get services
    echo ""
    echo "📋 Get external IP:"
    echo "  kubectl get service frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}'"
}

# ============ SSL SETUP ============
setup_ssl() {
    echo -e "${GREEN}🔒 Setting up SSL with Let's Encrypt...${NC}"
    
    # Check certbot
    if ! command -v certbot &> /dev/null; then
        echo -e "${YELLOW}⚠️  Certbot not found. Installing...${NC}"
        sudo apt-get update
        sudo apt-get install -y certbot
    fi
    
    read -p "Enter your domain name: " DOMAIN
    
    # Get certificate
    sudo certbot certonly --standalone \
        -d $DOMAIN \
        -d api.$DOMAIN \
        --agree-tos \
        --email admin@$DOMAIN \
        --non-interactive
    
    # Copy certificates
    sudo mkdir -p nginx/ssl
    sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/ssl/
    sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem nginx/ssl/
    
    echo -e "${GREEN}✅ SSL certificates installed!${NC}"
}

# ============ HEALTH CHECK ============
health_check() {
    echo -e "${GREEN}🏥 Running health checks...${NC}"
    
    # Check backend
    if curl -f http://localhost:3000/health &> /dev/null; then
        echo -e "${GREEN}✅ Backend: Healthy${NC}"
    else
        echo -e "${RED}❌ Backend: Unhealthy${NC}"
    fi
    
    # Check frontend
    if curl -f http://localhost &> /dev/null; then
        echo -e "${GREEN}✅ Frontend: Healthy${NC}"
    else
        echo -e "${RED}❌ Frontend: Unhealthy${NC}"
    fi
}

# Main deployment logic
case $DEPLOYMENT_TYPE in
    render)
        deploy_render
        ;;
    vercel)
        deploy_vercel
        ;;
    docker)
        deploy_docker
        
        # Ask if user wants SSL
        read -p "Setup SSL certificate? (y/n): " SETUP_SSL
        if [ "$SETUP_SSL" = "y" ]; then
            setup_ssl
        fi
        
        # Run health check
        sleep 5
        health_check
        ;;
    k8s)
        deploy_k8s
        ;;
    *)
        echo -e "${RED}❌ Unknown deployment type: $DEPLOYMENT_TYPE${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "📚 Documentation: see DEPLOYMENT.md"
echo "🐛 Issues: https://github.com/yourrepo/issues"
