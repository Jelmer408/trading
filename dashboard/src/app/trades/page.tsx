"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTrades } from "@/hooks/useRealtimeData";

export default function TradesPage() {
  const { trades, loading } = useTrades(100);

  const stats = {
    total: trades.length,
    wins: trades.filter((t) => t.status === "closed" && (t.pnl || 0) > 0).length,
    losses: trades.filter((t) => t.status === "closed" && (t.pnl || 0) < 0).length,
    totalPnl: trades
      .filter((t) => t.status === "closed")
      .reduce((sum, t) => sum + (t.pnl || 0), 0),
  };

  const winRate =
    stats.wins + stats.losses > 0
      ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Trade History</h2>
        <p className="text-muted-foreground text-sm">
          Complete log of all executed trades with AI reasoning
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Trades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-green-500">{stats.wins}</p>
            <p className="text-xs text-muted-foreground">Wins</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold text-red-500">{stats.losses}</p>
            <p className="text-xs text-muted-foreground">Losses</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{winRate}%</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Trades</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : trades.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground">
              No trades recorded yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="max-w-xs">AI Reasoning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trades.map((trade) => {
                    const pnl = trade.pnl || 0;
                    const isProfit = pnl >= 0;
                    return (
                      <TableRow key={trade.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(trade.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="font-bold">
                          {trade.symbol}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              trade.side === "buy" ? "default" : "destructive"
                            }
                            className="text-xs"
                          >
                            {trade.side.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {trade.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {trade.entry_price
                            ? `$${trade.entry_price.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {trade.exit_price
                            ? `$${trade.exit_price.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-bold ${
                            trade.status === "closed"
                              ? isProfit
                                ? "text-green-500"
                                : "text-red-500"
                              : ""
                          }`}
                        >
                          {trade.status === "closed"
                            ? `${isProfit ? "+" : ""}$${pnl.toFixed(2)}`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {trade.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground truncate">
                          {trade.ai_reasoning || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
