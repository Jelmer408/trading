"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { WatchlistItem } from "@/lib/types";

interface WatchlistCardProps {
  watchlist: WatchlistItem[];
  loading: boolean;
}

const sourceColors: Record<string, string> = {
  base: "bg-zinc-700 text-zinc-300",
  discovered: "bg-amber-900/50 text-amber-400",
  ai_approved: "bg-emerald-900/50 text-emerald-400",
};

const sourceLabels: Record<string, string> = {
  base: "Core",
  discovered: "Discovered",
  ai_approved: "AI Approved",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function WatchlistCard({ watchlist, loading }: WatchlistCardProps) {
  const discovered = watchlist.filter((w) => w.source !== "base");
  const base = watchlist.filter((w) => w.source === "base");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Dynamic Watchlist
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {watchlist.length} symbols active
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading...
          </div>
        ) : watchlist.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No watchlist data yet. Bot will scan Reddit &amp; news on startup.
          </div>
        ) : (
          <div className="space-y-4">
            {/* AI-discovered symbols */}
            {discovered.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Trending / Discovered
                </p>
                <div className="space-y-2">
                  {discovered.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-bold text-sm">
                          {item.symbol}
                        </span>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${sourceColors[item.source] || ""}`}
                        >
                          {sourceLabels[item.source] || item.source}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {item.reason}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {item.discovery_sources?.join(", ")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-mono text-amber-400">
                            {item.score.toFixed(1)}
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {formatTimeAgo(item.added_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Base symbols */}
            {base.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Core Watchlist
                </p>
                <div className="flex flex-wrap gap-2">
                  {base.map((item) => (
                    <Badge
                      key={item.id}
                      variant="outline"
                      className="font-mono text-xs border-zinc-700"
                    >
                      {item.symbol}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
