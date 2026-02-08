"use client";

import { useBotStatus } from "@/hooks/useBotStatus";

export default function SystemPage() {
  const { data: bot, error } = useBotStatus();

  const infra = [
    { label: "BOT HOST", value: "Fly.io (ewr)", url: "https://trading-symxyw.fly.dev" },
    { label: "DASHBOARD", value: "Vercel", url: null },
    { label: "DATABASE", value: "Supabase (PostgreSQL)", url: null },
    { label: "BROKER", value: "Alpaca Markets", url: null },
    { label: "AI ENGINE", value: "Google Gemini 2.5 Pro", url: null },
    { label: "DATA FEED", value: "PlusE Finance + Alpaca WS", url: null },
  ];

  const riskParams = [
    { label: "MAX POSITION SIZE", value: "5% of portfolio", env: "MAX_POSITION_PCT" },
    { label: "MAX CONCURRENT", value: "3 positions", env: "MAX_POSITIONS" },
    { label: "STOP LOSS", value: "-2%", env: "STOP_LOSS_PCT" },
    { label: "TAKE PROFIT", value: "+4%", env: "TAKE_PROFIT_PCT" },
    { label: "DAILY LOSS LIMIT", value: "-3% (halts)", env: "DAILY_LOSS_LIMIT_PCT" },
    { label: "ORDER TYPE", value: "Limit only", env: "--" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.1em] text-[#ccc]">SYSTEM</h2>
        <p className="text-[10px] text-[#444] tracking-[0.05em]">
          INFRASTRUCTURE &amp; CONFIGURATION
        </p>
      </div>

      {/* Bot Connection */}
      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">BOT CONNECTION</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-[6px] h-[6px] ${bot?.status === "online" ? "bg-[#00ff41]" : "bg-[#ff0040]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={`text-[10px] ${bot?.status === "online" ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
              {bot?.status === "online" ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
        </div>
        <div className="p-0">
          <table className="w-full text-[11px]">
            <tbody>
              <tr className="border-b border-[#0a0a0a]">
                <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444] w-[140px]">STATUS</td>
                <td className={`px-4 py-2 ${bot?.status === "online" ? "text-[#00ff41]" : "text-[#ff0040]"}`}>
                  {bot?.status?.toUpperCase() || "UNKNOWN"}
                </td>
              </tr>
              <tr className="border-b border-[#0a0a0a]">
                <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444]">UPTIME</td>
                <td className="px-4 py-2">{bot?.uptime || "--"}</td>
              </tr>
              <tr className="border-b border-[#0a0a0a]">
                <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444]">WATCHLIST</td>
                <td className="px-4 py-2">{bot?.config.watchlist.join(", ") || "--"}</td>
              </tr>
              <tr className="border-b border-[#0a0a0a]">
                <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444]">LAST ERROR</td>
                <td className="px-4 py-2 text-[#ff0040]">
                  {bot?.errors.last_error || "NONE"}
                </td>
              </tr>
              {error && (
                <tr className="border-b border-[#0a0a0a]">
                  <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444]">CONN ERROR</td>
                  <td className="px-4 py-2 text-[#ff0040]">{error}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Infrastructure */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">INFRASTRUCTURE</span>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {infra.map((item) => (
                <tr key={item.label} className="border-b border-[#0a0a0a]">
                  <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444] w-[140px]">
                    {item.label}
                  </td>
                  <td className="px-4 py-2">
                    {item.url ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0088ff] hover:text-[#00aaff] transition-colors"
                      >
                        {item.value}
                      </a>
                    ) : (
                      item.value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Risk Parameters */}
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">RISK PARAMETERS</span>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {riskParams.map((item) => (
                <tr key={item.label} className="border-b border-[#0a0a0a]">
                  <td className="px-4 py-2 text-[9px] tracking-[0.12em] text-[#444] w-[160px]">
                    {item.label}
                  </td>
                  <td className="px-4 py-2 font-bold">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
