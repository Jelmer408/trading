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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-[0.1em] text-[#ccc]">CHARTS</h2>
          <p className="text-[10px] text-[#444] tracking-[0.05em]">
            LIVE CANDLESTICK DATA WITH PATTERN DETECTION
          </p>
        </div>
      </div>

      {/* Symbol + Timeframe selector */}
      <div className="flex flex-wrap items-center gap-0 border border-[#1a1a1a]">
        <div className="px-3 py-2 bg-[#050505] border-r border-[#1a1a1a]">
          <span className="text-[9px] tracking-[0.15em] text-[#444]">SYMBOL</span>
        </div>
        <div className="flex overflow-x-auto">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-3 py-2 text-[11px] border-r border-[#1a1a1a] transition-colors ${
                activeSymbol === sym
                  ? "text-[#00ff41] bg-[#001a08]"
                  : "text-[#555] hover:text-[#999] hover:bg-[#0a0a0a]"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="ml-auto flex">
          <div className="px-3 py-2 bg-[#050505] border-l border-[#1a1a1a]">
            <span className="text-[9px] tracking-[0.15em] text-[#444]">TF</span>
          </div>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3 py-2 text-[11px] border-l border-[#1a1a1a] transition-colors ${
                activeTimeframe === tf
                  ? "text-[#00ff41] bg-[#001a08]"
                  : "text-[#555] hover:text-[#999] hover:bg-[#0a0a0a]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="border border-[#1a1a1a]">
        <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.15em] text-[#666]">
            {activeSymbol} / {activeTimeframe}
          </span>
          <span className="text-[9px] text-[#333]">LIVE</span>
        </div>
        <CandlestickChart
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

      {/* Signals for this symbol */}
      {symbolSignals.length > 0 && (
        <div className="border border-[#1a1a1a]">
          <div className="px-4 py-2 border-b border-[#1a1a1a] bg-[#050505]">
            <span className="text-[10px] tracking-[0.15em] text-[#666]">
              SIGNALS — {activeSymbol}
            </span>
          </div>
          <div className="flex flex-wrap gap-0">
            {symbolSignals.map((sig) => (
              <div
                key={sig.id}
                className={`px-3 py-2 border-r border-b border-[#1a1a1a] text-[11px] flex items-center gap-2 ${
                  sig.direction === "long" ? "text-[#00ff41]" : "text-[#ff0040]"
                }`}
              >
                <span className={`w-[4px] h-[4px] ${
                  sig.direction === "long" ? "bg-[#00ff41]" : "bg-[#ff0040]"
                }`} />
                {sig.name.replace(/_/g, " ")}
                <span className="text-[#444]">
                  {(sig.strength * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
