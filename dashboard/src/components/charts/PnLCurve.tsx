"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, AreaSeries } from "lightweight-charts";
import type { AccountSnapshot } from "@/lib/types";

interface PnLCurveProps {
  data: AccountSnapshot[];
  height?: number;
}

export default function PnLCurve({ data, height = 200 }: PnLCurveProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#333",
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "#111" },
        horzLines: { color: "#111" },
      },
      width: containerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderColor: "#1a1a1a",
      },
      timeScale: {
        borderColor: "#1a1a1a",
        timeVisible: true,
      },
      crosshair: {
        vertLine: { color: "#222", width: 1, style: 2 },
        horzLine: { color: "#222", width: 1, style: 2 },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#00ff41",
      topColor: "rgba(0, 255, 65, 0.08)",
      bottomColor: "transparent",
      lineWidth: 1,
    });

    const chartData = data.map((d) => ({
      time: (new Date(d.snapshot_time).getTime() / 1000) as number,
      value: d.equity,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(chartData as any);
    chart.timeScale().fitContent();

    let disposed = false;
    const handleResize = () => {
      if (!disposed && containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height]);

  return <div ref={containerRef} />;
}
