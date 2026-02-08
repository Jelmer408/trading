export interface Candle {
  id: number;
  symbol: string;
  timeframe: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
}

export interface Signal {
  id: number;
  symbol: string;
  timeframe: string;
  timestamp: string;
  signal_type: string;
  name: string;
  direction: "long" | "short";
  strength: number;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Trade {
  id: number;
  alpaca_order_id: string | null;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entry_price: number | null;
  exit_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: "pending" | "filled" | "closed" | "cancelled";
  pnl: number | null;
  pnl_pct: number | null;
  signal_id: number | null;
  ai_reasoning: string | null;
  entry_time: string | null;
  exit_time: string | null;
  duration_sec: number | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: number;
  symbol: string;
  side: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  updated_at: string;
}

export interface AccountSnapshot {
  id: number;
  equity: number;
  cash: number;
  buying_power: number;
  day_pnl: number;
  day_pnl_pct: number;
  open_positions: number;
  snapshot_time: string;
}

export interface NewsItem {
  id: number;
  symbol: string | null;
  headline: string;
  summary: string | null;
  sentiment: "bullish" | "bearish" | "neutral" | null;
  source: string | null;
  url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  event_type: string;
  agent: string;
  symbol: string | null;
  title: string;
  detail: string | null;
  metadata: Record<string, unknown>;
  level: "info" | "warn" | "error" | "success";
  created_at: string;
}

export interface WatchlistItem {
  id: number;
  symbol: string;
  source: "base" | "discovered" | "ai_approved";
  reason: string | null;
  score: number;
  discovery_sources: string[];
  active: boolean;
  added_at: string;
  updated_at: string;
}
