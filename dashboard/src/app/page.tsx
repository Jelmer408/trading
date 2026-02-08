"use client";

import AccountCard from "@/components/dashboard/AccountCard";
import PositionsTable from "@/components/dashboard/PositionsTable";
import TradesFeed from "@/components/dashboard/TradesFeed";
import SignalFeed from "@/components/dashboard/SignalFeed";
import PnLCurve from "@/components/charts/PnLCurve";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAccountData,
  usePositions,
  useTrades,
  useSignals,
} from "@/hooks/useRealtimeData";

export default function OverviewPage() {
  const { snapshot, history, loading: accountLoading } = useAccountData();
  const { positions, loading: posLoading } = usePositions();
  const { trades, loading: tradesLoading } = useTrades(20);
  const { signals } = useSignals(10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm">
          Real-time overview of your autonomous trading system
        </p>
      </div>

      <AccountCard snapshot={snapshot} loading={accountLoading} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <PnLCurve data={history} height={200} />
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              Waiting for data...
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PositionsTable positions={positions} loading={posLoading} />
        <TradesFeed trades={trades} loading={tradesLoading} />
      </div>

      <SignalFeed signals={signals} />
    </div>
  );
}
