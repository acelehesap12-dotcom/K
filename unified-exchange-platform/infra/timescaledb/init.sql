-- TimescaleDB schema for high-frequency market data

CREATE SCHEMA IF NOT EXISTS timescale;
SET search_path TO timescale;

-- ============ MARKET DATA HYPERTABLES ============
CREATE TABLE IF NOT EXISTS market_data (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    open DECIMAL(20, 8),
    high DECIMAL(20, 8),
    low DECIMAL(20, 8),
    close DECIMAL(20, 8),
    volume DECIMAL(30, 8),
    vwap DECIMAL(20, 8),
    bid DECIMAL(20, 8),
    ask DECIMAL(20, 8),
    bid_size DECIMAL(20, 8),
    ask_size DECIMAL(20, 8),
    last_trade_price DECIMAL(20, 8),
    last_trade_size DECIMAL(20, 8),
    trade_count INT
);

SELECT create_hypertable('market_data', 'time', if_not_exists => TRUE);
CREATE INDEX idx_market_data_symbol_time ON market_data (symbol, time DESC);
CREATE INDEX idx_market_data_asset_class ON market_data (asset_class, time DESC);

-- ============ TICK DATA (1-minute OHLCV) ============
CREATE TABLE IF NOT EXISTS tick_data_1m (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    asset_class VARCHAR(50) NOT NULL,
    open DECIMAL(20, 8),
    high DECIMAL(20, 8),
    low DECIMAL(20, 8),
    close DECIMAL(20, 8),
    volume DECIMAL(30, 8)
);

SELECT create_hypertable('tick_data_1m', 'time', if_not_exists => TRUE);
CREATE INDEX idx_tick_1m_symbol ON tick_data_1m (symbol, time DESC);

-- ============ ORDER BOOK SNAPSHOTS ============
CREATE TABLE IF NOT EXISTS order_book_snapshots (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    bid_levels INT,
    ask_levels INT,
    best_bid DECIMAL(20, 8),
    best_ask DECIMAL(20, 8),
    mid_price DECIMAL(20, 8),
    spread DECIMAL(20, 8),
    spread_bps DECIMAL(10, 4),
    total_bid_volume DECIMAL(30, 8),
    total_ask_volume DECIMAL(30, 8)
);

SELECT create_hypertable('order_book_snapshots', 'time', if_not_exists => TRUE);
CREATE INDEX idx_orderbook_symbol ON order_book_snapshots (symbol, time DESC);

-- ============ EXECUTION TIMESTAMPS (for latency tracking) ============
CREATE TABLE IF NOT EXISTS trade_execution_latencies (
    time TIMESTAMPTZ NOT NULL,
    order_id UUID,
    symbol VARCHAR(50) NOT NULL,
    order_received_at TIMESTAMPTZ,
    order_sent_to_exchange_at TIMESTAMPTZ,
    execution_received_at TIMESTAMPTZ,
    latency_ms DECIMAL(10, 3),
    side VARCHAR(10)
);

SELECT create_hypertable('trade_execution_latencies', 'time', if_not_exists => TRUE);
CREATE INDEX idx_exec_latency_symbol ON trade_execution_latencies (symbol, time DESC);

-- ============ ANOMALY DETECTION LOG ============
CREATE TABLE IF NOT EXISTS market_anomalies (
    time TIMESTAMPTZ NOT NULL,
    symbol VARCHAR(50) NOT NULL,
    anomaly_type VARCHAR(100) NOT NULL, -- price_spike, volume_spike, bid_ask_anomaly, etc
    severity VARCHAR(50), -- low, medium, high, critical
    description TEXT,
    metric_value DECIMAL(20, 8),
    threshold_value DECIMAL(20, 8),
    action_taken VARCHAR(255)
);

SELECT create_hypertable('market_anomalies', 'time', if_not_exists => TRUE);
CREATE INDEX idx_anomalies_symbol ON market_anomalies (symbol, time DESC);
CREATE INDEX idx_anomalies_severity ON market_anomalies (severity, time DESC);

-- ============ CONTINUOUS AGGREGATES (for performance) ============
CREATE MATERIALIZED VIEW IF NOT EXISTS tick_data_5m
WITH (timescaledb.continuous, timescaledb.materialized_only = false)
AS
SELECT
  time_bucket('5 minutes', time) as time,
  symbol,
  asset_class,
  first(open, time) as open,
  max(high) as high,
  min(low) as low,
  last(close, time) as close,
  sum(volume) as volume
FROM market_data
GROUP BY 1, 2, 3;

CREATE MATERIALIZED VIEW IF NOT EXISTS tick_data_1h
WITH (timescaledb.continuous, timescaledb.materialized_only = false)
AS
SELECT
  time_bucket('1 hour', time) as time,
  symbol,
  asset_class,
  first(open, time) as open,
  max(high) as high,
  min(low) as low,
  last(close, time) as close,
  sum(volume) as volume
FROM market_data
GROUP BY 1, 2, 3;

-- Create retention policy (keep 1 year of data)
SELECT add_retention_policy('market_data', INTERVAL '1 year', if_not_exists => TRUE);
SELECT add_retention_policy('tick_data_1m', INTERVAL '2 years', if_not_exists => TRUE);
SELECT add_retention_policy('order_book_snapshots', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('trade_execution_latencies', INTERVAL '1 year', if_not_exists => TRUE);
