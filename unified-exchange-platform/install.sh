#!/bin/bash

echo "🚀 KK99 Exchange - Kurulum Başlıyor..."

# Renk kodları
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Hata kontrolü
set -e

echo ""
echo "📦 1/4 - Backend bağımlılıkları yükleniyor..."
cd apps/backend
if npm install; then
    echo -e "${GREEN}✅ Backend bağımlılıkları yüklendi${NC}"
else
    echo -e "${RED}❌ Backend npm install hatası${NC}"
    echo -e "${YELLOW}Lütfen manuel olarak çalıştırın: cd apps/backend && npm install${NC}"
fi
cd ../..

echo ""
echo "📦 2/4 - Frontend bağımlılıkları yükleniyor..."
cd apps/web
if npm install; then
    echo -e "${GREEN}✅ Frontend bağımlılıkları yüklendi${NC}"
else
    echo -e "${RED}❌ Frontend npm install hatası${NC}"
    echo -e "${YELLOW}Lütfen manuel olarak çalıştırın: cd apps/web && npm install${NC}"
fi
cd ../..

echo ""
echo "📦 3/4 - Rust bağımlılıkları kontrol ediliyor..."
if command -v cargo &> /dev/null; then
    cd apps/engine
    if cargo build --release; then
        echo -e "${GREEN}✅ Rust engine build edildi${NC}"
    else
        echo -e "${YELLOW}⚠️  Rust build hatası (normal, devam edebilirsiniz)${NC}"
    fi
    cd ../..
else
    echo -e "${YELLOW}⚠️  Cargo bulunamadı. Rust yüklemek için: https://rustup.rs${NC}"
fi

echo ""
echo "🐳 4/4 - Docker servisleri başlatılıyor..."
if docker-compose up -d; then
    echo -e "${GREEN}✅ Docker servisleri başlatıldı${NC}"
else
    echo -e "${YELLOW}⚠️  Docker servisleri başlatılamadı (normal, manuel başlatabilirsiniz)${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🎉 KURULUM TAMAMLANDI!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""
echo "📝 Servisleri başlatmak için:"
echo ""
echo "Terminal 1 (Backend):"
echo "  cd apps/backend"
echo "  npm run dev"
echo "  → http://localhost:3000"
echo ""
echo "Terminal 2 (Frontend):"
echo "  cd apps/web"
echo "  npm run dev"
echo "  → http://localhost:5173"
echo ""
echo "Terminal 3 (Rust Engine - opsiyonel):"
echo "  cd apps/engine"
echo "  cargo run --release"
echo "  → gRPC server on [::1]:50051"
echo ""
echo "🌐 Tarayıcıda aç: http://localhost:5173"
echo ""
