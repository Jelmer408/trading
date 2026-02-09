"use client";

import { useState, useEffect, useCallback } from "react";
import { useActivityFeed, useWatchlist } from "@/hooks/useRealtimeData";
import { useTickerDrawer } from "@/context/TickerDrawerContext";

// ── Types ────────────────────────────────────────────────────

interface TrendingTicker {
  symbol: string;
  name?: string;
  rank: number;
  mentions: number;
  upvotes: number;
  rank_change?: number;
  mention_change?: number;
  sources: string[];
}

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/**
 * Maps a score to a color on a red → amber → green gradient.
 * 0-10 = red, 10-25 = amber, 25+ = green, 50+ = deep green
 */
function scoreColor(score: number): string {
  if (score >= 50) return "#15803d";
  if (score >= 25) return "#16a34a";
  if (score >= 15) return "#65a30d";
  if (score >= 10) return "#ca8a04";
  if (score >= 5)  return "#d97706";
  return "#dc2626";
}

function scoreBg(score: number): string {
  if (score >= 50) return "#f0fdf4";
  if (score >= 25) return "#f0fdf4";
  if (score >= 15) return "#f7fee7";
  if (score >= 10) return "#fefce8";
  if (score >= 5)  return "#fffbeb";
  return "#fef2f2";
}

// ── Score Badge ──────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  return (
    <span
      className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
      style={{ color: scoreColor(score), backgroundColor: scoreBg(score) }}
    >
      {score}
    </span>
  );
}

