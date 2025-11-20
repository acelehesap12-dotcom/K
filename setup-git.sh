#!/bin/bash

# Git konfigürasyonu
cd /workspaces/K

echo "🔧 Git yapılandırması..."

# Eğer .git varsa temizle
if [ -d "unified-exchange-platform/.git" ]; then
    echo "📦 Eski .git klasörü kaldırılıyor..."
    rm -rf unified-exchange-platform/.git
fi

# Ana dizinde git init
if [ ! -d ".git" ]; then
    git init
    echo "✅ Git repository oluşturuldu"
fi

# Git config
git config user.name "acelehesap12-dotcom"
git config user.email "your-email@example.com"

# .gitignore oluştur
cat > .gitignore << 'EOF'
# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
dist/
.env
.env.local
.env.production

# Build
build/
target/
*.log

# IDEs
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Database
*.db
*.sqlite

# Docker
docker-compose.override.yml

# Rust
Cargo.lock
EOF

# Dosyaları ekle
git add .
git status

echo ""
echo "✅ Git hazır!"
echo ""
echo "📝 Sonraki adımlar:"
echo "1. GitHub'da yeni repo oluştur: https://github.com/new"
echo "2. Şu komutları çalıştır:"
echo ""
echo "   git remote add origin https://github.com/acelehesap12-dotcom/REPO_ADI.git"
echo "   git branch -M main"
echo "   git commit -m 'Initial commit: KK99 Exchange Platform'"
echo "   git push -u origin main"
echo ""
