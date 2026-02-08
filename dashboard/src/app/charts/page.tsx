"use client";

import { useRef, useState } from "react";
import CandlestickChart, {
  type CandlestickChartRef,
} from "@/components/charts/CandlestickChart";
import PatternMarkers from "@/components/charts/PatternMarkers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSignals } from "@/hooks/useRealtimeData";

const SYMBOLS = ["SPY", "AAPL", "MSFT", "NVDA", "TSLA"];
const TIMEFRAMES = ["1Min", "5Min", "15Min"];

export default function ChartsPage() {
  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [activeTimeframe, setActiveTimeframe] = useState("5Min");
  const chartRef = useRef<CandlestickChartRef>(null);
  const { signals } = useSignals(10);

  const symbolSignals = signals.filter((s) => s.symbol === activeSymbol);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Charts</h2>
        <p className="text-muted-foreground text-sm">
          Live candlestick charts with pattern detection
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 flex-wrap">
          {SYMBOLS.map((sym) => (
            <button
              key={sym}
              onClick={() => setActiveSymbol(sym)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeSymbol === sym
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {sym}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTimeframe === tf
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-hidden rounded-lg">
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
        </CardContent>
      </Card>

      {symbolSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recent Signals for {activeSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {symbolSignals.map((sig) => (
                <Badge
                  key={sig.id}
                  variant={sig.direction === "long" ? "default" : "destructive"}
                >
                  {sig.name.replace(/_/g, " ")} ({(sig.strength * 100).toFixed(0)}%)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
