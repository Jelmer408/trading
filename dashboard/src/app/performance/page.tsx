"use client";

import PnLCurve from "@/components/charts/PnLCurve";
import { useAccountData, useTrades } from "@/hooks/useRealtimeData";

export default function PerformancePage() {
  const { history, loading: accountLoading } = useAccountData();
  const { trades } = useTrades(500);

  const closedTrades = trades.filter((t) => t.status === "closed");
  const wins = closedTrades.filter((t) => (t.pnl || 0) > 0);
  const losses = closedTrades.filter((t) => (t.pnl || 0) < 0);

  const totalPnl = closedTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = wins.length > 0
    ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0
    ? losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length : 0;
  const profitFactor = avgLoss !== 0
    ? Math.abs(avgWin / avgLoss) : avgWin > 0 ? Infinity : 0;
  const winRate = closedTrades.length > 0
    ? (wins.length / closedTrades.length) * 100 : 0;

  let maxDrawdown = 0;
  let peak = 0;
  for (const snap of history) {
    if (snap.equity > peak) peak = snap.equity;
    const dd = peak > 0 ? ((peak - snap.equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

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
    { label: "TOTAL P&L", value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-[#00ff41]" : "text-[#ff0040]" },
    { label: "WIN RATE", value: `${winRate.toFixed(1)}%`, color: winRate >= 50 ? "text-[#00ff41]" : "text-[#ff0040]" },
    { label: "PROFIT FACTOR", value: profitFactor === Infinity ? "INF" : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? "text-[#00ff41]" : "text-[#ff0040]" },
    { label: "SHARPE", value: sharpe.toFixed(2), color: sharpe >= 1 ? "text-[#00ff41]" : "text-[#ff0040]" },
    { label: "MAX DD", value: `${maxDrawdown.toFixed(1)}%`, color: "text-[#ff0040]" },
    { label: "AVG WIN", value: `$${avgWin.toFixed(2)}`, color: "text-[#00ff41]" },
    { label: "AVG LOSS", value: `$${avgLoss.toFixed(2)}`, color: "text-[#ff0040]" },
    { label: "TRADES", value: closedTrades.length.toString(), color: "text-[#ccc]" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.1em] text-[#ccc]">METRICS</h2>
        <p className="text-[10px] text-[#444] tracking-[0.05em]">
          STRATEGY PERFORMANCE ANALYTICS
        </p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px] bg-[#1a1a1a] border border-[#1a1a1a]">
        {metrics.map((m) => (
          <div key={m.label} className="bg-[#000] px-4 py-4">
            <div className="text-[9px] tracking-[0.15em] text-[#444] mb-2">{m.label}</div>
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">EQUITY CURVE</span>
        </div>
        <div className="p-2">
          {accountLoading || history.length === 0 ? (
            <div className="h-[350px] flex items-center justify-center text-[11px] text-[#333]">
              AWAITING DATA...
            </div>
          ) : (
            <PnLCurve data={history} height={350} />
          )}
        </div>
      </div>
    </div>
  );
}
