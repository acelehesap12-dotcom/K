-- Create main database schema for exchange platform

CREATE SCHEMA IF NOT EXISTS exchange;
SET search_path TO exchange;

-- ============ USERS & AUTHENTICATION ============
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    kk99_balance DECIMAL(20, 6) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'active',
    kyc_status VARCHAR(50) DEFAULT 'pending',
    kyc_verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);

-- ============ WALLETS & DEPOSITS ============
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_address VARCHAR(255) NOT NULL,
    chain VARCHAR(50) NOT NULL, -- ETH, SOL, TRX, BTC
    balance DECIMAL(30, 18) DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_chain ON wallets(chain);
CREATE UNIQUE INDEX idx_wallets_unique ON wallets(wallet_address, chain);

CREATE TABLE deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    transaction_hash VARCHAR(255) UNIQUE NOT NULL,
    amount DECIMAL(30, 18) NOT NULL,
    kk99_amount_credited DECIMAL(20, 6) NOT NULL,
    chain VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, confirmed, credited, failed
    confirmations INT DEFAULT 0,
    required_confirmations INT DEFAULT 12,
    deposit_fee_percent DECIMAL(5, 2) DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    credited_at TIMESTAMP
);

CREATE INDEX idx_deposits_user_id ON deposits(user_id);
CREATE INDEX idx_deposits_status ON deposits(status);
CREATE INDEX idx_deposits_tx_hash ON deposits(transaction_hash);

-- ============ KK99 TOKEN TRANSACTIONS ============
CREATE TABLE kk99_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(20, 6) NOT NULL,
    tx_type VARCHAR(50) NOT NULL, -- deposit, withdrawal, trade, fee, reward, transfer
    related_order_id UUID,
    fee_amount DECIMAL(20, 6) DEFAULT 0,
    description VARCHAR(500),
    status VARCHAR(50) DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_kk99_tx_from_user ON kk99_transactions(from_user_id);
CREATE INDEX idx_kk99_tx_to_user ON kk99_transactions(to_user_id);
CREATE INDEX idx_kk99_tx_type ON kk99_transactions(tx_type);

-- ============ ASSET CLASSES ============
CREATE TABLE asset_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    class_type VARCHAR(50) NOT NULL, -- CRYPTO, FOREX, STOCK, BOND, ETF, COMMODITY, OPTION, FUTURES
    base_asset VARCHAR(50),
    quote_asset VARCHAR(50),
    min_order_size DECIMAL(20, 8),
    max_order_size DECIMAL(20, 8),
    tick_size DECIMAL(20, 8),
    maker_fee_bps DECIMAL(5, 2),
    taker_fee_bps DECIMAL(5, 2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_asset_classes_symbol ON asset_classes(symbol);
CREATE INDEX idx_asset_classes_type ON asset_classes(class_type);

-- Crypto pairs
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES 
  ('BTC-USD', 'Bitcoin / US Dollar', 'CRYPTO', 'BTC', 'USD', 0.001, 0.01, 5, 10),
  ('ETH-USD', 'Ethereum / US Dollar', 'CRYPTO', 'ETH', 'USD', 0.01, 0.01, 5, 10),
  ('SOL-USD', 'Solana / US Dollar', 'CRYPTO', 'SOL', 'USD', 0.1, 0.01, 5, 10);

-- Forex pairs
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('EUR-USD', 'Euro / US Dollar', 'FOREX', 'EUR', 'USD', 1000, 0.0001, 1, 2),
  ('GBP-USD', 'British Pound / US Dollar', 'FOREX', 'GBP', 'USD', 1000, 0.0001, 1, 2);

-- Stocks
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('AAPL', 'Apple Inc', 'STOCK', 'AAPL', 'USD', 1, 0.01, 5, 10),
  ('MSFT', 'Microsoft Corporation', 'STOCK', 'MSFT', 'USD', 1, 0.01, 5, 10);

-- Bonds
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('US10Y', 'US 10-Year Treasury', 'BOND', 'US10Y', 'USD', 1000, 0.01, 2, 4);

-- ETFs
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('SPY', 'SPDR S&P 500 ETF Trust', 'ETF', 'SPY', 'USD', 1, 0.01, 5, 10);

-- Commodities
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('GOLD', 'Gold Futures', 'COMMODITY', 'GOLD', 'USD', 1, 0.1, 2, 5),
  ('WTI', 'WTI Crude Oil', 'COMMODITY', 'WTI', 'USD', 1, 0.01, 2, 5);

-- Options (sample)
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('BTC-CALL', 'Bitcoin Call Options', 'OPTION', 'BTC', 'USD', 0.01, 0.01, 10, 20);

-- Futures
INSERT INTO asset_classes (symbol, name, class_type, base_asset, quote_asset, min_order_size, tick_size, maker_fee_bps, taker_fee_bps)
VALUES
  ('BTC-FUT', 'Bitcoin Futures', 'FUTURES', 'BTC', 'USD', 0.001, 0.1, 5, 10);

-- ============ ORDER BOOK ============
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_class_id UUID NOT NULL REFERENCES asset_classes(id),
    symbol VARCHAR(50) NOT NULL,
    order_type VARCHAR(50) NOT NULL, -- LIMIT, MARKET, STOP_LOSS, TAKE_PROFIT
    side VARCHAR(10) NOT NULL, -- BUY, SELL
    quantity DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8),
    stop_price DECIMAL(20, 8),
    time_in_force VARCHAR(20) DEFAULT 'GTC', -- GTC, IOC, FOK
    status VARCHAR(50) DEFAULT 'open', -- open, partially_filled, filled, cancelled, rejected
    filled_quantity DECIMAL(20, 8) DEFAULT 0,
    average_fill_price DECIMAL(20, 8),
    total_fee_kk99 DECIMAL(20, 6) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    filled_at TIMESTAMP
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_symbol ON orders(symbol);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_side ON orders(side);

