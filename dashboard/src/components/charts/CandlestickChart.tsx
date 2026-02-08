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
          background: { type: ColorType.Solid, color: "#000000" },
          textColor: "#2a2a2a",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "#0a0a0a" },
          horzLines: { color: "#0a0a0a" },
        },
        width: chartContainerRef.current.clientWidth,
        height,
        crosshair: {
          vertLine: { color: "#1a1a1a", width: 1, style: 2 },
          horzLine: { color: "#1a1a1a", width: 1, style: 2 },
        },
        timeScale: {
          borderColor: "#161616",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "#161616",
        },
      });

      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#e8e8e8",
        downColor: "#555555",
        borderDownColor: "#555555",
        borderUpColor: "#e8e8e8",
        wickDownColor: "#333333",
        wickUpColor: "#999999",
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
          color: c.close >= c.open ? "#e8e8e810" : "#55555510",
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candleSeries.setData(candleData as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        volumeSeries.setData(volumeData as any);
        chart.timeScale().fitContent();
        setLoading(false);
      });

      let disposed = false;
      const handleResize = () => {
        if (!disposed && chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

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
              color: c.close >= c.open ? "#e8e8e810" : "#55555510",
            } as any);
          }
        )
        .subscribe();

      return () => {
        disposed = true;
        window.removeEventListener("resize", handleResize);
        supabase.removeChannel(channel);
        try { chart.remove(); } catch { /* already disposed */ }
      };
    }, [symbol, timeframe, height, fetchCandles]);

    return (
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#000] z-10">
            <p className="text-[11px] text-[#333] tracking-[0.1em]">LOADING...</p>
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>
    );
  }
);

export default CandlestickChart;
