"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type {
  Trade,
  Position,
  AccountSnapshot,
  Signal,
  NewsItem,
  WatchlistItem,
  ActivityEvent,
} from "@/lib/types";

// ── Account data ────────────────────────────────────────────

export function useAccountData() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [history, setHistory] = useState<AccountSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data: latest } = await supabase
      .from("account_snapshots")
      .select("*")
      .order("snapshot_time", { ascending: false })
      .limit(1)
      .single();

    const { data: hist } = await supabase
      .from("account_snapshots")
      .select("*")
      .order("snapshot_time", { ascending: true })
      .limit(500);

    if (latest) setSnapshot(latest);
    if (hist) setHistory(hist);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("account_snapshots")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "account_snapshots" },
        (payload) => {
          const row = payload.new as AccountSnapshot;
          setSnapshot(row);
          setHistory((prev) => [...prev, row]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { snapshot, history, loading };
}

// ── Positions ───────────────────────────────────────────────

export function usePositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from("positions").select("*");
    if (data) setPositions(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("positions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positions" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { positions, loading };
}

// ── Trades ──────────────────────────────────────────────────

export function useTrades(limit = 50) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("trades")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setTrades(data);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("trades")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { trades, loading };
}

// ── Signals ─────────────────────────────────────────────────

export function useSignals(limit = 20) {
  const [signals, setSignals] = useState<Signal[]>([]);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("signals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setSignals(data);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("signals")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "signals" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { signals };
}

// ── News ────────────────────────────────────────────────────

export function useNews(limit = 20) {
  const [news, setNews] = useState<NewsItem[]>([]);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setNews(data);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("news")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "news" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { news };
}

// ── Watchlist ──────────────────────────────────────────────

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("watchlist")
      .select("*")
      .eq("active", true)
      .order("score", { ascending: false });
    if (data) setWatchlist(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("watchlist")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watchlist" },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return { watchlist, loading };
}

// ── Activity Feed ────────────────────────────────────────────

export function useActivityFeed(limit = 100) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setEvents(data);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("activity_log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const row = payload.new as ActivityEvent;
          setEvents((prev) => [row, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, limit]);

  return { events, loading };
}

// ── Error Log ────────────────────────────────────────────────

export function useErrorLog(limit = 200) {
  const [errors, setErrors] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("level", "error")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setErrors(data);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("error_log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const row = payload.new as ActivityEvent;
          if (row.level === "error") {
            setErrors((prev) => [row, ...prev].slice(0, limit));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, limit]);

  return { errors, loading };
}

// ── Declined Trades (AI skip decisions + rejected candidates) ─

export function useDeclinedTrades(limit = 200) {
  const [declined, setDeclined] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // Fetch trade_decision skips and ai_response with rejections
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .or("event_type.eq.trade_decision,and(event_type.eq.ai_response,agent.eq.analyst)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data) setDeclined(data);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel("declined_trades")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const row = payload.new as ActivityEvent;
          if (
            row.event_type === "trade_decision" ||
            (row.event_type === "ai_response" && row.agent === "analyst")
          ) {
            setDeclined((prev) => [row, ...prev].slice(0, limit));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, limit]);

  return { declined, loading };
}
