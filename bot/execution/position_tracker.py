"""
Position tracking: monitors open positions with tiered trailing stops,
breakeven protection, partial profit taking, and server-side stop updates.

Strategy tiers:
  1. Breakeven move   — after +1.0% profit, move SL to entry + 0.1% buffer
  2. Lock-in profit   — after +1.5%, trail 0.6% behind peak (locks ~0.9%)
  3. Tight trail       — after +2.5%, trail 0.4% behind peak (locks ~2.1%)
  4. Scalp trail       — after +3.5%, trail 0.3% behind peak (locks ~3.2%)
  5. Partial take      — at +2.0%, sell half the position, let rest ride
"""

import asyncio
from datetime import datetime, timezone

from bot.data import alpaca_client as alpaca
from bot.data import supabase_client as db
from bot.execution import order_manager
from bot.utils.logger import log
from bot.utils import activity

# ── Trailing stop state ──────────────────────────────────────

# Track peak price per symbol
_peak_prices: dict[str, float] = {}

# Track which symbols already had breakeven move applied (avoid repeated cancel/replace)
_breakeven_applied: set[str] = set()

# Track which symbols already had partial profit taken
_partial_taken: set[str] = set()

# Track last stop level pushed to Alpaca (avoid spamming cancel/replace)
_last_pushed_stop: dict[str, float] = {}


# ── Tier configuration ───────────────────────────────────────

TIERS = [
    # (min_profit_pct, trail_pct, label)
    (0.035, 0.003, "scalp"),     # +3.5% → trail 0.3%
    (0.025, 0.004, "tight"),     # +2.5% → trail 0.4%
    (0.015, 0.006, "lock-in"),   # +1.5% → trail 0.6%
    (0.010, 0.010, "breakeven"), # +1.0% → move to breakeven (trail 1.0%)
]

BREAKEVEN_ACTIVATE_PCT = 0.010   # Move SL to breakeven after 1.0% profit
BREAKEVEN_BUFFER_PCT = 0.001     # Small buffer above entry (0.1%)

PARTIAL_TAKE_PCT = 0.020         # Take partial at +2.0% profit
PARTIAL_TAKE_RATIO = 0.5         # Sell 50% of position

# Minimum price change before we push a new stop to Alpaca (avoid spam)
MIN_STOP_CHANGE_PCT = 0.002      # Only update if stop moves by > 0.2%


