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
    { label: "Total P&L", value: `$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-[#16a34a]" : "text-[#dc2626]" },
    { label: "Win Rate", value: `${winRate.toFixed(1)}%`, color: "text-[#111]" },
    { label: "Profit Factor", value: profitFactor === Infinity ? "∞" : profitFactor.toFixed(2), color: "text-[#111]" },
    { label: "Sharpe", value: sharpe.toFixed(2), color: "text-[#111]" },
    { label: "Max Drawdown", value: `${maxDrawdown.toFixed(1)}%`, color: "text-[#dc2626]" },
    { label: "Avg Win", value: `$${avgWin.toFixed(2)}`, color: "text-[#16a34a]" },
    { label: "Avg Loss", value: `$${avgLoss.toFixed(2)}`, color: "text-[#dc2626]" },
    { label: "Trades", value: closedTrades.length.toString(), color: "text-[#111]" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">Metrics</h2>
        <p className="text-sm text-[#999]">Strategy performance analytics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg border border-[#e5e5e5] p-4">
            <div className="text-xs text-[#999] mb-1">{m.label}</div>
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Equity Curve</span>
        </div>
        <div className="p-3">
          {accountLoading || history.length === 0 ? (
            <div className="h-[350px] flex items-center justify-center text-sm text-[#ccc]">
              Awaiting data...
            </div>
          ) : (
            <PnLCurve data={history} height={350} />
          )}
        </div>
      </div>
    </div>
  );
}
