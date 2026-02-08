"use client";

import { useNews, useActivityFeed } from "@/hooks/useRealtimeData";

export default function NewsPage() {
  const { news } = useNews(50);
  const { events } = useActivityFeed(200);

  const newsEvents = events.filter(
    (e) => e.agent === "news_ai" || e.event_type === "news_analysis" || e.event_type === "news_cycle"
  );
  const aiRequests = newsEvents.filter((e) => e.event_type === "ai_request");
  const aiResponses = newsEvents.filter((e) => e.event_type === "ai_response");
  const newsAlerts = newsEvents.filter((e) => e.event_type === "news_analysis");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.08em] text-[#e8e8e8]">News & AI Analysis</h2>
        <p className="text-[10px] text-[#333] tracking-[0.04em]">
          Gemini Flash powered market intelligence
        </p>
      </div>

      {aiResponses.length > 0 && (
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center gap-2">
            <span className="text-[10px] tracking-[0.1em] text-[#888]">◎ NEWS AI</span>
            <span className="text-[10px] tracking-[0.1em] text-[#333]">ANALYSIS</span>
          </div>
          <div className="divide-y divide-[#0a0a0a]">
            {aiResponses.slice(0, 5).map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-[#e8e8e8]">{e.title}</span>
                  <span className="text-[9px] text-[#2a2a2a]">
                    {new Date(e.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {e.detail && (
                  <p className="text-[11px] text-[#555] leading-[1.6]">{e.detail}</p>
                )}
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {Object.entries(e.metadata).map(([k, v]) => (
                      <span key={k} className="text-[9px] px-1.5 py-0.5 bg-[#080808] border border-[#141414] text-[#555]">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {newsAlerts.length > 0 && (
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">AI ALERTS</span>
            <span className="text-[9px] text-[#2a2a2a]">{newsAlerts.length}</span>
          </div>
          <div className="divide-y divide-[#0a0a0a]">
            {newsAlerts.slice(0, 20).map((alert) => {
              const sentiment = (alert.metadata as Record<string, string>)?.sentiment;
              return (
                <div key={alert.id} className="px-4 py-3 hover:bg-[#040404]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {alert.symbol && (
                          <span className="text-[10px] px-1.5 py-0 border border-[#1a1a1a] text-[#ccc] font-bold">
                            {alert.symbol}
                          </span>
                        )}
                        {sentiment && (
                          <span className={`text-[9px] tracking-[0.08em] px-1 ${
                            sentiment === "bullish" ? "text-[#3fcf6d] bg-[#0a150d]" :
                            sentiment === "bearish" ? "text-[#e5484d] bg-[#150a0a]" :
                            "text-[#555] bg-[#0a0a0a]"
                          }`}>
                            {sentiment.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#888]">{alert.title}</p>
                      {alert.detail && (
                        <p className="text-[10px] text-[#444] mt-1">{alert.detail}</p>
                      )}
                    </div>
                    <span className="text-[9px] text-[#2a2a2a] whitespace-nowrap shrink-0">
                      {new Date(alert.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {aiRequests.length > 0 && (
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">AI PROMPTS</span>
            <span className="text-[9px] text-[#2a2a2a]">{aiRequests.length} calls</span>
          </div>
          <div className="divide-y divide-[#0a0a0a]">
            {aiRequests.slice(0, 5).map((req) => (
              <div key={req.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#888]">→ {req.title}</span>
                  <span className="text-[9px] text-[#2a2a2a]">
                    {new Date(req.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {req.detail && (
                  <div className="text-[10px] text-[#333] leading-[1.6] bg-[#030303] border border-[#111] p-3 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                    {req.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">RAW NEWS FEED</span>
          <span className="text-[9px] text-[#2a2a2a]">{news.length}</span>
        </div>
        {news.length === 0 ? (
          <div className="text-[11px] text-[#1a1a1a] text-center py-12">
            No news items yet
          </div>
        ) : (
          <div className="divide-y divide-[#0a0a0a]">
            {news.map((item) => (
              <div key={item.id} className="px-4 py-3 hover:bg-[#040404] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.symbol && (
                        <span className="text-[10px] px-1.5 py-0 border border-[#1a1a1a] text-[#ccc]">
                          {item.symbol}
                        </span>
                      )}
                      {item.sentiment && (
                        <span className={`text-[10px] ${
                          item.sentiment === "bullish" ? "text-[#3fcf6d]" :
                          item.sentiment === "bearish" ? "text-[#e5484d]" :
                          "text-[#555]"
                        }`}>
                          {item.sentiment.toUpperCase()}
                        </span>
                      )}
                      {item.source && (
                        <span className="text-[10px] text-[#2a2a2a]">via {item.source}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#888] font-medium">{item.headline}</p>
                    {item.summary && (
                      <p className="text-[11px] text-[#333] mt-1 line-clamp-2">{item.summary}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-[#2a2a2a] whitespace-nowrap flex-shrink-0">
                    {new Date(item.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
