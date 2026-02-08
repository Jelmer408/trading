"use client";

import { useNews, useActivityFeed } from "@/hooks/useRealtimeData";

export default function NewsPage() {
  const { news } = useNews(50);
  const { events } = useActivityFeed(200);

  const newsEvents = events.filter(
    (e) => e.agent === "news_ai" || e.event_type === "news_analysis" || e.event_type === "news_cycle"
  );
  const aiResponses = newsEvents.filter((e) => e.event_type === "ai_response");
  const newsAlerts = newsEvents.filter((e) => e.event_type === "news_analysis");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">News & AI Analysis</h2>
        <p className="text-sm text-[#999]">Gemini Flash powered market intelligence</p>
      </div>

      {aiResponses.length > 0 && (
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">AI Analysis</span>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {aiResponses.slice(0, 5).map((e) => (
              <div key={e.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-[#111]">{e.title}</span>
                  <span className="text-xs text-[#ccc]">
                    {new Date(e.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {e.detail && <p className="text-sm text-[#555] leading-relaxed">{e.detail}</p>}
                {e.metadata && Object.keys(e.metadata).length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {Object.entries(e.metadata).map(([k, v]) => (
                      <span key={k} className="text-xs px-2 py-0.5 rounded bg-[#f5f5f5] text-[#555]">
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
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">AI Alerts</span>
            <span className="text-xs text-[#ccc]">{newsAlerts.length}</span>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {newsAlerts.slice(0, 20).map((alert) => {
              const sentiment = (alert.metadata as Record<string, string>)?.sentiment;
              return (
                <div key={alert.id} className="px-5 py-3 hover:bg-[#fafafa]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {alert.symbol && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-[#f0f0f0] text-[#111] font-bold">{alert.symbol}</span>
                        )}
                        {sentiment && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            sentiment === "bullish" ? "bg-[#f0fdf4] text-[#16a34a]" :
                            sentiment === "bearish" ? "bg-[#fef2f2] text-[#dc2626]" :
                            "bg-[#f5f5f5] text-[#999]"
                          }`}>
                            {sentiment.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#555]">{alert.title}</p>
                      {alert.detail && <p className="text-xs text-[#999] mt-1">{alert.detail}</p>}
                    </div>
                    <span className="text-xs text-[#ccc] whitespace-nowrap shrink-0">
                      {new Date(alert.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Raw News Feed</span>
          <span className="text-xs text-[#ccc]">{news.length}</span>
        </div>
        {news.length === 0 ? (
          <div className="text-sm text-[#ccc] text-center py-12">No news items yet</div>
        ) : (
          <div className="divide-y divide-[#f0f0f0]">
            {news.map((item) => (
              <div key={item.id} className="px-5 py-3 hover:bg-[#fafafa] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.symbol && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-[#f0f0f0] text-[#111] font-bold">{item.symbol}</span>
                      )}
                      {item.sentiment && (
                        <span className={`text-xs font-medium ${
                          item.sentiment === "bullish" ? "text-[#16a34a]" :
                          item.sentiment === "bearish" ? "text-[#dc2626]" :
                          "text-[#999]"
                        }`}>
                          {item.sentiment.toUpperCase()}
                        </span>
                      )}
                      {item.source && <span className="text-xs text-[#ccc]">via {item.source}</span>}
                    </div>
                    <p className="text-sm font-medium text-[#111]">{item.headline}</p>
                    {item.summary && <p className="text-xs text-[#999] mt-1 line-clamp-2">{item.summary}</p>}
                  </div>
                  <span className="text-xs text-[#ccc] whitespace-nowrap flex-shrink-0">
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
