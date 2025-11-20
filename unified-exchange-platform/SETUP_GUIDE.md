# KK99 Exchange - API Setup Guide

## 🎯 ZERO-MOCK POLICY

This platform uses **REAL APIs ONLY**. No mocks, no demos, no fake data.

Before running the platform, you must obtain **real API keys** from the following providers.

---

## 1️⃣ Binance API (Cryptocurrency Data)

**Purpose**: Live crypto prices, order books, trading

### Steps:
1. Create account: https://www.binance.com/en/register
2. Enable 2FA for security
3. Go to: https://www.binance.com/en/my/settings/api-management
4. Create API Key
   - ✅ Enable: "Enable Reading"
   - ✅ Enable: "Enable Spot & Margin Trading" (if trading)
   - ⚠️ **IP Whitelist**: Add your server IP for security
5. Copy **API Key** and **Secret Key**

### Add to `.env`:
```bash
BINANCE_API_KEY=your_actual_api_key_here
BINANCE_API_SECRET=your_actual_secret_here
```

**Free Tier**: Yes (limited requests/minute)

---

## 2️⃣ Polygon.io API (Stock Market Data)

**Purpose**: Real-time stocks, ETFs, forex, options

### Steps:
1. Sign up: https://polygon.io/
2. Choose plan:
   - **Starter**: $99/month (delayed data)
   - **Developer**: $249/month (real-time)
   - **Advanced**: $499/month (full access)
3. Get API Key: https://polygon.io/dashboard/api-keys
4. Copy your API key

### Add to `.env`:
```bash
POLYGON_API_KEY=your_polygon_api_key_here
```

**Free Tier**: 5 API calls/minute (limited)

---

## 3️⃣ Ethereum RPC (Blockchain Data)

**Purpose**: Verify ETH deposits, smart contracts

### Option A: Alchemy (Recommended)
1. Sign up: https://dashboard.alchemy.com/
2. Create new app → **Ethereum Mainnet**
3. Copy HTTP endpoint
4. Add to `.env`:
```bash
ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

**Free Tier**: 300M compute units/month

### Option B: Infura
1. Sign up: https://infura.io/
2. Create project → Ethereum Mainnet
3. Copy endpoint
4. Add to `.env`:
```bash
ETH_RPC_URL_ALT=https://mainnet.infura.io/v3/YOUR_KEY
```

**Free Tier**: 100k requests/day

---

## 4️⃣ Solana RPC (Solana Blockchain)

**Purpose**: SOL deposit verification

### Option A: Public RPC (Free)
```bash
SOL_RPC_URL=https://api.mainnet-beta.solana.com
```

### Option B: QuickNode (Paid, Faster)
1. Sign up: https://www.quicknode.com/
2. Create endpoint → Solana Mainnet
3. Copy HTTP URL
4. Add to `.env`:
```bash
SOL_RPC_URL=https://your-endpoint.solana-mainnet.quiknode.pro/YOUR_KEY/
```

**Free Tier**: 250k requests/month (QuickNode)

---

## 5️⃣ Bitcoin RPC

**Purpose**: BTC deposit verification

### Option: Mempool.space API (Free)
```bash
BTC_RPC_URL=https://mempool.space/api
```

**Free Tier**: Yes (rate limited)

---

## 6️⃣ ExchangeRate-API (Forex Data)

**Purpose**: Real-time currency exchange rates

### Steps:
1. Sign up: https://www.exchangerate-api.com/
2. Choose plan:
   - **Free**: 1,500 requests/month
   - **Pro**: $9/month (100k requests)
3. Copy API key
4. Add to `.env`:
```bash
FOREX_API_KEY=your_exchangerate_api_key_here
```

**Free Tier**: 1,500 requests/month

---

## 7️⃣ Bloomberg Terminal API (Optional, Enterprise)

**Purpose**: Professional-grade financial data

⚠️ **Enterprise only** - Requires Bloomberg Terminal subscription (~$2,000/month)

### Steps:
1. Contact Bloomberg sales: https://www.bloomberg.com/professional/
2. Request API access (BLPAPI)
3. Obtain credentials

```bash
BLOOMBERG_API_KEY=your_bloomberg_key
BLOOMBERG_API_URL=https://api.bloomberg.com
```

**Free Tier**: No (Enterprise license required)

---

## 8️⃣ SendGrid Email API (Notifications)

**Purpose**: User email notifications, alerts

### Steps:
1. Sign up: https://signup.sendgrid.com/
2. Create API Key: https://app.sendgrid.com/settings/api_keys
3. Add to `.env`:
```bash
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdomain.com
```

**Free Tier**: 100 emails/day

---

## 9️⃣ Vault & Secrets Management

**Purpose**: Secure storage for API keys, private keys

### HashiCorp Vault (Self-hosted):
```bash
# Start Vault in dev mode
docker run -d --name vault \
  -p 8200:8200 \
  -e VAULT_DEV_ROOT_TOKEN_ID=root \
  vault:latest

