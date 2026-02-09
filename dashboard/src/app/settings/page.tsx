"use client";

import { useState } from "react";
import { useBotStatus } from "@/hooks/useBotStatus";
import { useErrorLog } from "@/hooks/useRealtimeData";

function timeAgo(dateStr: string) {
  const sec = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default function SystemPage() {
  const { data: bot, error } = useBotStatus();
  const { errors: errorLog, loading: errorsLoading } = useErrorLog(200);
  const [expandedError, setExpandedError] = useState<number | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

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

      {/* Error Log */}
      <div className="rounded-lg border border-[#e5e5e5]">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">Error Log</span>
            {errorLog.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#fef2f2] text-[#dc2626]">
                {errorLog.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {errorLog.length > 10 && (
              <button
                onClick={() => setShowAllErrors(!showAllErrors)}
                className="text-[10px] text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
              >
                {showAllErrors ? "Show recent" : `Show all (${errorLog.length})`}
              </button>
            )}
            <span className="text-xs text-[#ccc]">
              {errorsLoading ? "Loading..." : errorLog.length === 0 ? "No errors" : `${errorLog.length} total`}
            </span>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {errorsLoading ? (
            <div className="text-sm text-[#ccc] text-center py-12">Loading errors...</div>
          ) : errorLog.length === 0 ? (
            <div className="text-sm text-center py-12">
              <span className="text-[#16a34a]">No errors recorded</span>
            </div>
          ) : (
            <div className="divide-y divide-[#f0f0f0]">
              {(showAllErrors ? errorLog : errorLog.slice(0, 10)).map((err) => (
                <button
                  key={err.id}
                  onClick={() => setExpandedError(expandedError === err.id ? null : err.id)}
                  className="w-full text-left px-5 py-3 hover:bg-[#fefefe] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#dc2626] mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-[#dc2626]">{err.agent}</span>
                          {err.symbol && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f5f5f5] text-[#555] font-bold">
                              {err.symbol}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[#333] mt-0.5 leading-snug">{err.title}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-[#bbb] shrink-0 tabular-nums">{timeAgo(err.created_at)}</span>
                  </div>
                  {expandedError === err.id && err.detail && (
                    <div className="mt-2 ml-[18px] text-xs text-[#999] leading-relaxed whitespace-pre-wrap bg-[#f8f8f8] border border-[#e5e5e5] rounded-md p-3 max-h-[200px] overflow-y-auto font-mono">
                      {err.detail}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
