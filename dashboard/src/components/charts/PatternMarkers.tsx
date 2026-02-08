"use client";

import { useEffect, useCallback, useRef } from "react";
import {
  createSeriesMarkers,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { supabase } from "@/lib/supabase";
import type { Signal } from "@/lib/types";

interface PatternMarkersProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  candleSeries: ISeriesApi<any> | null;
  symbol: string;
}

function signalToMarker(signal: Signal) {
  const isLong = signal.direction === "long";
  return {
    time: (new Date(signal.timestamp).getTime() / 1000) as number,
    position: isLong ? ("belowBar" as const) : ("aboveBar" as const),
    color: isLong ? "#22c55e" : "#ef4444",
    shape: isLong ? ("arrowUp" as const) : ("arrowDown" as const),
    text: signal.name.replace(/_/g, " ").substring(0, 20),
  };
}

export default function PatternMarkers({
  candleSeries,
  symbol,
}: PatternMarkersProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<any> | null>(null);

  const fetchAndApplyMarkers = useCallback(async () => {
    if (!candleSeries) return;

    // Create markers plugin if not yet created
    if (!markersPluginRef.current) {
      markersPluginRef.current = createSeriesMarkers(candleSeries, []);
    }

    const { data: signals } = await supabase
      .from("signals")
      .select("*")
      .eq("symbol", symbol)
      .order("timestamp", { ascending: true })
      .limit(100);

    if (signals && signals.length > 0) {
      const markers = signals.map(signalToMarker);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markersPluginRef.current.setMarkers(markers as any);
    }
  }, [candleSeries, symbol]);

  useEffect(() => {
    fetchAndApplyMarkers();

    const channel = supabase
      .channel(`signals_markers_${symbol}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
          filter: `symbol=eq.${symbol}`,
        },
        () => fetchAndApplyMarkers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (markersPluginRef.current) {
        markersPluginRef.current.detach();
        markersPluginRef.current = null;
      }
    };
  }, [fetchAndApplyMarkers, symbol]);

  return null;
}
