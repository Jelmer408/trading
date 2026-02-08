"use client";

import { useBotStatus } from "@/hooks/useBotStatus";

export default function SystemPage() {
  const { data: bot, error } = useBotStatus();

  const infra = [
    { label: "Bot Host", value: "Fly.io (ewr)" },
    { label: "Dashboard", value: "Vercel" },
    { label: "Database", value: "Supabase (PostgreSQL)" },
    { label: "Broker", value: "Alpaca Markets" },
    { label: "AI Engine", value: "Google Gemini 3 Pro" },
    { label: "News AI", value: "Gemini Flash" },
    { label: "Data Feed", value: "PlusE Finance + Alpaca WS" },
  ];

  const riskParams = [
    { label: "Max Position Size", value: "5% of portfolio" },
    { label: "Max Concurrent", value: "3 positions" },
    { label: "Stop Loss", value: "−2%" },
    { label: "Take Profit", value: "+4%" },
    { label: "Daily Loss Limit", value: "−3% (halts trading)" },
    { label: "Order Type", value: "Limit only" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">System</h2>
        <p className="text-sm text-[#999]">Infrastructure & configuration</p>
      </div>

      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Bot Connection</span>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${bot?.status === "online" ? "bg-[#16a34a]" : "bg-[#dc2626]"}`}
              style={{ animation: "blink 2s ease-in-out infinite" }}
            />
            <span className={`text-xs font-medium ${bot?.status === "online" ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
              {bot?.status === "online" ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
        <div className="divide-y divide-[#f0f0f0]">
          {[
            { label: "Status", value: bot?.status?.toUpperCase() || "UNKNOWN", highlight: bot?.status !== "online" },
            { label: "Uptime", value: bot?.uptime || "—" },
            { label: "Watchlist", value: bot?.config?.watchlist?.join(", ") || "—" },
            { label: "Last Error", value: bot?.errors?.last_error || "None", highlight: !!bot?.errors?.last_error },
            ...(error ? [{ label: "Connection Error", value: error, highlight: true }] : []),
          ].map((item) => (
            <div key={item.label} className="flex items-center px-5 py-3">
              <span className="text-xs text-[#999] w-[160px] shrink-0">{item.label}</span>
              <span className={`text-sm ${item.highlight ? "text-[#dc2626]" : "text-[#555]"}`}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Infrastructure</span>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {infra.map((item) => (
              <div key={item.label} className="flex items-center px-5 py-3">
                <span className="text-xs text-[#999] w-[140px] shrink-0">{item.label}</span>
                <span className="text-sm text-[#555]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-[#e5e5e5]">
          <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Risk Parameters</span>
          </div>
          <div className="divide-y divide-[#f0f0f0]">
            {riskParams.map((item) => (
              <div key={item.label} className="flex items-center px-5 py-3">
                <span className="text-xs text-[#999] w-[160px] shrink-0">{item.label}</span>
                <span className="text-sm font-semibold text-[#111]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
