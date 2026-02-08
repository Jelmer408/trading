"use client";

import { useRef, useState } from "react";
import CandlestickChart, {
  type CandlestickChartRef,
} from "@/components/charts/CandlestickChart";
import PatternMarkers from "@/components/charts/PatternMarkers";
import { useSignals, useWatchlist } from "@/hooks/useRealtimeData";

const TIMEFRAMES = ["1Min", "5Min", "15Min"];

export default function ChartsPage() {
  const { watchlist } = useWatchlist();
  const symbols = watchlist.length > 0
    ? watchlist.map((w) => w.symbol)
    : ["SPY", "AAPL", "MSFT", "NVDA", "TSLA"];

  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [activeTimeframe, setActiveTimeframe] = useState("5Min");
  const chartRef = useRef<CandlestickChartRef>(null);
  const { signals } = useSignals(10);

  const symbolSignals = signals.filter((s) => s.symbol === activeSymbol);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[#111]">Charts</h2>
        <p className="text-sm text-[#999]">Live candlestick data with pattern detection</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeSymbol === sym
                  ? "text-[#111] bg-[#f0f0f0] font-medium"
                  : "text-[#999] hover:text-[#555] hover:bg-[#f8f8f8]"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                activeTimeframe === tf
                  ? "text-[#111] bg-[#f0f0f0] font-medium"
                  : "text-[#999] hover:text-[#555] hover:bg-[#f8f8f8]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#f0f0f0] flex items-center justify-between bg-[#fafafa]">
          <span className="text-sm font-semibold text-[#111]">{activeSymbol} / {activeTimeframe}</span>
          <span className="text-xs text-[#16a34a] font-medium">LIVE</span>
        </div>
        <CandlestickChart
          key={`${activeSymbol}-${activeTimeframe}`}
          ref={chartRef}
          symbol={activeSymbol}
          timeframe={activeTimeframe}
          height={550}
        />
        <PatternMarkers
          candleSeries={chartRef.current?.getCandleSeries() ?? null}
          symbol={activeSymbol}
        />
      </div>

      {symbolSignals.length > 0 && (
        <div className="rounded-lg border border-[#e5e5e5] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#f0f0f0] bg-[#fafafa]">
            <span className="text-xs font-medium text-[#999] uppercase tracking-wide">
              Signals — {activeSymbol}
            </span>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            {symbolSignals.map((sig) => (
              <div
                key={sig.id}
                className="px-3 py-1.5 text-xs rounded-md bg-[#f8f8f8] text-[#555] flex items-center gap-2"
              >
                <span className={`w-2 h-2 rounded-full ${
                  sig.direction === "long" ? "bg-[#16a34a]" : "bg-[#dc2626]"
                }`} />
                {sig.name.replace(/_/g, " ")}
                <span className="text-[#999]">{(sig.strength * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
