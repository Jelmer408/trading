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
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

// ── Agent colors / labels ────────────────────────────────────

const AGENT_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  scanner: { color: "#f0b400", label: "SCANNER", icon: "◉" },
  analyst: { color: "#00bfff", label: "ANALYST", icon: "◈" },
  strategist: { color: "#9b59b6", label: "STRATEGIST", icon: "◆" },
  executor: { color: "#00ff41", label: "EXECUTOR", icon: "▶" },
  news_ai: { color: "#ff6b35", label: "NEWS AI", icon: "◎" },
};

const LEVEL_COLORS: Record<string, string> = {
  info: "#555",
  warn: "#f0b400",
  error: "#ff0040",
  success: "#00ff41",
};

// ── Event type icons ─────────────────────────────────────────

function eventIcon(type: string) {
  switch (type) {
    case "scan_start": return "⟳";
    case "scan_reddit": return "⊞";
    case "scan_news": return "⊟";
    case "ai_request": return "→";
    case "ai_response": return "←";
    case "pattern": return "△";
    case "trade_decision": return "⊘";
    case "trade": return "⚡";
    case "news_analysis": return "✦";
    case "news_cycle": return "◎";
    case "watchlist_update": return "↻";
    case "error": return "✕";
    default: return "·";
  }
}

// ── Activity row component ───────────────────────────────────

