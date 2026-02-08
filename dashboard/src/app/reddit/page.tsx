"use client";

import { useState, useRef, useEffect } from "react";
import { useActivityFeed, useWatchlist } from "@/hooks/useRealtimeData";

// ── Types ────────────────────────────────────────────────────

interface RedditPost {
  title: string;
  url: string;
  sub: string;
  time: string;
}

interface ScannedTicker {
  symbol: string;
  score: number;
  sources: string[];
  posts?: RedditPost[];
}

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function postTimeAgo(dateStr: string) {
  if (!dateStr) return "";
  try {
    const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  } catch {
    return "";
  }
}

// ── Ticker Detail Drawer ─────────────────────────────────────

function TickerDrawer({
  ticker,
  allScans,
  onClose,
}: {
  ticker: ScannedTicker;
  allScans: ScannedTicker[][];
  onClose: () => void;
}) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Collect all posts for this ticker across all scan results
  const allPosts: RedditPost[] = [];
  const seenUrls = new Set<string>();
  for (const scan of allScans) {
    const match = scan.find((t) => t.symbol === ticker.symbol);
    if (match?.posts) {
      for (const post of match.posts) {
        if (post.url && !seenUrls.has(post.url)) {
          allPosts.push(post);
          seenUrls.add(post.url);
        }
      }
    }
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Unique subreddits this ticker appears in
  const subs = [...new Set(allPosts.map((p) => p.sub))];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/10 backdrop-blur-[2px]">
      <div
        ref={drawerRef}
        className="w-full max-w-lg h-full bg-white border-l border-[#e5e5e5] shadow-2xl
                   animate-in slide-in-from-right duration-200 flex flex-col"
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 border-b border-[#e5e5e5]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black text-[#111] tracking-tight">
                {ticker.symbol}
              </span>
              <span className="text-sm font-medium text-[#555] bg-[#f0f0f0] px-2.5 py-0.5 rounded-full tabular-nums">
                score {ticker.score}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#f0f0f0] transition-colors text-[#999] hover:text-[#555]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Sub badges */}
          <div className="flex items-center gap-2 mt-3">
            {subs.map((sub) => (
              <span key={sub} className="text-[11px] px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#999] font-medium">
                {sub}
              </span>
            ))}
            <span className="text-[11px] text-[#ccc] ml-auto">
              {allPosts.length} post{allPosts.length !== 1 ? "s" : ""} found
            </span>
          </div>
        </div>

        {/* Posts list */}
        <div className="flex-1 overflow-y-auto">
          {allPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-10 h-10 rounded-full bg-[#f5f5f5] flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7.5" stroke="#ccc" strokeWidth="1.5" />
                  <path d="M9 5.5V9.5M9 12V12.01" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-sm text-[#999]">No post data available yet</p>
              <p className="text-xs text-[#ccc] mt-1">
                Post details appear after the next scan cycle
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {allPosts.map((post, i) => (
                <a
                  key={post.url || i}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-6 py-4 hover:bg-[#fafafa] transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    {/* Index pill */}
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#f5f5f5] text-[11px] font-medium text-[#999] flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      {/* Post title */}
                      <p className="text-sm text-[#333] leading-snug group-hover:text-[#111] transition-colors">
                        {post.title}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] font-medium text-[#2563eb] bg-[#eff6ff] px-1.5 py-0.5 rounded">
                          {post.sub}
                        </span>
                        {post.time && (
                          <span className="text-[11px] text-[#ccc]">{postTimeAgo(post.time)} ago</span>
                        )}
                      </div>
                    </div>

                    {/* External link icon */}
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="flex-shrink-0 mt-1 text-[#ccc] group-hover:text-[#999] transition-colors"
                    >
                      <path
                        d="M10.5 7.5V11.5H2.5V3.5H6.5M8.5 2H12V5.5M12 2L6.5 7.5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-[#f0f0f0] bg-[#fafafa]">
          <p className="text-[11px] text-[#ccc]">
            Sources: {ticker.sources?.join(", ") || "RSS feeds"} — Click any post to open on Reddit
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────

export default function RedditPage() {
  const { events } = useActivityFeed(500);
  const { watchlist } = useWatchlist();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<ScannedTicker | null>(null);

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

  // Parse tickers from latest scan
  const rawTickers = (latestScan?.metadata?.tickers as unknown) || [];
  const scannedTickers: ScannedTicker[] = Array.isArray(rawTickers)
    ? rawTickers.map((t: unknown) =>
        typeof t === "string"
          ? { symbol: t, score: 0, sources: [], posts: [] }
          : (t as ScannedTicker)
      )
    : [];

  // Collect tickers from ALL scans for post aggregation
  const allScanTickers: ScannedTicker[][] = scanResults.map((scan) => {
    const raw = (scan.metadata?.tickers as unknown) || [];
    return Array.isArray(raw)
      ? raw.map((t: unknown) =>
          typeof t === "string"
            ? { symbol: t, score: 0, sources: [], posts: [] }
            : (t as ScannedTicker)
        )
      : [];
  });

  return (
    <div className="space-y-6">
      {/* Ticker detail drawer */}
      {selectedTicker && (
        <TickerDrawer
          ticker={selectedTicker}
          allScans={allScanTickers}
          onClose={() => setSelectedTicker(null)}
        />
      )}

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
          { label: "Tickers Found", value: scannedTickers.length || Number(latestScan?.metadata?.count) || "—", sub: "latest scan" },
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
        {/* Trending tickers — clickable */}
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Trending Tickers</span>
            <span className="text-xs text-[#ccc]">{latestScan ? timeAgo(latestScan.created_at) : "—"}</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {scanResults.length === 0 ? (
              <div className="text-sm text-[#ccc] text-center py-12">Awaiting first Reddit scan...</div>
            ) : scannedTickers.length > 0 ? (
              <div className="divide-y divide-[#f0f0f0]">
                {scannedTickers.map((t, i) => {
                  const postCount = t.posts?.length || 0;
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => setSelectedTicker(t)}
                      className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-[#f8f8f8] transition-all group text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[#ccc] w-5 text-right tabular-nums">{i + 1}</span>
                        <span className="text-sm font-bold text-[#111] group-hover:text-[#000]">{t.symbol}</span>
                        <div className="flex gap-1">
                          {(t.sources || []).map((s) => (
                            <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                          ))}
                        </div>
                        {postCount > 0 && (
                          <span className="text-[11px] text-[#2563eb] opacity-0 group-hover:opacity-100 transition-opacity">
                            {postCount} post{postCount !== 1 ? "s" : ""} →
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-[#555] tabular-nums">{t.score}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-5">
                <div className="text-sm text-[#555]">{latestScan?.title}</div>
                {latestScan?.detail && (
                  <div className="text-xs text-[#999] leading-relaxed mt-2 whitespace-pre-wrap bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[300px] overflow-y-auto">
                    {latestScan.detail}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Discovered stocks */}
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Added to Watchlist</span>
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
                      <span className="text-sm text-[#555] tabular-nums">{w.score.toFixed(1)}</span>
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
