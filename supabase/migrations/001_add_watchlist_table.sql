-- Migration: Add dynamic watchlist table
-- Run this in the Supabase SQL Editor

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

CREATE INDEX IF NOT EXISTS idx_watchlist_active ON watchlist (active, score DESC);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE watchlist;
