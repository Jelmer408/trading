"use client";

import { useEffect, useState, useCallback } from "react";

const BOT_STATUS_URL =
  process.env.NEXT_PUBLIC_BOT_URL || "https://trading-symxyw.fly.dev";
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
      const resp = await fetch(`${BOT_STATUS_URL}/api/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
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
