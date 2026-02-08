"""Supabase client for reading/writing trading data."""

from datetime import datetime, timezone
from typing import Any

from supabase import create_client, Client

from bot.config import config
from bot.utils.logger import log


_client: Client | None = None


def get_client() -> Client:
    """Get or create the Supabase client singleton."""
    global _client
    if _client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
        _client = create_client(config.SUPABASE_URL, config.SUPABASE_KEY)
        log.info("Supabase client connected")
    return _client


# ── Candles ──────────────────────────────────────────────────

def upsert_candle(
    symbol: str,
    timeframe: str,
    timestamp: datetime,
    open_: float,
    high: float,
    low: float,
    close: float,
    volume: int,
    vwap: float | None = None,
) -> None:
    """Insert or update a candle bar."""
    client = get_client()
    client.table("candles").upsert(
        {
            "symbol": symbol,
            "timeframe": timeframe,
            "timestamp": timestamp.isoformat(),
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
            "vwap": vwap,
        },
        on_conflict="symbol,timeframe,timestamp",
    ).execute()


def get_candles(
    symbol: str, timeframe: str, limit: int = 200
) -> list[dict[str, Any]]:
    """Fetch recent candles for a symbol."""
    client = get_client()
    resp = (
        client.table("candles")
        .select("*")
        .eq("symbol", symbol)
        .eq("timeframe", timeframe)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(resp.data)) if resp.data else []


# ── Signals ──────────────────────────────────────────────────

def insert_signal(
    symbol: str,
    timeframe: str,
    timestamp: datetime,
    signal_type: str,
    name: str,
    direction: str,
    strength: float,
    details: dict | None = None,
) -> int:
    """Insert a detected signal and return its ID."""
    client = get_client()
    resp = (
        client.table("signals")
        .insert(
            {
                "symbol": symbol,
                "timeframe": timeframe,
                "timestamp": timestamp.isoformat(),
                "signal_type": signal_type,
                "name": name,
                "direction": direction,
                "strength": strength,
                "details": details or {},
            }
        )
        .execute()
    )
    return resp.data[0]["id"]


# ── Trades ───────────────────────────────────────────────────

def insert_trade(trade_data: dict[str, Any]) -> int:
    """Insert a new trade record."""
    client = get_client()
    resp = client.table("trades").insert(trade_data).execute()
    return resp.data[0]["id"]


def update_trade(trade_id: int, updates: dict[str, Any]) -> None:
    """Update an existing trade."""
    client = get_client()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    client.table("trades").update(updates).eq("id", trade_id).execute()


def get_open_trades() -> list[dict[str, Any]]:
    """Get all trades that are not yet closed."""
    client = get_client()
    resp = (
        client.table("trades")
        .select("*")
        .in_("status", ["pending", "filled"])
        .execute()
    )
    return resp.data or []


# ── Positions ────────────────────────────────────────────────

def upsert_position(position_data: dict[str, Any]) -> None:
    """Insert or update a position by symbol."""
    client = get_client()
    position_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    client.table("positions").upsert(
        position_data, on_conflict="symbol"
    ).execute()


def delete_position(symbol: str) -> None:
    """Remove a closed position."""
    client = get_client()
    client.table("positions").delete().eq("symbol", symbol).execute()


def get_positions() -> list[dict[str, Any]]:
    """Get all current positions."""
    client = get_client()
    resp = client.table("positions").select("*").execute()
    return resp.data or []


# ── Account Snapshots ────────────────────────────────────────

def insert_account_snapshot(
    equity: float,
    cash: float,
    buying_power: float,
    day_pnl: float = 0,
    day_pnl_pct: float = 0,
    open_positions: int = 0,
) -> None:
    """Record an account balance snapshot."""
    client = get_client()
    client.table("account_snapshots").insert(
        {
            "equity": equity,
            "cash": cash,
            "buying_power": buying_power,
            "day_pnl": day_pnl,
            "day_pnl_pct": day_pnl_pct,
            "open_positions": open_positions,
        }
    ).execute()


# ── News ─────────────────────────────────────────────────────

def insert_news(news_data: dict[str, Any]) -> None:
    """Insert a news item."""
    client = get_client()
    client.table("news").insert(news_data).execute()


# ── Settings ─────────────────────────────────────────────────

def get_setting(key: str) -> Any:
    """Read a setting value."""
    client = get_client()
    resp = client.table("settings").select("value").eq("key", key).execute()
    if resp.data:
        return resp.data[0]["value"]
    return None


def update_setting(key: str, value: Any) -> None:
    """Update a setting value."""
    client = get_client()
    client.table("settings").upsert(
        {
            "key": key,
            "value": value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="key",
    ).execute()
