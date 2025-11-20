-- ============================================
-- KK99 Exchange - Database Indexes & Optimizations
-- Version: 2.0
-- Date: 2025-11-20
-- ============================================

-- ============================================
-- ORDERS TABLE INDEXES
-- ============================================

-- Index for user order queries (most common)
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created 
ON orders(user_id, status, created_at DESC);

-- Index for matching engine (symbol, side, price)
CREATE INDEX IF NOT EXISTS idx_orders_symbol_side_price 
ON orders(symbol, side, price) 
WHERE status = 'OPEN';

-- Index for order book queries
CREATE INDEX IF NOT EXISTS idx_orders_symbol_status_price 
ON orders(symbol, status, price, quantity);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at 
ON orders(created_at DESC);

-- Partial index for open orders only (faster matching)
CREATE INDEX IF NOT EXISTS idx_orders_open_matching 
ON orders(symbol, side, price, quantity, created_at) 
WHERE status = 'OPEN';

-- Index for order ID lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_id 
ON orders(order_id) 
WHERE status IN ('OPEN', 'PARTIAL');

-- ============================================
-- TRADES TABLE INDEXES
-- ============================================

-- Index for symbol and timestamp (analytics)
CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp 
ON trades(symbol, timestamp DESC);

-- Index for user trade history
CREATE INDEX IF NOT EXISTS idx_trades_user_timestamp 
ON trades(user_id, timestamp DESC);

-- Index for both maker and taker
CREATE INDEX IF NOT EXISTS idx_trades_maker_taker 
ON trades(maker_user_id, taker_user_id, timestamp DESC);

-- Index for trade volume calculations
CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp_volume 
ON trades(symbol, timestamp DESC, quantity, price);

-- ============================================
-- WALLETS TABLE INDEXES
-- ============================================

-- Index for user wallet lookups
CREATE INDEX IF NOT EXISTS idx_wallets_user_chain_asset 
ON wallets(user_id, chain, asset);

-- Index for balance queries
CREATE INDEX IF NOT EXISTS idx_wallets_balance 
ON wallets(asset, balance) 
WHERE balance > 0;

-- Index for KK99 token holdings
CREATE INDEX IF NOT EXISTS idx_wallets_kk99 
ON wallets(user_id, balance) 
WHERE asset = 'KK99';

-- ============================================
-- DEPOSITS TABLE INDEXES
-- ============================================

-- Index for user deposit history
CREATE INDEX IF NOT EXISTS idx_deposits_user_timestamp 
ON deposits(user_id, timestamp DESC);

-- Index for pending deposits
CREATE INDEX IF NOT EXISTS idx_deposits_pending 
ON deposits(chain, status, timestamp) 
WHERE status = 'PENDING';

-- Index for chain and transaction hash
CREATE INDEX IF NOT EXISTS idx_deposits_chain_txhash 
ON deposits(chain, transaction_hash);

-- ============================================
-- WITHDRAWALS TABLE INDEXES
-- ============================================

-- Index for user withdrawal history
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_timestamp 
ON withdrawals(user_id, timestamp DESC);

-- Index for pending withdrawals
CREATE INDEX IF NOT EXISTS idx_withdrawals_pending 
ON withdrawals(status, timestamp) 
WHERE status IN ('PENDING', 'PROCESSING');

-- Index for chain and status
CREATE INDEX IF NOT EXISTS idx_withdrawals_chain_status 
ON withdrawals(chain, status, timestamp DESC);

-- ============================================
-- AUDIT_LOG TABLE INDEXES
-- ============================================

-- Index for user audit trail
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp 
ON audit_log(user_id, timestamp DESC);

-- Index for action type queries
CREATE INDEX IF NOT EXISTS idx_audit_action_timestamp 
ON audit_log(action_type, timestamp DESC);

-- Index for IP address tracking
CREATE INDEX IF NOT EXISTS idx_audit_ip_timestamp 
ON audit_log(ip_address, timestamp DESC);

-- ============================================
-- COMPLIANCE TABLES INDEXES
-- ============================================

-- AML flags index
CREATE INDEX IF NOT EXISTS idx_aml_flags_user_severity 
ON aml_flags(user_id, severity, created_at DESC);

-- Trade flags for surveillance
CREATE INDEX IF NOT EXISTS idx_trade_flags_timestamp 
ON trade_flags(flag_type, timestamp DESC);

-- Login attempts tracking
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_timestamp 
ON login_attempts(user_id, success, timestamp DESC);

-- Device fingerprints
CREATE INDEX IF NOT EXISTS idx_device_fingerprints_user 
ON device_fingerprints(user_id, last_seen DESC);

-- ============================================
-- TABLE PARTITIONING (TimescaleDB)
-- ============================================

