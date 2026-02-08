-- Migration: Add activity_log table for full agent pipeline visibility
-- Run this in the Supabase SQL Editor

CREATE TABLE IF NOT EXISTS activity_log (
    id          BIGSERIAL PRIMARY KEY,
    event_type  TEXT        NOT NULL,      -- 'scan_reddit', 'scan_news', 'ai_watchlist', 'ai_trade', 'pattern', 'trade', 'news_analysis', 'error'
    agent       TEXT        NOT NULL,      -- 'scanner', 'analyst', 'strategist', 'executor', 'news_ai'
    symbol      TEXT,
    title       TEXT        NOT NULL,      -- Short human-readable title
    detail      TEXT,                      -- Longer description / AI prompt / response
    metadata    JSONB       NOT NULL DEFAULT '{}',  -- Structured data (scores, tickers, decisions)
    level       TEXT        NOT NULL DEFAULT 'info', -- 'info', 'warn', 'error', 'success'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_agent ON activity_log (agent, created_at DESC);

-- Enable real-time
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- Auto-cleanup: keep only last 7 days of activity
-- (Run this as a cron job or manual cleanup)
-- DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '7 days';
