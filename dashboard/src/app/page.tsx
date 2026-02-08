"use client";

import { useBotStatus } from "@/hooks/useBotStatus";
import {
  useAccountData,
  usePositions,
  useTrades,
  useSignals,
  useWatchlist,
} from "@/hooks/useRealtimeData";
import PnLCurve from "@/components/charts/PnLCurve";

function formatMoney(val: number) {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function OverviewPage() {
  const { data: bot } = useBotStatus();
  const { snapshot, history } = useAccountData();
  const { positions } = usePositions();
  const { trades } = useTrades(10);
  const { signals } = useSignals(8);
  const { watchlist } = useWatchlist();

  const isOnline = bot?.status === "online";
  const discovered = watchlist.filter((w) => w.source !== "base");
  const base = watchlist.filter((w) => w.source === "base");

  return (
    <div className="space-y-4">
      {/* ── Bot Status Panel ──────────────────────────────── */}
      <div className="border border-[#1a1a1a]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
          <div className="flex items-center gap-3">
            <div
              className={`w-[6px] h-[6px] ${isOnline ? "bg-[#00ff41]" : "bg-[#ff0040]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className="text-[10px] tracking-[0.15em] text-[#666]">
              BOT STATUS
            </span>
          </div>
          <span className={`text-[10px] tracking-[0.15em] ${isOnline ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-[1px] bg-[#1a1a1a]">
          {[
            { label: "UPTIME", value: bot?.uptime || "--", color: "" },
            { label: "BARS", value: bot?.activity.bars_received.toLocaleString() || "0", color: "" },
            { label: "SIGNALS", value: bot?.activity.signals_generated.toLocaleString() || "0", color: "text-[#f0b400]" },
            { label: "TRADES", value: bot?.activity.trades_placed.toLocaleString() || "0", color: "text-[#00ff41]" },
            { label: "TIMEFRAME", value: bot?.config.timeframe || "--", color: "" },
            { label: "MODE", value: bot?.config.paper ? "PAPER" : "LIVE", color: bot?.config.paper ? "text-[#f0b400]" : "text-[#ff0040]" },
          ].map((item) => (
            <div key={item.label} className="bg-[#000] px-4 py-3">
              <div className="text-[9px] tracking-[0.15em] text-[#444] mb-1">{item.label}</div>
              <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Account Metrics ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1px] bg-[#1a1a1a] border border-[#1a1a1a]">
        {[
          { label: "EQUITY", value: snapshot ? formatMoney(snapshot.equity) : "--", color: "" },
          {
            label: "DAY P&L",
            value: snapshot ? `${snapshot.day_pnl >= 0 ? "+" : ""}${formatMoney(snapshot.day_pnl)}` : "--",
            color: snapshot ? (snapshot.day_pnl >= 0 ? "text-[#00ff41]" : "text-[#ff0040]") : "",
            sub: snapshot ? `${snapshot.day_pnl_pct >= 0 ? "+" : ""}${snapshot.day_pnl_pct.toFixed(2)}%` : "",
          },
          { label: "CASH", value: snapshot ? formatMoney(snapshot.cash) : "--", color: "" },
          { label: "BUYING POWER", value: snapshot ? formatMoney(snapshot.buying_power) : "--", color: "" },
        ].map((item) => (
          <div key={item.label} className="bg-[#000] px-4 py-4">
            <div className="text-[9px] tracking-[0.15em] text-[#444] mb-2">{item.label}</div>
            <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
            {"sub" in item && item.sub && (
              <div className={`text-[11px] mt-1 ${item.color}`}>{item.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Equity Curve + Watchlist ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve */}
        <div className="lg:col-span-2 border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">EQUITY CURVE</span>
          </div>
          <div className="p-2">
            {history.length > 0 ? (
              <PnLCurve data={history} height={200} />
            ) : (
              <div className="h-[200px] flex items-center justify-center text-[11px] text-[#333]">
                AWAITING DATA...
              </div>
            )}
          </div>
        </div>

        {/* Watchlist Radar */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">WATCHLIST RADAR</span>
            <span className="text-[9px] text-[#333]">{watchlist.length} SYM</span>
          </div>
          <div className="p-3 space-y-3 max-h-[248px] overflow-y-auto">
            {/* Core symbols */}
            {base.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.15em] text-[#333] mb-2">CORE</div>
                <div className="flex flex-wrap gap-1">
                  {base.map((w) => (
                    <span
                      key={w.id}
                      className="px-2 py-0.5 text-[10px] border border-[#222] text-[#666]"
                    >
                      {w.symbol}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered symbols */}
            {discovered.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.15em] text-[#333] mb-2">TRENDING</div>
                <div className="space-y-1">
                  {discovered.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between text-[11px] py-1 border-b border-[#111]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#ccc]">{w.symbol}</span>
                        <span className={`text-[9px] tracking-[0.1em] px-1 ${
                          w.source === "ai_approved"
                            ? "text-[#00ff41] bg-[#001a08]"
                            : "text-[#f0b400] bg-[#1a1400]"
                        }`}>
                          {w.source === "ai_approved" ? "AI" : "SCORE"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-[3px] bg-[#00ff41]"
                          style={{ width: `${Math.min(w.score * 2, 60)}px`, opacity: 0.6 }}
                        />
                        <span className="text-[10px] text-[#555] w-8 text-right">
                          {w.score.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {watchlist.length === 0 && (
              <div className="text-[11px] text-[#333] text-center py-4">
                SCANNER INITIALIZING...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Positions + Trades + Signals ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Positions */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">OPEN POSITIONS</span>
            <span className="text-[9px] text-[#333]">{positions.length}</span>
          </div>
          <div className="p-0">
            {positions.length === 0 ? (
              <div className="text-[11px] text-[#333] text-center py-8">
                NO POSITIONS
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[#111]">
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">SYM</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">QTY</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-b border-[#0a0a0a]">
                      <td className="px-3 py-2 font-bold">{p.symbol}</td>
                      <td className="px-3 py-2 text-right text-[#666]">{p.quantity}</td>
                      <td className={`px-3 py-2 text-right ${
                        (p.unrealized_pnl || 0) >= 0 ? "text-[#00ff41]" : "text-[#ff0040]"
                      }`}>
                        {p.unrealized_pnl ? `$${p.unrealized_pnl.toFixed(2)}` : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Recent Trades */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">RECENT TRADES</span>
            <span className="text-[9px] text-[#333]">{trades.length}</span>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            {trades.length === 0 ? (
              <div className="text-[11px] text-[#333] text-center py-8">
                NO TRADES YET
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[#111]">
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">SYM</th>
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">SIDE</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.1em] text-[#444] font-normal">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b border-[#0a0a0a]">
                      <td className="px-3 py-2 font-bold">{t.symbol}</td>
                      <td className={`px-3 py-2 ${t.side === "buy" ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
                        {t.side.toUpperCase()}
                      </td>
                      <td className={`px-3 py-2 text-right ${
                        (t.pnl || 0) >= 0 ? "text-[#00ff41]" : "text-[#ff0040]"
                      }`}>
                        {t.pnl != null ? `$${t.pnl.toFixed(2)}` : t.status.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Signals */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">SIGNALS</span>
            <span className="text-[9px] text-[#333]">{signals.length}</span>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            {signals.length === 0 ? (
              <div className="text-[11px] text-[#333] text-center py-8">
                NO SIGNALS
              </div>
            ) : (
              <div className="divide-y divide-[#0a0a0a]">
                {signals.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-[4px] h-[4px] ${
                        s.direction === "long" ? "bg-[#00ff41]" : "bg-[#ff0040]"
                      }`} />
                      <span className="font-bold text-[11px]">{s.symbol}</span>
                      <span className="text-[10px] text-[#555]">
                        {s.name.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#444]">
                      {(s.strength * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Log Feed ─────────────────────────────────── */}
      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">LIVE LOG</span>
          <span className="text-[9px] text-[#333]">
            {bot?.errors.last_error ? (
              <span className="text-[#ff0040]">ERR: {bot.errors.last_error.slice(0, 60)}</span>
            ) : (
              "NO ERRORS"
            )}
          </span>
        </div>
        <div className="p-3 max-h-[200px] overflow-y-auto bg-[#020202] font-mono text-[10px] leading-[1.8]">
          {bot?.logs && bot.logs.length > 0 ? (
            bot.logs.map((line, i) => (
              <div key={i} className={`${
                line.includes("TRADE") ? "text-[#00ff41]" :
                line.includes("ERROR") || line.includes("FAIL") ? "text-[#ff0040]" :
                line.includes("WATCHLIST") ? "text-[#f0b400]" :
                "text-[#444]"
              }`}>
                {line}
              </div>
            ))
          ) : (
            <div className="text-[#222]">
              {">"} Connecting to bot...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
