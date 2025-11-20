# 🔧 Kurulum Sorun Giderme

## ❌ Karşılaşılan Hatalar ve Çözümleri

### 1. `elasticsearch@^7.17.9 bulunamadı`
**Sebep**: Eski paket versiyonu artık mevcut değil  
**Çözüm**: ✅ Düzeltildi → `@elastic/elasticsearch@^8.11.0` kullanılıyor

### 2. `tsx: not found` veya `vite: not found`
**Sebep**: `node_modules` yüklü değil  
**Çözüm**:
```bash
# Backend
cd apps/backend
npm install

# Frontend
cd apps/web
npm install
```

### 3. `cargo: command not found`
**Sebep**: Rust yüklü değil  
**Çözüm**: 
```bash
# Rust kurulumu
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

Veya Rust olmadan çalıştır:
```bash
# Backend + Frontend yeterli
cd apps/backend && npm run dev &
cd apps/web && npm run dev
```

### 4. `vault:latest not found`
**Sebep**: Docker imaj adı yanlış  
**Çözüm**: ✅ Düzeltildi → `hashicorp/vault:1.15` kullanılıyor

---

## ✅ Hızlı Kurulum

### Otomatik (Önerilen):
```bash
cd /workspaces/K/unified-exchange-platform
chmod +x install.sh
./install.sh
```

### Manuel:
```bash
# 1. Backend
cd apps/backend
npm install
npm run dev

# 2. Frontend (yeni terminal)
cd apps/web
npm install
npm run dev

# 3. Docker (yeni terminal)
docker-compose up -d

# 4. Rust Engine (opsiyonel, yeni terminal)
cd apps/engine
cargo build --release
cargo run --release
```

---

## 🐛 Hala Hata Alıyorsanız

### Node.js sürümü kontrolü:
```bash
node --version  # v20+ olmalı
npm --version   # v9+ olmalı
```

### Cache temizleme:
```bash
cd apps/backend
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

cd ../web
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Port kullanımda:
```bash
# Kullanılan portları kontrol et
lsof -i :3000  # Backend
lsof -i :5173  # Frontend
lsof -i :8200  # Vault
lsof -i :5432  # PostgreSQL

# Process'i kapat
kill -9 <PID>
```

### Docker sorunları:
```bash
# Tüm container'ları durdur
docker-compose down

# Volume'ları temizle
docker-compose down -v

# Yeniden başlat
docker-compose up -d

# Logları kontrol et
docker-compose logs vault
docker-compose logs postgres
```

---

## 📊 Sistem Gereksinimleri

### Minimum:
- **Node.js**: v20.x
- **npm**: v9.x
- **RAM**: 4GB
- **Disk**: 10GB boş alan

### Önerilen:
- **Node.js**: v20.18+
- **npm**: v10+
- **Rust**: 1.70+ (opsiyonel)
- **Docker**: 24.x
- **RAM**: 8GB+
- **Disk**: 20GB+ SSD

---

## 🆘 Destek

Hala sorun yaşıyorsanız:

1. **Hata loglarını kontrol edin**:
```bash
# Backend
cd apps/backend
npm run dev 2>&1 | tee error.log

# Frontend
cd apps/web
npm run dev 2>&1 | tee error.log
```

2. **Paket versiyonlarını kontrol edin**:
```bash
cat apps/backend/package.json
cat apps/web/package.json
```

3. **GitHub issue açın** (error.log ile birlikte)

---

## ✨ Başarılı Kurulum Kontrolleri

Kurulumun başarılı olduğunu anlamak için:

```bash
# Backend çalışıyor mu?
curl http://localhost:3000/health
# Beklenen: {"status":"ok"}

# Frontend çalışıyor mu?
curl http://localhost:5173
# Beklenen: HTML sayfası

# Docker servisleri çalışıyor mu?
docker-compose ps
# Beklenen: Tüm servisler "Up" durumunda

# WebSocket çalışıyor mu?
wscat -c ws://localhost:3000/ws/market/BTC-USDT
# Beklenen: WebSocket bağlantısı
```

Tüm testler başarılıysa: **🎉 Kurulum tamamlandı!**

Tarayıcıda açın: **http://localhost:5173**
