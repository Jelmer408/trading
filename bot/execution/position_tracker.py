"""
Position tracking: monitors open positions for stop-loss, take-profit,
and trailing stop hits.
"""

import asyncio
from datetime import datetime, timezone

from bot.data import alpaca_client as alpaca
from bot.data import supabase_client as db
from bot.execution import order_manager
from bot.utils.logger import log
from bot.utils import activity

# ── Trailing stop state ──────────────────────────────────────

# Track peak price per symbol to calculate trailing stops
_peak_prices: dict[str, float] = {}

# Trailing stop config
TRAIL_ACTIVATE_PCT = 0.005  # Start trailing after 0.5% profit
TRAIL_PCT = 0.01            # Trail 1% behind the peak


async def check_positions() -> None:
    """
    Check all open positions against their stop-loss, take-profit,
    and trailing stop levels. Close positions that have hit targets.
    """
    try:
        alpaca_positions = alpaca.get_positions()
        open_trades = db.get_open_trades()
    except Exception as e:
        log.error(f"Position check failed: {e}")
        return

    # Build a lookup of active trades by symbol
    trade_map: dict[str, dict] = {}
    for trade in open_trades:
        if trade["status"] in ("pending", "filled"):
            trade_map[trade["symbol"]] = trade

    # Clean up peak prices for symbols we no longer hold
    active_symbols = {pos["symbol"] for pos in alpaca_positions}
    for sym in list(_peak_prices):
        if sym not in active_symbols:
            del _peak_prices[sym]

    for pos in alpaca_positions:
        symbol = pos["symbol"]
        current_price = pos["current_price"]
        trade = trade_map.get(symbol)

        if not trade:
            continue

        # Update trade status to filled if still pending
        if trade["status"] == "pending":
            db.update_trade(trade["id"], {
                "status": "filled",
                "entry_price": pos["avg_entry_price"],
                "entry_time": datetime.now(timezone.utc).isoformat(),
            })

        # Sync position to Supabase for dashboard
        db.upsert_position(pos)

        entry_price = trade.get("entry_price") or pos.get("avg_entry_price", 0)
        stop_loss = trade.get("stop_loss")
        take_profit = trade.get("take_profit")
        side = trade.get("side", "buy")

        # ── Trailing stop logic ──────────────────────────────
        if entry_price and entry_price > 0:
            if side == "buy":
                profit_pct = (current_price - entry_price) / entry_price
            else:
                profit_pct = (entry_price - current_price) / entry_price

            # Update peak price tracking
            if symbol not in _peak_prices:
                _peak_prices[symbol] = current_price
            elif side == "buy" and current_price > _peak_prices[symbol]:
                _peak_prices[symbol] = current_price
            elif side == "sell" and current_price < _peak_prices[symbol]:
                _peak_prices[symbol] = current_price

            # Check trailing stop if we've been profitable enough
            if profit_pct >= TRAIL_ACTIVATE_PCT:
                peak = _peak_prices[symbol]

                if side == "buy":
                    trail_stop = peak * (1 - TRAIL_PCT)
                    if current_price <= trail_stop:
                        log.info(
                            f"TRAILING STOP: {symbol} @ ${current_price:.2f} "
                            f"(peak=${peak:.2f}, trail=${trail_stop:.2f}, "
                            f"profit was {profit_pct:.1%})"
                        )
                        result = await order_manager.exit_position(symbol, "trailing_stop")
                        if result:
                            _close_trade(trade, current_price, "trailing_stop", pos=pos)
                        continue
                else:
                    trail_stop = peak * (1 + TRAIL_PCT)
                    if current_price >= trail_stop:
                        log.info(
                            f"TRAILING STOP: {symbol} @ ${current_price:.2f} "
                            f"(peak=${peak:.2f}, trail=${trail_stop:.2f}, "
                            f"profit was {profit_pct:.1%})"
                        )
                        result = await order_manager.exit_position(symbol, "trailing_stop")
                        if result:
                            _close_trade(trade, current_price, "trailing_stop", pos=pos)
                        continue

        # ── Fixed stop-loss (backup for bracket orders) ──────
        if stop_loss:
            if (side == "buy" and current_price <= stop_loss) or (
                side == "sell" and current_price >= stop_loss
            ):
                log.warning(
                    f"STOP-LOSS HIT: {symbol} @ ${current_price:.2f} "
                    f"(stop=${stop_loss:.2f})"
                )
                result = await order_manager.exit_position(symbol, "stop_loss")
                if result:
                    _close_trade(trade, current_price, "stop_loss", pos=pos)
                continue

        # ── Take-profit ──────────────────────────────────────
        if take_profit:
            if (side == "buy" and current_price >= take_profit) or (
                side == "sell" and current_price <= take_profit
            ):
                log.info(
                    f"TAKE-PROFIT HIT: {symbol} @ ${current_price:.2f} "
                    f"(target=${take_profit:.2f})"
                )
                result = await order_manager.exit_position(symbol, "take_profit")
                if result:
                    _close_trade(trade, current_price, "take_profit", pos=pos)
                continue


def _close_trade(trade: dict, exit_price: float, reason: str, pos: dict | None = None) -> None:
    """Update a trade record as closed with P&L calculation.
    
    Uses Alpaca's position data for accurate P&L when available,
    falls back to manual calculation otherwise.
    """
    quantity = trade.get("quantity", 0)
    side = trade.get("side", "buy")

    # Prefer Alpaca's own P&L (accounts for actual fill prices, not signal prices)
    if pos and "unrealized_pnl" in pos:
        pnl = pos["unrealized_pnl"]
        pnl_pct = pos.get("unrealized_pnl_pct", 0)
        entry_price = pos.get("avg_entry_price", trade.get("entry_price", 0))
        # Update entry_price to actual fill if we have it
        if entry_price:
            trade["entry_price"] = entry_price
    else:
        entry_price = trade.get("entry_price", 0)
        if side == "buy":
            pnl = (exit_price - entry_price) * quantity
            pnl_pct = ((exit_price - entry_price) / entry_price * 100) if entry_price else 0
        else:
            pnl = (entry_price - exit_price) * quantity
            pnl_pct = ((entry_price - exit_price) / entry_price * 100) if entry_price else 0

    entry_time = trade.get("entry_time")
    now = datetime.now(timezone.utc)
    duration = None
    if entry_time:
        try:
            et = datetime.fromisoformat(entry_time)
            duration = int((now - et).total_seconds())
        except (ValueError, TypeError):
            pass

    db.update_trade(trade["id"], {
        "status": "closed",
        "exit_price": exit_price,
        "pnl": round(pnl, 2),
        "pnl_pct": round(pnl_pct, 2),
        "exit_time": now.isoformat(),
        "duration_sec": duration,
    })

    # Remove from positions table
    db.delete_position(trade["symbol"])

    # Log to activity feed
    emoji = "profit" if pnl >= 0 else "loss"
    activity.emit(
        event_type="trade",
        agent="executor",
        symbol=trade["symbol"],
        title=f"Closed: {reason} | ${pnl:+.2f} ({pnl_pct:+.1f}%)",
        detail=f"Entry ${entry_price:.2f} → Exit ${exit_price:.2f} | {reason}",
        metadata={"reason": reason, "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct, 2)},
        level="success" if pnl >= 0 else "warn",
    )

    log.info(
        f"Trade closed: {trade['symbol']} | {reason} | "
        f"P&L=${pnl:+.2f} ({pnl_pct:+.1f}%)"
    )
