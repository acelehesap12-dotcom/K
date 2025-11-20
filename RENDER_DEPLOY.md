# 🚀 KK99 Exchange - Render.com Deployment

## Manuel Deployment (En Kolay)

### 1️⃣ Backend Deployment

1. **https://render.com** → Sign up/Login
2. **Dashboard** → "New +" → "Web Service"
3. **Connect Repository:**
   - Repo: `acelehesap12-dotcom/K`
   - Branch: `main`

4. **Service Configuration:**
   ```
   Name: kk99-backend
   Region: Oregon (US West)
   Branch: main
   Root Directory: (leave empty)
   
   Runtime: Node
   
   Build Command:
   cd unified-exchange-platform/apps/backend && npm install
   
   Start Command:
   cd unified-exchange-platform/apps/backend && npm start
   
   Plan: Free
   ```

5. **Environment Variables** (Add these):
   ```
   NODE_ENV = production
   PORT = 10000
   ```

6. **Advanced Settings:**
   - Health Check Path: `/health`
   - Auto-Deploy: Yes

7. **Create Web Service** → Wait 5-10 minutes

### 2️⃣ Frontend Deployment (Optional)

1. **Dashboard** → "New +" → "Static Site"
2. **Connect same repository**
3. **Configuration:**
   ```
   Name: kk99-frontend
   Branch: main
   Root Directory: (leave empty)
   
   Build Command:
   cd unified-exchange-platform/apps/web && npm install && npm run build
   
   Publish Directory:
   unified-exchange-platform/apps/web/dist
   ```

4. **Environment Variables:**
   ```
   VITE_API_URL = https://kk99-backend.onrender.com
   ```

5. **Create Static Site**

---

## Blueprint Deployment (Otomatik)

Eğer `render.yaml` kullanmak istersen:

```bash
cd /workspaces/K
git add render.yaml render-backend.json
git commit -m "Add: Render.com deployment configs"
git push
```

Sonra Render.com'da:
1. "New +" → "Blueprint"
2. Repo seç → `render.yaml` otomatik algılanır
3. "Apply" → Tüm servisler otomatik deploy olur

---

## Troubleshooting

### "no such file or directory" Hatası
✅ **Çözüldü:** Build/Start komutlarında `cd` ile doğru dizine gidiyoruz

### Port Hatası
✅ Render otomatik `PORT` envvar'ı verir, `10000` kullan

### Build Timeout
- Free plan: 15 dakika build süresi var
- Backend build ~5 dakika sürer
- Frontend build ~3 dakika sürer

---

## Test After Deployment

Backend deployed olduktan sonra:

```bash
# Health check
curl https://kk99-backend.onrender.com/health

# API test
curl https://kk99-backend.onrender.com/api/health
```

Frontend:
```
https://kk99-frontend.onrender.com
```

---

## Free Plan Limits

✅ **Backend (Web Service):**
- 750 saat/ay (tek servis için yeterli)
- 512 MB RAM
- Auto-sleep after 15 min inactivity
- Custom domain support

✅ **Frontend (Static Site):**
- Unlimited bandwidth
- Global CDN
- Free SSL
- Custom domain support

---

## Next Steps After Deploy

1. ✅ Backend çalışıyor → Health check yap
2. ✅ Frontend çalışıyor → Tarayıcıda aç
3. 🔧 Environment variables ekle (DB, API keys)
4. 🔒 Custom domain bağla (opsiyonel)
5. 📊 Monitoring ekle (Render built-in)

**Render.com link'lerin:**
- Backend: `https://kk99-backend.onrender.com`
- Frontend: `https://kk99-frontend.onrender.com`

🎉 **Production'dasın!**
