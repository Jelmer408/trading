"use client";

import { useState, useCallback } from "react";
import { useTickerDrawer } from "@/context/TickerDrawerContext";

// ── Types ────────────────────────────────────────────────────

interface SimStep {
  key: string;
  label: string;
  icon: string;
  status: "waiting" | "running" | "done" | "error";
  duration?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

// ── Helpers ──────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return n.toFixed(d);
}

function cn(...c: (string | false | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

// ── Status Dot ───────────────────────────────────────────────

function StatusDot({ status }: { status: SimStep["status"] }) {
  if (status === "waiting") return <span className="w-2.5 h-2.5 rounded-full bg-[#e5e5e5]" />;
  if (status === "running")
    return (
      <span className="relative w-2.5 h-2.5">
        <span className="absolute inset-0 rounded-full bg-[#2563eb] animate-ping opacity-40" />
        <span className="relative block w-2.5 h-2.5 rounded-full bg-[#2563eb]" />
      </span>
    );
  if (status === "done") return <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" />;
  return <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" />;
}

// ── Step 1: Watchlist Card ───────────────────────────────────

function WatchlistCard({ data, onTickerClick }: { data: R; onTickerClick?: (sym: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(data.symbols || []).map((s: string) => (
        <button
          key={s}
          onClick={() => onTickerClick?.(s)}
          className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-[#f5f5f5] text-[#111] hover:bg-[#e5e5e5] transition-colors cursor-pointer"
        >
          {s}
        </button>
      ))}
      <span className="text-[11px] text-[#999] ml-2">{data.count} tickers loaded</span>
    </div>
  );
}

// ── Step 2: Market Data Scanner ──────────────────────────────

function MarketScanCard({ data, onTickerClick }: { data: R; onTickerClick?: (sym: string) => void }) {
  const tickers = data.tickers || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-[#999]">
        <span>{data.analyzed} analyzed</span>
        {data.failed > 0 && <span className="text-[#dc2626]">{data.failed} failed</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f0f0f0]">
              <th className="text-left py-2 pr-3 text-[#999] font-medium">Ticker</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">Price</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">Chg%</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">RSI</th>
              <th className="text-center py-2 px-2 text-[#999] font-medium">MACD</th>
              <th className="text-center py-2 px-2 text-[#999] font-medium">Stoch</th>
              <th className="text-center py-2 px-2 text-[#999] font-medium">BB</th>
              <th className="text-center py-2 px-2 text-[#999] font-medium">VWAP</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">Vol</th>
              <th className="text-center py-2 px-2 text-[#999] font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((t: R) => {
              const signalColor = (sig: string) => {
                if (sig === "bullish" || sig === "oversold" || sig === "accumulation" || sig === "above" || sig === "below_lower" || sig === "golden_cross") return "bg-[#f0fdf4] text-[#16a34a]";
                if (sig === "bearish" || sig === "overbought" || sig === "distribution" || sig === "below" || sig === "above_upper" || sig === "death_cross") return "bg-[#fef2f2] text-[#dc2626]";
                return "bg-[#f5f5f5] text-[#999]";
              };
              return (
                <tr key={t.symbol} className="border-b border-[#f8f8f8] hover:bg-[#fafafa]">
                  <td className="py-2 pr-3 font-bold text-[#111]">
                    <button onClick={() => onTickerClick?.(t.symbol)} className="hover:text-[#2563eb] transition-colors cursor-pointer">{t.symbol}</button>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-[#111]">${fmt(t.price)}</td>
                  <td className={cn("py-2 px-2 text-right tabular-nums font-medium", t.change_pct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]")}>
                    {t.change_pct >= 0 ? "+" : ""}{fmt(t.change_pct)}%
                  </td>
                  <td className={cn("py-2 px-2 text-right tabular-nums", t.rsi > 70 || t.rsi < 30 ? "text-[#d97706] font-medium" : "text-[#555]")}>
                    {fmt(t.rsi, 1)}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signalColor(t.macd_cross))}>{t.macd_cross}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signalColor(t.stoch_signal))}>{t.stoch_signal}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signalColor(t.bb_position))}>{t.bb_position?.replace("_", " ")}</span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", signalColor(t.vwap_pos))}>{t.vwap_pos}</span>
                  </td>
                  <td className={cn("py-2 px-2 text-right tabular-nums", t.volume > 1.5 ? "text-[#2563eb] font-medium" : "text-[#555]")}>
                    {fmt(t.volume, 1)}x
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className={cn(
                      "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                      t.trend === "bullish" ? "bg-[#f0fdf4] text-[#16a34a]" : t.trend === "bearish" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#f5f5f5] text-[#999]"
                    )}>
                      {t.trend} {t.trend_strength === "strong" ? "!!" : t.trend_strength === "moderate" ? "!" : ""}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 3: Pattern Summary ──────────────────────────────────

function PatternSummaryCard({ data }: { data: R }) {
  const byTicker = data.by_ticker || [];
  if (data.total_patterns === 0) {
    return <p className="text-sm text-[#999]">No candlestick patterns detected across the watchlist.</p>;
  }
  return (
    <div className="space-y-3">
      <span className="text-xs text-[#999]">{data.total_patterns} patterns across {byTicker.length} tickers</span>
      {byTicker.map((t: R) => (
        <div key={t.symbol} className="space-y-1.5">
          <span className="text-xs font-bold text-[#111]">{t.symbol}</span>
          <div className="flex flex-wrap gap-1.5">
            {(t.patterns || []).map((p: R, i: number) => (
              <span
                key={i}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full font-medium",
                  p.direction === "bullish" ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
                )}
              >
                {p.name} ({(p.confidence * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 4: AI Ranking ───────────────────────────────────────

function AIRankingCard({ data, expanded, onToggle }: { data: R; expanded: boolean; onToggle: () => void }) {
  const rankings = data.rankings || [];
  return (
    <div className="space-y-4">
      {data.market_overview && (
        <p className="text-sm text-[#555] leading-relaxed italic">&ldquo;{data.market_overview}&rdquo;</p>
      )}

      <div className="space-y-2">
        {rankings.map((r: R, i: number) => {
          const isAction = r.action !== "skip";
          const isLong = r.action === "enter_long";
          const isBest = r.symbol === data.best_trade;
          return (
            <div
              key={r.symbol}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                isBest ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "bg-[#f8f8f8]"
              )}
            >
              <span className="text-xs text-[#ccc] w-5 text-right tabular-nums font-bold">#{i + 1}</span>
              <span className="text-sm font-bold text-[#111] w-14">{r.symbol}</span>
              <span className={cn(
                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                isAction
                  ? isLong ? "bg-[#dcfce7] text-[#16a34a]" : "bg-[#fee2e2] text-[#dc2626]"
                  : "bg-[#f0f0f0] text-[#999]"
              )}>
                {r.action?.replace("_", " ") || "skip"}
              </span>
              <div className="flex-1 flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-[#e5e5e5] overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", isAction ? isLong ? "bg-[#16a34a]" : "bg-[#dc2626]" : "bg-[#ccc]")}
                    style={{ width: `${(r.confidence || 0) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-[#555] font-medium">{((r.confidence || 0) * 100).toFixed(0)}%</span>
              </div>
              <p className="text-[11px] text-[#777] flex-1 truncate">{r.reasoning}</p>
              {isBest && (
                <span className="text-[10px] font-bold text-[#16a34a] bg-[#dcfce7] px-2 py-0.5 rounded-full flex-shrink-0">
                  BEST TRADE
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[11px] text-[#999] bg-[#f5f5f5] px-2 py-0.5 rounded">{data.model}</span>
        <button onClick={onToggle} className="text-[11px] text-[#2563eb] hover:underline">
          {expanded ? "Hide" : "Show"} full AI prompt & response
        </button>
      </div>

      {expanded && (
        <div className="space-y-2">
          <div className="text-[11px] text-[#999] uppercase font-medium">Prompt sent to AI</div>
          <pre className="text-xs text-[#555] bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">{data.prompt}</pre>
          <div className="text-[11px] text-[#999] uppercase font-medium">Raw AI response</div>
          <pre className="text-xs text-[#555] bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">{data.raw_response}</pre>
        </div>
      )}
    </div>
  );
}

// ── Step 4b: Fundamentals Card ───────────────────────────────

function fmtMcap(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  // Handle values that are already percentages vs decimals
  const val = Math.abs(n) < 1 ? n * 100 : n;
  return `${val.toFixed(1)}%`;
}

function FundamentalsCard({ data }: { data: R }) {
  const tickers = data.tickers || [];
  if (tickers.length === 0) {
    return <p className="text-sm text-[#999]">No fundamental data available.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="text-xs text-[#999]">{data.loaded} of {tickers.length} tickers with fundamental data</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f0f0f0]">
              <th className="text-left py-2 pr-3 text-[#999] font-medium">Ticker</th>
              <th className="text-left py-2 px-2 text-[#999] font-medium">Sector</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">MCap</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">P/E</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">EPS</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">ROE</th>
              <th className="text-right py-2 px-2 text-[#999] font-medium">D/E</th>
              <th className="text-right py-2 pl-2 text-[#999] font-medium">FCF</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((t: R) => (
              <tr key={t.symbol} className="border-b border-[#f8f8f8] hover:bg-[#fafafa]">
                <td className="py-2 pr-3">
                  <div className="font-bold text-[#111]">{t.symbol}</div>
                  {t.name && <div className="text-[10px] text-[#999] truncate max-w-[120px]">{t.name}</div>}
                </td>
                <td className="py-2 px-2 text-[#555] truncate max-w-[100px]">{t.sector || "—"}</td>
                <td className="py-2 px-2 text-right tabular-nums text-[#111]">{fmtMcap(t.market_cap)}</td>
                <td className={cn("py-2 px-2 text-right tabular-nums", t.pe_ratio && t.pe_ratio > 40 ? "text-[#d97706]" : "text-[#111]")}>
                  {t.pe_ratio ? t.pe_ratio.toFixed(1) : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-[#111]">{t.eps ? `$${t.eps.toFixed(2)}` : "—"}</td>
                <td className={cn("py-2 px-2 text-right tabular-nums", t.roe && t.roe > 0.15 ? "text-[#16a34a] font-medium" : "text-[#555]")}>
                  {fmtPct(t.roe)}
                </td>
                <td className={cn("py-2 px-2 text-right tabular-nums", t.debt_to_equity && t.debt_to_equity > 2 ? "text-[#dc2626]" : "text-[#555]")}>
                  {t.debt_to_equity != null ? t.debt_to_equity.toFixed(2) : "—"}
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-[#555]">{fmtMcap(t.free_cash_flow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Step 5b: Deep Analysis Card ──────────────────────────────

function DeepAnalysisCard({ data, expanded, onToggle }: { data: R; expanded: boolean; onToggle: () => void }) {
  if (!data) {
    return <p className="text-sm text-[#999]">No candidate met the threshold for deep analysis.</p>;
  }

  const isAuthorized = data.authorized;
  const isLong = data.action === "enter_long";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f0f0f0] text-[#555]">{data.model}</span>
        <span className="text-sm font-bold text-[#111]">{data.symbol}</span>
        <span className={cn(
          "text-xs font-black px-3 py-1 rounded-md uppercase tracking-wide",
          isAuthorized
            ? isLong ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
            : "bg-[#fef3c7] text-[#d97706]"
        )}>
          {isAuthorized ? (data.action?.replace("_", " ") || "authorized") : "not authorized"}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-20 h-2 rounded-full bg-[#f0f0f0] overflow-hidden">
            <div
              className={cn("h-full rounded-full", isAuthorized ? "bg-[#16a34a]" : "bg-[#d97706]")}
              style={{ width: `${(data.confidence || 0) * 100}%` }}
            />
          </div>
          <span className="text-xs font-bold text-[#111]">{((data.confidence || 0) * 100).toFixed(0)}%</span>
        </div>
        {data.conviction && (
          <span className={cn(
            "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
            data.conviction === "high" ? "bg-[#f0fdf4] text-[#16a34a]" :
            data.conviction === "medium" ? "bg-[#fefce8] text-[#ca8a04]" :
            "bg-[#f5f5f5] text-[#999]"
          )}>
            {data.conviction} conviction
          </span>
        )}
      </div>

      <p className="text-sm text-[#555] leading-relaxed">{data.reasoning}</p>

      {data.key_factors?.length > 0 && (
        <div>
          <div className="text-[11px] text-[#999] uppercase font-medium mb-1.5">Key Factors</div>
          <div className="flex flex-wrap gap-1.5">
            {data.key_factors.map((f: string, i: number) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#f0fdf4] text-[#16a34a]">{f}</span>
            ))}
          </div>
        </div>
      )}

      {data.risks?.length > 0 && (
        <div>
          <div className="text-[11px] text-[#999] uppercase font-medium mb-1.5">Risks Identified</div>
          <div className="flex flex-wrap gap-1.5">
            {data.risks.map((r: string, i: number) => (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626]">{r}</span>
            ))}
          </div>
        </div>
      )}

      <button onClick={onToggle} className="text-[11px] text-[#2563eb] hover:underline">
        {expanded ? "Hide" : "Show"} full Gemini Pro prompt & response
      </button>
      {expanded && (
        <div className="space-y-2">
          <pre className="text-xs text-[#555] bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">{data.prompt}</pre>
          <pre className="text-xs text-[#555] bg-[#f8f8f8] border border-[#e5e5e5] rounded-lg p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">{data.raw_response}</pre>
        </div>
      )}
    </div>
  );
}

// ── Step 6: Execution Card ───────────────────────────────────

function ExecutionCard({ data }: { data: R | null }) {
  if (!data || !data.would_execute) {
    const vetoed = data?.vetoed_by_pro;
    return (
      <div className={cn("flex items-center gap-3 rounded-lg p-4", vetoed ? "bg-[#fef2f2] border border-[#fca5a5]" : "bg-[#f8f8f8]")}>
        <span className={cn("w-3 h-3 rounded-full", vetoed ? "bg-[#dc2626]" : "bg-[#d97706]")} />
        <div>
          <p className="text-sm font-bold text-[#111]">{vetoed ? "Trade Vetoed by Gemini Pro" : "No Trade"}</p>
          <p className="text-xs text-[#999]">
            {vetoed
              ? "Flash screening identified a candidate, but Gemini Pro deep analysis did not authorize execution."
              : "No tickers passed the confidence threshold. Bot would wait for next cycle."}
          </p>
          {data?.risks?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {data!.risks.map((r: string, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#fef2f2] text-[#dc2626]">{r}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4">
        <span className="w-3 h-3 rounded-full bg-[#16a34a]" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-[#111]">
              Would Execute: {data.side?.toUpperCase()} {data.position_size} shares of {data.symbol} @ ${fmt(data.entry_price)}
            </p>
            {data.conviction && (
              <span className={cn(
                "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                data.conviction === "high" ? "bg-[#dcfce7] text-[#16a34a]" : data.conviction === "medium" ? "bg-[#fefce8] text-[#ca8a04]" : "bg-[#f5f5f5] text-[#999]"
              )}>
                {data.conviction}
              </span>
            )}
          </div>
          <p className="text-xs text-[#555]">
            Pro confidence: {((data.confidence || 0) * 100).toFixed(0)}% · Total ≈ ${(data.position_size * data.entry_price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Position Size", value: `${data.position_size} shares` },
          { label: "Stop Loss", value: `$${fmt(data.stop_loss)}`, color: "text-[#dc2626]" },
          { label: "Take Profit", value: `$${fmt(data.take_profit)}`, color: "text-[#16a34a]" },
          { label: "Risk/Reward", value: `${fmt(data.risk_reward)}:1` },
          { label: "Max Loss", value: `-$${fmt(data.max_loss)}`, color: "text-[#dc2626]" },
          { label: "Max Gain", value: `+$${fmt(data.max_gain)}`, color: "text-[#16a34a]" },
          { label: "Account", value: `$${data.account_equity?.toLocaleString()}` },
          { label: "Risk %", value: "2.0%" },
        ].map((item) => (
          <div key={item.label} className="bg-[#f8f8f8] rounded-lg p-3">
            <div className="text-[11px] text-[#999] uppercase">{item.label}</div>
            <div className={cn("text-sm font-bold", item.color || "text-[#111]")}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pipeline Steps ───────────────────────────────────────────

const PIPELINE_STEPS: Omit<SimStep, "status">[] = [
  { key: "watchlist_scan", label: "Load Watchlist", icon: "📋" },
  { key: "market_data", label: "Quant Scan (All Tickers)", icon: "📡" },
  { key: "fundamentals", label: "Fundamental Analysis", icon: "📑" },
  { key: "pattern_summary", label: "Pattern Detection", icon: "🔍" },
  { key: "ai_ranking", label: "AI Screening (Flash)", icon: "⚡" },
  { key: "deep_analysis", label: "Deep Analysis (Pro)", icon: "🧠" },
  { key: "execution", label: "Trade Authorization", icon: "🎯" },
];

// ── Main Page ────────────────────────────────────────────────

export default function TestPage() {
  const [steps, setSteps] = useState<SimStep[]>(PIPELINE_STEPS.map((s) => ({ ...s, status: "waiting" })));
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState(false);
  const [expandedDeep, setExpandedDeep] = useState(false);
  const [totalTime, setTotalTime] = useState<number | null>(null);
  const { openTicker } = useTickerDrawer();

  const runSimulation = useCallback(async () => {
    setRunning(true);
    setError(null);
    setExpandedPrompt(false);
    setExpandedDeep(false);
    setTotalTime(null);
    setSteps(PIPELINE_STEPS.map((s) => ({ ...s, status: "waiting" })));

    const updateStep = (index: number, status: SimStep["status"], data?: R, duration?: number) => {
      setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status, data, duration } : s)));
    };

    updateStep(0, "running");

    try {
      const start = Date.now();
      const resp = await fetch("/api/simulate-watchlist");
      const ms = Date.now() - start;
      setTotalTime(ms);

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const result = await resp.json();
      const s = result.steps;

      // Progressively reveal steps
      const delays = [0, 200, 350, 500, 650, 900, 1200];
      const pcts = [0.02, 0.25, 0.12, 0.03, 0.25, 0.28, 0.05];
      const stepKeys = ["watchlist_scan", "market_data", "fundamentals", "pattern_summary", "ai_ranking", "deep_analysis", "execution"];

      for (let i = 0; i < stepKeys.length; i++) {
        await new Promise((r) => setTimeout(r, delays[i]));
        updateStep(i, "done", s[stepKeys[i]], Math.round(ms * pcts[i]));
        if (i + 1 < stepKeys.length) updateStep(i + 1, "running");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
      setSteps((prev) => prev.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)));
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#111]">Pipeline Simulator</h2>
          <p className="text-sm text-[#999]">
            Runs the full trading pipeline across your entire watchlist — data, patterns, AI ranking, and execution plan
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalTime !== null && (
            <span className="text-xs text-[#999] tabular-nums">{(totalTime / 1000).toFixed(1)}s total</span>
          )}
          <button
            onClick={runSimulation}
            disabled={running}
            className={cn(
              "px-5 py-2 text-xs font-bold rounded-lg transition-all",
              running
                ? "bg-[#f0f0f0] text-[#999] cursor-not-allowed"
                : "bg-[#111] text-white hover:bg-[#333] active:scale-95"
            )}
          >
            {running ? "Running..." : "Run Full Pipeline"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">{error}</div>
      )}

      {/* Pipeline steps */}
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div
            key={step.key}
            className={cn(
              "rounded-lg border overflow-hidden transition-all duration-300",
              step.status === "done" ? "border-[#e5e5e5]" : step.status === "running" ? "border-[#93c5fd] shadow-sm" : step.status === "error" ? "border-[#fca5a5]" : "border-[#f0f0f0]",
              step.status === "waiting" && "opacity-40"
            )}
          >
            {/* Step header */}
            <div className={cn(
              "flex items-center gap-3 px-5 py-3 transition-colors",
              step.status === "running" ? "bg-[#eff6ff]" : step.status === "done" ? "bg-[#fafafa]" : "bg-white"
            )}>
              <StatusDot status={step.status} />
              <span className="text-sm">{step.icon}</span>
              <span className={cn(
                "text-sm font-medium",
                step.status === "done" ? "text-[#111]" : step.status === "running" ? "text-[#2563eb]" : "text-[#999]"
              )}>
                Step {i + 1}: {step.label}
              </span>
              {step.duration != null && (
                <span className="ml-auto text-[11px] text-[#ccc] tabular-nums">{step.duration}ms</span>
              )}
            </div>

            {/* Step content */}
            {step.status === "done" && step.data && (
              <div className="px-5 py-4 border-t border-[#f0f0f0]">
                {step.key === "watchlist_scan" && <WatchlistCard data={step.data} onTickerClick={openTicker} />}
                {step.key === "market_data" && <MarketScanCard data={step.data} onTickerClick={openTicker} />}
                {step.key === "fundamentals" && <FundamentalsCard data={step.data} />}
                {step.key === "pattern_summary" && <PatternSummaryCard data={step.data} />}
                {step.key === "deep_analysis" && (
                  <DeepAnalysisCard data={step.data} expanded={expandedDeep} onToggle={() => setExpandedDeep(!expandedDeep)} />
                )}
                {step.key === "ai_ranking" && (
                  <AIRankingCard data={step.data} expanded={expandedPrompt} onToggle={() => setExpandedPrompt(!expandedPrompt)} />
                )}
                {step.key === "execution" && <ExecutionCard data={step.data} />}
              </div>
            )}

            {/* Running spinner */}
            {step.status === "running" && (
              <div className="px-5 py-4 border-t border-[#93c5fd] bg-[#eff6ff]">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-[#2563eb]">
                    {step.key === "market_data" ? "Computing MACD, RSI, Bollinger Bands, StochRSI, ATR, VWAP, OBV for all tickers..." :
                     step.key === "fundamentals" ? "Loading P/E, ROE, market cap, and financial ratios from Massive.com..." :
                     step.key === "ai_ranking" ? "Gemini Flash scanning and ranking all tickers..." :
                     step.key === "deep_analysis" ? "Gemini Pro performing deep analysis on best candidate..." :
                     "Processing..."}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
