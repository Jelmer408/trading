"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Signal } from "@/lib/types";

interface SignalFeedProps {
  signals: Signal[];
}

function strengthBar(strength: number) {
  const pct = Math.round(strength * 100);
  const color =
    strength >= 0.8
      ? "bg-green-500"
      : strength >= 0.6
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function SignalFeed({ signals }: SignalFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signal Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Waiting for signals...
          </div>
        ) : (
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {signals.map((sig) => (
              <div
                key={sig.id}
                className="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={sig.direction === "long" ? "default" : "destructive"}
                    className="w-14 justify-center text-xs"
                  >
                    {sig.direction.toUpperCase()}
                  </Badge>
                  <div>
                    <p className="font-bold text-sm">{sig.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {sig.name.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
                {strengthBar(sig.strength)}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