async def check_positions() -> None:
    """
    Check all open positions against tiered trailing stops.
    Updates both local tracking and Alpaca server-side stops.
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

    # Clean up state for symbols we no longer hold
    active_symbols = {pos["symbol"] for pos in alpaca_positions}
    for sym in list(_peak_prices):
        if sym not in active_symbols:
            del _peak_prices[sym]
    for sym in list(_last_pushed_stop):
        if sym not in active_symbols:
            del _last_pushed_stop[sym]
    _breakeven_applied.difference_update(_breakeven_applied - active_symbols)
    _partial_taken.difference_update(_partial_taken - active_symbols)

    for pos in alpaca_positions:
        symbol = pos["symbol"]
        current_price = pos["current_price"]
        qty = pos["quantity"]
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

        if not entry_price or entry_price <= 0:
            continue

        # ── Calculate profit percentage ──────────────────────
        if side == "buy":
            profit_pct = (current_price - entry_price) / entry_price
        else:
            profit_pct = (entry_price - current_price) / entry_price

        # ── Update peak price tracking ───────────────────────
        if symbol not in _peak_prices:
            _peak_prices[symbol] = current_price
        elif side == "buy" and current_price > _peak_prices[symbol]:
            _peak_prices[symbol] = current_price
        elif side == "sell" and current_price < _peak_prices[symbol]:
            _peak_prices[symbol] = current_price

        peak = _peak_prices[symbol]

        # ── Fixed stop-loss check (backup) ───────────────────
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

        # ── Partial profit taking ────────────────────────────
        if (
            profit_pct >= PARTIAL_TAKE_PCT
            and symbol not in _partial_taken
            and qty > 1
        ):
            partial_qty = max(1, int(qty * PARTIAL_TAKE_RATIO))
            remaining_qty = qty - partial_qty

            try:
                # Cancel existing bracket/OCO orders first
                await asyncio.to_thread(
                    alpaca.cancel_open_orders_for_symbol, symbol
                )
                await asyncio.sleep(0.3)

                # Sell partial
                exit_side = "sell" if side == "buy" else "buy"
                await asyncio.to_thread(
                    alpaca.place_market_order,
                    symbol, exit_side, partial_qty,
                )

                _partial_taken.add(symbol)

                partial_pnl = partial_qty * abs(current_price - entry_price)
                if side == "sell":
                    partial_pnl = partial_qty * abs(entry_price - current_price)

                log.info(
                    f"PARTIAL TAKE: {symbol} sold {partial_qty}/{int(qty)} shares "
                    f"@ ${current_price:.2f} (profit ~${partial_pnl:.2f})"
                )

                activity.emit(
                    event_type="trade",
                    agent="trailing",
                    symbol=symbol,
                    title=f"Partial profit: sold {partial_qty} of {int(qty)} shares",
                    detail=(
                        f"Locked ${partial_pnl:.2f} at +{profit_pct:.1%} | "
                        f"Remaining {int(remaining_qty)} shares riding"
                    ),
                    level="success",
                )

                # Re-establish protection for remaining shares
                # Use tighter stop (breakeven at minimum)
                new_sl = _calculate_trailing_stop(
                    entry_price, peak, side, profit_pct
                )
                await asyncio.sleep(0.5)
                await asyncio.to_thread(
                    alpaca.place_oco_exit,
                    symbol, remaining_qty, side,
                    new_sl, take_profit or _default_tp(entry_price, side),
                )
                _last_pushed_stop[symbol] = new_sl

                # Update trade record
                db.update_trade(trade["id"], {
                    "quantity": int(remaining_qty),
                })

            except Exception as e:
                log.error(f"Partial take failed for {symbol}: {e}")
            continue

        # ── Tiered trailing stop ─────────────────────────────
        if profit_pct >= TIERS[-1][0]:  # At least breakeven tier
            trailing_stop = _calculate_trailing_stop(
                entry_price, peak, side, profit_pct
            )

            # Check if trailing stop is hit
            if side == "buy" and current_price <= trailing_stop:
                tier_name = _get_tier_name(profit_pct)
                log.info(
                    f"TRAILING STOP ({tier_name}): {symbol} @ ${current_price:.2f} "
                    f"(peak=${peak:.2f}, trail=${trailing_stop:.2f}, "
                    f"profit was +{profit_pct:.1%})"
                )
                result = await order_manager.exit_position(symbol, f"trailing_stop_{tier_name}")
                if result:
                    _close_trade(trade, current_price, f"trailing_stop_{tier_name}", pos=pos)
                continue

            if side == "sell" and current_price >= trailing_stop:
                tier_name = _get_tier_name(profit_pct)
                log.info(
                    f"TRAILING STOP ({tier_name}): {symbol} @ ${current_price:.2f} "
                    f"(peak=${peak:.2f}, trail=${trailing_stop:.2f}, "
                    f"profit was +{profit_pct:.1%})"
                )
                result = await order_manager.exit_position(symbol, f"trailing_stop_{tier_name}")
                if result:
                    _close_trade(trade, current_price, f"trailing_stop_{tier_name}", pos=pos)
                continue

            # ── Push updated stop to Alpaca server-side ──────
            await _maybe_push_stop(
                symbol=symbol,
                side=side,
                qty=qty if symbol not in _partial_taken else trade.get("quantity", qty),
                new_stop=trailing_stop,
                take_profit=take_profit or _default_tp(entry_price, side),
                profit_pct=profit_pct,
            )

        # ── Take-profit check (backup for bracket) ──────────
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


def _calculate_trailing_stop(
    entry_price: float,
    peak: float,
    side: str,
    profit_pct: float,
) -> float:
    """Calculate the trailing stop price based on the current profit tier."""
    # Find the tightest applicable tier
    for min_pct, trail_pct, _ in TIERS:
        if profit_pct >= min_pct:
            if side == "buy":
                trail_stop = peak * (1 - trail_pct)
                # Never set stop below entry + buffer (breakeven floor)
                breakeven_stop = entry_price * (1 + BREAKEVEN_BUFFER_PCT)
                return max(trail_stop, breakeven_stop)
            else:
                trail_stop = peak * (1 + trail_pct)
                breakeven_stop = entry_price * (1 - BREAKEVEN_BUFFER_PCT)
                return min(trail_stop, breakeven_stop)

    # Fallback: shouldn't reach here if called correctly
    if side == "buy":
        return entry_price * (1 + BREAKEVEN_BUFFER_PCT)
    else:
        return entry_price * (1 - BREAKEVEN_BUFFER_PCT)


def _get_tier_name(profit_pct: float) -> str:
    """Get the name of the current trailing tier."""
    for min_pct, _, name in TIERS:
        if profit_pct >= min_pct:
            return name
    return "base"


def _default_tp(entry_price: float, side: str) -> float:
    """Fallback take-profit if none set."""
    from bot.config import config
    if side == "buy":
        return round(entry_price * (1 + config.TAKE_PROFIT_PCT), 2)
    else:
        return round(entry_price * (1 - config.TAKE_PROFIT_PCT), 2)


async def _maybe_push_stop(
    symbol: str,
    side: str,
    qty: float,
    new_stop: float,
    take_profit: float,
    profit_pct: float,
) -> None:
    """
    Push an updated stop-loss to Alpaca if it has moved significantly.
    Avoids spamming cancel/replace for tiny movements.
    """
    new_stop = round(new_stop, 2)
    last = _last_pushed_stop.get(symbol)

    if last is not None:
        change_pct = abs(new_stop - last) / last if last > 0 else 1.0
        if change_pct < MIN_STOP_CHANGE_PCT:
            return  # Too small a change, skip

        # Only move stop in the profitable direction
        if side == "buy" and new_stop <= last:
            return
        if side == "sell" and new_stop >= last:
            return

    try:
        tier_name = _get_tier_name(profit_pct)
        await asyncio.to_thread(
            alpaca.replace_stop_order,
            symbol, side, qty, new_stop, take_profit,
        )
        _last_pushed_stop[symbol] = new_stop

        log.info(
            f"STOP MOVED ({tier_name}): {symbol} → SL=${new_stop:.2f} "
            f"(at +{profit_pct:.1%} profit)"
        )
        activity.emit(
            event_type="trade",
            agent="trailing",
            symbol=symbol,
            title=f"Stop tightened ({tier_name}): SL → ${new_stop:.2f}",
            detail=f"At +{profit_pct:.1%} profit, peak tracked",
            level="info",
        )
    except Exception as e:
        log.error(f"Failed to push stop for {symbol}: {e}")


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

    # Clean up tracking state
    symbol = trade["symbol"]
    _peak_prices.pop(symbol, None)
    _last_pushed_stop.pop(symbol, None)
    _breakeven_applied.discard(symbol)
    _partial_taken.discard(symbol)

    # Log to activity feed
    activity.emit(
        event_type="trade",
        agent="executor",
        symbol=symbol,
        title=f"Closed: {reason} | ${pnl:+.2f} ({pnl_pct:+.1f}%)",
        detail=f"Entry ${entry_price:.2f} → Exit ${exit_price:.2f} | {reason}",
        metadata={"reason": reason, "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct, 2)},
        level="success" if pnl >= 0 else "warn",
    )

    log.info(
        f"Trade closed: {trade['symbol']} | {reason} | "
        f"P&L=${pnl:+.2f} ({pnl_pct:+.1f}%)"
    )
