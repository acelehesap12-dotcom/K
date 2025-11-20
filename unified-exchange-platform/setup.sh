#!/bin/bash
# Setup script for initial project setup

set -e

echo "🚀 KK99 Exchange Platform - Initial Setup"
echo "=========================================="

# Check if running in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run from project root directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Create environment file if not exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p infra/grafana/datasources
mkdir -p infra/grafana/dashboards
mkdir -p docs

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker not found. Please install Docker to run services."
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Node.js 20+ required (found v$(node -v))"
fi

# Check Rust (optional)
if command -v cargo &> /dev/null; then
    echo "✓ Rust found: $(rustc --version)"
else
    echo "ℹ️  Rust not installed. Install from https://rustup.rs/ for engine development"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Review and update .env file"
echo "2. Run: docker-compose up -d"
echo "3. Run: bash infra/vault/init.sh"
echo "4. Run: npm run dev"
echo ""
echo "See QUICKSTART.md for more details"
