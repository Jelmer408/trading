-- ============================================================
-- Fundamentals table — cached financial ratios & company info
-- from Massive.com (Polygon.io) API
-- ============================================================

CREATE TABLE IF NOT EXISTS fundamentals (
    id              BIGSERIAL PRIMARY KEY,
    symbol          TEXT        NOT NULL UNIQUE,

    -- Company info (from /v3/reference/tickers/{ticker})
    name            TEXT,
    description     TEXT,
    sector          TEXT,
    industry        TEXT,
    homepage_url    TEXT,

    -- Valuation (from /stocks/financials/v1/ratios)
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

    -- Profitability
    return_on_equity DOUBLE PRECISION,
    return_on_assets DOUBLE PRECISION,

    -- Financial health
    debt_to_equity  DOUBLE PRECISION,
    current_ratio   DOUBLE PRECISION,
    quick_ratio     DOUBLE PRECISION,
    cash_ratio      DOUBLE PRECISION,
    free_cash_flow  DOUBLE PRECISION,

    -- Trading context
    avg_volume      DOUBLE PRECISION,
    dividend_yield  DOUBLE PRECISION,

    -- Metadata
    data_date       TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fundamentals_symbol ON fundamentals (symbol);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE fundamentals;
