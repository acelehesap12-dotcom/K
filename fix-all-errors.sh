#!/bin/bash

echo "🔧 Tüm dependencies yükleniyor..."

# Backend
echo "📦 Backend dependencies..."
cd /workspaces/K/unified-exchange-platform/apps/backend
npm install

# Frontend
echo "📦 Frontend dependencies..."
cd /workspaces/K/unified-exchange-platform/apps/web
npm install

# Services
echo "📦 Market Surveillance dependencies..."
cd /workspaces/K/unified-exchange-platform/services/market-surveillance
npm install

echo "📦 Quant Studio dependencies..."
cd /workspaces/K/unified-exchange-platform/services/quant-studio
npm install

echo ""
echo "✅ Tüm dependencies yüklendi!"
echo ""
echo "Hata kontrol:"
cd /workspaces/K
