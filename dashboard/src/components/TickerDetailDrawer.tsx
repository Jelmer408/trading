"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTickerDrawer } from "@/context/TickerDrawerContext";
import CandlestickChart from "@/components/charts/CandlestickChart";

// ── Types ────────────────────────────────────────────────────

interface RedditPost {
  title: string;
  url: string;
  sub: string;
  time: string;
  upvotes: number;
  comments: number;
  upvote_ratio: number;
}

interface ApeWisdomData {
  rank: number;
  mentions: number;
  upvotes: number;
  rank_24h_ago: number;
  mentions_24h_ago: number;
  name: string;
  filter: string;
}

interface TickerData {
  symbol: string;
  fundamentals: Record<string, unknown> | null;
  indicators: {
    price: number;
    change_pct: number;
    rsi: number;
    rel_volume: number;
    avg_volume: number;
    sma20: number;
    day_high: number;
    day_low: number;
  } | null;
  reddit: {
    posts: RedditPost[];
    total_upvotes: number;
    post_count: number;
    mentions: number;
    apewisdom: ApeWisdomData | null;
    sentiment: { score: number; label: string; confidence: number };
  };
  ai_analysis: string | null;
  ai_fresh: boolean;
}

type Tab = "overview" | "reddit" | "ai";

// ── Helpers ──────────────────────────────────────────────────

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtMcap(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

function timeAgo(ts: string) {
  if (!ts) return "";
  const sec = (Date.now() - (ts.length < 13 ? Number(ts) * 1000 : new Date(ts).getTime())) / 1000;
  if (sec < 0) return "just now";
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function sentimentColor(label: string) {
  if (label === "bullish") return { text: "text-[#16a34a]", bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]" };
  if (label === "bearish") return { text: "text-[#dc2626]", bg: "bg-[#fef2f2]", border: "border-[#fca5a5]" };
  return { text: "text-[#d97706]", bg: "bg-[#fffbeb]", border: "border-[#fde68a]" };
}

// ── Main Component ──────────────────────────────────────────

export default function TickerDetailDrawer() {
  const { symbol, closeTicker } = useTickerDrawer();
  const [data, setData] = useState<TickerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const drawerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    setTab("overview");
    try {
      const resp = await fetch(`/api/ticker-analysis?symbol=${sym}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || `HTTP ${resp.status}`);
      }
      const result = await resp.json();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (symbol) fetchData(symbol);
  }, [symbol, fetchData]);

  // Close on outside click
  useEffect(() => {
    if (!symbol) return;
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        closeTicker();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [symbol, closeTicker]);

  // Close on Escape
  useEffect(() => {
    if (!symbol) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeTicker();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [symbol, closeTicker]);

  if (!symbol) return null;

  const sent = data?.reddit?.sentiment;
  const sentColors = sent ? sentimentColor(sent.label) : sentimentColor("neutral");
  const ind = data?.indicators;
  const fund = data?.fundamentals;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/10 backdrop-blur-[2px]">
      <div
        ref={drawerRef}
        className="w-full max-w-2xl h-full bg-white border-l border-[#e5e5e5] shadow-2xl flex flex-col"
        style={{ animation: "slideIn 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-[#111] tracking-tight">{symbol}</span>
              {fund?.name ? (
                <span className="text-xs text-[#999] truncate max-w-[200px]">{String(fund.name)}</span>
              ) : null}
            </div>
            <button
              onClick={closeTicker}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f0f0f0] transition-colors text-[#999] hover:text-[#555]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Quick stats row */}
          {ind && (
            <div className="flex items-center gap-4 mt-3">
              <span className="text-lg font-bold text-[#111] tabular-nums">{fmtMoney(ind.price)}</span>
              <span className={`text-sm font-bold tabular-nums ${ind.change_pct >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
                {ind.change_pct >= 0 ? "+" : ""}{ind.change_pct.toFixed(2)}%
              </span>
              <span className="text-xs text-[#999]">RSI {ind.rsi.toFixed(0)}</span>
              <span className={`text-xs font-medium ${ind.rel_volume > 1.5 ? "text-[#2563eb]" : "text-[#999]"}`}>
                Vol {ind.rel_volume.toFixed(1)}x
              </span>
              {sent && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md capitalize ${sentColors.text} ${sentColors.bg}`}>
                  {sent.label}
                </span>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(["overview", "reddit", "ai"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors capitalize ${
                  tab === t ? "bg-[#111] text-white" : "text-[#999] hover:bg-[#f5f5f5] hover:text-[#555]"
                }`}
              >
                {t === "ai" ? "AI Analysis" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-6 h-6 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[#999]">Loading analysis for {symbol}...</span>
            </div>
          )}

          {error && (
            <div className="p-6">
              <div className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-sm text-[#dc2626]">{error}</div>
            </div>
          )}

          {data && !loading && tab === "overview" && <OverviewTab data={data} />}
          {data && !loading && tab === "reddit" && (
            <RedditTab
              posts={data.reddit.posts}
              sentiment={data.reddit.sentiment}
              totalUpvotes={data.reddit.total_upvotes}
              mentions={data.reddit.mentions}
              apewisdom={data.reddit.apewisdom}
            />
          )}
          {data && !loading && tab === "ai" && <AITab analysis={data.ai_analysis} />}
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Overview Tab ────────────────────────────────────────────

function OverviewTab({ data }: { data: TickerData }) {
  const ind = data.indicators;
  const fund = data.fundamentals;

  return (
    <div className="p-6 space-y-6">
      {/* Chart */}
      <div>
        <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide mb-3">Price Chart (5-min)</h3>
        <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
          <CandlestickChart symbol={data.symbol} timeframe="5Min" height={280} />
        </div>
      </div>

      {/* Key Metrics Grid */}
      {ind && (
        <div>
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide mb-3">Key Metrics</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Day High", value: fmtMoney(ind.day_high) },
              { label: "Day Low", value: fmtMoney(ind.day_low) },
              { label: "SMA(20)", value: fmtMoney(ind.sma20) },
              { label: "RSI(14)", value: ind.rsi.toFixed(1), color: ind.rsi > 70 ? "text-[#dc2626]" : ind.rsi < 30 ? "text-[#16a34a]" : "text-[#111]" },
              { label: "Rel Volume", value: `${ind.rel_volume.toFixed(1)}x`, color: ind.rel_volume > 1.5 ? "text-[#2563eb]" : "text-[#111]" },
              { label: "Avg Volume", value: fmtVol(ind.avg_volume) },
            ].map((m) => (
              <div key={m.label} className="bg-[#f8f8f8] rounded-lg p-3">
                <div className="text-[10px] text-[#999] uppercase">{m.label}</div>
                <div className={`text-sm font-bold ${m.color || "text-[#111]"}`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fundamentals */}
      {fund && (
        <div>
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide mb-3">Fundamentals</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Sector", value: String(fund.sector || "—") },
              { label: "Market Cap", value: fmtMcap(Number(fund.market_cap) || null) },
              { label: "P/E", value: fund.pe_ratio ? Number(fund.pe_ratio).toFixed(1) : "—" },
              { label: "EPS", value: fund.eps ? `$${Number(fund.eps).toFixed(2)}` : "—" },
              { label: "ROE", value: fund.return_on_equity ? `${(Number(fund.return_on_equity) * 100).toFixed(1)}%` : "—" },
              { label: "D/E", value: fund.debt_to_equity ? Number(fund.debt_to_equity).toFixed(2) : "—" },
            ].map((m) => (
              <div key={m.label} className="bg-[#f8f8f8] rounded-lg p-3">
                <div className="text-[10px] text-[#999] uppercase">{m.label}</div>
                <div className="text-sm font-bold text-[#111] truncate">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reddit Summary */}
      {data.reddit.post_count > 0 && (
        <div>
          <h3 className="text-xs font-medium text-[#999] uppercase tracking-wide mb-3">Reddit Buzz</h3>
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[#f8f8f8]">
            <div className="text-center">
              <div className="text-lg font-bold text-[#111]">{data.reddit.post_count}</div>
              <div className="text-[10px] text-[#999]">posts</div>
            </div>
            <div className="w-px h-8 bg-[#e5e5e5]" />
            <div className="text-center">
              <div className="text-lg font-bold text-[#111]">{data.reddit.total_upvotes.toLocaleString()}</div>
              <div className="text-[10px] text-[#999]">upvotes</div>
            </div>
            <div className="w-px h-8 bg-[#e5e5e5]" />
            <div className="text-center">
              <SentimentBadge sentiment={data.reddit.sentiment} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reddit Tab ──────────────────────────────────────────────

function RedditTab({
  posts,
  sentiment,
  totalUpvotes,
  mentions,
  apewisdom,
}: {
  posts: RedditPost[];
  sentiment: { score: number; label: string; confidence: number };
  totalUpvotes: number;
  mentions: number;
  apewisdom: ApeWisdomData | null;
}) {
  const colors = sentimentColor(sentiment.label);
  const hasSocialData = apewisdom || mentions > 0 || totalUpvotes > 0;

  return (
    <div className="p-6 space-y-4">
      {/* ApeWisdom social buzz stats */}
      {apewisdom && (
        <div className="rounded-lg border border-[#e5e5e5] bg-[#f8f8f8] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-[#111] uppercase tracking-wide">Reddit Social Buzz</h4>
            <span className="text-[10px] text-[#999] bg-white px-2 py-0.5 rounded border border-[#e5e5e5]">
              via ApeWisdom
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-lg font-black text-[#111] tabular-nums">#{apewisdom.rank}</div>
              <div className="text-[10px] text-[#999]">rank</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-[#111] tabular-nums">{apewisdom.mentions}</div>
              <div className="text-[10px] text-[#999]">mentions</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-[#111] tabular-nums">{apewisdom.upvotes.toLocaleString()}</div>
              <div className="text-[10px] text-[#999]">upvotes</div>
            </div>
            <div className="text-center">
              {(() => {
                const rankChange = apewisdom.rank_24h_ago - apewisdom.rank;
                const mentionChange = apewisdom.mentions - apewisdom.mentions_24h_ago;
                const trending = rankChange > 0;
                return (
                  <>
                    <div className={`text-lg font-black tabular-nums ${trending ? "text-[#16a34a]" : rankChange < 0 ? "text-[#dc2626]" : "text-[#999]"}`}>
                      {rankChange > 0 ? `↑${rankChange}` : rankChange < 0 ? `↓${Math.abs(rankChange)}` : "—"}
                    </div>
                    <div className="text-[10px] text-[#999]">
                      {mentionChange > 0 ? `+${mentionChange}` : mentionChange < 0 ? `${mentionChange}` : "0"} vs 24h
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Sentiment summary */}
      {hasSocialData && (
        <div className={`rounded-lg border p-4 ${colors.bg} ${colors.border}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className={`text-sm font-bold capitalize ${colors.text}`}>
                {sentiment.label} sentiment
              </div>
              <div className="text-xs text-[#999] mt-0.5">
                {mentions > 0 ? `${mentions} mentions` : `${posts.length} posts`} · {totalUpvotes.toLocaleString()} upvotes
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-black tabular-nums ${colors.text}`}>
                {(sentiment.score * 100).toFixed(0)}
              </div>
              <div className="text-[10px] text-[#999]">score / 100</div>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gradient-to-r from-[#dc2626] via-[#d97706] to-[#16a34a] relative">
            <div
              className="absolute top-0 w-3 h-3 -mt-0.5 rounded-full bg-white border-2 border-[#111] shadow-sm"
              style={{ left: `${Math.min(Math.max(sentiment.score * 100, 2), 98)}%`, transform: "translateX(-50%)" }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-[#999] mt-1">
            <span>Bearish</span>
            <span>Neutral</span>
            <span>Bullish</span>
          </div>
        </div>
      )}

      {/* Posts list */}
      {posts.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-[#999] uppercase tracking-wide mb-2">Posts & Activity</h4>
          <div className="divide-y divide-[#f0f0f0] -mx-6">
            {posts.map((post, i) => (
              <a
                key={post.url || i}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-6 py-3.5 hover:bg-[#fafafa] transition-colors group"
              >
                <div className="flex-shrink-0 w-12 text-center pt-0.5">
                  <div className="text-sm font-bold text-[#111] tabular-nums">{post.upvotes.toLocaleString()}</div>
                  <div className="text-[9px] text-[#ccc]">upvotes</div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#333] leading-snug group-hover:text-[#111]">{post.title}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] font-medium text-[#2563eb] bg-[#eff6ff] px-1.5 py-0.5 rounded">{post.sub}</span>
                    {post.comments > 0 && (
                      <span className="text-[11px] text-[#999]">{post.comments} comments</span>
                    )}
                    {post.time && (
                      <span className="text-[11px] text-[#ccc]">{timeAgo(post.time)}</span>
                    )}
                    {post.upvote_ratio > 0 && (
                      <span className="text-[11px] text-[#ccc]">{(post.upvote_ratio * 100).toFixed(0)}% upvoted</span>
                    )}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-1 text-[#ccc] group-hover:text-[#999]">
                  <path d="M10.5 7.5V11.5H2.5V3.5H6.5M8.5 2H12V5.5M12 2L6.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      ) : !hasSocialData ? (
        <div className="text-sm text-[#999] text-center py-8">No Reddit activity found for this ticker</div>
      ) : null}
    </div>
  );
}

// ── AI Analysis Tab ─────────────────────────────────────────

function AITab({ analysis }: { analysis: string | null }) {
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12">
        <div className="text-sm text-[#999]">No AI analysis available yet</div>
        <div className="text-xs text-[#ccc] mt-1">Analysis will be generated on first view</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f0f0f0] text-[#555]">Gemini Pro</span>
        <span className="text-xs text-[#999]">Daily analysis</span>
      </div>
      <div className="prose prose-sm max-w-none">
        <div
          className="text-sm text-[#333] leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: formatMarkdown(analysis) }}
        />
      </div>
    </div>
  );
}

// ── Simple markdown renderer ────────────────────────────────

function formatMarkdown(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 class="text-xs font-bold text-[#111] uppercase tracking-wide mt-5 mb-2">$1</h3>')
    .replace(/## (.*)/g, '<h2 class="text-sm font-bold text-[#111] mt-6 mb-2 pb-1 border-b border-[#f0f0f0]">$1</h2>')
    .replace(/# (.*)/g, '<h1 class="text-base font-bold text-[#111] mt-4 mb-2">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-[#111]">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="text-xs bg-[#f5f5f5] px-1 py-0.5 rounded text-[#555]">$1</code>')
    .replace(/^- (.*)/gm, '<div class="flex gap-2 ml-2"><span class="text-[#ccc]">•</span><span>$1</span></div>')
    .replace(/\n\n/g, '<div class="h-3"></div>')
    .replace(/\n/g, "<br>");
}

// ── Sentiment Badge ─────────────────────────────────────────

function SentimentBadge({ sentiment }: { sentiment: { score: number; label: string; confidence: number } }) {
  const colors = sentimentColor(sentiment.label);
  return (
    <div>
      <div className={`text-sm font-bold capitalize ${colors.text}`}>{sentiment.label}</div>
      <div className="text-[10px] text-[#999]">{(sentiment.confidence * 100).toFixed(0)}% conf</div>
    </div>
  );
}
