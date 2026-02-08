"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Position } from "@/lib/types";

interface PositionsTableProps {
  positions: Position[];
  loading: boolean;
}

export default function PositionsTable({
  positions,
  loading,
}: PositionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active Positions</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : positions.length === 0 ? (
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            No open positions
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((pos) => {
                const pnl = pos.unrealized_pnl || 0;
                const pnlPct = pos.unrealized_pnl_pct || 0;
                const isProfit = pnl >= 0;

                return (
                  <TableRow key={pos.id}>
                    <TableCell className="font-bold">{pos.symbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant={pos.side === "long" ? "default" : "destructive"}
                      >
                        {pos.side.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{pos.quantity}</TableCell>
                    <TableCell className="text-right">
                      ${pos.avg_entry_price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${(pos.current_price || 0).toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${
                        isProfit ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {isProfit ? "+" : ""}${pnl.toFixed(2)} ({pnlPct.toFixed(1)}
                      %)
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