// ── Info Tooltip ─────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
        className="w-4 h-4 rounded-full border border-[#d4d4d4] text-[#999] text-[9px] font-bold flex items-center justify-center hover:border-[#999] hover:text-[#555] transition-colors cursor-help"
      >
        i
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 z-50">
          <div className="bg-[#111] text-white text-[11px] leading-relaxed rounded-lg px-3 py-2.5 shadow-xl">
            {text}
            {/* Score legend */}
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/10">
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "linear-gradient(to right, #dc2626, #d97706, #ca8a04, #65a30d, #16a34a, #15803d)" }} />
            </div>
            <div className="flex justify-between text-[9px] text-white/50 mt-0.5">
              <span>0</span>
              <span>10</span>
              <span>25</span>
              <span>50+</span>
            </div>
          </div>
          <div className="w-2 h-2 bg-[#111] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function RedditPage() {
  const { events } = useActivityFeed(500);
  const { watchlist } = useWatchlist();
  const { openTicker } = useTickerDrawer();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [trendingLoaded, setTrendingLoaded] = useState(false);

  const fetchTrending = useCallback(async () => {
    try {
      const resp = await fetch("/api/overview");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.top_tickers) {
        setTrending(data.top_tickers);
      }
    } catch { /* */ }
    setTrendingLoaded(true);
  }, []);

  useEffect(() => {
    fetchTrending();
    const interval = setInterval(fetchTrending, 60_000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchTrending]);

  // Match all scanner events (both old and new event_type conventions)
  const scanEvents = events.filter(
    (e) =>
      e.agent === "scanner" &&
      (e.event_type === "scan_started" || e.event_type === "scan_start" ||
       e.event_type === "scan_result" || e.event_type === "scan_reddit")
  );
  const redditScans = scanEvents.filter(
    (e) =>
      e.title.toLowerCase().includes("reddit") ||
      e.title.toLowerCase().includes("rss") ||
      (e.metadata as Record<string, unknown>)?.source === "reddit"
  );
  const scanResults = redditScans.filter(
    (e) => e.event_type === "scan_result" || e.event_type === "scan_reddit"
  );
  const aiEvals = events.filter(
    (e) => e.agent === "analyst" && e.event_type === "ai_request" && e.title.toLowerCase().includes("watchlist")
  );
  const aiResponses = events.filter(
    (e) => e.agent === "analyst" && e.event_type === "ai_response" && e.title.toLowerCase().includes("approved")
  );

  const discovered = watchlist.filter((w) => w.source !== "base");
  const latestScan = scanResults[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#111]">Reddit Scanner</h2>
          <p className="text-sm text-[#999]">
            RSS feeds from r/wallstreetbets, r/stocks, r/options, r/stockmarket + ApeWisdom
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#999]">{scanResults.length} scans logged</span>
          <span className="text-xs text-[#555] px-2 py-1 rounded-md bg-[#f5f5f5]">Every 15 min</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Scans", value: scanResults.length, sub: "RSS + ApeWisdom" },
          { label: "Trending", value: trending.length || "—", sub: "live ApeWisdom" },
          { label: "AI Evaluated", value: aiEvals.length, sub: "Gemini calls" },
          { label: "Discovered", value: discovered.length, sub: "on watchlist" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-[#e5e5e5] p-4">
            <div className="text-xs text-[#999]">{item.label}</div>
            <div className="text-2xl font-bold text-[#111]">{item.value}</div>
            <div className="text-xs text-[#ccc]">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trending tickers — live ApeWisdom */}
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Trending Tickers</span>
              <InfoTooltip text="Live trending tickers from ApeWisdom — aggregated Reddit mentions and upvotes across all stock subreddits. Rank change shows 24h momentum." />
            </div>
            <span className="text-[10px] text-[#bbb]">via ApeWisdom &bull; live</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {!trendingLoaded ? (
              <div className="text-sm text-[#ccc] text-center py-12">Loading...</div>
            ) : trending.length === 0 ? (
              <div className="text-sm text-[#ccc] text-center py-12">No trending data available</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {trending.map((t) => {
                  const rc = t.rank_change ?? 0;
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => openTicker(t.symbol)}
                      className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-[#f8f8f8] transition-all group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#ccc] w-5 text-right tabular-nums">#{t.rank}</span>
                        <span className="text-sm font-bold text-[#111] group-hover:text-[#000]">{t.symbol}</span>
                        {t.name && <span className="text-xs text-[#999] max-w-[120px] truncate">{t.name}</span>}
                        <div className="flex gap-1">
                          {(t.sources || []).map((s) => (
                            <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs font-semibold text-[#333] tabular-nums">{t.mentions} mentions</div>
                          <div className="text-[10px] text-[#999] tabular-nums">{t.upvotes?.toLocaleString()} upvotes</div>
                        </div>
                        {rc !== 0 && (
                          <span className={`text-xs font-bold tabular-nums ${rc > 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                            {rc > 0 ? `▲${rc}` : `▼${Math.abs(rc)}`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Discovered stocks */}
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Added to Watchlist</span>
              <InfoTooltip text="Stocks that passed AI evaluation. Score combines Reddit momentum + news sentiment (1.5x weight). AI filters for liquidity, catalysts, and day-trading suitability." />
            </div>
            <span className="text-xs text-[#ccc]">{discovered.length} stocks</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {discovered.length === 0 ? (
              <div className="text-sm text-[#ccc] text-center py-12">No stocks discovered yet</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {discovered.map((w) => (
                  <div key={w.id} className="px-5 py-3 hover:bg-[#fafafa]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#111]">{w.symbol}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          w.source === "ai_approved"
                            ? "bg-[#eff6ff] text-[#2563eb]"
                            : "bg-[#f5f5f5] text-[#999]"
                        }`}>
                          {w.source === "ai_approved" ? "AI Approved" : "Score"}
                        </span>
                      </div>
                      <ScoreBadge score={w.score} />
                    </div>
                    {w.reason && <p className="text-xs text-[#999] mt-1">{w.reason}</p>}
                    {w.discovery_sources && w.discovery_sources.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {w.discovery_sources.map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                        ))}
                      </div>
                    )}
                    <div className="text-[11px] text-[#ccc] mt-1">added {timeAgo(w.added_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Evaluation */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">AI Watchlist Evaluation</span>
          <span className="text-xs text-[#ccc]">{aiEvals.length + aiResponses.length} events</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {aiEvals.length === 0 && aiResponses.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-12">No AI evaluations yet</div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {aiResponses.map((e) => {
                const approved = (e.metadata?.approved as string[]) || [];
                return (
                  <div key={e.id} className="px-5 py-3 hover:bg-[#fafafa] cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#eff6ff] text-[#2563eb] font-medium">Response</span>
                        <span className="text-sm text-[#555]">{e.title}</span>
                      </div>
                      <span className="text-xs text-[#ccc]">{timeAgo(e.created_at)}</span>
                    </div>
                    {approved.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5">
                        {approved.map((sym) => (
                          <span key={sym} className="text-xs px-2 py-0.5 font-bold text-[#111] bg-[#f0f0f0] rounded-md">{sym}</span>
                        ))}
                      </div>
                    )}
                    {expandedId === e.id && e.detail && (
                      <div className="text-xs text-[#555] leading-relaxed mt-3 bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                        {e.detail}
                      </div>
                    )}
                  </div>
                );
              })}
              {aiEvals.map((e) => (
                <div key={e.id} className="px-5 py-3 hover:bg-[#fafafa] cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#999] font-medium">Prompt</span>
                      <span className="text-sm text-[#999]">{e.title}</span>
                    </div>
                    <span className="text-xs text-[#ccc]">{timeAgo(e.created_at)}</span>
                  </div>
                  {expandedId === e.id && e.detail && (
                    <div className="text-xs text-[#999] leading-relaxed mt-2 bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {e.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
