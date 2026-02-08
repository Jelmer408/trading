"""
Position tracking: monitors open positions for stop-loss and take-profit hits.
"""

import asyncio
from datetime import datetime, timezone

from bot.data import alpaca_client as alpaca
from bot.data import supabase_client as db
from bot.execution import order_manager
from bot.utils.logger import log


async def check_positions() -> None:
    """
    Check all open positions against their stop-loss and take-profit levels.
    Close positions that have hit their targets.
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

        stop_loss = trade.get("stop_loss")
        take_profit = trade.get("take_profit")
        side = trade.get("side", "buy")

        # Check stop-loss
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
                    _close_trade(trade, current_price, "stop_loss")
                continue

        # Check take-profit
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
                    _close_trade(trade, current_price, "take_profit")
                continue


def _close_trade(trade: dict, exit_price: float, reason: str) -> None:
    """Update a trade record as closed with P&L calculation."""
    entry_price = trade.get("entry_price", 0)
    quantity = trade.get("quantity", 0)
    side = trade.get("side", "buy")

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

    log.info(
        f"Trade closed: {trade['symbol']} | {reason} | "
        f"P&L=${pnl:+.2f} ({pnl_pct:+.1f}%)"
    )
