-- ============================================================
-- Autonomous Candle Trading System - Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- ============================================================

-- OHLCV candle bars for charting
CREATE TABLE IF NOT EXISTS candles (
    id          BIGSERIAL PRIMARY KEY,
    symbol      TEXT        NOT NULL,
    timeframe   TEXT        NOT NULL,  -- '1Min', '5Min', '15Min'
    timestamp   TIMESTAMPTZ NOT NULL,
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume      BIGINT      NOT NULL DEFAULT 0,
    vwap        DOUBLE PRECISION,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (symbol, timeframe, timestamp)
);

CREATE INDEX idx_candles_symbol_tf_ts ON candles (symbol, timeframe, timestamp DESC);

-- Detected signals (candle patterns, price action, combined)
CREATE TABLE IF NOT EXISTS signals (
    id          BIGSERIAL PRIMARY KEY,
    symbol      TEXT        NOT NULL,
    timeframe   TEXT        NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,
    signal_type TEXT        NOT NULL,  -- 'candle_pattern', 'price_action', 'combined'
    name        TEXT        NOT NULL,  -- e.g. 'bullish_engulfing', 'breakout_up'
    direction   TEXT        NOT NULL,  -- 'long', 'short'
    strength    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- 0.0 to 1.0
    details     JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_symbol_ts ON signals (symbol, timestamp DESC);

-- Executed trades with full lifecycle
CREATE TABLE IF NOT EXISTS trades (
    id              BIGSERIAL PRIMARY KEY,
    alpaca_order_id TEXT        UNIQUE,
    symbol          TEXT        NOT NULL,
    side            TEXT        NOT NULL,  -- 'buy', 'sell'
    quantity        DOUBLE PRECISION NOT NULL,
    entry_price     DOUBLE PRECISION,
    exit_price      DOUBLE PRECISION,
    stop_loss       DOUBLE PRECISION,
    take_profit     DOUBLE PRECISION,
    status          TEXT        NOT NULL DEFAULT 'pending',  -- 'pending', 'filled', 'closed', 'cancelled'
    pnl             DOUBLE PRECISION,
    pnl_pct         DOUBLE PRECISION,
    signal_id       BIGINT      REFERENCES signals(id),
    ai_reasoning    TEXT,
    entry_time      TIMESTAMPTZ,
    exit_time       TIMESTAMPTZ,
    duration_sec    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trades_symbol ON trades (symbol, created_at DESC);
CREATE INDEX idx_trades_status ON trades (status);

-- Current open positions (synced from Alpaca)
CREATE TABLE IF NOT EXISTS positions (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT        NOT NULL UNIQUE,
    side            TEXT        NOT NULL,  -- 'long', 'short'
    quantity        DOUBLE PRECISION NOT NULL,
    avg_entry_price DOUBLE PRECISION NOT NULL,
    current_price   DOUBLE PRECISION,
    market_value    DOUBLE PRECISION,
    unrealized_pnl  DOUBLE PRECISION,
    unrealized_pnl_pct DOUBLE PRECISION,
    stop_loss       DOUBLE PRECISION,
    take_profit     DOUBLE PRECISION,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Account balance snapshots for equity curve
CREATE TABLE IF NOT EXISTS account_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    equity          DOUBLE PRECISION NOT NULL,
    cash            DOUBLE PRECISION NOT NULL,
    buying_power    DOUBLE PRECISION NOT NULL,
    day_pnl         DOUBLE PRECISION NOT NULL DEFAULT 0,
    day_pnl_pct     DOUBLE PRECISION NOT NULL DEFAULT 0,
    open_positions  INTEGER     NOT NULL DEFAULT 0,
    snapshot_time   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_time ON account_snapshots (snapshot_time DESC);

-- AI-digested news items
CREATE TABLE IF NOT EXISTS news (
    id          BIGSERIAL PRIMARY KEY,
    symbol      TEXT,
    headline    TEXT        NOT NULL,
    summary     TEXT,
    sentiment   TEXT,       -- 'bullish', 'bearish', 'neutral'
    source      TEXT,
    url         TEXT,
    published_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_symbol ON news (symbol, created_at DESC);

-- User configuration (watchlist, risk params)
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('watchlist', '["AAPL", "MSFT", "NVDA", "TSLA", "SPY"]'),
    ('risk_params', '{"max_position_pct": 0.05, "max_positions": 3, "stop_loss_pct": 0.02, "take_profit_pct": 0.04, "daily_loss_limit_pct": 0.03}'),
    ('strategy', '{"timeframe": "5Min", "min_signal_strength": 0.6, "use_ai_confirmation": true}')
ON CONFLICT (key) DO NOTHING;

-- Dynamic watchlist (auto-discovered from Reddit, news, AI)
CREATE TABLE IF NOT EXISTS watchlist (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT        NOT NULL UNIQUE,
    source          TEXT        NOT NULL DEFAULT 'base',  -- 'base', 'discovered', 'ai_approved'
    reason          TEXT,
    score           DOUBLE PRECISION NOT NULL DEFAULT 0,
    discovery_sources TEXT[]    NOT NULL DEFAULT '{}',     -- e.g. ['r/wallstreetbets', 'alpaca_news']
    active          BOOLEAN     NOT NULL DEFAULT TRUE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_watchlist_active ON watchlist (active, score DESC);

-- Cached fundamental data from Massive.com (Polygon.io)
CREATE TABLE IF NOT EXISTS fundamentals (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT        NOT NULL UNIQUE,
    name            TEXT,
    description     TEXT,
    sector          TEXT,
    industry        TEXT,
    homepage_url    TEXT,
    market_cap      DOUBLE PRECISION,
    enterprise_value DOUBLE PRECISION,
    eps             DOUBLE PRECISION,
    pe_ratio        DOUBLE PRECISION,
    pb_ratio        DOUBLE PRECISION,
    ps_ratio        DOUBLE PRECISION,
    price_to_cash_flow DOUBLE PRECISION,
    price_to_free_cash_flow DOUBLE PRECISION,
    ev_to_ebitda    DOUBLE PRECISION,
    ev_to_sales     DOUBLE PRECISION,
    return_on_equity DOUBLE PRECISION,
    return_on_assets DOUBLE PRECISION,
    debt_to_equity  DOUBLE PRECISION,
    current_ratio   DOUBLE PRECISION,
    quick_ratio     DOUBLE PRECISION,
    cash_ratio      DOUBLE PRECISION,
    free_cash_flow  DOUBLE PRECISION,
    avg_volume      DOUBLE PRECISION,
    dividend_yield  DOUBLE PRECISION,
    data_date       TEXT,
    ai_summary      TEXT,
    ai_analyzed_at  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fundamentals_symbol ON fundamentals (symbol);

-- Activity log: full agent pipeline visibility
CREATE TABLE IF NOT EXISTS activity_log (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT        NOT NULL,
    agent       TEXT        NOT NULL,
    symbol      TEXT,
    title       TEXT        NOT NULL,
    detail      TEXT,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    level       TEXT        NOT NULL DEFAULT 'info',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_log_time ON activity_log (created_at DESC);
CREATE INDEX idx_activity_log_type ON activity_log (event_type, created_at DESC);
CREATE INDEX idx_activity_log_agent ON activity_log (agent, created_at DESC);

-- Enable real-time for dashboard subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE candles;
ALTER PUBLICATION supabase_realtime ADD TABLE signals;
ALTER PUBLICATION supabase_realtime ADD TABLE trades;
ALTER PUBLICATION supabase_realtime ADD TABLE positions;
ALTER PUBLICATION supabase_realtime ADD TABLE account_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE news;
ALTER PUBLICATION supabase_realtime ADD TABLE watchlist;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE fundamentals;