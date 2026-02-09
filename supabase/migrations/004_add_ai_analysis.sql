-- Add AI analysis columns to fundamentals table
-- ai_summary: Gemini Pro generated analysis (done once per day)
-- ai_analyzed_at: When the AI analysis was last run

ALTER TABLE fundamentals
ADD COLUMN IF NOT EXISTS ai_summary TEXT,
ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ;

-- Index for quick lookup of stale analyses
CREATE INDEX IF NOT EXISTS idx_fundamentals_ai_date
ON fundamentals (symbol, ai_analyzed_at DESC);
