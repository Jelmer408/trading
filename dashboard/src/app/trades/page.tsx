"use client";

import { useTrades } from "@/hooks/useRealtimeData";

export default function TradesPage() {
  const { trades, loading } = useTrades(100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.1em] text-[#ccc]">TRADES</h2>
        <p className="text-[10px] text-[#444] tracking-[0.05em]">
          FULL TRADE HISTORY WITH LIFECYCLE TRACKING
        </p>
      </div>

      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">TRADE LOG</span>
          <span className="text-[9px] text-[#333]">{trades.length} RECORDS</span>
        </div>

        {loading ? (
          <div className="text-[11px] text-[#333] text-center py-12">LOADING...</div>
        ) : trades.length === 0 ? (
          <div className="text-[11px] text-[#333] text-center py-12">
            NO TRADES RECORDED YET
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-[#1a1a1a] bg-[#050505]">
                  {["TIME", "SYMBOL", "SIDE", "QTY", "ENTRY", "EXIT", "STATUS", "P&L"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[9px] tracking-[0.12em] text-[#444] font-normal whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b border-[#0a0a0a] hover:bg-[#050505] transition-colors">
                    <td className="px-3 py-2 text-[#555] whitespace-nowrap">
                      {new Date(t.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2 font-bold">{t.symbol}</td>
                    <td className={`px-3 py-2 ${t.side === "buy" ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
                      {t.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-[#666]">{t.quantity}</td>
                    <td className="px-3 py-2 text-[#666]">
                      {t.entry_price ? `$${t.entry_price.toFixed(2)}` : "--"}
                    </td>
                    <td className="px-3 py-2 text-[#666]">
                      {t.exit_price ? `$${t.exit_price.toFixed(2)}` : "--"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 ${
                        t.status === "filled" ? "text-[#00ff41] bg-[#001a08]" :
                        t.status === "closed" ? "text-[#666] bg-[#111]" :
                        t.status === "cancelled" ? "text-[#ff0040] bg-[#1a0008]" :
                        "text-[#f0b400] bg-[#1a1400]"
                      }`}>
                        {t.status.toUpperCase()}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-right font-bold ${
                      t.pnl == null ? "text-[#444]" :
                      t.pnl >= 0 ? "text-[#00ff41]" : "text-[#ff0040]"
                    }`}>
                      {t.pnl != null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "--"}
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
