"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNews } from "@/hooks/useRealtimeData";

export default function NewsPage() {
  const { news } = useNews(50);

  const sentimentColor = (s: string | null) => {
    if (s === "bullish") return "text-green-500";
    if (s === "bearish") return "text-red-500";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Market News</h2>
        <p className="text-muted-foreground text-sm">
          AI-curated news from PlusE Finance
        </p>
      </div>

      {news.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No news items yet. The bot will populate this as it analyzes
            markets.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <Card key={item.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {item.symbol && (
                        <Badge variant="outline" className="text-xs">
                          {item.symbol}
                        </Badge>
                      )}
                      {item.sentiment && (
                        <span
                          className={`text-xs font-medium ${sentimentColor(item.sentiment)}`}
                        >
                          {item.sentiment.toUpperCase()}
                        </span>
                      )}
                      {item.source && (
                        <span className="text-xs text-muted-foreground">
                          via {item.source}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm">{item.headline}</h3>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
