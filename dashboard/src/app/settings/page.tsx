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
    { label: "NEWS AI", value: "Gemini Flash", url: null },
    { label: "DATA FEED", value: "PlusE Finance + Alpaca WS", url: null },
  ];

  const riskParams = [
    { label: "MAX POSITION SIZE", value: "5% of portfolio", env: "MAX_POSITION_PCT" },
    { label: "MAX CONCURRENT", value: "3 positions", env: "MAX_POSITIONS" },
    { label: "STOP LOSS", value: "−2%", env: "STOP_LOSS_PCT" },
    { label: "TAKE PROFIT", value: "+4%", env: "TAKE_PROFIT_PCT" },
    { label: "DAILY LOSS LIMIT", value: "−3% (halts)", env: "DAILY_LOSS_LIMIT_PCT" },
    { label: "ORDER TYPE", value: "Limit only", env: "—" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold tracking-[0.08em] text-[#e8e8e8]">System</h2>
        <p className="text-[10px] text-[#333] tracking-[0.04em]">
          Infrastructure & configuration
        </p>
      </div>

      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">BOT CONNECTION</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-[5px] h-[5px] rounded-full ${bot?.status === "online" ? "bg-[#3fcf6d]" : "bg-[#e5484d]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={`text-[10px] ${bot?.status === "online" ? "text-[#888]" : "text-[#e5484d]"}`}>
              {bot?.status === "online" ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
        </div>
        <table className="w-full text-[11px]">
          <tbody>
            <tr className="border-b border-[#0a0a0a]">
              <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333] w-[140px]">STATUS</td>
              <td className={`px-4 py-2 ${bot?.status === "online" ? "text-[#888]" : "text-[#e5484d]"}`}>
                {bot?.status?.toUpperCase() || "UNKNOWN"}
              </td>
            </tr>
            <tr className="border-b border-[#0a0a0a]">
              <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333]">UPTIME</td>
              <td className="px-4 py-2 text-[#888]">{bot?.uptime || "—"}</td>
            </tr>
            <tr className="border-b border-[#0a0a0a]">
              <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333]">WATCHLIST</td>
              <td className="px-4 py-2 text-[#888]">{bot?.config?.watchlist?.join(", ") || "—"}</td>
            </tr>
            <tr className="border-b border-[#0a0a0a]">
              <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333]">LAST ERROR</td>
              <td className="px-4 py-2 text-[#e5484d]">{bot?.errors?.last_error || "None"}</td>
            </tr>
            {error && (
              <tr className="border-b border-[#0a0a0a]">
                <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333]">CONN ERROR</td>
                <td className="px-4 py-2 text-[#e5484d]">{error}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">INFRASTRUCTURE</span>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {infra.map((item) => (
                <tr key={item.label} className="border-b border-[#0a0a0a]">
                  <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333] w-[140px]">{item.label}</td>
                  <td className="px-4 py-2 text-[#888]">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">RISK PARAMETERS</span>
          </div>
          <table className="w-full text-[11px]">
            <tbody>
              {riskParams.map((item) => (
                <tr key={item.label} className="border-b border-[#0a0a0a]">
                  <td className="px-4 py-2 text-[9px] tracking-[0.1em] text-[#333] w-[160px]">{item.label}</td>
                  <td className="px-4 py-2 font-bold text-[#e8e8e8]">{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
