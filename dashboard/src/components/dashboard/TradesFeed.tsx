"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Trade } from "@/lib/types";

interface TradesFeedProps {
  trades: Trade[];
  loading: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TradesFeed({ trades, loading }: TradesFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Trades</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : trades.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            No trades yet
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {trades.slice(0, 20).map((trade) => {
              const isProfit = (trade.pnl || 0) >= 0;
              return (
                <div
                  key={trade.id}
                  className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={trade.side === "buy" ? "default" : "destructive"}
                      className="w-10 justify-center text-xs"
                    >
                      {trade.side === "buy" ? "BUY" : "SELL"}
                    </Badge>
                    <div>
                      <p className="font-bold text-sm">{trade.symbol}</p>
                      <p className="text-xs text-muted-foreground">
                        {trade.quantity} shares @ $
                        {(trade.entry_price || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {trade.status === "closed" && trade.pnl !== null ? (
                      <p
                        className={`font-mono text-sm font-bold ${
                          isProfit ? "text-green-500" : "text-red-500"
                        }`}
                      >
                        {isProfit ? "+" : ""}${trade.pnl.toFixed(2)}
                      </p>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        {trade.status}
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(trade.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
