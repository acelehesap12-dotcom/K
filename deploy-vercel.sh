#!/bin/bash

echo "🚀 Vercel Deployment - En Hızlı Yol"
echo "===================================="
echo ""

cd /workspaces/K/unified-exchange-platform/apps/web

# Vercel yüklü mü kontrol et
if ! command -v vercel &> /dev/null; then
    echo "📦 Vercel CLI yükleniyor..."
    npm install -g vercel
fi

echo ""
echo "🌐 Vercel'e deploy ediliyor..."
echo ""
echo "Soruları yanıtla:"
echo "  - Project name: kk99-exchange"
echo "  - Directory: . (enter)"
echo "  - Override settings: N"
echo ""

vercel --prod

echo ""
echo "✅ Frontend deploy edildi!"
echo ""
echo "📋 Backend için Railway'i dene:"
echo "   cd /workspaces/K/unified-exchange-platform/apps/backend"
echo "   npx @railway/cli login"
echo "   npx @railway/cli up"
