"""
Order execution: places market orders for immediate fills.
"""

from typing import Any

from bot.data import alpaca_client as alpaca
from bot.data import supabase_client as db
from bot.utils.logger import log


async def enter_position(
    symbol: str,
    direction: str,
    quantity: int,
    entry_price: float,
    stop_loss: float,
    take_profit: float,
    signal_id: int | None = None,
    ai_reasoning: str | None = None,
) -> dict[str, Any] | None:
    """
    Enter a new position via market order for immediate fill.

    Args:
        symbol: Ticker.
        direction: 'long' or 'short'.
        quantity: Number of shares.
        entry_price: Price at time of signal (for record-keeping).
        stop_loss: Stop-loss price.
        take_profit: Take-profit price.
        signal_id: Reference to the signal that triggered this.
        ai_reasoning: AI's reasoning for the trade.

    Returns:
        Trade record dict, or None if order failed.
    """
    side = "buy" if direction == "long" else "sell"

    try:
        order = alpaca.place_bracket_order(
            symbol=symbol,
            side=side,
            qty=quantity,
            stop_loss=stop_loss,
            take_profit=take_profit,
        )

        # Record in database
        trade_id = db.insert_trade({
            "alpaca_order_id": order["order_id"],
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "status": "pending",
            "signal_id": signal_id,
            "ai_reasoning": ai_reasoning,
        })

        log.info(
            f"ENTER: {direction.upper()} {quantity} {symbol} @ ${entry_price:.2f} "
            f"SL=${stop_loss:.2f} TP=${take_profit:.2f} "
            f"(order={order['order_id']}, trade_id={trade_id})"
        )

        return {
            "trade_id": trade_id,
            "order_id": order["order_id"],
            "symbol": symbol,
            "direction": direction,
            "quantity": quantity,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
        }

    except Exception as e:
        log.error(f"Failed to enter {direction} {symbol}: {e}")
        return None


async def exit_position(symbol: str, reason: str = "signal") -> dict[str, Any] | None:
    """
    Close an existing position at market.

    IMPORTANT: Must cancel existing bracket/OCO orders first to free shares,
    otherwise Alpaca will reject with "insufficient qty available" because
    the shares are held by pending exit orders.

    Args:
        symbol: Ticker to close.
        reason: Why we're closing (signal, stop_loss, take_profit, etc.).

    Returns:
        Close order dict or None.
    """
    import asyncio

    try:
        # Step 1: Cancel all open orders for this symbol to free held shares
        cancelled = alpaca.cancel_open_orders_for_symbol(symbol)
        if cancelled > 0:
            log.info(f"Cancelled {cancelled} orders for {symbol} before exit")
            # Brief pause for cancellations to settle
            await asyncio.sleep(0.5)

        # Step 2: Now close the position
        result = alpaca.close_position(symbol)
        log.info(f"EXIT: {symbol} (reason: {reason}, order={result['order_id']})")
        return result
    except Exception as e:
        log.error(f"Failed to exit {symbol}: {e}")
        return None