function ActivityRow({ event, expanded, onToggle }: { event: ActivityEvent; expanded: boolean; onToggle: () => void }) {
  const agent = AGENT_CONFIG[event.agent] || { color: "#555", label: event.agent.toUpperCase(), icon: "·" };
  const levelColor = LEVEL_COLORS[event.level] || "#555";

  return (
    <div
      className="border-b border-[#0a0a0a] hover:bg-[#050505] cursor-pointer transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        {/* Timestamp */}
        <span className="text-[9px] text-[#333] w-[52px] shrink-0 pt-0.5">
          {timeAgo(event.created_at)}
        </span>

        {/* Level indicator */}
        <span
          className="w-[4px] h-[4px] shrink-0 mt-1.5"
          style={{ backgroundColor: levelColor }}
        />

        {/* Agent badge */}
        <span
          className="text-[8px] tracking-[0.12em] px-1.5 py-0.5 shrink-0"
          style={{ color: agent.color, backgroundColor: `${agent.color}10`, border: `1px solid ${agent.color}22` }}
        >
          {agent.icon} {agent.label}
        </span>

        {/* Symbol */}
        {event.symbol && (
          <span className="text-[10px] font-bold text-[#ccc] shrink-0">
            {event.symbol}
          </span>
        )}

        {/* Title */}
        <span className="text-[10px] text-[#888] truncate flex-1">
          {event.title}
        </span>

        {/* Expand icon */}
        {event.detail && (
          <span className="text-[8px] text-[#333] shrink-0">
            {expanded ? "▼" : "▶"}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && event.detail && (
        <div className="px-3 pb-3 ml-[60px]">
          <div className="text-[10px] text-[#555] leading-[1.8] whitespace-pre-wrap bg-[#030303] border border-[#111] p-3 max-h-[300px] overflow-y-auto">
            {event.detail}
          </div>
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(event.metadata).map(([key, val]) => (
                <span key={key} className="text-[9px] px-1.5 py-0.5 bg-[#0a0a0a] border border-[#151515] text-[#555]">
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

// ── Agent network visualization ──────────────────────────────

function AgentNetworkDiagram({ events }: { events: ActivityEvent[] }) {
  // Count recent events per agent
  const agentCounts: Record<string, number> = {};
  const lastActive: Record<string, string> = {};

  events.slice(0, 50).forEach((e) => {
    agentCounts[e.agent] = (agentCounts[e.agent] || 0) + 1;
    if (!lastActive[e.agent]) lastActive[e.agent] = e.created_at;
  });

  const agents = [
    { id: "scanner", x: 15, y: 30, desc: "Reddit + News" },
    { id: "news_ai", x: 50, y: 15, desc: "Gemini Flash" },
    { id: "analyst", x: 50, y: 50, desc: "Trade Eval" },
    { id: "strategist", x: 75, y: 30, desc: "Patterns" },
    { id: "executor", x: 92, y: 50, desc: "Orders" },
  ];

  // Connections between agents
  const connections = [
    { from: "scanner", to: "news_ai" },
    { from: "scanner", to: "analyst" },
    { from: "news_ai", to: "analyst" },
    { from: "analyst", to: "strategist" },
    { from: "strategist", to: "executor" },
  ];

  return (
    <div className="relative h-[90px] w-full overflow-hidden">
      {/* Connection lines (SVG) */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {connections.map((conn) => {
          const from = agents.find((a) => a.id === conn.from)!;
          const to = agents.find((a) => a.id === conn.to)!;
          return (
            <line
              key={`${conn.from}-${conn.to}`}
              x1={`${from.x}%`} y1={`${from.y}%`}
              x2={`${to.x}%`} y2={`${to.y}%`}
              stroke="#1a1a1a"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          );
        })}
      </svg>

      {/* Agent nodes */}
      {agents.map((a) => {
        const cfg = AGENT_CONFIG[a.id] || { color: "#555", label: a.id, icon: "·" };
        const count = agentCounts[a.id] || 0;
        const active = count > 0;
        const last = lastActive[a.id];

        return (
          <div
            key={a.id}
            className="absolute flex flex-col items-center"
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 1,
            }}
          >
            <div
              className="w-[28px] h-[28px] flex items-center justify-center text-[12px]"
              style={{
                border: `1px solid ${active ? cfg.color : "#222"}`,
                color: active ? cfg.color : "#333",
                backgroundColor: active ? `${cfg.color}08` : "#000",
              }}
            >
              {cfg.icon}
            </div>
            <div className="text-[7px] tracking-[0.12em] mt-0.5" style={{ color: cfg.color }}>
              {cfg.label}
            </div>
            <div className="text-[7px] text-[#333]">{a.desc}</div>
            {last && (
              <div className="text-[7px] text-[#222]">{timeAgo(last)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Filter tabs ──────────────────────────────────────────────

const FILTER_OPTIONS = [
  { key: "all", label: "ALL" },
  { key: "scanner", label: "SCANNER" },
  { key: "news_ai", label: "NEWS AI" },
  { key: "analyst", label: "ANALYST" },
  { key: "strategist", label: "STRATEGY" },
  { key: "executor", label: "TRADES" },
];

// ── Main Page ────────────────────────────────────────────────

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
      {/* ── Bot Status + Account ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bot Status */}
        <div className="border border-[#1a1a1a]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <div className="flex items-center gap-3">
              <div
                className={`w-[6px] h-[6px] ${isOnline ? "bg-[#00ff41]" : "bg-[#ff0040]"}`}
                style={{ animation: "blink 2s ease-in-out infinite" }}
              />
              <span className="text-[10px] tracking-[0.15em] text-[#666]">BOT STATUS</span>
            </div>
            <span className={`text-[10px] tracking-[0.15em] ${isOnline ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
              {isOnline ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] bg-[#1a1a1a]">
            {[
              { label: "UPTIME", value: bot?.uptime || "--" },
              { label: "BARS", value: bot?.activity.bars_received.toLocaleString() || "0" },
              { label: "TRADES", value: bot?.activity.trades_placed.toLocaleString() || "0", color: "text-[#00ff41]" },
            ].map((item) => (
              <div key={item.label} className="bg-[#000] px-3 py-2">
                <div className="text-[8px] tracking-[0.15em] text-[#444]">{item.label}</div>
                <div className={`text-sm font-bold ${item.color || ""}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Account Metrics */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">ACCOUNT</span>
          </div>
          <div className="grid grid-cols-2 gap-[1px] bg-[#1a1a1a]">
            {[
              { label: "EQUITY", value: snapshot ? formatMoney(snapshot.equity) : "--" },
              {
                label: "DAY P&L",
                value: snapshot ? `${snapshot.day_pnl >= 0 ? "+" : ""}${formatMoney(snapshot.day_pnl)}` : "--",
                color: snapshot ? (snapshot.day_pnl >= 0 ? "text-[#00ff41]" : "text-[#ff0040]") : "",
              },
              { label: "CASH", value: snapshot ? formatMoney(snapshot.cash) : "--" },
              { label: "BUYING POWER", value: snapshot ? formatMoney(snapshot.buying_power) : "--" },
            ].map((item) => (
              <div key={item.label} className="bg-[#000] px-3 py-2">
                <div className="text-[8px] tracking-[0.15em] text-[#444]">{item.label}</div>
                <div className={`text-base font-bold ${item.color || ""}`}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Agent Network ───────────────────────────────────── */}
      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">AGENT NETWORK</span>
          <span className="text-[9px] text-[#333]">{events.length} EVENTS</span>
        </div>
        <div className="p-4">
          <AgentNetworkDiagram events={events} />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center border-t border-[#1a1a1a] bg-[#030303]">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = agentFilter === opt.key;
            const cfg = AGENT_CONFIG[opt.key];
            return (
              <button
                key={opt.key}
                onClick={() => setAgentFilter(opt.key)}
                className={`px-3 py-2 text-[9px] tracking-[0.12em] transition-colors border-r border-[#1a1a1a] ${
                  isActive ? "bg-[#0a0a0a]" : "hover:bg-[#050505]"
                }`}
                style={{ color: isActive ? (cfg?.color || "#ccc") : "#444" }}
              >
                {opt.label}
                {opt.key !== "all" && (
                  <span className="ml-1 text-[#333]">
                    {events.filter((e) => e.agent === opt.key).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Event stream */}
        <div className="max-h-[500px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="text-[11px] text-[#222] text-center py-12">
              {events.length === 0 ? "AWAITING AGENT ACTIVITY..." : "NO EVENTS FOR THIS FILTER"}
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

      {/* ── Equity + Watchlist + Quick Panels ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Equity Curve */}
        <div className="lg:col-span-2 border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">EQUITY CURVE</span>
          </div>
          <div className="p-2">
            {history.length > 0 ? (
              <PnLCurve data={history} height={180} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-[11px] text-[#333]">
                AWAITING DATA...
              </div>
            )}
          </div>
        </div>

        {/* Watchlist */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">WATCHLIST</span>
            <span className="text-[9px] text-[#333]">{watchlist.length} SYM</span>
          </div>
          <div className="p-3 space-y-3 max-h-[230px] overflow-y-auto">
            {base.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.15em] text-[#333] mb-2">CORE</div>
                <div className="flex flex-wrap gap-1">
                  {base.map((w) => (
                    <span key={w.id} className="px-2 py-0.5 text-[10px] border border-[#222] text-[#666]">
                      {w.symbol}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {discovered.length > 0 && (
              <div>
                <div className="text-[9px] tracking-[0.15em] text-[#333] mb-2">TRENDING</div>
                <div className="space-y-1">
                  {discovered.map((w) => (
                    <div key={w.id} className="flex items-center justify-between text-[11px] py-1 border-b border-[#111]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#ccc]">{w.symbol}</span>
                        <span className={`text-[9px] tracking-[0.1em] px-1 ${
                          w.source === "ai_approved" ? "text-[#00ff41] bg-[#001a08]" : "text-[#f0b400] bg-[#1a1400]"
                        }`}>
                          {w.source === "ai_approved" ? "AI" : "SCORE"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-[3px] bg-[#00ff41]" style={{ width: `${Math.min(w.score * 2, 60)}px`, opacity: 0.6 }} />
                        <span className="text-[10px] text-[#555] w-8 text-right">{w.score.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {watchlist.length === 0 && (
              <div className="text-[11px] text-[#333] text-center py-4">SCANNER INITIALIZING...</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Positions + Trades + Signals ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Positions */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">POSITIONS</span>
            <span className="text-[9px] text-[#333]">{positions.length}</span>
          </div>
          <div className="p-0">
            {positions.length === 0 ? (
              <div className="text-[11px] text-[#333] text-center py-8">NO POSITIONS</div>
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
                      <td className={`px-3 py-2 text-right ${(p.unrealized_pnl || 0) >= 0 ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
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
              <div className="text-[11px] text-[#333] text-center py-8">NO TRADES YET</div>
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
                      <td className={`px-3 py-2 text-right ${(t.pnl || 0) >= 0 ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
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
              <div className="text-[11px] text-[#333] text-center py-8">NO SIGNALS</div>
            ) : (
              <div className="divide-y divide-[#0a0a0a]">
                {signals.map((s) => (
                  <div key={s.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-[4px] h-[4px] ${s.direction === "long" ? "bg-[#00ff41]" : "bg-[#ff0040]"}`} />
                      <span className="font-bold text-[11px]">{s.symbol}</span>
                      <span className="text-[10px] text-[#555]">{s.name.replace(/_/g, " ")}</span>
                    </div>
                    <span className="text-[10px] text-[#444]">{(s.strength * 100).toFixed(0)}%</span>
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
        <div className="p-3 max-h-[180px] overflow-y-auto bg-[#020202] font-mono text-[10px] leading-[1.8]">
          {bot?.logs && bot.logs.length > 0 ? (
            bot.logs.map((line, i) => (
              <div key={i} className={`${
                line.includes("TRADE") ? "text-[#00ff41]" :
                line.includes("ERROR") || line.includes("FAIL") ? "text-[#ff0040]" :
                line.includes("WATCHLIST") || line.includes("NEWS") ? "text-[#f0b400]" :
                line.includes("AI") ? "text-[#00bfff]" :
                "text-[#444]"
              }`}>
                {line}
              </div>
            ))
          ) : (
            <div className="text-[#222]">{">"} Connecting to bot...</div>
          )}
        </div>
      </div>
    </div>
  );
}
