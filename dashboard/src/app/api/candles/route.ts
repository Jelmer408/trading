import { NextRequest, NextResponse } from "next/server";

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "9GhoymR6R5TvnO8MzBPbohBJnRewjhyP";
const BASE = "https://api.massive.com";

export const dynamic = "force-dynamic";

/**
 * GET /api/candles?symbol=SPY&timeframe=5Min&days=5
 *
 * Fetches OHLCV candle data from Massive.com (formerly Polygon).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const symbol = searchParams.get("symbol") || "SPY";
  const timeframe = searchParams.get("timeframe") || "5Min";
  const days = parseInt(searchParams.get("days") || "5", 10);

  // Parse timeframe into multiplier + timespan
  const { multiplier, timespan } = parseTimeframe(timeframe);

  // Calculate date range
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  const fromStr = fmt(from);
  const toStr = fmt(to);

  const url =
    `${BASE}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${fromStr}/${toStr}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${MASSIVE_API_KEY}`;

  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `Massive API ${resp.status}`, detail: text.slice(0, 300) },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    const results = (data.results || []).map(
      (bar: { o: number; h: number; l: number; c: number; v: number; t: number; vw?: number }) => ({
        time: bar.t / 1000, // Convert ms → seconds for lightweight-charts
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        vwap: bar.vw ?? null,
      })
    );

    return NextResponse.json(
      { symbol, timeframe, count: results.length, candles: results },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch candles" },
      { status: 500 }
    );
  }
}

function parseTimeframe(tf: string): { multiplier: number; timespan: string } {
  if (tf.endsWith("Min")) return { multiplier: parseInt(tf), timespan: "minute" };
  if (tf.endsWith("Hour")) return { multiplier: parseInt(tf), timespan: "hour" };
  if (tf.endsWith("Day")) return { multiplier: parseInt(tf), timespan: "day" };
  // Default 5-minute
  return { multiplier: 5, timespan: "minute" };
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}
