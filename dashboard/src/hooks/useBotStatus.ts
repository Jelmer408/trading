"use client";

import { useEffect, useState, useCallback } from "react";

// Use local API route as proxy (bypasses broken Fly.io DNS)
const BOT_STATUS_URL = "/api/bot-status";
const POLL_INTERVAL = 5000; // 5 seconds

export interface BotStatus {
  status: "online" | "offline";
  uptime: string;
  uptime_seconds: number;
  timestamp: string;
  account: {
    equity: number;
    cash: number;
    buying_power: number;
    day_pnl: number;
    open_positions: number;
  };
  activity: {
    bars_received: number;
    signals_generated: number;
    trades_placed: number;
    last_bar_time: string | null;
  };
  config: {
    watchlist: string[];
    watchlist_size: number;
    timeframe: string;
    paper: boolean;
  };
  market?: {
    now_et: string;
    is_market_open: boolean;
    is_pre_market: boolean;
    market_open: string;
    market_close: string;
    opens_in_seconds: number | null;
    closes_in_seconds: number | null;
    next_open: string | null;
    trading_days: string;
  };
  strategy?: {
    name: string;
    ai_model: string;
    news_model: string;
    timeframe: string;
    min_confidence: number;
    min_signal_strength: number;
    min_risk_reward: string;
    patterns: string[];
    indicators: string[];
    confirmations: string[];
    data_sources: string[];
    risk: {
      max_position_pct: number;
      max_positions: number;
      stop_loss_pct: number;
      take_profit_pct: number;
      daily_loss_limit_pct: number;
    };
    pipeline: Array<{ step: number; name: string; desc: string }>;
    scan_intervals: Record<string, string>;
  };
  errors: {
    last_error: string | null;
  };
  logs: string[];
}

export function useBotStatus() {
  const [data, setData] = useState<BotStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(BOT_STATUS_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      setData(json);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
      // Keep last known data, just mark as potentially offline
      if (data) {
        setData({ ...data, status: "offline" });
      }
    }
  }, [data]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, error, lastFetch };
}