-- Partition trades table by time (if using TimescaleDB)
SELECT create_hypertable('trades', 'timestamp', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Partition audit_log by time
SELECT create_hypertable('audit_log', 'timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- Partition market_data by time
SELECT create_hypertable('market_data', 'timestamp',
    chunk_time_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- ============================================
-- MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================

-- User trading statistics (refreshed hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_trading_stats AS
SELECT 
    user_id,
    COUNT(DISTINCT DATE(timestamp)) as trading_days,
    COUNT(*) as total_trades,
    SUM(quantity * price) as total_volume,
    AVG(quantity * price) as avg_trade_size,
    MAX(timestamp) as last_trade_at
FROM trades
WHERE timestamp >= NOW() - INTERVAL '30 days'
GROUP BY user_id;

CREATE UNIQUE INDEX idx_mv_user_trading_stats ON mv_user_trading_stats(user_id);

-- Symbol statistics (refreshed every 5 minutes)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_symbol_stats AS
SELECT 
    symbol,
    COUNT(*) as trade_count,
    SUM(quantity) as total_quantity,
    SUM(quantity * price) as total_volume,
    AVG(price) as avg_price,
    MAX(price) as high_price,
    MIN(price) as low_price,
    MAX(timestamp) as last_trade_at
FROM trades
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY symbol;

CREATE UNIQUE INDEX idx_mv_symbol_stats ON mv_symbol_stats(symbol);

-- Daily trading volume (refreshed daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_volume AS
SELECT 
    DATE(timestamp) as trade_date,
    symbol,
    COUNT(*) as trades,
    SUM(quantity) as volume,
    SUM(quantity * price) as volume_usd
FROM trades
GROUP BY DATE(timestamp), symbol;

CREATE UNIQUE INDEX idx_mv_daily_volume ON mv_daily_volume(trade_date, symbol);

-- ============================================
-- QUERY OPTIMIZATION SETTINGS
-- ============================================

-- Increase shared buffers for better caching
ALTER SYSTEM SET shared_buffers = '4GB';

-- Increase effective cache size
ALTER SYSTEM SET effective_cache_size = '12GB';

-- Increase work memory for complex queries
ALTER SYSTEM SET work_mem = '64MB';

-- Increase maintenance work memory
ALTER SYSTEM SET maintenance_work_mem = '1GB';

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;

-- Optimize checkpoint settings
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';

-- Optimize autovacuum for high-traffic tables
ALTER TABLE orders SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE trades SET (autovacuum_vacuum_scale_factor = 0.01);
ALTER TABLE audit_log SET (autovacuum_vacuum_scale_factor = 0.05);

-- ============================================
-- TABLE STATISTICS UPDATE
-- ============================================

-- Update table statistics for query planner
ANALYZE orders;
ANALYZE trades;
ANALYZE wallets;
ANALYZE deposits;
ANALYZE withdrawals;
ANALYZE audit_log;

-- ============================================
-- VACUUM SCHEDULE (run via cron)
-- ============================================

-- Daily VACUUM for high-traffic tables
-- Run during low-traffic hours (e.g., 3 AM UTC)

-- vacuum_schedule.sql
-- VACUUM ANALYZE orders;
-- VACUUM ANALYZE trades;
-- VACUUM ANALYZE audit_log;

-- Weekly FULL VACUUM for all tables
-- VACUUM FULL ANALYZE;

-- ============================================
-- CONNECTION POOLING SETUP
-- ============================================

-- pgBouncer configuration (external file)
-- pool_mode = transaction
-- max_client_conn = 1000
-- default_pool_size = 25
-- reserve_pool_size = 5
-- reserve_pool_timeout = 3
-- max_db_connections = 100

-- ============================================
-- BACKUP & RECOVERY SETUP
-- ============================================

-- Point-in-time recovery setup
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = 'cp %p /backup/archive/%f';
ALTER SYSTEM SET max_wal_senders = 3;

-- Continuous archiving
ALTER SYSTEM SET archive_timeout = '300';  -- 5 minutes

-- ============================================
-- READ REPLICAS SETUP
-- ============================================

-- On primary server
ALTER SYSTEM SET synchronous_commit = 'remote_apply';
ALTER SYSTEM SET synchronous_standby_names = 'replica1,replica2';

-- On replica servers
-- recovery.conf:
-- standby_mode = 'on'
-- primary_conninfo = 'host=primary port=5432 user=replicator'
-- restore_command = 'cp /backup/archive/%f %p'

-- ============================================
-- MONITORING QUERIES
-- ============================================

-- Check index usage
CREATE OR REPLACE VIEW v_index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Check table sizes
CREATE OR REPLACE VIEW v_table_sizes AS
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check slow queries
CREATE OR REPLACE VIEW v_slow_queries AS
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE mean_time > 100  -- queries slower than 100ms
ORDER BY mean_time DESC;

-- ============================================
-- COMPLETE
-- ============================================

-- Reload PostgreSQL configuration
SELECT pg_reload_conf();

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Database optimizations completed successfully';
    RAISE NOTICE 'Indexes created: ✓';
    RAISE NOTICE 'Partitioning configured: ✓';
    RAISE NOTICE 'Materialized views created: ✓';
    RAISE NOTICE 'Performance tuning applied: ✓';
END $$;