# Store secrets
vault kv put secret/api-keys \
  binance_key=YOUR_KEY \
  polygon_key=YOUR_KEY
```

### AWS Secrets Manager (Cloud):
```bash
aws secretsmanager create-secret \
  --name exchange/api-keys \
  --secret-string '{"binance_key":"YOUR_KEY","polygon_key":"YOUR_KEY"}'
```

---

## 🔒 Security Best Practices

### API Key Security:
1. ✅ **Never commit** `.env` to Git
2. ✅ Use **IP whitelisting** on API providers
3. ✅ Enable **2FA** on all accounts
4. ✅ Store keys in **Vault** or **AWS Secrets Manager**
5. ✅ Rotate keys **quarterly**
6. ✅ Monitor API usage for anomalies

### Blockchain Security:
1. ⚠️ **NEVER** store private keys in environment variables
2. ✅ Use **Hardware Security Module (HSM)** for production
3. ✅ Implement **multi-sig wallets** for large amounts
4. ✅ Use **cold storage** for long-term holdings

---

## 📊 Cost Breakdown (Monthly)

| Service | Free Tier | Paid Plan | Our Usage |
|---------|-----------|-----------|-----------|
| **Binance** | ✅ Yes | - | Free |
| **Polygon.io** | 5 calls/min | $249/month | **$249** |
| **Alchemy ETH** | 300M CU | $199/month | Free |
| **Solana RPC** | Public | $49/month | Free |
| **Bitcoin** | Mempool API | - | Free |
| **Forex API** | 1,500/month | $9/month | **$9** |
| **SendGrid** | 100/day | $19.95/month | Free |
| **Bloomberg** | ❌ No | $2,000/month | Optional |
| **Total (Min)** | - | - | **~$258/month** |
| **Total (Full)** | - | - | **~$2,500/month** |

---

## ✅ Verification Checklist

Before starting the platform:

- [ ] Binance API key obtained
- [ ] Polygon.io API key obtained (or using free tier)
- [ ] Ethereum RPC configured (Alchemy/Infura)
- [ ] Solana RPC configured
- [ ] Bitcoin API configured
- [ ] Forex API configured
- [ ] SendGrid configured
- [ ] All keys added to `.env`
- [ ] Vault initialized (optional but recommended)
- [ ] IP whitelisting configured
- [ ] 2FA enabled on all accounts
- [ ] `.env` added to `.gitignore`

---

## 🚀 Quick Start

Once all API keys are configured:

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env with your REAL API keys
nano .env

# 3. Start infrastructure
docker-compose up -d

# 4. Initialize Vault (optional)
bash infra/vault/init.sh

# 5. Run migrations
npm run migrate

# 6. Start backend
npm run dev:backend

# 7. Verify connections
curl http://localhost:3001/health
```

---

## 🔍 Testing Real APIs

Test each API connection:

```bash
# Test Binance
curl "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"

# Test Polygon
curl "https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey=YOUR_KEY"

# Test Ethereum RPC
curl -X POST https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Test Solana
curl -X POST https://api.mainnet-beta.solana.com \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getVersion"}'
```

---

## 📚 Additional Resources

- **Binance API Docs**: https://binance-docs.github.io/apidocs/spot/en/
- **Polygon API Docs**: https://polygon.io/docs/stocks/getting-started
- **Ethereum JSON-RPC**: https://ethereum.org/en/developers/docs/apis/json-rpc/
- **Solana API**: https://docs.solana.com/api/
- **Vault Docs**: https://developer.hashicorp.com/vault/docs

---

## ⚠️ Important Notes

1. **Rate Limits**: All APIs have rate limits. Monitor usage to avoid bans.
2. **Costs**: API costs scale with usage. Start with free tiers.
3. **Security**: Treat API keys like passwords. Never expose them.
4. **Compliance**: Trading with real APIs may require regulatory licenses.
5. **Testing**: Use testnet APIs for development when available.

---

## 🆘 Troubleshooting

### "Unauthorized" errors:
- ✅ Check API key is correct
- ✅ Verify IP whitelist includes your server
- ✅ Ensure 2FA token is valid (if required)

### "Rate limit exceeded":
- ✅ Reduce request frequency
- ✅ Implement caching
- ✅ Upgrade to paid tier

### "Invalid endpoint":
- ✅ Verify base URL in `.env`
- ✅ Check API documentation for changes
- ✅ Ensure correct API version

---

**Ready?** Once all keys are configured, return to [README.md](./README.md) for deployment instructions.
