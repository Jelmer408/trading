"use client";

import { useState, useEffect, Fragment } from "react";
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
import type { ActivityEvent } from "@/lib/types";

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

  const [expandedId, setExpandedId] = useState<number | null>(null);

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
    <div className="space-y-8">

      {/* ════════════════════════════════════════════════
          SECTION 1: Status + Market + Account
          ════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Bot status */}
        <div className="rounded-lg border border-[#e5e5e5] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Bot Status</h3>
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${isOnline ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
                style={{ animation: "blink 2s ease-in-out infinite" }}
              />
              <span className={`text-sm font-semibold ${isOnline ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#999]">Uptime</span>
              <span className="text-[#111] font-medium">{bot?.uptime || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Bars received</span>
              <span className="text-[#111] font-medium">{bot?.activity?.bars_received?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Trades placed</span>
              <span className="text-[#111] font-medium">{bot?.activity?.trades_placed?.toLocaleString() || "0"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Mode</span>
              <span className="text-[#111] font-medium">{bot?.config?.paper ? "Paper Trading" : "Live Trading"}</span>
            </div>
          </div>
        </div>

        {/* Market clock */}
        <div className="rounded-lg border border-[#e5e5e5] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide">Market</h3>
            <span className={`text-sm font-semibold ${
              isMarketOpen ? "text-[#16a34a]" : isPreMarket ? "text-[#d97706]" : "text-[#dc2626]"
            }`}>
              {isMarketOpen ? "Open" : isPreMarket ? "Pre-Market" : "Closed"}
            </span>
          </div>
          <div className="text-center py-2">
            <div className="text-xs text-[#999] mb-1">
              {isMarketOpen ? "Closes in" : "Opens in"}
            </div>
            <div className="text-3xl font-bold text-[#111] tabular-nums">
              {isMarketOpen ? formatCountdown(closesIn) : formatCountdown(opensIn)}
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-[#f0f0f0] text-sm">
            <div className="flex justify-between text-[#999]">
              <span>Hours</span>
              <span className="text-[#555]">{market?.market_open ?? "09:30"} – {market?.market_close ?? "16:00"} ET</span>
            </div>
            <div className="flex justify-between text-[#999] mt-1">
              <span>Days</span>
              <span className="text-[#555]">{market?.trading_days ?? "Mon–Fri"}</span>
            </div>
          </div>
          <div className={`mt-3 text-xs px-3 py-2 rounded-md ${
            isMarketOpen ? "bg-[#f0fdf4] text-[#16a34a]"
              : isPreMarket ? "bg-[#fffbeb] text-[#d97706]"
              : "bg-[#f8f8f8] text-[#999]"
          }`}>
            {isMarketOpen
              ? "Actively scanning bars and executing trades"
              : isPreMarket
                ? "Pre-market — loading data and scanning watchlist"
                : "Market closed — scanners run on schedule"
            }
          </div>
        </div>

        {/* Account */}
        <div className="rounded-lg border border-[#e5e5e5] p-5">
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide mb-4">Account</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#999]">Equity</span>
              <span className="text-[#111] font-bold text-base">{snapshot ? formatMoney(snapshot.equity) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Day P&L</span>
              <span className={`font-bold text-base ${
                snapshot ? (snapshot.day_pnl >= 0 ? "text-[#16a34a]" : "text-[#dc2626]") : "text-[#111]"
              }`}>
                {snapshot ? `${snapshot.day_pnl >= 0 ? "+" : ""}${formatMoney(snapshot.day_pnl)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Cash</span>
              <span className="text-[#111] font-medium">{snapshot ? formatMoney(snapshot.cash) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Buying power</span>
              <span className="text-[#111] font-medium">{snapshot ? formatMoney(snapshot.buying_power) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#999]">Open positions</span>
              <span className="text-[#111] font-medium">{positions.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 2: What It's Watching
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
                  <span key={w.id} className="px-3 py-1 text-sm font-semibold text-[#111] bg-white border border-[#e5e5e5] rounded-md">
                    {w.symbol}
                  </span>
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
                <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-[#fafafa] transition-colors">
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
                </div>
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
                <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-[#111]">{p.symbol}</span>
                    <span className="text-xs text-[#999] ml-2">{p.quantity} shares</span>
                  </div>
                  <span className={`text-sm font-semibold ${(p.unrealized_pnl || 0) >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                    {p.unrealized_pnl ? `$${p.unrealized_pnl.toFixed(2)}` : "—"}
                  </span>
                </div>
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
                <div key={t.id} className="px-5 py-3 flex items-center justify-between">
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
                </div>
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
                <div key={s.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${s.direction === "long" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`} />
                    <span className="text-sm font-bold text-[#111]">{s.symbol}</span>
                    <span className="text-xs text-[#999]">{s.name.replace(/_/g, " ")}</span>
                  </div>
                  <span className="text-sm text-[#555] font-medium">{(s.strength * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 6: Activity Feed
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
                    <span className="text-sm font-bold text-[#111]">{event.symbol}</span>
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
          SECTION 7: Live Log
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
