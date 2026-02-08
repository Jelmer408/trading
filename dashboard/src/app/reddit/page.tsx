"use client";

import { useState } from "react";
import { useActivityFeed, useWatchlist } from "@/hooks/useRealtimeData";

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function RedditPage() {
  const { events } = useActivityFeed(500);
  const { watchlist } = useWatchlist();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const scanEvents = events.filter(
    (e) => e.agent === "scanner" && (e.event_type === "scan_started" || e.event_type === "scan_result")
  );
  const redditScans = scanEvents.filter(
    (e) => e.title.toLowerCase().includes("reddit") || e.title.toLowerCase().includes("rss")
  );
  const scanResults = redditScans.filter((e) => e.event_type === "scan_result");
  const aiEvals = events.filter(
    (e) => e.agent === "analyst" && e.event_type === "ai_request" && e.title.toLowerCase().includes("watchlist")
  );
  const aiResponses = events.filter(
    (e) => e.agent === "analyst" && e.event_type === "ai_response" && e.title.toLowerCase().includes("approved")
  );

  const discovered = watchlist.filter((w) => w.source !== "base");
  const latestScan = scanResults[0];
  const scannedTickers: Array<{ symbol: string; score: number; sources: string[] }> =
    (latestScan?.metadata?.tickers as Array<{ symbol: string; score: number; sources: string[] }>) || [];

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
          <span className="text-xs text-[#999]">{redditScans.length} scans logged</span>
          <span className="text-xs text-[#555] px-2 py-1 rounded-md bg-[#f5f5f5]">Every 15 min</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Scans", value: redditScans.length, sub: "RSS + ApeWisdom" },
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
        {/* Trending tickers */}
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
                {scannedTickers.map((t, i) => (
                  <div key={t.symbol} className="flex items-center justify-between px-5 py-2.5 hover:bg-[#fafafa]">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#ccc] w-5 text-right tabular-nums">{i + 1}</span>
                      <span className="text-sm font-bold text-[#111]">{t.symbol}</span>
                      <div className="flex gap-1">
                        {(t.sources || []).map((s) => (
                          <span key={s} className="text-[11px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#999]">{s}</span>
                        ))}
                      </div>
                    </div>
                    <span className="text-sm text-[#555] tabular-nums">{t.score}</span>
                  </div>
                ))}
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

      {/* Scan Timeline */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Scan Timeline</span>
          <span className="text-xs text-[#ccc]">{redditScans.length} events</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-[#f0f0f0]">
          {redditScans.length === 0 ? (
            <div className="text-sm text-[#ccc] text-center py-12">No scan events recorded yet</div>
          ) : (
            redditScans.map((e) => {
              const count = (e.metadata?.count as number) || 0;
              const tickers = (e.metadata?.tickers as Array<{ symbol: string; score: number }>) || [];
              const topTickers = tickers.slice(0, 8);
              const isResult = e.event_type === "scan_result";

              return (
                <div key={e.id} className="px-5 py-3 hover:bg-[#fafafa] cursor-pointer" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${isResult ? "bg-[#16a34a]" : "bg-[#ccc]"}`} />
                      <span className={`text-sm ${isResult ? "text-[#555]" : "text-[#999]"}`}>{e.title}</span>
                      {isResult && count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5f5f5] text-[#999]">{count} tickers</span>
                      )}
                    </div>
                    <span className="text-xs text-[#ccc]">{timeAgo(e.created_at)}</span>
                  </div>
                  {isResult && topTickers.length > 0 && (
                    <div className="flex gap-1.5 mt-2 ml-4">
                      {topTickers.map((t) => (
                        <span key={t.symbol} className="text-xs px-2 py-0.5 rounded bg-[#f5f5f5] text-[#555]">
                          {t.symbol} <span className="text-[#ccc]">{t.score}</span>
                        </span>
                      ))}
                      {tickers.length > 8 && <span className="text-xs text-[#ccc] py-0.5">+{tickers.length - 8}</span>}
                    </div>
                  )}
                  {expandedId === e.id && e.detail && (
                    <div className="text-xs text-[#999] leading-relaxed mt-3 ml-4 bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {e.detail}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
