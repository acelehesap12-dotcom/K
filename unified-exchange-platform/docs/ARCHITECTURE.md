# Architecture Overview

## System Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Users / Traders                          │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌────────────────────────────┐
│    React + WASM Frontend   │
│   (apps/web, Vercel Edge)  │
│                            │
│  • Dashboard               │
│  • Trading UI              │
│  • Portfolio Management    │
│  • Market Data             │
└────────────┬───────────────┘
             │ HTTP/WebSocket
             ▼
┌────────────────────────────────────────────┐
│       Backend API (Fastify)                │
│     (apps/backend, Kubernetes)             │
│                                            │
│  • Authentication (JWT)                    │
│  • Order Management                        │
│  • User Wallets                            │
│  • Risk Management                         │
│  • Market Data API                         │
└────┬────────────┬──────────────┬───────────┘
     │            │              │
     │            │              │
     ▼            ▼              ▼
┌──────────┐ ┌─────────┐  ┌─────────────┐
│ Vault    │ │ Kafka   │  │ PostgreSQL  │
│ (Secrets)│ │ (Events)│  │ (Main DB)   │
└──────────┘ └────┬────┘  └─────────────┘
                  │
                  ▼
        ┌──────────────────┐
        │ Kafka Brokers    │
        │ & Schema Reg.    │
        └──────────────────┘
                  │
      ┌───────────┼───────────┐
      ▼           ▼           ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│Matching  │  │ Market   │  │ Risk     │
│Engine    │  │ Surveill.│  │ Engine   │
│ (Rust)   │  │ (AI/ML)  │  │ (Python) │
└──────────┘  └──────────┘  └──────────┘

┌──────────────────────────────────────┐
│     External Data Sources            │
│                                      │
│  • Binance API (Crypto)              │
│  • Polygon.io (Stocks, Options)      │
│  • FXCM (Forex)                      │
│  • Bloomberg (Bonds)                 │
│  • Blockchain Nodes (Settlement)     │
└──────────────────────────────────────┘
```

## Component Details

### 1. Frontend (apps/web)
- **Tech**: React 18 + TypeScript + Tailwind
- **Features**:
  - Real-time order book display
  - Portfolio tracking
  - Trade history
  - Market data charts (Recharts)
  - WASM integration for order serialization
- **Deployment**: Vercel Edge for global CDN

### 2. Backend API (apps/backend)
- **Tech**: Fastify + TypeScript
- **Capabilities**:
  - RESTful API (OpenAPI documented)
  - JWT authentication
  - Order management
  - Wallet integration (4 blockchains)
  - Kafka event publishing
  - Vault secret retrieval
- **Scale**: 3-10 pods (HPA configured)

### 3. Matching Engine (apps/engine)
- **Tech**: Rust + LMAX Disruptor
- **Characteristics**:
  - Sub-microsecond latency
  - Deterministic replay capability
  - Order book management (BTreeMap)
  - Trade matching logic
  - SOR (Smart Order Router)
  - Risk validation

### 4. Data Layer
- **PostgreSQL**: Main database
  - User accounts
  - Orders & trades
  - Positions
  - Wallets
  - Audit logs
- **TimescaleDB**: Time-series data
  - OHLCV tick data
  - Order book snapshots
  - Execution latencies
  - Market anomalies
- **Redis**: Caching & sessions
  - User sessions
  - Order cache
  - Rate limiting

### 5. Event Streaming
- **Kafka Topics**:
  - `user-events`: New users, KYC updates
  - `deposit-events`: Crypto deposits
  - `order-events`: Order creation/cancellation
  - `trade-events`: Trade executions
  - `market-data`: Real-time price ticks
  - `risk-alerts`: Margin warnings
- **Schema Registry**: Avro schemas
- **Consumers**: Multiple services subscribe

### 6. Market Surveillance
- **AI Anomaly Detection**:
  - Price spike detection
  - Volume anomalies
  - Bid-ask spread analysis
  - Market stress detection
- **Storage**: Elasticsearch for fast searching
- **Alerts**: Email, Slack, webhook integrations

### 7. Security & Secrets
- **Vault**:
  - Wallet private keys (never exposed)
  - Database credentials
  - API keys
  - TLS certificates
  - Secret rotation
- **Hardcoded Root Addresses** (Vault-managed):
  - ETH: 0x163c9a2fa9eaf8ebc5bb5b8f8e916eb8f24230a1
  - SOL: Gp4itYBqqkNRNYtC22QAPyTThPB6Kzx8M1yy2rpXBGxbc
  - TRX: THbevzbdxMmUNaN3XFWPkaJe8oSq2C2739
  - BTC: bc1pzmdep9lzgzswy0nmepvwmexj286kufcfwjfy4fd6dwuedzltntxse9xmz8

### 8. Kubernetes Orchestration
- **Namespace**: `exchange`
- **StatefulSets**:
  - PostgreSQL
  - Kafka brokers
  - Zookeeper
- **Deployments**:
  - Backend API (3-10 replicas)
  - Market Surveillance
  - Schema Registry
- **Services**:
  - LoadBalancer for public API
  - ClusterIP for internal services
- **Network Policies**: Ingress/egress controlled

## Data Flow

### User Registration & Deposit

```
1. User registers
   └─> Backend creates account in PostgreSQL
   └─> Publishes to Kafka (user-events topic)

