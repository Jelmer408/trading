"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
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

interface MassiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchMassiveCandles(
  symbol: string,
  timeframe: string,
): Promise<MassiveCandle[]> {
  const days = timeframe.endsWith("Day") ? 90 : 7;
  const resp = await fetch(
    `/api/candles?symbol=${symbol}&timeframe=${timeframe}&days=${days}`,
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.candles || []) as MassiveCandle[];
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
    const [empty, setEmpty] = useState(false);

    useImperativeHandle(ref, () => ({
      getCandleSeries: () => candleSeriesRef.current,
    }));

    useEffect(() => {
      if (!chartContainerRef.current) return;

      // Restore visibility (cleanup of previous effect hides it)
      chartContainerRef.current.style.display = "";
      setLoading(true);
      setEmpty(false);

      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "#999999",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "#f0f0f0" },
          horzLines: { color: "#f0f0f0" },
        },
        width: chartContainerRef.current.clientWidth,
        height,
        crosshair: {
          vertLine: { color: "#d4d4d4", width: 1, style: 2 },
          horzLine: { color: "#d4d4d4", width: 1, style: 2 },
        },
        timeScale: {
          borderColor: "#e5e5e5",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "#e5e5e5",
        },
      });

      chartRef.current = chart;

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#16a34a",
        downColor: "#dc2626",
        borderDownColor: "#dc2626",
        borderUpColor: "#16a34a",
        wickDownColor: "#dc2626",
        wickUpColor: "#16a34a",
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

      let disposed = false;

      // Fetch candles from Massive.com API
      fetchMassiveCandles(symbol, timeframe).then((candles) => {
        if (disposed) return;

        if (candles.length === 0) {
          setEmpty(true);
          setLoading(false);
          return;
        }

        const candleData = candles.map((c) => ({
          time: c.time as number,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }));

        const volumeData = candles.map((c) => ({
          time: c.time as number,
          value: c.volume,
          color: c.close >= c.open ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
        }));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        candleSeries.setData(candleData as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        volumeSeries.setData(volumeData as any);
        chart.timeScale().fitContent();
        setLoading(false);
      });

      // Also subscribe to Supabase for live bar updates during market hours
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
              color: c.close >= c.open ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)",
            } as any);
          },
        )
        .subscribe();

      const handleResize = () => {
        if (!disposed && chartContainerRef.current) {
          chart.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener("resize", handleResize);

      return () => {
        disposed = true;
        window.removeEventListener("resize", handleResize);
        supabase.removeChannel(channel);
        try { chart.remove(); } catch { /* already disposed */ }
      };
    }, [symbol, timeframe, height]);

    return (
      <div className="relative" key={`${symbol}-${timeframe}`}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <p className="text-xs text-[#999]">Loading chart data...</p>
          </div>
        )}
        {empty && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
            <p className="text-sm font-medium text-[#555]">No candle data available</p>
            <p className="text-xs text-[#999] mt-1">Check the ticker symbol or try again later</p>
          </div>
        )}
        <div ref={chartContainerRef} />
      </div>
    );
  },
);

export default CandlestickChart;
