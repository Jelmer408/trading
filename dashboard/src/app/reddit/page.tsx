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

  // ── Filter events by type ──────────────────────────
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
  const watchlistUpdates = events.filter(
    (e) => e.event_type === "watchlist_update"
  );

  // Discovered stocks from watchlist
  const discovered = watchlist.filter((w) => w.source !== "base");

  // Extract tickers from the latest scan result metadata
  const latestScan = scanResults[0];
  const scannedTickers: Array<{ symbol: string; score: number; sources: string[] }> =
    (latestScan?.metadata?.tickers as Array<{ symbol: string; score: number; sources: string[] }>) || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-[0.08em] text-[#e8e8e8]">Reddit Scanner</h2>
          <p className="text-[10px] text-[#333] tracking-[0.04em]">
            RSS feeds from r/wallstreetbets, r/stocks, r/options, r/stockmarket + ApeWisdom
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] text-[#333] tracking-[0.08em]">
            {redditScans.length} scans logged
          </span>
          <span className="text-[9px] text-[#555] tracking-[0.08em] px-2 py-1 border border-[#1a1a1a]">
            EVERY 15 MIN
          </span>
        </div>
      </div>

      {/* ── Pipeline overview ─────────────────────────── */}
      <div className="grid grid-cols-4 gap-[1px] bg-[#161616]">
        {[
          { label: "SCANS", value: redditScans.length, sub: "RSS + ApeWisdom" },
          { label: "TICKERS FOUND", value: scannedTickers.length || Number(latestScan?.metadata?.count) || "—", sub: "latest scan" },
          { label: "AI EVALUATED", value: aiEvals.length, sub: "Gemini calls" },
          { label: "DISCOVERED", value: discovered.length, sub: "on watchlist" },
        ].map((item) => (
          <div key={item.label} className="bg-[#000] px-4 py-3">
            <div className="text-[8px] tracking-[0.12em] text-[#333]">{item.label}</div>
            <div className="text-lg font-bold text-[#e8e8e8]">{item.value}</div>
            <div className="text-[9px] text-[#2a2a2a]">{item.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Latest Scan Results (tickers found) ────── */}
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">TRENDING TICKERS</span>
            <span className="text-[9px] text-[#2a2a2a]">
              {latestScan ? timeAgo(latestScan.created_at) : "—"}
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {scanResults.length === 0 ? (
              <div className="text-[11px] text-[#1a1a1a] text-center py-12">
                Awaiting first Reddit scan...
              </div>
            ) : (
              <>
                {/* Show tickers from metadata if available */}
                {scannedTickers.length > 0 ? (
                  <div className="divide-y divide-[#0a0a0a]">
                    {scannedTickers.map((t, i) => (
                      <div key={t.symbol} className="flex items-center justify-between px-4 py-2 hover:bg-[#040404]">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-[#2a2a2a] w-5 text-right tabular-nums">{i + 1}</span>
                          <span className="text-[12px] font-bold text-[#ccc]">{t.symbol}</span>
                          <div className="flex gap-1">
                            {(t.sources || []).map((s) => (
                              <span key={s} className="text-[8px] px-1 py-0 bg-[#080808] border border-[#141414] text-[#444]">
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-[2px] bg-[#333]" style={{ width: `${Math.min(t.score * 3, 80)}px` }} />
                          <span className="text-[10px] text-[#555] w-10 text-right tabular-nums">{t.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Fallback: show the scan result detail text */
                  <div className="p-4">
                    <div className="text-[11px] text-[#555]">{latestScan?.title}</div>
                    {latestScan?.detail && (
                      <div className="text-[10px] text-[#333] leading-[1.6] mt-2 whitespace-pre-wrap bg-[#030303] border border-[#111] p-3 max-h-[300px] overflow-y-auto">
                        {latestScan.detail}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Discovered stocks on watchlist ──────── */}
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">ADDED TO WATCHLIST</span>
            <span className="text-[9px] text-[#2a2a2a]">{discovered.length} stocks</span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {discovered.length === 0 ? (
              <div className="text-[11px] text-[#1a1a1a] text-center py-12">
                No stocks discovered yet
              </div>
            ) : (
              <div className="divide-y divide-[#0a0a0a]">
                {discovered.map((w) => (
                  <div key={w.id} className="px-4 py-3 hover:bg-[#040404]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-[#e8e8e8]">{w.symbol}</span>
                        <span className={`text-[8px] tracking-[0.08em] px-1.5 py-0.5 ${
                          w.source === "ai_approved"
                            ? "text-[#e8e8e8] bg-[#111] border border-[#252525]"
                            : "text-[#555] bg-[#0a0a0a] border border-[#161616]"
                        }`}>
                          {w.source === "ai_approved" ? "AI APPROVED" : "SCORE"}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#555] tabular-nums">{w.score.toFixed(1)}</span>
                    </div>
                    {w.reason && (
                      <p className="text-[10px] text-[#444] mt-1">{w.reason}</p>
                    )}
                    {w.discovery_sources && w.discovery_sources.length > 0 && (
                      <div className="flex gap-1 mt-1.5">
                        {w.discovery_sources.map((s) => (
                          <span key={s} className="text-[8px] px-1 py-0 bg-[#060606] border border-[#111] text-[#333]">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[9px] text-[#1a1a1a] mt-1">
                      added {timeAgo(w.added_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Evaluation Log ─────────────────────── */}
      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.1em] text-[#888]">◈ AI</span>
            <span className="text-[10px] tracking-[0.1em] text-[#555]">WATCHLIST EVALUATION</span>
          </div>
          <span className="text-[9px] text-[#2a2a2a]">{aiEvals.length + aiResponses.length} events</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {aiEvals.length === 0 && aiResponses.length === 0 ? (
            <div className="text-[11px] text-[#1a1a1a] text-center py-12">
              No AI evaluations yet — next scan cycle will trigger one
            </div>
          ) : (
            <div className="divide-y divide-[#0a0a0a]">
              {/* Show AI responses (decisions) first */}
              {aiResponses.map((e) => {
                const approved = (e.metadata?.approved as string[]) || [];
                return (
                  <div
                    key={e.id}
                    className="px-4 py-3 hover:bg-[#040404] cursor-pointer"
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#e8e8e8]">← RESPONSE</span>
                        <span className="text-[11px] text-[#888]">{e.title}</span>
                      </div>
                      <span className="text-[9px] text-[#2a2a2a]">{timeAgo(e.created_at)}</span>
                    </div>
                    {approved.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5">
                        {approved.map((sym) => (
                          <span key={sym} className="text-[10px] px-1.5 py-0.5 font-bold text-[#e8e8e8] bg-[#111] border border-[#252525]">
                            {sym}
                          </span>
                        ))}
                      </div>
                    )}
                    {expandedId === e.id && e.detail && (
                      <div className="text-[10px] text-[#444] leading-[1.6] mt-3 bg-[#030303] border border-[#111] p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                        {e.detail}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Show AI requests (prompts) */}
              {aiEvals.map((e) => (
                <div
                  key={e.id}
                  className="px-4 py-3 hover:bg-[#040404] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#555]">→ PROMPT</span>
                      <span className="text-[11px] text-[#555]">{e.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-[#2a2a2a]">
                        {expandedId === e.id ? "COLLAPSE" : "EXPAND"}
                      </span>
                      <span className="text-[9px] text-[#2a2a2a]">{timeAgo(e.created_at)}</span>
                    </div>
                  </div>
                  {expandedId === e.id && e.detail && (
                    <div className="text-[10px] text-[#333] leading-[1.6] mt-2 bg-[#030303] border border-[#111] p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {e.detail}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Full Scan Timeline ────────────────────── */}
      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">SCAN TIMELINE</span>
          <span className="text-[9px] text-[#2a2a2a]">{redditScans.length} events</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-[#0a0a0a]">
          {redditScans.length === 0 ? (
            <div className="text-[11px] text-[#1a1a1a] text-center py-12">
              No scan events recorded yet
            </div>
          ) : (
            redditScans.map((e) => {
              const count = (e.metadata?.count as number) || 0;
              const tickers = (e.metadata?.tickers as Array<{ symbol: string; score: number }>) || [];
              const topTickers = tickers.slice(0, 8);
              const isResult = e.event_type === "scan_result";

              return (
                <div
                  key={e.id}
                  className="px-4 py-3 hover:bg-[#040404] cursor-pointer"
                  onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-[5px] h-[5px] rounded-full ${
                        isResult ? "bg-[#3fcf6d]" : "bg-[#555]"
                      }`} />
                      <span className={`text-[10px] ${isResult ? "text-[#888]" : "text-[#444]"}`}>
                        {e.title}
                      </span>
                      {isResult && count > 0 && (
                        <span className="text-[9px] text-[#555] px-1 bg-[#0a0a0a] border border-[#161616]">
                          {count} tickers
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-[#2a2a2a]">{timeAgo(e.created_at)}</span>
                  </div>

                  {/* Show top tickers inline */}
                  {isResult && topTickers.length > 0 && (
                    <div className="flex gap-1.5 mt-2 ml-[13px]">
                      {topTickers.map((t) => (
                        <span key={t.symbol} className="text-[9px] px-1.5 py-0.5 bg-[#080808] border border-[#141414] text-[#555]">
                          {t.symbol} <span className="text-[#2a2a2a]">{t.score}</span>
                        </span>
                      ))}
                      {tickers.length > 8 && (
                        <span className="text-[9px] text-[#2a2a2a] py-0.5">+{tickers.length - 8}</span>
                      )}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {expandedId === e.id && e.detail && (
                    <div className="text-[10px] text-[#333] leading-[1.6] mt-3 ml-[13px] bg-[#030303] border border-[#111] p-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                      {e.detail}
                    </div>
                  )}

                  {/* Expanded metadata */}
                  {expandedId === e.id && e.metadata && Object.keys(e.metadata).length > 0 && (
                    <div className="mt-2 ml-[13px] flex flex-wrap gap-1.5">
                      {Object.entries(e.metadata).filter(([k]) => k !== "tickers").map(([key, val]) => (
                        <span key={key} className="text-[9px] px-1.5 py-0.5 bg-[#080808] border border-[#141414] text-[#444]">
                          {key}: {typeof val === "object" ? JSON.stringify(val) : String(val)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Watchlist Updates ─────────────────────── */}
      {watchlistUpdates.length > 0 && (
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">WATCHLIST UPDATES</span>
            <span className="text-[9px] text-[#2a2a2a]">{watchlistUpdates.length}</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-[#0a0a0a]">
            {watchlistUpdates.map((e) => {
              const added = (e.metadata?.added as string[]) || [];
              const removed = (e.metadata?.removed as string[]) || [];
              const total = (e.metadata?.total as number) || 0;
              return (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#888]">{e.title}</span>
                    <span className="text-[9px] text-[#2a2a2a]">{timeAgo(e.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    {total > 0 && <span className="text-[#555]">{total} total</span>}
                    {added.length > 0 && (
                      <span className="text-[#3fcf6d]">
                        + {added.join(", ")}
                      </span>
                    )}
                    {removed.length > 0 && (
                      <span className="text-[#e5484d]">
                        − {removed.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
