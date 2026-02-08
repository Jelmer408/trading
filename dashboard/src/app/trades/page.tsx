"use client";

import { useTrades } from "@/hooks/useRealtimeData";

export default function TradesPage() {
  const { trades, loading } = useTrades(100);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">Trades</h2>
        <p className="text-sm text-[#999]">Full trade history with lifecycle tracking</p>
      </div>

      <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Trade Log</span>
          <span className="text-xs text-[#999]">{trades.length} records</span>
        </div>

        {loading ? (
          <div className="text-sm text-[#ccc] text-center py-12">Loading...</div>
        ) : trades.length === 0 ? (
          <div className="text-sm text-[#ccc] text-center py-12">No trades recorded yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
                  {["Time", "Symbol", "Side", "Qty", "Entry", "Exit", "Status", "P&L"].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-[#999] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-2.5 text-[#999] whitespace-nowrap text-xs">
                      {new Date(t.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-[#111]">{t.symbol}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.side === "buy" ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]"
                      }`}>
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#555]">{t.quantity}</td>
                    <td className="px-4 py-2.5 text-[#555]">
                      {t.entry_price ? `$${t.entry_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[#555]">
                      {t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.status === "filled" ? "bg-[#eff6ff] text-[#2563eb]" :
                        t.status === "closed" ? "bg-[#f5f5f5] text-[#555]" :
                        t.status === "cancelled" ? "bg-[#fef2f2] text-[#dc2626]" :
                        "bg-[#fffbeb] text-[#d97706]"
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold ${
                      t.pnl == null ? "text-[#ccc]" :
                      t.pnl >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
                    }`}>
                      {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
