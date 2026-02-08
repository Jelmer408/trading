"""Alpaca REST API client for account info, orders, and historical data."""

from datetime import datetime, timedelta, timezone

from alpaca.trading.client import TradingClient
from alpaca.trading.requests import (
    GetOrdersRequest,
    LimitOrderRequest,
    MarketOrderRequest,
)
from alpaca.trading.enums import OrderSide, TimeInForce, QueryOrderStatus
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

from bot.config import config
from bot.utils.logger import log


# ── Clients ──────────────────────────────────────────────────

_trading_client: TradingClient | None = None
_data_client: StockHistoricalDataClient | None = None


def get_trading_client() -> TradingClient:
    """Get or create the Alpaca trading client."""
    global _trading_client
    if _trading_client is None:
        _trading_client = TradingClient(
            api_key=config.ALPACA_API_KEY,
            secret_key=config.ALPACA_SECRET_KEY,
            paper=config.ALPACA_PAPER,
        )
        log.info(f"Alpaca trading client connected (paper={config.ALPACA_PAPER})")
    return _trading_client


def get_data_client() -> StockHistoricalDataClient:
    """Get or create the Alpaca historical data client."""
    global _data_client
    if _data_client is None:
        _data_client = StockHistoricalDataClient(
            api_key=config.ALPACA_API_KEY,
            secret_key=config.ALPACA_SECRET_KEY,
        )
        log.info("Alpaca data client connected")
    return _data_client


# ── Account ──────────────────────────────────────────────────

def get_account() -> dict:
    """Get current account information."""
    client = get_trading_client()
    account = client.get_account()
    return {
        "equity": float(account.equity),
        "cash": float(account.cash),
        "buying_power": float(account.buying_power),
        "portfolio_value": float(account.portfolio_value),
        "day_pnl": float(account.equity) - float(account.last_equity),
        "day_pnl_pct": (
            (float(account.equity) - float(account.last_equity))
            / float(account.last_equity)
            * 100
            if float(account.last_equity) > 0
            else 0
        ),
    }


# ── Positions ────────────────────────────────────────────────

def get_positions() -> list[dict]:
    """Get all open positions from Alpaca."""
    client = get_trading_client()
    positions = client.get_all_positions()
    return [
        {
            "symbol": p.symbol,
            "side": p.side.value,
            "quantity": float(p.qty),
            "avg_entry_price": float(p.avg_entry_price),
            "current_price": float(p.current_price),
            "market_value": float(p.market_value),
            "unrealized_pnl": float(p.unrealized_pl),
            "unrealized_pnl_pct": float(p.unrealized_plpc) * 100,
        }
        for p in positions
    ]


# ── Orders ───────────────────────────────────────────────────

def place_limit_order(
    symbol: str,
    side: str,
    qty: float,
    limit_price: float,
    time_in_force: str = "day",
) -> dict:
    """Place a limit order."""
    client = get_trading_client()
    order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL
    tif = TimeInForce.DAY if time_in_force == "day" else TimeInForce.GTC

    request = LimitOrderRequest(
        symbol=symbol,
        qty=qty,
        side=order_side,
        time_in_force=tif,
        limit_price=limit_price,
    )
    order = client.submit_order(request)
    log.info(f"Limit order placed: {side} {qty} {symbol} @ ${limit_price}")
    return {
        "order_id": str(order.id),
        "symbol": order.symbol,
        "side": side,
        "qty": float(order.qty),
        "limit_price": float(order.limit_price),
        "status": order.status.value,
    }


def place_market_order(symbol: str, side: str, qty: float) -> dict:
    """Place a market order (use sparingly -- limit orders preferred)."""
    client = get_trading_client()
    order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

    request = MarketOrderRequest(
        symbol=symbol,
        qty=qty,
        side=order_side,
        time_in_force=TimeInForce.DAY,
    )
    order = client.submit_order(request)
    log.info(f"Market order placed: {side} {qty} {symbol}")
    return {
        "order_id": str(order.id),
        "symbol": order.symbol,
        "side": side,
        "qty": float(order.qty),
        "status": order.status.value,
    }


def cancel_order(order_id: str) -> None:
    """Cancel an open order."""
    client = get_trading_client()
    client.cancel_order_by_id(order_id)
    log.info(f"Order cancelled: {order_id}")


def get_order(order_id: str) -> dict:
    """Get order details."""
    client = get_trading_client()
    order = client.get_order_by_id(order_id)
    return {
        "order_id": str(order.id),
        "symbol": order.symbol,
        "side": order.side.value,
        "qty": float(order.qty),
        "filled_qty": float(order.filled_qty) if order.filled_qty else 0,
        "limit_price": float(order.limit_price) if order.limit_price else None,
        "filled_avg_price": (
            float(order.filled_avg_price) if order.filled_avg_price else None
        ),
        "status": order.status.value,
    }


def close_position(symbol: str) -> dict:
    """Close an entire position for a symbol."""
    client = get_trading_client()
    order = client.close_position(symbol)
    log.info(f"Position closed: {symbol}")
    return {
        "order_id": str(order.id),
        "symbol": order.symbol,
        "status": order.status.value,
    }


# ── Historical Data ──────────────────────────────────────────

TIMEFRAME_MAP = {
    "1Min": TimeFrame(1, TimeFrameUnit.Minute),
    "5Min": TimeFrame(5, TimeFrameUnit.Minute),
    "15Min": TimeFrame(15, TimeFrameUnit.Minute),
    "1Hour": TimeFrame(1, TimeFrameUnit.Hour),
    "1Day": TimeFrame(1, TimeFrameUnit.Day),
}


def get_historical_bars(
    symbol: str,
    timeframe: str = "5Min",
    limit: int = 200,
) -> list[dict]:
    """Fetch historical bars from Alpaca."""
    client = get_data_client()
    tf = TIMEFRAME_MAP.get(timeframe, TIMEFRAME_MAP["5Min"])

    # Calculate start time — always go back enough calendar days
    # to cover weekends/holidays (at least 7 days for intraday)
    now = datetime.now(timezone.utc)
    if "Min" in timeframe:
        minutes = int(timeframe.replace("Min", ""))
        # 6.5 trading hours/day, need enough calendar days
        trading_days_needed = (minutes * limit) / (6.5 * 60) + 1
        calendar_days = max(7, int(trading_days_needed * 1.6))
        start = now - timedelta(days=calendar_days)
    elif "Hour" in timeframe:
        start = now - timedelta(days=max(7, limit // 6 + 3))
    else:
        start = now - timedelta(days=limit * 2)

    request = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=tf,
        start=start,
        limit=limit,
    )
    bars = client.get_stock_bars(request)

    result = []
    if symbol in bars.data:
        for bar in bars.data[symbol]:
            result.append(
                {
                    "symbol": symbol,
                    "timestamp": bar.timestamp,
                    "open": float(bar.open),
                    "high": float(bar.high),
                    "low": float(bar.low),
                    "close": float(bar.close),
                    "volume": int(bar.volume),
                    "vwap": float(bar.vwap) if bar.vwap else None,
                }
            )
    return result
