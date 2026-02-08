"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PnLCurve from "@/components/charts/PnLCurve";
import { useAccountData, useTrades } from "@/hooks/useRealtimeData";

export default function PerformancePage() {
  const { history, loading: accountLoading } = useAccountData();
  const { trades } = useTrades(500);

  const closedTrades = trades.filter((t) => t.status === "closed");
  const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
  const losses = closedTrades.filter((t) => (t.pnl || 0) < 0);

  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin =
    wins.length > 0
      ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length
      : 0;
  const avgLoss =
    losses.length > 0
      ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length
      : 0;
  const profitFactor =
    avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : avgWin > 0 ? Infinity : 0;
  const winRate =
    closedTrades.length > 0
      ? (wins.length / closedTrades.length) * 100
      : 0;

  // Calculate max drawdown from equity curve
  let maxDrawdown = 0;
  let peak = 0;
  for (const snap of history) {
    if (snap.equity > peak) peak = snap.equity;
    const dd = peak > 0 ? ((peak - snap.equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  // Sharpe ratio approximation (daily snapshots)
  let sharpe = 0;
  if (history.length > 1) {
    const returns = [];
    for (let i = 1; i < history.length; i++) {
      if (history[i - 1].equity > 0) {
        returns.push(
          (history[i].equity - history[i - 1].equity) / history[i - 1].equity
        );
      }
    }
    if (returns.length > 0) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length
      );
      sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
    }
  }

  const metrics = [
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-green-500" : "text-red-500" },
    { label: "Win Rate", value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? "text-green-500" : "text-red-500" },
    { label: "Profit Factor", value: profitFactor === Infinity ? "N/A" : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? "text-green-500" : "text-red-500" },
    { label: "Sharpe Ratio", value: sharpe.toFixed(2), color: sharpe >= 1 ? "text-green-500" : "text-red-500" },
    { label: "Max Drawdown", value: `${maxDrawdown.toFixed(1)}%`, color: "text-red-500" },
    { label: "Avg Win", value: `$${avgWin.toFixed(2)}`, color: "text-green-500" },
    { label: "Avg Loss", value: `$${avgLoss.toFixed(2)}`, color: "text-red-500" },
    { label: "Total Trades", value: closedTrades.length.toString(), color: "" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance</h2>
        <p className="text-muted-foreground text-sm">
          Strategy metrics and equity curve
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-6">
              <p className={`text-2xl font-bold font-mono ${m.color}`}>
                {m.value}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {accountLoading || history.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Waiting for data...
            </div>
          ) : (
            <PnLCurve data={history} height={350} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
