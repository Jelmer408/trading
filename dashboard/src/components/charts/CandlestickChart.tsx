"use client";

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import {
  createChart,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";
import { supabase } from "@/lib/supabase";
import type { Candle } from "@/lib/types";

interface CandlestickChartProps {
  symbol: string;
  timeframe?: string;
  height?: number;
}

export interface CandlestickChartRef {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getCandleSeries: () => ISeriesApi<any> | null;
}

const CandlestickChart = forwardRef<CandlestickChartRef, CandlestickChartProps>(
  function CandlestickChart({ symbol, timeframe = "5Min", height = 500 }, ref) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candleSeriesRef = useRef<ISeriesApi<any> | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
    const [loading, setLoading] = useState(true);

    useImperativeHandle(ref, () => ({
      getCandleSeries: () => candleSeriesRef.current,
    }));

    const fetchCandles = useCallback(async () => {
      const { data } = await supabase
        .from("candles")
        .select("*")
        .eq("symbol", symbol)
        .eq("timeframe", timeframe)
        .order("timestamp", { ascending: true })
        .limit(300);
      return (data || []) as Candle[];
    }, [symbol, timeframe]);

    useEffect(() => {
      if (!chartContainerRef.current) return;

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#0a0a0a" },
          textColor: "#a1a1aa",
          fontFamily: "var(--font-geist-mono), monospace",
        },
        grid: {
          vertLines: { color: "#1c1c1e" },
          horzLines: { color: "#1c1c1e" },
        },
        width: chartContainerRef.current.clientWidth,
        height,
        crosshair: {
          vertLine: { color: "#3f3f46", width: 1, style: 2 },
          horzLine: { color: "#3f3f46", width: 1, style: 2 },
        },
        timeScale: {
          borderColor: "#27272a",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "#27272a",
        },
      });

      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
      });
      candleSeriesRef.current = candleSeries;

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });
      volumeSeriesRef.current = volumeSeries;

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      // Load initial data
      fetchCandles().then((candles) => {
        const candleData = candles.map((c) => ({
          time: (new Date(c.timestamp).getTime() / 1000) as number,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const volumeData = candles.map((c) => ({
          time: (new Date(c.timestamp).getTime() / 1000) as number,
          value: c.volume,
          color: c.close >= c.open ? "#22c55e40" : "#ef444440",
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candleSeries.setData(candleData as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        volumeSeries.setData(volumeData as any);
        chart.timeScale().fitContent();
        setLoading(false);
      });

      // Resize handler with disposed guard
      let disposed = false;
      const handleResize = () => {
        if (!disposed && chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

      // Real-time updates
      const channel = supabase
        .channel(`candles_${symbol}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "candles",
            filter: `symbol=eq.${symbol}`,
          },
          (payload) => {
            if (disposed) return;
            const c = payload.new as Candle;
            const time = (new Date(c.timestamp).getTime() / 1000) as number;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            candleSeries.update({
              time,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
            } as any);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            volumeSeries.update({
              time,
              value: c.volume,
              color: c.close >= c.open ? "#22c55e40" : "#ef444440",
            } as any);
          }
        )
        .subscribe();

      return () => {
        disposed = true;
        window.removeEventListener("resize", handleResize);
        supabase.removeChannel(channel);
        chart.remove();
      };
    }, [symbol, timeframe, height, fetchCandles]);

    return (
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0a] z-10">
            <p className="text-muted-foreground">Loading chart...</p>
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>
    );
  }
);

export default CandlestickChart;
