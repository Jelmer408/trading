"""
Risk management: position sizing, daily loss limits, max positions.
"""

from typing import Any

from bot.config import config
from bot.data import alpaca_client as alpaca
from bot.data import supabase_client as db
from bot.utils.logger import log


class RiskManager:
    """Enforces risk rules before allowing trade execution."""

    def __init__(self):
        self.max_position_pct = config.MAX_POSITION_PCT
        self.max_positions = config.MAX_POSITIONS
        self.stop_loss_pct = config.STOP_LOSS_PCT
        self.take_profit_pct = config.TAKE_PROFIT_PCT
        self.daily_loss_limit_pct = config.DAILY_LOSS_LIMIT_PCT
        self._halted = False

    def check_can_trade(self) -> tuple[bool, str]:
        """
        Check if trading is allowed based on all risk rules.

        Returns:
            (allowed, reason) tuple.
        """
        if self._halted:
            return False, "Trading halted due to daily loss limit"

        # Check daily loss limit
        try:
            account = alpaca.get_account()
            if account["day_pnl_pct"] < 0:
                loss_pct = abs(account["day_pnl_pct"]) / 100
                if loss_pct >= self.daily_loss_limit_pct:
                    self._halted = True
                    log.warning(
                        f"DAILY LOSS LIMIT HIT: {loss_pct:.1%} >= "
                        f"{self.daily_loss_limit_pct:.1%}. Trading halted."
                    )
                    return False, f"Daily loss limit hit ({loss_pct:.1%})"
        except Exception as e:
            log.error(f"Failed to check account: {e}")
            return False, f"Account check failed: {e}"

        # Check max positions
        try:
            positions = alpaca.get_positions()
            if len(positions) >= self.max_positions:
                return False, f"Max positions reached ({len(positions)}/{self.max_positions})"
        except Exception as e:
            log.error(f"Failed to check positions: {e}")
            return False, f"Position check failed: {e}"

        return True, "OK"

    def calculate_position_size(self, current_price: float) -> tuple[float, str]:
        """
        Calculate the number of shares to buy based on position sizing rules.

        Returns:
            (quantity, reason) tuple.
        """
        try:
            account = alpaca.get_account()
            equity = account["equity"]

            # Max dollar amount for this position
            max_dollars = equity * self.max_position_pct
            quantity = int(max_dollars / current_price)

            if quantity < 1:
                return 0, f"Position too small: ${max_dollars:.2f} < ${current_price:.2f}"

            log.info(
                f"Position size: {quantity} shares @ ${current_price:.2f} "
                f"= ${quantity * current_price:.2f} "
                f"({self.max_position_pct:.0%} of ${equity:,.2f})"
            )
            return quantity, "OK"

        except Exception as e:
            log.error(f"Position sizing failed: {e}")
            return 0, f"Position sizing error: {e}"

    def calculate_stops(
        self,
        entry_price: float,
        direction: str,
        ai_stop: float | None = None,
        ai_target: float | None = None,
    ) -> dict[str, float]:
        """
        Calculate stop-loss and take-profit levels.

        Uses AI-suggested levels if provided, otherwise defaults.
        """
        if direction == "long":
            stop_loss = ai_stop or round(entry_price * (1 - self.stop_loss_pct), 2)
            take_profit = ai_target or round(entry_price * (1 + self.take_profit_pct), 2)
        else:
            stop_loss = ai_stop or round(entry_price * (1 + self.stop_loss_pct), 2)
            take_profit = ai_target or round(entry_price * (1 - self.take_profit_pct), 2)

        return {
            "stop_loss": stop_loss,
            "take_profit": take_profit,
        }

    def reset_daily(self) -> None:
        """Reset daily halt flag (call at market open)."""
        self._halted = False
        log.info("Daily risk limits reset")
