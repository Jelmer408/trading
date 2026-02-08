"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground text-sm">
          Configure your trading system
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Alpaca API Key</label>
            <p className="text-xs text-muted-foreground mt-1">
              Set via <code className="bg-muted px-1 py-0.5 rounded">ALPACA_API_KEY</code> environment variable on the bot
            </p>
          </div>
          <Separator />
          <div>
            <label className="text-sm font-medium">Supabase</label>
            <p className="text-xs text-muted-foreground mt-1">
              Set via <code className="bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="bg-muted px-1 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
            </p>
          </div>
          <Separator />
          <div>
            <label className="text-sm font-medium">PlusE Finance</label>
            <p className="text-xs text-muted-foreground mt-1">
              Set via <code className="bg-muted px-1 py-0.5 rounded">PLUSE_API_KEY</code> on the bot
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { label: "Max Position Size", value: "5% of portfolio", env: "MAX_POSITION_PCT" },
              { label: "Max Concurrent Positions", value: "3", env: "MAX_POSITIONS" },
              { label: "Stop Loss", value: "-2%", env: "STOP_LOSS_PCT" },
              { label: "Take Profit", value: "+4%", env: "TAKE_PROFIT_PCT" },
              { label: "Daily Loss Limit", value: "-3% (halts trading)", env: "DAILY_LOSS_LIMIT_PCT" },
              { label: "Order Type", value: "Limit orders only", env: "-" },
            ].map((param) => (
              <div key={param.label} className="flex justify-between items-center border-b border-border pb-2">
                <div>
                  <p className="text-sm font-medium">{param.label}</p>
                  <p className="text-xs text-muted-foreground">{param.env}</p>
                </div>
                <p className="text-sm font-mono">{param.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Watchlist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Set via <code className="bg-muted px-1 py-0.5 rounded">WATCHLIST</code> env var (comma-separated)
          </p>
          <div className="flex flex-wrap gap-2">
            {["AAPL", "MSFT", "NVDA", "TSLA", "SPY"].map((sym) => (
              <span
                key={sym}
                className="px-3 py-1 bg-muted rounded-md text-sm font-mono"
              >
                {sym}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Infrastructure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Trading Bot</span>
            <span className="text-xs text-muted-foreground">Fly.io</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Dashboard</span>
            <span className="text-xs text-muted-foreground">Vercel (free)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Database</span>
            <span className="text-xs text-muted-foreground">Supabase (free)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Broker</span>
            <span className="text-xs text-muted-foreground">Alpaca Paper (free)</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
