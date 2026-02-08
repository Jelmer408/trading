"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccountSnapshot } from "@/lib/types";

interface AccountCardProps {
  snapshot: AccountSnapshot | null;
  loading: boolean;
}

function formatMoney(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(val);
}

export default function AccountCard({ snapshot, loading }: AccountCardProps) {
  if (loading || !snapshot) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Loading...
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: "Equity",
      value: formatMoney(snapshot.equity),
      sub: `${snapshot.open_positions} positions open`,
    },
    {
      label: "Day P&L",
      value: formatMoney(snapshot.day_pnl),
      sub: `${snapshot.day_pnl_pct >= 0 ? "+" : ""}${snapshot.day_pnl_pct.toFixed(2)}%`,
      color: snapshot.day_pnl >= 0 ? "text-green-500" : "text-red-500",
    },
    {
      label: "Cash",
      value: formatMoney(snapshot.cash),
      sub: "Available",
    },
    {
      label: "Buying Power",
      value: formatMoney(snapshot.buying_power),
      sub: "For new trades",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${card.color || ""}`}>
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
