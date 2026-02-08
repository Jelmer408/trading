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
        textColor: "#71717a",
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1c1c1e" },
      },
      width: containerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { color: "#3f3f46", width: 1, style: 2 },
      },
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#3b82f6",
      topColor: "#3b82f620",
      bottomColor: "transparent",
      lineWidth: 2,
    });

    const chartData = data.map((d) => ({
      time: (new Date(d.snapshot_time).getTime() / 1000) as number,
      value: d.equity,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series.setData(chartData as any);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height]);

  return <div ref={containerRef} />;
}