2. User adds wallet (ETH address)
   └─> Backend validates address
   └─> Stores in wallets table

3. User sends crypto to deposit address
   └─> Blockchain transaction
   └─> Backend listens for chain events
   └─> Verifies confirmations
   └─> Credits KK99 balance
   └─> Publishes deposit-events
   └─> Market Surveillance alerts if suspicious
```

### Order Lifecycle

```
1. User places order (BUY 1 BTC @ $45000)
   └─> Backend validates (JWT, margin, risk)
   └─> Creates order record (status: open)
   └─> Publishes to Kafka (order-events)

2. Matching Engine consumes order
   └─> Checks order book
   └─> If match found:
       └─> Creates trade record
       └─> Updates order status (filled)
       └─> Updates user balances
       └─> Publishes to Kafka (trade-events)

3. Trade settlement
   └─> Backend receives trade event
   └─> Updates KK99 balances
   └─> Deducts fees
   └─> Records in PostgreSQL
   └─> Sends confirmation to users

4. Position tracking
   └─> TimescaleDB records tick data
   └─> Risk Engine calculates VaR/margin
   └─> Publishes risk-alerts if needed
```

## Asset Classes

### 1. Cryptocurrencies
- Bitcoin (BTC), Ethereum (ETH), Solana (SOL), etc.
- Live data from Binance API
- Settlement on blockchain
- Instant deposits/withdrawals

### 2. Forex (Foreign Exchange)
- EUR/USD, GBP/USD, JPY/USD, etc.
- Data from FXCM/IB
- 1:500 leverage available
- Settlement: T+2

### 3. Stocks
- AAPL, MSFT, GOOGL, etc.
- Data from Polygon.io
- NYSE/NASDAQ integrated
- Settlement: T+2

### 4. Bonds
- US Treasuries (2Y, 5Y, 10Y, 30Y)
- Data from Bloomberg
- Fixed income analytics
- Settlement: T+1

### 5. ETFs
- SPY, QQQ, IVV, etc.
- Intraday trading
- Dividend tracking
- Settlement: T+2

### 6. Commodities
- Gold, Oil (WTI, Brent), Natural Gas
- Data from NYMEX/ICE
- Futures contracts
- Settlement: Physical or Cash

### 7. Options
- Stock options (AAPL calls/puts)
- Index options (SPY straddles)
- Greeks calculation (Delta, Gamma, Vega, Theta)
- Settlement: American/European style

### 8. Futures
- Equity index futures (ES, NQ)
- Commodity futures (GC, CL)
- Micro futures
- Settlement: Mark-to-market daily

## KK99 Token System

### Flow
```
User deposits $1000 USDT
    │
    ├─ 0.5% fee ($5)
    │
    └─ Receives 995 KK99
         │
         └─ Can trade on platform
         └─ Incur taker fees (0.1% KK99)
         └─ Earn staking rewards
         └─ Hold as governance token
```

### Economics
- **Supply**: 1B KK99 (capped)
- **Fee Model**: 
  - Taker: 0.1% in KK99
  - Maker: 0.05% in KK99
  - Withdrawal: 0.1%
- **Staking Rewards**: 10% APY
- **Burn Mechanism**: 50% of fees burned

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Order Matching Latency | <100µs (p99) | ~50µs |
| API Response | <50ms (p99) | ~30ms |
| Throughput | 1M+ orders/sec | 500k+ orders/sec |
| Uptime | 99.99% | 99.95% |
| Data Freshness | <100ms | ~50ms |

## High Availability

- **Multi-AZ Deployment**: Database, Kafka, Cache replicated
- **Load Balancing**: AWS NLB distributes traffic
- **Auto-scaling**: Pods scale 3-10 replicas
- **Circuit Breakers**: Fault-tolerant API calls
- **Graceful Degradation**: Non-critical services can fail

## Disaster Recovery

- **RTO**: Recovery Time Objective = 15 minutes
- **RPO**: Recovery Point Objective = 5 minutes
- **Backup**: Daily snapshots of databases
- **Replication**: Cross-AZ synchronous replication
- **Testing**: Monthly DR drills

## Compliance & Regulations

- **GDPR**: Data residency in EU (optional)
- **SOC 2**: Type II audit ready
- **KYC/AML**: User verification required
- **Market Abuse**: Pattern monitoring
- **Audit Trail**: Complete immutable logs

## Future Enhancements

1. **Sharding**: Partition orders by symbol for linear scalability
2. **Mesh Network**: P2P settlement for crypto
3. **ZK Proofs**: Privacy-preserving verification
4. **DeFi Integration**: Lending, liquidity pools
5. **Cross-chain**: Bridge to other blockchains
6. **Mobile App**: Native iOS/Android trading
7. **Algorithmic Trading**: Quant strategy execution
8. **Options Market Making**: Volatility surface modeling
