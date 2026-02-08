"use client";

import { useNews } from "@/hooks/useRealtimeData";

export default function NewsPage() {
  const { news } = useNews(50);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.1em] text-[#ccc]">NEWS FEED</h2>
        <p className="text-[10px] text-[#444] tracking-[0.05em]">
          AI-CURATED MARKET INTELLIGENCE
        </p>
      </div>

      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">FEED</span>
        </div>

        {news.length === 0 ? (
          <div className="text-[11px] text-[#333] text-center py-12">
            NO NEWS ITEMS YET — BOT WILL POPULATE AS IT SCANS MARKETS
          </div>
        ) : (
          <div className="divide-y divide-[#0a0a0a]">
            {news.map((item) => (
              <div key={item.id} className="px-4 py-3 hover:bg-[#050505] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.symbol && (
                        <span className="text-[10px] px-1.5 py-0 border border-[#222] text-[#ccc]">
                          {item.symbol}
                        </span>
                      )}
                      {item.sentiment && (
                        <span className={`text-[10px] ${
                          item.sentiment === "bullish" ? "text-[#00ff41]" :
                          item.sentiment === "bearish" ? "text-[#ff0040]" :
                          "text-[#666]"
                        }`}>
                          {item.sentiment.toUpperCase()}
                        </span>
                      )}
                      {item.source && (
                        <span className="text-[10px] text-[#333]">
                          via {item.source}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#aaa] font-medium">{item.headline}</p>
                    {item.summary && (
                      <p className="text-[11px] text-[#444] mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-[#333] whitespace-nowrap flex-shrink-0">
                    {new Date(item.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
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
