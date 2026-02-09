import { NextRequest, NextResponse } from "next/server";

const BOT_IP = "137.66.57.12";
const BOT_HOST = "trading-symxyw.fly.dev";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "Missing ?symbol=" }, { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000); // 35s — AI eval can take a while

    const resp = await fetch(`http://${BOT_IP}:80/api/rescan/${symbol}`, {
      headers: { Host: BOT_HOST },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `Bot returned HTTP ${resp.status}`, detail: text.slice(0, 500) },
        { status: 502 }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-cache, no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Rescan failed" },
      { status: 502 }
    );
  }
}
