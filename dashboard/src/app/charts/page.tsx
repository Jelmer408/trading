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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-[0.08em] text-[#e8e8e8]">Charts</h2>
          <p className="text-[10px] text-[#333] tracking-[0.04em]">
            Live candlestick data with pattern detection
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-0 border border-[#161616]">
        <div className="px-3 py-2 bg-[#040404] border-r border-[#161616]">
          <span className="text-[9px] tracking-[0.1em] text-[#333]">SYMBOL</span>
        </div>
        <div className="flex overflow-x-auto">
          {symbols.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-3 py-2 text-[11px] border-r border-[#161616] transition-colors ${
                activeSymbol === sym
                  ? "text-[#e8e8e8] bg-[#0a0a0a]"
                  : "text-[#444] hover:text-[#999] hover:bg-[#060606]"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
        <div className="ml-auto flex">
          <div className="px-3 py-2 bg-[#040404] border-l border-[#161616]">
            <span className="text-[9px] tracking-[0.1em] text-[#333]">TF</span>
          </div>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3 py-2 text-[11px] border-l border-[#161616] transition-colors ${
                activeTimeframe === tf
                  ? "text-[#e8e8e8] bg-[#0a0a0a]"
                  : "text-[#444] hover:text-[#999] hover:bg-[#060606]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-[#161616]">
        <div className="px-4 py-2 border-b border-[#161616] bg-[#040404] flex items-center justify-between">
          <span className="text-[10px] tracking-[0.1em] text-[#555]">
            {activeSymbol} / {activeTimeframe}
          </span>
          <span className="text-[9px] text-[#2a2a2a]">LIVE</span>
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

      {symbolSignals.length > 0 && (
        <div className="border border-[#161616]">
          <div className="px-4 py-2 border-b border-[#161616] bg-[#040404]">
            <span className="text-[10px] tracking-[0.1em] text-[#555]">
              SIGNALS — {activeSymbol}
            </span>
          </div>
          <div className="flex flex-wrap gap-0">
            {symbolSignals.map((sig) => (
              <div
                key={sig.id}
                className="px-3 py-2 border-r border-b border-[#161616] text-[11px] flex items-center gap-2 text-[#888]"
              >
                <span className={`w-[3px] h-[3px] rounded-full ${
                  sig.direction === "long" ? "bg-[#3fcf6d]" : "bg-[#e5484d]"
                }`} />
                {sig.name.replace(/_/g, " ")}
                <span className="text-[#333]">{(sig.strength * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
