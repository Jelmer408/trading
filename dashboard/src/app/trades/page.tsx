"use client";

import { useState } from "react";
import { useTrades, useDeclinedTrades, usePositions } from "@/hooks/useRealtimeData";
import { useTickerDrawer } from "@/context/TickerDrawerContext";

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function TradesPage() {
  const { trades, loading } = useTrades(100);
  const { declined, loading: declinedLoading } = useDeclinedTrades(200);
  const { positions } = usePositions();
  const { openTicker } = useTickerDrawer();

  // Build position lookup by symbol for current price data
  const posMap = Object.fromEntries(positions.map((p) => [p.symbol, p]));
  const [expandedDecline, setExpandedDecline] = useState<number | null>(null);
  const [showAllDeclined, setShowAllDeclined] = useState(false);
  const [tradeView, setTradeView] = useState<"live" | "history">("live");

  const liveTrades = trades.filter((t) => t.status === "filled" || t.status === "pending");
  const historyTrades = trades.filter((t) => t.status === "closed" || t.status === "cancelled");
  const displayedTrades = tradeView === "live" ? liveTrades : historyTrades;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">Trades</h2>
        <p className="text-sm text-[#999]">Full trade history with lifecycle tracking</p>
      </div>

      {/* Open Positions with SL/TP Progress */}
      {(() => {
        const openTrades = trades.filter((t) => t.status === "filled");
        if (openTrades.length === 0) return null;
        return (
          <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Open Positions</span>
              </div>
              <span className="text-xs text-[#999]">{openTrades.length} active</span>
            </div>
            <div className="divide-y divide-[#f0f0f0]">
              {openTrades.map((t) => {
                const entry = t.entry_price || 0;
                const sl = t.stop_loss || 0;
                const tp = t.take_profit || 0;
                const isLong = t.side === "buy";
                const pos = posMap[t.symbol];
                const currentPrice = pos?.current_price ?? entry;
                const unrealizedPnl = pos?.unrealized_pnl ?? 0;
                const unrealizedPct = pos?.unrealized_pnl_pct ?? 0;

                // Calculate position of current price on the SL-to-TP range (0% = SL, 100% = TP)
                const range = Math.abs(tp - sl);
                const priceProgress = range > 0
                  ? (isLong
                      ? ((currentPrice - sl) / range) * 100
                      : ((sl - currentPrice + range) / range) * 100)
                  : 50;

                // Distance to TP
                const distToTp = isLong ? tp - currentPrice : currentPrice - tp;
                const distToTpPct = entry > 0 ? ((distToTp / entry) * 100) : 0;

                // Is profitable?
                const isProfitable = unrealizedPnl >= 0;

                return (
                  <div key={t.id} className="px-5 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <button onClick={() => openTicker(t.symbol)} className="font-bold text-[#111] hover:text-[#2563eb] transition-colors cursor-pointer">{t.symbol}</button>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isLong ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"}`}>
                          {isLong ? "LONG" : "SHORT"}
                        </span>
                        <span className="text-xs text-[#999]">{t.quantity} shares</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#999]">
                          Entry ${entry.toFixed(2)}
                        </span>
                        <span className={`text-xs font-bold ${isProfitable ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                          Now ${currentPrice.toFixed(2)}
                        </span>
                        <span className={`text-xs font-bold ${isProfitable ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                          {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)} ({unrealizedPct >= 0 ? "+" : ""}{unrealizedPct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    {/* SL / TP Progress Bar */}
                    <div className="relative h-3 bg-[#f0f0f0] rounded-full overflow-hidden">
                      {/* Gradient background: red on left → green on right */}
                      <div className="absolute inset-0 rounded-full overflow-hidden flex">
                        <div className="w-1/4 bg-gradient-to-r from-[#fecaca] to-[#f0f0f0]" />
                        <div className="flex-1" />
                        <div className="w-1/4 bg-gradient-to-l from-[#bbf7d0] to-[#f0f0f0]" />
                      </div>
                      {/* Entry marker (thin dark line) */}
                      {(() => {
                        const entryPos = range > 0
                          ? (isLong ? ((entry - sl) / range) * 100 : ((sl - entry + range) / range) * 100)
                          : 50;
                        return (
                          <div
                            className="absolute top-0 h-full w-px bg-[#999]"
                            style={{ left: `${Math.min(Math.max(entryPos, 1), 99)}%` }}
                            title={`Entry $${entry.toFixed(2)}`}
                          />
                        );
                      })()}
                      {/* Current price marker (thick colored dot) */}
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm ${isProfitable ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
                        style={{ left: `${Math.min(Math.max(priceProgress, 1), 99)}%`, marginLeft: "-6px" }}
                        title={`Current $${currentPrice.toFixed(2)}`}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <span className="text-[10px] text-[#dc2626] font-medium">SL ${sl.toFixed(2)}</span>
                      <span className={`text-[10px] font-medium ${distToTp <= 0 ? "text-[#16a34a]" : "text-[#999]"}`}>
                        {distToTp > 0
                          ? `$${distToTp.toFixed(2)} to TP (${distToTpPct.toFixed(1)}%)`
                          : "At/past TP target"}
                      </span>
                      <span className="text-[10px] text-[#16a34a] font-medium">TP ${tp.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          {/* Tab switch */}
          <div className="flex items-center gap-1 bg-[#f0f0f0] rounded-lg p-0.5">
            <button
              onClick={() => setTradeView("live")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tradeView === "live"
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-[#999] hover:text-[#555]"
              }`}
            >
              Live{liveTrades.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tradeView === "live" ? "bg-[#eff6ff] text-[#2563eb]" : "bg-[#e5e5e5] text-[#999]"
                }`}>
                  {liveTrades.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTradeView("history")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tradeView === "history"
                  ? "bg-white text-[#111] shadow-sm"
                  : "text-[#999] hover:text-[#555]"
              }`}
            >
              History{historyTrades.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tradeView === "history" ? "bg-[#f5f5f5] text-[#555]" : "bg-[#e5e5e5] text-[#999]"
                }`}>
                  {historyTrades.length}
                </span>
              )}
            </button>
          </div>
          {/* Summary stats */}
          {tradeView === "history" && historyTrades.length > 0 && (() => {
            const closed = historyTrades.filter((t) => t.status === "closed");
            const totalPnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
            const wins = closed.filter((t) => (t.pnl || 0) > 0).length;
            const winRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(0) : "0";
            return (
              <div className="flex items-center gap-4 text-xs">
                <span className={`font-bold ${totalPnl >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                  Total: {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </span>
                <span className="text-[#999]">
                  {winRate}% win rate ({wins}/{closed.length})
                </span>
              </div>
            );
          })()}
          {tradeView === "live" && liveTrades.length > 0 && (() => {
            const totalUnrealized = liveTrades.reduce((sum, t) => {
              const pos = posMap[t.symbol];
              return sum + (pos?.unrealized_pnl ?? 0);
            }, 0);
            return (
              <span className={`text-xs font-bold ${totalUnrealized >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                Unrealized: {totalUnrealized >= 0 ? "+" : ""}${totalUnrealized.toFixed(2)}
              </span>
            );
          })()}
        </div>

        {loading ? (
          <div className="text-sm text-[#ccc] text-center py-12">Loading...</div>
        ) : displayedTrades.length === 0 ? (
          <div className="text-sm text-[#ccc] text-center py-12">
            {tradeView === "live" ? "No active trades" : "No closed trades yet"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
                  {(tradeView === "live"
                    ? ["Time", "Symbol", "Side", "Qty", "Entry", "Current", "P&L ($)", "P&L (%)"]
                    : ["Time", "Symbol", "Side", "Qty", "Entry", "Exit", "P&L ($)", "P&L (%)", "Duration"]
                  ).map((h) => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-medium text-[#999] whitespace-nowrap ${
                      h.startsWith("P&L") || h === "Duration" ? "text-right" : "text-left"
                    }`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedTrades.map((t) => {
                  const pos = posMap[t.symbol];
                  const isLive = tradeView === "live";
                  const currentPrice = isLive ? (pos?.current_price ?? t.entry_price ?? 0) : (t.exit_price ?? 0);
                  const entry = t.entry_price || 0;

                  // P&L calculation
                  let pnlDollar: number | null;
                  let pnlPct: number | null;

                  if (isLive && pos) {
                    pnlDollar = pos.unrealized_pnl ?? null;
                    pnlPct = pos.unrealized_pnl_pct ?? null;
                  } else {
                    pnlDollar = t.pnl ?? null;
                    pnlPct = t.pnl_pct ?? null;
                  }

                  // Duration formatting
                  const dur = t.duration_sec;
                  let durStr = "—";
                  if (dur != null) {
                    if (dur < 60) durStr = `${dur}s`;
                    else if (dur < 3600) durStr = `${Math.floor(dur / 60)}m ${dur % 60}s`;
                    else durStr = `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`;
                  }

                  const isProfitable = (pnlDollar ?? 0) >= 0;

                  return (
                    <tr key={t.id} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-2.5 text-[#999] whitespace-nowrap text-xs">
                        {new Date(t.created_at).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-[#111]">
                        <button onClick={() => openTicker(t.symbol)} className="hover:text-[#2563eb] transition-colors cursor-pointer">{t.symbol}</button>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.side === "buy" ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
                        }`}>
                          {t.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#555]">{t.quantity}</td>
                      <td className="px-4 py-2.5 text-[#555]">
                        {entry ? `$${entry.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[#555]">
                        {isLive ? (
                          <span className={`font-medium ${isProfitable ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                            {currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}
                          </span>
                        ) : (
                          t.exit_price ? (
                            <span className={t.status === "cancelled" ? "text-[#999]" : ""}>
                              {t.status === "cancelled" ? "Cancelled" : `$${t.exit_price.toFixed(2)}`}
                            </span>
                          ) : (
                            <span className="text-[#999]">{t.status === "cancelled" ? "Cancelled" : "—"}</span>
                          )
                        )}
                      </td>
                      {/* P&L Dollar */}
                      <td className={`px-4 py-2.5 text-right font-bold ${
                        pnlDollar == null ? "text-[#ccc]" : isProfitable ? "text-[#16a34a]" : "text-[#dc2626]"
                      }`}>
                        {pnlDollar != null ? `${pnlDollar >= 0 ? "+" : ""}$${pnlDollar.toFixed(2)}` : "—"}
                      </td>
                      {/* P&L Percent */}
                      <td className={`px-4 py-2.5 text-right font-bold ${
                        pnlPct == null ? "text-[#ccc]" : isProfitable ? "text-[#16a34a]" : "text-[#dc2626]"
                      }`}>
                        {pnlPct != null ? `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%` : "—"}
                      </td>
                      {/* Duration (history only) */}
                      {!isLive && (
                        <td className="px-4 py-2.5 text-right text-xs text-[#999]">
                          {t.status === "cancelled" ? "—" : durStr}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Declined Trades / Rejected Candidates */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Declined & Rejected</span>
            <span className="text-[10px] text-[#999]">AI trade decisions & candidate rejections</span>
          </div>
          <div className="flex items-center gap-3">
            {declined.length > 15 && (
              <button
                onClick={() => setShowAllDeclined(!showAllDeclined)}
                className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
              >
                {showAllDeclined ? "Show recent" : `Show all (${declined.length})`}
              </button>
            )}
            <span className="text-xs text-[#ccc]">
              {declinedLoading ? "Loading..." : `${declined.length} records`}
            </span>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {declinedLoading ? (
            <div className="text-sm text-[#ccc] text-center py-12">Loading...</div>
          ) : declined.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-12">No declined trades recorded yet</div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {(showAllDeclined ? declined : declined.slice(0, 15)).map((evt) => {
                const isTradeDecision = evt.event_type === "trade_decision";
                const isRejectionBatch = evt.event_type === "ai_response" && evt.agent === "analyst";
                const meta = evt.metadata || {};
                const decision = meta.decision as string | undefined;
                const confidence = meta.confidence as number | undefined;
                const rejectedSymbols = (meta.rejected as string[]) || [];
                const approvedSymbols = (meta.approved as string[]) || [];
                const marketContext = meta.market_context as string | undefined;

                // Skip approved-only responses (no rejections)
                if (isRejectionBatch && rejectedSymbols.length === 0 && !isTradeDecision) return null;

                return (
                  <button
                    key={evt.id}
                    onClick={() => setExpandedDecline(expandedDecline === evt.id ? null : evt.id)}
                    className="w-full text-left px-5 py-3 hover:bg-[#fefefe] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Icon */}
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                          isTradeDecision
                            ? decision === "skip"
                              ? "bg-[#fef3c7] text-[#d97706]"
                              : "bg-[#f0fdf4] text-[#16a34a]"
                            : "bg-[#fef2f2] text-[#dc2626]"
                        }`}>
                          {isTradeDecision ? (decision === "skip" ? "S" : "T") : "R"}
                        </div>

                        <div className="min-w-0">
                          {/* Header line */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {isTradeDecision ? (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (evt.symbol) openTicker(evt.symbol); }}
                                  className="text-sm font-bold text-[#111] hover:text-[#2563eb] transition-colors"
                                >
                                  {evt.symbol}
                                </button>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  decision === "skip"
                                    ? "bg-[#fef3c7] text-[#d97706]"
                                    : "bg-[#f0fdf4] text-[#16a34a]"
                                }`}>
                                  {decision?.toUpperCase() || "SKIP"}
                                </span>
                                {confidence != null && (
                                  <span className="text-[10px] text-[#999]">
                                    {(confidence * 100).toFixed(0)}% confidence
                                  </span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="text-xs font-medium text-[#dc2626]">Watchlist Evaluation</span>
                                {approvedSymbols.length > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a] font-medium">
                                    {approvedSymbols.length} approved
                                  </span>
                                )}
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626] font-medium">
                                  {rejectedSymbols.length} rejected
                                </span>
                              </>
                            )}
                          </div>

                          {/* Title / reason */}
                          <div className="text-xs text-[#555] mt-0.5 leading-snug">
                            {isTradeDecision ? evt.title : (
                              <>
                                <span className="text-[#dc2626]">{rejectedSymbols.join(", ")}</span>
                                {approvedSymbols.length > 0 && (
                                  <span className="text-[#999]"> | Approved: <span className="text-[#16a34a]">{approvedSymbols.join(", ")}</span></span>
                                )}
                              </>
                            )}
                          </div>

                          {/* Market context (for batch rejections) */}
                          {marketContext && (
                            <div className="text-[10px] text-[#999] mt-1 italic">{marketContext}</div>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-[#bbb] shrink-0 tabular-nums">{timeAgo(evt.created_at)}</span>
                    </div>

                    {/* Expanded detail */}
                    {expandedDecline === evt.id && evt.detail && (
                      <div className="mt-2 ml-8 text-xs text-[#999] leading-relaxed whitespace-pre-wrap bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[200px] overflow-y-auto font-mono">
                        {evt.detail}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