-- ============ TRADES & EXECUTIONS ============
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buy_order_id UUID NOT NULL REFERENCES orders(id),
    sell_order_id UUID NOT NULL REFERENCES orders(id),
    buyer_user_id UUID NOT NULL REFERENCES users(id),
    seller_user_id UUID NOT NULL REFERENCES users(id),
    symbol VARCHAR(50) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    total_value DECIMAL(30, 8) NOT NULL,
    buyer_fee_kk99 DECIMAL(20, 6),
    seller_fee_kk99 DECIMAL(20, 6),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trades_buyer ON trades(buyer_user_id);
CREATE INDEX idx_trades_seller ON trades(seller_user_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);

-- ============ POSITIONS ============
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,
    quantity DECIMAL(20, 8) NOT NULL,
    entry_price DECIMAL(20, 8) NOT NULL,
    current_price DECIMAL(20, 8),
    unrealized_pnl DECIMAL(30, 8),
    realized_pnl DECIMAL(30, 8) DEFAULT 0,
    margin_used DECIMAL(30, 8),
    status VARCHAR(50) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_symbol ON positions(symbol);

-- ============ RISK & PORTFOLIO ============
CREATE TABLE portfolio_risk_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_portfolio_value DECIMAL(30, 8),
    var_95 DECIMAL(30, 8), -- Value at Risk 95%
    var_99 DECIMAL(30, 8), -- Value at Risk 99%
    margin_requirement DECIMAL(30, 8),
    span_margin DECIMAL(30, 8),
    available_margin DECIMAL(30, 8),
    risk_level VARCHAR(50), -- low, medium, high, critical
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portfolio_risk_user ON portfolio_risk_metrics(user_id);

-- ============ AUDIT LOG ============
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    old_value TEXT,
    new_value TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- ============ SETTINGS & CONFIG ============
CREATE TABLE system_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    is_secret BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

INSERT INTO system_config (key, value, description) VALUES
  ('platform_name', 'KK99 Exchange', 'Platform name'),
  ('maintenance_mode', 'false', 'Maintenance mode enabled'),
  ('trading_enabled', 'true', 'Trading is enabled'),
  ('deposit_enabled', 'true', 'Deposits are enabled');

GRANT USAGE ON SCHEMA exchange TO exchange_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA exchange TO exchange_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA exchange TO exchange_user;
