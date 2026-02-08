"use client";

import { useState } from "react";
import { useBotStatus } from "@/hooks/useBotStatus";
import {
  useAccountData,
  usePositions,
  useTrades,
  useSignals,
  useWatchlist,
  useActivityFeed,
} from "@/hooks/useRealtimeData";
import PnLCurve from "@/components/charts/PnLCurve";
import type { ActivityEvent } from "@/lib/types";

function formatMoney(val: number) {
  return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

// ── Agent config ─────────────────────────────────────

const AGENT_CONFIG: Record<string, { label: string; icon: string }> = {
  scanner: { label: "SCAN", icon: "◉" },
  analyst: { label: "AI", icon: "◈" },
  strategist: { label: "STRAT", icon: "◆" },
  executor: { label: "EXEC", icon: "▶" },
  news_ai: { label: "NEWS", icon: "◎" },
};

const LEVEL_STYLE: Record<string, string> = {
  info: "text-[#555]",
  warn: "text-[#e5a63f]",
  error: "text-[#e5484d]",
  success: "text-[#e8e8e8]",
};

// ── Activity row ─────────────────────────────────────

function ActivityRow({ event, expanded, onToggle }: { event: ActivityEvent; expanded: boolean; onToggle: () => void }) {
  const agent = AGENT_CONFIG[event.agent] || { label: event.agent.toUpperCase(), icon: "·" };

  return (
    <div
      className="border-b border-[#0e0e0e] hover:bg-[#060606] cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <span className="text-[9px] text-[#2a2a2a] w-[36px] shrink-0 pt-0.5 tabular-nums">
          {timeAgo(event.created_at)}
        </span>
        <span className="text-[8px] tracking-[0.1em] px-1.5 py-0.5 shrink-0 text-[#555] bg-[#0a0a0a] border border-[#161616]">
          {agent.icon} {agent.label}
        </span>
        {event.symbol && (
          <span className="text-[10px] font-bold text-[#ccc] shrink-0">{event.symbol}</span>
        )}
        <span className={`text-[10px] truncate flex-1 ${LEVEL_STYLE[event.level] || "text-[#555]"}`}>
          {event.title}
        </span>
        {event.detail && (
          <span className="text-[8px] text-[#2a2a2a] shrink-0">{expanded ? "−" : "+"}</span>
        )}
      </div>
      {expanded && event.detail && (
        <div className="px-3 pb-3 ml-[44px]">
          <div className="text-[10px] text-[#555] leading-[1.7] whitespace-pre-wrap bg-[#040404] border border-[#111] p-3 max-h-[300px] overflow-y-auto">
            {event.detail}
          </div>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(event.metadata).map(([key, val]) => (
                <span key={key} className="text-[9px] px-1.5 py-0.5 bg-[#080808] border border-[#141414] text-[#555]">
                  {key}: {typeof val === "object" ? JSON.stringify(val) : String(val)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Agent network diagram ────────────────────────────

function AgentNetworkDiagram({ events }: { events: ActivityEvent[] }) {
  const agentCounts: Record<string, number> = {};
  events.slice(0, 50).forEach((e) => {
    agentCounts[e.agent] = (agentCounts[e.agent] || 0) + 1;
  });

  const agents = [
    { id: "scanner", x: 10, y: 50, desc: "Reddit + News" },
    { id: "news_ai", x: 32, y: 25, desc: "Gemini Flash" },
    { id: "analyst", x: 50, y: 50, desc: "Trade Eval" },
    { id: "strategist", x: 72, y: 25, desc: "Patterns" },
    { id: "executor", x: 90, y: 50, desc: "Orders" },
  ];

  const connections = [
    { from: "scanner", to: "news_ai" },
    { from: "scanner", to: "analyst" },
    { from: "news_ai", to: "analyst" },
    { from: "analyst", to: "strategist" },
    { from: "strategist", to: "executor" },
  ];

  return (
    <div className="relative h-[80px] w-full overflow-hidden">
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {connections.map((conn) => {
          const from = agents.find((a) => a.id === conn.from)!;
          const to = agents.find((a) => a.id === conn.to)!;
          return (
            <line
              key={`${conn.from}-${conn.to}`}
              x1={`${from.x}%`} y1={`${from.y}%`}
              x2={`${to.x}%`} y2={`${to.y}%`}
              stroke="#161616" strokeWidth="1"
            />
          );
        })}
      </svg>
      {agents.map((a) => {
        const cfg = AGENT_CONFIG[a.id] || { label: a.id, icon: "·" };
        const count = agentCounts[a.id] || 0;
        const active = count > 0;
        return (
          <div
            key={a.id}
            className="absolute flex flex-col items-center"
            style={{ left: `${a.x}%`, top: `${a.y}%`, transform: "translate(-50%, -50%)", zIndex: 1 }}
          >
            <div
              className="w-[26px] h-[26px] flex items-center justify-center text-[11px] border"
              style={{
                borderColor: active ? "#333" : "#1a1a1a",
                color: active ? "#e8e8e8" : "#333",
                background: active ? "#0a0a0a" : "#000",
              }}
            >
              {cfg.icon}
            </div>
            <div className="text-[7px] tracking-[0.1em] mt-0.5 text-[#555]">{cfg.label}</div>
            <div className="text-[7px] text-[#2a2a2a]">{a.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Filter tabs ──────────────────────────────────────

const FILTER_OPTIONS = [
  { key: "all", label: "ALL" },
  { key: "scanner", label: "SCANNER" },
  { key: "news_ai", label: "NEWS AI" },
  { key: "analyst", label: "ANALYST" },
  { key: "strategist", label: "STRATEGY" },
  { key: "executor", label: "TRADES" },
];

// ── Main Page ────────────────────────────────────────

export default function OverviewPage() {
  const { data: bot } = useBotStatus();
  const { snapshot, history } = useAccountData();
  const { positions } = usePositions();
  const { trades } = useTrades(10);
  const { signals } = useSignals(8);
  const { watchlist } = useWatchlist();
  const { events } = useActivityFeed(200);

  const [agentFilter, setAgentFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const isOnline = bot?.status === "online";
  const discovered = watchlist.filter((w) => w.source !== "base");
  const base = watchlist.filter((w) => w.source === "base");

  const filteredEvents = agentFilter === "all"
    ? events
    : events.filter((e) => e.agent === agentFilter);

  return (
    <div className="space-y-4">
      {/* ── Status + Account ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[#161616]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <div className="flex items-center gap-3">
              <div
                className={`w-[5px] h-[5px] rounded-full ${isOnline ? "bg-[#3fcf6d]" : "bg-[#e5484d]"}`}
                style={{ animation: "blink 2s ease-in-out infinite" }}
              />
              <span className="text-[10px] tracking-[0.1em] text-[#555]">STATUS</span>
            </div>
            <span className={`text-[10px] tracking-[0.1em] ${isOnline ? "text-[#888]" : "text-[#e5484d]"}`}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] bg-[#161616]">
            {[
              { label: "UPTIME", value: bot?.uptime || "—" },
              { label: "BARS", value: bot?.activity?.bars_received?.toLocaleString() || "0" },
              { label: "TRADES", value: bot?.activity?.trades_placed?.toLocaleString() || "0" },
            ].map((item) => (
              <div key={item.label} className="bg-[#000] px-3 py-2">
                <div className="text-[8px] tracking-[0.12em] text-[#333]">{item.label}</div>
                <div className="text-sm font-bold text-[#e8e8e8]">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">ACCOUNT</span>
          </div>
          <div className="grid grid-cols-2 gap-[1px] bg-[#161616]">
            {[
              { label: "EQUITY", value: snapshot ? formatMoney(snapshot.equity) : "—" },
              {
                label: "DAY P&L",
                value: snapshot ? `${snapshot.day_pnl >= 0 ? "+" : ""}${formatMoney(snapshot.day_pnl)}` : "—",
                color: snapshot ? (snapshot.day_pnl >= 0 ? "text-[#3fcf6d]" : "text-[#e5484d]") : "",
              },
              { label: "CASH", value: snapshot ? formatMoney(snapshot.cash) : "—" },
              { label: "BUYING POWER", value: snapshot ? formatMoney(snapshot.buying_power) : "—" },
            ].map((item) => (
              <div key={item.label} className="bg-[#000] px-3 py-2">
                <div className="text-[8px] tracking-[0.12em] text-[#333]">{item.label}</div>
                <div className={`text-base font-bold ${item.color || "text-[#e8e8e8]"}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Agent Network ───────────────────────────────── */}
      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">AGENT NETWORK</span>
          <span className="text-[9px] text-[#2a2a2a]">{events.length} events</span>
        </div>
        <div className="p-4">
          <AgentNetworkDiagram events={events} />
        </div>

        <div className="flex items-center border-t border-[#161616] bg-[#030303]">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = agentFilter === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setAgentFilter(opt.key)}
                className={`px-3 py-2 text-[9px] tracking-[0.1em] transition-colors border-r border-[#161616] ${
                  isActive ? "text-[#e8e8e8] bg-[#0a0a0a]" : "text-[#333] hover:text-[#888] hover:bg-[#060606]"
                }`}
              >
                {opt.label}
                {opt.key !== "all" && (
                  <span className="ml-1 text-[#2a2a2a]">{events.filter((e) => e.agent === opt.key).length}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="max-h-[500px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="text-[11px] text-[#1a1a1a] text-center py-12">
              {events.length === 0 ? "Awaiting agent activity..." : "No events for this filter"}
            </div>
          ) : (
            filteredEvents.map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                expanded={expandedId === event.id}
                onToggle={() => setExpandedId(expandedId === event.id ? null : event.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Equity + Watchlist ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">EQUITY CURVE</span>
          </div>
          <div className="p-2">
            {history.length > 0 ? (
              <PnLCurve data={history} height={180} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-[11px] text-[#1a1a1a]">
                Awaiting data...
              </div>
            )}
          </div>
        </div>

        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">WATCHLIST</span>
            <span className="text-[9px] text-[#2a2a2a]">{watchlist.length}</span>
          </div>
          <div className="p-3 space-y-3 max-h-[230px] overflow-y-auto">
            {base.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.1em] text-[#2a2a2a] mb-2">CORE</div>
                <div className="flex flex-wrap gap-1">
                  {base.map((w) => (
                    <span key={w.id} className="px-2 py-0.5 text-[10px] border border-[#1a1a1a] text-[#555]">
                      {w.symbol}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {discovered.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.1em] text-[#2a2a2a] mb-2">DISCOVERED</div>
                <div className="space-y-1">
                  {discovered.map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-[11px] py-1 border-b border-[#0e0e0e]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#ccc]">{w.symbol}</span>
                        <span className={`text-[8px] tracking-[0.08em] px-1 ${
                          w.source === "ai_approved"
                            ? "text-[#888] bg-[#0e0e0e]"
                            : "text-[#555] bg-[#0a0a0a]"
                        }`}>
                          {w.source === "ai_approved" ? "AI" : "SCORE"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-[2px] bg-[#333]" style={{ width: `${Math.min(w.score * 2, 60)}px` }} />
                        <span className="text-[10px] text-[#333] w-8 text-right">{w.score.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {watchlist.length === 0 && (
              <div className="text-[11px] text-[#1a1a1a] text-center py-4">Scanner initializing...</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Positions + Trades + Signals ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">POSITIONS</span>
            <span className="text-[9px] text-[#2a2a2a]">{positions.length}</span>
          </div>
          <div className="p-0">
            {positions.length === 0 ? (
              <div className="text-[11px] text-[#1a1a1a] text-center py-8">No positions</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[#111]">
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">SYM</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">QTY</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.id} className="border-b border-[#0a0a0a]">
                      <td className="px-3 py-2 font-bold text-[#ccc]">{p.symbol}</td>
                      <td className="px-3 py-2 text-right text-[#555]">{p.quantity}</td>
                      <td className={`px-3 py-2 text-right ${(p.unrealized_pnl || 0) >= 0 ? "text-[#3fcf6d]" : "text-[#e5484d]"}`}>
                        {p.unrealized_pnl ? `$${p.unrealized_pnl.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">RECENT TRADES</span>
            <span className="text-[9px] text-[#2a2a2a]">{trades.length}</span>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            {trades.length === 0 ? (
              <div className="text-[11px] text-[#1a1a1a] text-center py-8">No trades yet</div>
            ) : (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[#111]">
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">SYM</th>
                    <th className="text-left px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">SIDE</th>
                    <th className="text-right px-3 py-2 text-[9px] tracking-[0.08em] text-[#333] font-normal">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.id} className="border-b border-[#0a0a0a]">
                      <td className="px-3 py-2 font-bold text-[#ccc]">{t.symbol}</td>
                      <td className="px-3 py-2 text-[#888]">{t.side.toUpperCase()}</td>
                      <td className={`px-3 py-2 text-right ${(t.pnl || 0) >= 0 ? "text-[#3fcf6d]" : "text-[#e5484d]"}`}>
                        {t.pnl != null ? `$${t.pnl.toFixed(2)}` : t.status.toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">SIGNALS</span>
            <span className="text-[9px] text-[#2a2a2a]">{signals.length}</span>
          </div>
          <div className="p-0 max-h-[300px] overflow-y-auto">
            {signals.length === 0 ? (
              <div className="text-[11px] text-[#1a1a1a] text-center py-8">No signals</div>
            ) : (
              <div className="divide-y divide-[#0a0a0a]">
                {signals.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-[3px] h-[3px] rounded-full ${s.direction === "long" ? "bg-[#3fcf6d]" : "bg-[#e5484d]"}`} />
                      <span className="font-bold text-[11px] text-[#ccc]">{s.symbol}</span>
                      <span className="text-[10px] text-[#444]">{s.name.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[10px] text-[#333]">{(s.strength * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Live Log ─────────────────────────────────── */}
      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">LIVE LOG</span>
          <span className="text-[9px] text-[#2a2a2a]">
            {bot?.errors?.last_error ? (
              <span className="text-[#e5484d]">{bot.errors.last_error.slice(0, 60)}</span>
            ) : (
              "no errors"
            )}
          </span>
        </div>
        <div className="p-3 max-h-[180px] overflow-y-auto bg-[#020202] text-[10px] leading-[1.8]">
          {bot?.logs && bot.logs.length > 0 ? (
            bot.logs.map((line, i) => (
              <div key={i} className={`${
                line.includes("TRADE") ? "text-[#e8e8e8]" :
                line.includes("ERROR") || line.includes("FAIL") ? "text-[#e5484d]" :
                line.includes("WATCHLIST") || line.includes("NEWS") ? "text-[#888]" :
                "text-[#333]"
              }`}>
                {line}
              </div>
            ))
          ) : (
            <div className="text-[#1a1a1a]">Connecting to bot...</div>
          )}
        </div>
      </div>
    </div>
  );
}
