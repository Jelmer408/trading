"use client";

import { useTrades } from "@/hooks/useRealtimeData";

export default function TradesPage() {
  const { trades, loading } = useTrades(100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.08em] text-[#e8e8e8]">Trades</h2>
        <p className="text-[10px] text-[#333] tracking-[0.04em]">
          Full trade history with lifecycle tracking
        </p>
      </div>

      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">TRADE LOG</span>
          <span className="text-[9px] text-[#2a2a2a]">{trades.length} records</span>
        </div>

        {loading ? (
          <div className="text-[11px] text-[#1a1a1a] text-center py-12">Loading...</div>
        ) : trades.length === 0 ? (
          <div className="text-[11px] text-[#1a1a1a] text-center py-12">
            No trades recorded yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#161616] bg-[#040404]">
                  {["TIME", "SYMBOL", "SIDE", "QTY", "ENTRY", "EXIT", "STATUS", "P&L"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[9px] tracking-[0.1em] text-[#333] font-normal whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-[#0a0a0a] hover:bg-[#040404] transition-colors">
                    <td className="px-3 py-2 text-[#444] whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 font-bold text-[#ccc]">{t.symbol}</td>
                    <td className="px-3 py-2 text-[#888]">{t.side.toUpperCase()}</td>
                    <td className="px-3 py-2 text-[#555]">{t.quantity}</td>
                    <td className="px-3 py-2 text-[#555]">
                      {t.entry_price ? `$${t.entry_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[#555]">
                      {t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 ${
                        t.status === "filled" ? "text-[#888] bg-[#0e0e0e]" :
                        t.status === "closed" ? "text-[#555] bg-[#0a0a0a]" :
                        t.status === "cancelled" ? "text-[#e5484d] bg-[#150a0a]" :
                        "text-[#e5a63f] bg-[#15120a]"
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${
                      t.pnl == null ? "text-[#333]" :
                      t.pnl >= 0 ? "text-[#3fcf6d]" : "text-[#e5484d]"
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
