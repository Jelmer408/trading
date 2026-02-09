"use client";

import { useState, useEffect } from "react";
import { useBotStatus } from "@/hooks/useBotStatus";
import {
  useAccountData,
  usePositions,
  useTrades,
  useSignals,
  useWatchlist,
  useActivityFeed,
} from "@/hooks/useRealtimeData";
import PnLCurve from "@/components/charts/PnLCurve";
import { useTickerDrawer } from "@/context/TickerDrawerContext";
// ── Helpers ──────────────────────────────────────────

function formatMoney(val: number) {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function postTimeAgo(ts: string) {
  if (!ts) return "";
  try {
    const sec = (Date.now() - (ts.length < 13 ? Number(ts) * 1000 : new Date(ts).getTime())) / 1000;
    if (sec < 0) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  } catch { return ""; }
}

interface OverviewData {
  top_posts: Array<{ title: string; url: string; sub: string; time: string; upvotes: number; comments: number; symbol: string }>;
  top_tickers: Array<{ symbol: string; name?: string; rank: number; mentions: number; upvotes: number; rank_change?: number; mention_change?: number; sources: string[] }>;
  total_posts: number;
  total_upvotes: number;
  ai_analyses: Array<{ symbol: string; name: string; sector: string; ai_summary: string; ai_analyzed_at: string }>;
}

function formatCountdown(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds <= 0) return "—";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function useCountdown(seconds: number | null | undefined) {
  const [remaining, setRemaining] = useState(seconds ?? null);
  useEffect(() => { setRemaining(seconds ?? null); }, [seconds]);
  useEffect(() => {
    if (remaining == null || remaining <= 0) return;
    const timer = setInterval(() => setRemaining((r) => (r != null && r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);
  return remaining;
}

// ── Main Page ────────────────────────────────────────

export default function OverviewPage() {
  const { data: bot } = useBotStatus();
  const { snapshot, history } = useAccountData();
  const { positions } = usePositions();
  const { trades } = useTrades(10);
  const { signals } = useSignals(8);
  const { watchlist } = useWatchlist();
  const { events } = useActivityFeed(200);
  const { openTicker } = useTickerDrawer();

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);

  // Fetch overview data (top reddit posts, trending tickers)
  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setOverview(d); })
      .catch(() => {});
  }, []);

  const isOnline = bot?.status === "online";
  const market = bot?.market;
  const strategy = bot?.strategy;
  const opensIn = useCountdown(market?.opens_in_seconds);
  const closesIn = useCountdown(market?.closes_in_seconds);
  const isMarketOpen = market?.is_market_open ?? false;
  const isPreMarket = market?.is_pre_market ?? false;

  const discovered = watchlist.filter((w) => w.source !== "base");
  const base = watchlist.filter((w) => w.source === "base");

  return (
    <div className="space-y-8 pt-4">

      {/* ════════════════════════════════════════════════
          SECTION 1: Status + Market + Account
          ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr_1fr] gap-px bg-[#e5e5e5] rounded-2xl overflow-hidden border border-[#e5e5e5]">

        {/* Bot status */}
        <div className="bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-[0.15em]">System</span>
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
                  style={{ animation: isOnline ? "blink 2s ease-in-out infinite" : "none" }}
                />
                <span className={`text-[10px] font-semibold tracking-wide ${isOnline ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                  {isOnline ? "LIVE" : "OFF"}
                </span>
              </div>
            </div>
            <div className="mt-5">
              <div className="text-[10px] text-[#ccc] uppercase tracking-wider">Uptime</div>
              <div className="text-2xl font-bold text-[#111] tracking-tight mt-0.5">{bot?.uptime || "—"}</div>
            </div>
          </div>
          <div className="flex items-end gap-6 mt-6 pt-4 border-t border-[#f0f0f0]">
            <div>
              <div className="text-base font-bold text-[#111] tabular-nums">{bot?.activity?.bars_received?.toLocaleString() || "0"}</div>
              <div className="text-[9px] text-[#ccc] uppercase tracking-wider mt-0.5">bars</div>
            </div>
            <div>
              <div className="text-base font-bold text-[#111] tabular-nums">{bot?.activity?.trades_placed?.toLocaleString() || "0"}</div>
              <div className="text-[9px] text-[#ccc] uppercase tracking-wider mt-0.5">trades</div>
            </div>
            <div className="ml-auto">
              <span className="text-[10px] text-[#bbb] border border-[#e5e5e5] rounded px-2 py-0.5">
                {bot?.config?.paper ? "paper" : "live"}
              </span>
            </div>
          </div>
        </div>

        {/* Market clock — center piece */}
        <div className="bg-white p-6 flex flex-col items-center justify-center text-center">
          <div className="w-full flex items-center justify-between mb-4">
            <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-[0.15em]">Market</span>
            <div className="flex items-center gap-1.5">
              {/* State icon */}
              {isMarketOpen ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="#22c55e" strokeWidth="2"/><circle cx="7" cy="7" r="2" fill="#22c55e"/></svg>
              ) : isPreMarket ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V4M7 2L5 3.5M7 2L9 3.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/><path d="M3 8H11" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/><path d="M4 6L5.5 8M10 6L8.5 8" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round"/><path d="M2 10H12" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeDasharray="1.5 1.5"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 3.5C5.067 3.5 3.5 5.067 3.5 7C3.5 8.933 5.067 10.5 7 10.5C8.5 10.5 9.77 9.56 10.28 8.26C9.16 8.84 7.76 8.72 6.77 7.73C5.78 6.74 5.66 5.34 6.24 4.22C5.8 4.35 5.4 4.56 5.04 4.84" stroke="#888" strokeWidth="1.3" strokeLinecap="round"/></svg>
              )}
              <span className={`text-[10px] font-bold uppercase tracking-wider ${
                isMarketOpen ? "text-[#22c55e]" : isPreMarket ? "text-[#f59e0b]" : "text-[#999]"
              }`}>
                {isMarketOpen ? "Open" : isPreMarket ? "Pre-Mkt" : "Closed"}
              </span>
            </div>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className={`text-[10px] uppercase tracking-widest mb-1 ${
              isMarketOpen ? "text-[#22c55e]" : isPreMarket ? "text-[#f59e0b]" : "text-[#ccc]"
            }`}>
              {isMarketOpen ? "Closes in" : "Opens in"}
            </div>
            <div className="text-5xl font-black text-[#111] tabular-nums tracking-tighter leading-none">
              {isMarketOpen ? formatCountdown(closesIn) : formatCountdown(opensIn)}
            </div>
            <div className="text-[10px] text-[#ccc] mt-2">
              {market?.market_open ?? "09:30"} – {market?.market_close ?? "16:00"} ET / {market?.trading_days ?? "Mon–Fri"}
            </div>
          </div>
          <div className="w-full mt-4 pt-3 border-t border-[#f0f0f0]">
            <div className={`text-[10px] ${isPreMarket ? "text-[#f59e0b]" : isMarketOpen ? "text-[#22c55e]" : "text-[#bbb]"}`}>
              {isMarketOpen
                ? "/// scanning bars & executing trades"
                : isPreMarket
                  ? "/// warming up — loading data & scanning"
                  : "/// idle — scanners on schedule"
              }
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-[#bbb] uppercase tracking-[0.15em]">Account</span>
              <span className="text-[10px] text-[#ccc]">{positions.length} position{positions.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="mt-5">
              <div className="text-[10px] text-[#ccc] uppercase tracking-wider">Equity</div>
              <div className="text-2xl font-bold text-[#111] tracking-tight mt-0.5 tabular-nums">
                {snapshot ? formatMoney(snapshot.equity) : "—"}
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`text-sm font-bold tabular-nums ${
                snapshot ? (snapshot.day_pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]") : "text-[#ccc]"
              }`}>
                {snapshot ? `${snapshot.day_pnl >= 0 ? "+" : ""}${formatMoney(snapshot.day_pnl)}` : "—"}
              </span>
              <span className="text-[10px] text-[#ccc]">today</span>
            </div>
          </div>
          <div className="flex items-end gap-6 mt-6 pt-4 border-t border-[#f0f0f0]">
            <div>
              <div className="text-xs font-bold text-[#111] tabular-nums">{snapshot ? formatMoney(snapshot.cash) : "—"}</div>
              <div className="text-[9px] text-[#ccc] uppercase tracking-wider mt-0.5">cash</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#111] tabular-nums">{snapshot ? formatMoney(snapshot.buying_power) : "—"}</div>
              <div className="text-[9px] text-[#ccc] uppercase tracking-wider mt-0.5">buying power</div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 2: Activity Feed
          ════════════════════════════════════════════════ */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Activity Feed</h3>
          <span className="text-xs text-[#999]">{events.length} events</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-[#f0f0f0]">
          {events.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-8">Awaiting agent activity...</div>
          ) : (
            events.slice(0, 50).map((event) => (
              <div
                key={event.id}
                className="px-5 py-3 hover:bg-[#fafafa] cursor-pointer transition-colors"
                onClick={() => setExpandedId(expandedId === event.id ? null : event.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#ccc] w-14 shrink-0 tabular-nums">{timeAgo(event.created_at)}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    event.agent === "scanner" ? "bg-[#f5f5f5] text-[#555]" :
                    event.agent === "analyst" ? "bg-[#eff6ff] text-[#2563eb]" :
                    event.agent === "news_ai" ? "bg-[#fffbeb] text-[#d97706]" :
                    event.agent === "executor" ? "bg-[#f0fdf4] text-[#16a34a]" :
                    "bg-[#f5f5f5] text-[#999]"
                  }`}>
                    {event.agent}
                  </span>
                  {event.symbol && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openTicker(event.symbol!); }}
                      className="text-sm font-bold text-[#111] hover:text-[#2563eb] transition-colors"
                    >
                      {event.symbol}
                    </button>
                  )}
                  <span className={`text-sm truncate ${
                    event.level === "error" ? "text-[#dc2626]" :
                    event.level === "warn" ? "text-[#d97706]" :
                    event.level === "success" ? "text-[#111]" :
                    "text-[#555]"
                  }`}>
                    {event.title}
                  </span>
                </div>
                {expandedId === event.id && event.detail && (
                  <div className="mt-2 ml-[68px]">
                    <div className="text-xs text-[#555] leading-relaxed whitespace-pre-wrap bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[300px] overflow-y-auto">
                      {event.detail}
                    </div>
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(event.metadata).map(([key, val]) => (
                          <span key={key} className="text-[11px] px-2 py-0.5 bg-[#f5f5f5] rounded text-[#555]">
                            {key}: {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 3: What It's Watching
          ════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#111]">Watching {watchlist.length} stocks</h2>
            <p className="text-sm text-[#999]">These are the stocks the bot will analyze on every 5-min bar during market hours</p>
          </div>
        </div>

        <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
          {/* Core watchlist */}
          {base.length > 0 && (
            <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
              <div className="text-xs text-[#999] font-medium mb-2">Core watchlist (always active)</div>
              <div className="flex flex-wrap gap-2">
                {base.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => openTicker(w.symbol)}
                    className="px-3 py-1 text-sm font-semibold text-[#111] bg-white border border-[#e5e5e5] rounded-md hover:bg-[#f5f5f5] hover:border-[#ccc] transition-all cursor-pointer"
                  >
                    {w.symbol}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discovered stocks */}
          {discovered.length > 0 && (
            <div className="divide-y divide-[#f0f0f0]">
              <div className="px-5 py-3 bg-[#fafafa]">
                <div className="text-xs text-[#999] font-medium">Discovered by AI scanner</div>
              </div>
              {discovered.map((w) => (
                <button
                  key={w.id}
                  onClick={() => openTicker(w.symbol)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#fafafa] transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#111]">{w.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      w.source === "ai_approved"
                        ? "bg-[#eff6ff] text-[#2563eb]"
                        : "bg-[#f8f8f8] text-[#999]"
                    }`}>
                      {w.source === "ai_approved" ? "AI Approved" : "Score-based"}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    {w.discovery_sources && w.discovery_sources.length > 0 && (
                      <div className="flex gap-1">
                        {w.discovery_sources.map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                        ))}
                      </div>
                    )}
                    <span className="text-sm text-[#555] tabular-nums w-10 text-right">{w.score.toFixed(0)}</span>
                  </div>
                </button>
              ))}
              {discovered.length > 0 && discovered[0].reason && (
                <div className="px-5 py-2 bg-[#fafafa] text-xs text-[#999]">
                  Latest reasoning: {discovered[0].reason}
                </div>
              )}
            </div>
          )}

          {watchlist.length === 0 && (
            <div className="text-sm text-[#999] text-center py-8">Scanner initializing...</div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 3: How It Decides
          ════════════════════════════════════════════════ */}
      <div>
        <h2 className="text-lg font-bold text-[#111] mb-1">How it decides to trade</h2>
        <p className="text-sm text-[#999] mb-4">Every 5-minute bar goes through this pipeline. A trade only happens if every step passes.</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { step: "1", title: "Detect Pattern", desc: "14 candlestick patterns scanned on the latest candle", detail: "Doji, hammer, engulfing, morning star..." },
            { step: "2", title: "Score Signal", desc: "Pattern + RSI + MACD + EMA + volume + trend = combined score", detail: `Minimum strength: ${((strategy?.min_signal_strength ?? 0.6) * 100).toFixed(0)}%` },
            { step: "3", title: "Risk Check", desc: `Max ${strategy?.risk?.max_positions ?? 3} positions, ${((strategy?.risk?.daily_loss_limit_pct ?? 0.03) * 100).toFixed(0)}% daily loss limit`, detail: `${((strategy?.risk?.max_position_pct ?? 0.05) * 100).toFixed(0)}% per position` },
            { step: "4", title: "AI Evaluation", desc: `${strategy?.ai_model ?? "Gemini 3 Pro"} reviews signal with full market context`, detail: `Min confidence: ${((strategy?.min_confidence ?? 0.6) * 100).toFixed(0)}%` },
          ].map((p) => (
            <div key={p.step} className="rounded-lg border border-[#e5e5e5] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-[#111] text-white text-xs flex items-center justify-center font-bold">{p.step}</span>
                <span className="text-sm font-semibold text-[#111]">{p.title}</span>
              </div>
              <p className="text-xs text-[#555] leading-relaxed">{p.desc}</p>
              <p className="text-[11px] text-[#999] mt-1">{p.detail}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-[#999]">Data sources:</span>
          {(strategy?.data_sources ?? ["Alpaca real-time bars", "PlusE Finance", "Reddit RSS", "Alpaca news", "ApeWisdom"]).map((s) => (
            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#555]">{s}</span>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 4: Equity + Positions
          ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0]">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Equity Curve</h3>
          </div>
          <div className="p-3">
            {history.length > 0 ? (
              <PnLCurve data={history} height={200} />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-sm text-[#ccc]">
                Awaiting data...
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Open Positions</h3>
            <span className="text-xs text-[#999]">{positions.length}</span>
          </div>
          {positions.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-8">No open positions</div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {positions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openTicker(p.symbol)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#fafafa] transition-colors cursor-pointer text-left"
                >
                  <div>
                    <span className="text-sm font-bold text-[#111]">{p.symbol}</span>
                    <span className="text-xs text-[#999] ml-2">{p.quantity} shares</span>
                  </div>
                  <span className={`text-sm font-semibold ${(p.unrealized_pnl || 0) >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                    {p.unrealized_pnl ? `$${p.unrealized_pnl.toFixed(2)}` : "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 5: Recent Trades + Signals
          ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Recent Trades</h3>
            <span className="text-xs text-[#999]">{trades.length}</span>
          </div>
          {trades.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-8">No trades yet — waiting for market open</div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {trades.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicker(t.symbol)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#fafafa] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[#111]">{t.symbol}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.side === "buy" ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
                    }`}>
                      {t.side.toUpperCase()}
                    </span>
                  </div>
                  <span className={`text-sm font-semibold ${(t.pnl || 0) >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                    {t.pnl != null ? `$${t.pnl.toFixed(2)}` : t.status.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Recent Signals</h3>
            <span className="text-xs text-[#999]">{signals.length}</span>
          </div>
          {signals.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-8">No signals detected yet</div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {signals.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openTicker(s.symbol)}
                  className="w-full px-5 py-3 flex items-center justify-between hover:bg-[#fafafa] transition-colors cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${s.direction === "long" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`} />
                    <span className="text-sm font-bold text-[#111]">{s.symbol}</span>
                    <span className="text-xs text-[#999]">{s.name.replace(/_/g, " ")}</span>
                  </div>
                  <span className="text-sm text-[#555] font-medium">{(s.strength * 100).toFixed(0)}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 6: Watchlist Intelligence & Top Reddit
          ════════════════════════════════════════════════ */}
      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Reddit Posts */}
          <div className="rounded-lg border border-[#e5e5e5]">
            <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
              <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Top Reddit Posts</h3>
              <span className="text-xs text-[#ccc]">{overview.total_posts} posts · {overview.total_upvotes.toLocaleString()} upvotes</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-[#f0f0f0]">
              {overview.top_posts.length === 0 ? (
                <div className="text-sm text-[#ccc] text-center py-8">Awaiting Reddit scan data...</div>
              ) : (
                overview.top_posts.map((post, i) => (
                  <div key={post.url || i} className="px-5 py-3 hover:bg-[#fafafa] transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-center w-10 pt-0.5">
                        <div className="text-xs font-bold text-[#111] tabular-nums">{post.upvotes.toLocaleString()}</div>
                        <div className="text-[9px] text-[#ccc]">votes</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#333] leading-snug hover:text-[#111] line-clamp-2"
                        >
                          {post.title}
                        </a>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => openTicker(post.symbol)}
                            className="text-[11px] font-bold text-[#111] bg-[#f0f0f0] px-1.5 py-0.5 rounded hover:bg-[#e5e5e5] transition-colors"
                          >
                            {post.symbol}
                          </button>
                          <span className="text-[11px] text-[#2563eb] bg-[#eff6ff] px-1.5 py-0.5 rounded">{post.sub}</span>
                          {post.comments > 0 && (
                            <span className="text-[11px] text-[#999]">{post.comments} comments</span>
                          )}
                          {post.time && (
                            <span className="text-[11px] text-[#ccc]">{postTimeAgo(post.time)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Trending Tickers */}
          <div className="rounded-lg border border-[#e5e5e5]">
            <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Trending Tickers</h3>
                <div className="relative group">
                  <span className="text-[10px] text-[#ccc] cursor-help border border-[#e5e5e5] rounded-full w-4 h-4 flex items-center justify-center">i</span>
                  <div className="hidden group-hover:block absolute left-6 top-0 z-50 bg-white border border-[#e5e5e5] rounded-lg shadow-lg p-3 w-56 text-[11px] text-[#666]">
                    Live ranking from ApeWisdom. Shows tickers most discussed across Reddit stock communities in the last 24h, ranked by mention count.
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-[#ccc]">via ApeWisdom &bull; live</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto divide-y divide-[#f0f0f0]">
              {overview.top_tickers.length === 0 ? (
                <div className="text-sm text-[#ccc] text-center py-8">No trending tickers yet</div>
              ) : (
                overview.top_tickers.map((t) => (
                  <button
                    key={t.symbol}
                    onClick={() => openTicker(t.symbol)}
                    className="w-full px-5 py-2.5 flex items-center justify-between hover:bg-[#f8f8f8] transition-colors cursor-pointer text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#ccc] w-5 text-right tabular-nums font-mono">#{t.rank}</span>
                      <div>
                        <span className="text-sm font-bold text-[#111]">{t.symbol}</span>
                        {t.name && (
                          <span className="text-[11px] text-[#bbb] ml-1.5">{t.name.slice(0, 20)}</span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {t.sources.map((s) => (
                          <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[11px] text-[#666] tabular-nums">{t.mentions} mentions</div>
                        <div className="text-[10px] text-[#bbb] tabular-nums">{t.upvotes.toLocaleString()} upvotes</div>
                      </div>
                      {(t.rank_change ?? 0) !== 0 && (
                        <span
                          className="text-[10px] font-bold tabular-nums"
                          style={{ color: (t.rank_change ?? 0) > 0 ? "#16a34a" : "#dc2626" }}
                        >
                          {(t.rank_change ?? 0) > 0 ? `▲${t.rank_change}` : `▼${Math.abs(t.rank_change ?? 0)}`}
                        </span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          SECTION 8: Live Log
          ════════════════════════════════════════════════ */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between">
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Live Log</h3>
          {bot?.errors?.last_error && (
            <span className="text-xs text-[#dc2626]">{bot.errors.last_error.slice(0, 60)}</span>
          )}
        </div>
        <div className="p-4 max-h-[200px] overflow-y-auto bg-[#fafafa] text-xs leading-relaxed">
          {bot?.logs && bot.logs.length > 0 ? (
            bot.logs.map((line, i) => (
              <div key={i} className={
                line.includes("TRADE") ? "text-[#111] font-medium" :
                line.includes("ERROR") || line.includes("FAIL") ? "text-[#dc2626]" :
                line.includes("WATCHLIST") || line.includes("NEWS") ? "text-[#555]" :
                "text-[#999]"
              }>
                {line}
              </div>
            ))
          ) : (
            <div className="text-[#ccc]">Connecting to bot...</div>
          )}
        </div>
      </div>
    </div>
  );
}
