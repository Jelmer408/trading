import { NextResponse } from "next/server";

// Fly.io dedicated IPv4 -- bypasses broken .fly.dev DNS
const BOT_IP = "137.66.57.12";
const BOT_HOST = "trading-symxyw.fly.dev";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    // Use HTTPS with the IP but set Host header so Fly proxy routes correctly
    // For the IP connection we need to use HTTP since the TLS cert won't match
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const resp = await fetch(`http://${BOT_IP}:80/api/status`, {
      headers: { Host: BOT_HOST },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      return NextResponse.json(
        { status: "offline", error: `HTTP ${resp.status}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { status: "offline", error: e instanceof Error ? e.message : "Failed" },
      { status: 502 }
    );
  }
}
