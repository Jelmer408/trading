"""
Main candle trading strategy: orchestrates analysis, AI evaluation, and execution.
"""

import pandas as pd
from typing import Any

from bot.config import config
from bot.analysis.signals import analyze_symbol
from bot.data import pluse_client as pluse
from bot.data import supabase_client as db
from bot.ai.analyst import evaluate_signal
from bot.strategy.risk_manager import RiskManager
from bot.execution import order_manager
from bot.utils.logger import log
from bot.utils import activity


class CandleStrategy:
    """
    Candlestick pattern trading strategy.

    Flow per bar:
    1. Get recent candles from Supabase
    2. Run pattern detection + price action + indicators
    3. If actionable signal found, fetch PlusE data
    4. Ask AI to evaluate
    5. If AI says go, risk-check and execute
    """

    def __init__(self, risk_manager: RiskManager):
        self.risk = risk_manager

    async def on_bar(self, bar: dict) -> dict[str, Any] | None:
        """
        Process a new bar and potentially enter a trade.

        Args:
            bar: OHLCV bar data from Alpaca stream.

        Returns:
            Trade result dict if a trade was entered, else None.
        """
        symbol = bar["symbol"]

        # 1. Get recent candles from Supabase for analysis
        candles = db.get_candles(symbol, config.TIMEFRAME, limit=100)
        if len(candles) < 20:
            return None

        df = pd.DataFrame(candles)
        for col in ("open", "high", "low", "close"):
            df[col] = df[col].astype(float)
        df["volume"] = df["volume"].astype(int)

        # 2. Run full analysis
        analysis = analyze_symbol(df, symbol)
        signal = analysis.get("signal")

        if not signal or not signal.get("actionable"):
            return None

        log.info(
            f"Actionable signal on {symbol}: {signal['direction']} "
            f"({signal['pattern']}) strength={signal['strength']}"
        )

        # Log pattern detection
        activity.pattern_detected(
            symbol=symbol,
            pattern=signal["pattern"],
            direction=signal["direction"],
            strength=signal["strength"],
        )

        # Write signal to DB for dashboard
        signal_id = db.insert_signal(
            symbol=symbol,
            timeframe=config.TIMEFRAME,
            timestamp=bar["timestamp"],
            signal_type="combined",
            name=signal["pattern"],
            direction=signal["direction"],
            strength=signal["strength"],
            details={
                "confirmations": signal.get("confirmations", []),
                "indicators": analysis.get("indicators", {}),
            },
        )

        # 3. Risk check
        can_trade, reason = self.risk.check_can_trade()
        if not can_trade:
            log.info(f"Risk manager blocked trade on {symbol}: {reason}")
            return None

        current_price = bar["close"]

        # 4. Fetch PlusE data for AI context
        pluse_data = None
        try:
            pluse_data = await pluse.get_full_analysis(symbol)
        except Exception as e:
            log.warning(f"PlusE data unavailable for {symbol}: {e}")

        # 5. AI evaluation
        try:
            ai_decision = await evaluate_signal(
                symbol=symbol,
                signal=signal,
                price_action=analysis["price_action"],
                indicators=analysis["indicators"],
                pluse_data=pluse_data,
                current_price=current_price,
            )
        except Exception as e:
            log.error(f"AI evaluation failed for {symbol}: {e}")
            return None

        decision = ai_decision.get("decision", "skip")
        confidence = ai_decision.get("confidence", 0)

        if decision == "skip" or confidence < 0.6:
            log.info(
                f"AI skipped {symbol}: {ai_decision.get('reasoning', 'no reason')}"
            )
            return None

        # 6. Position sizing
        quantity, size_reason = self.risk.calculate_position_size(current_price)
        if quantity < 1:
            log.info(f"Position too small for {symbol}: {size_reason}")
            return None

        # 7. Calculate stops
        direction = "long" if decision == "enter_long" else "short"
        stops = self.risk.calculate_stops(
            entry_price=current_price,
            direction=direction,
            ai_stop=ai_decision.get("stop_loss"),
            ai_target=ai_decision.get("take_profit"),
        )

        # 8. Execute
        trade = await order_manager.enter_position(
            symbol=symbol,
            direction=direction,
            quantity=quantity,
            entry_price=current_price,
            stop_loss=stops["stop_loss"],
            take_profit=stops["take_profit"],
            signal_id=signal_id,
            ai_reasoning=ai_decision.get("reasoning"),
        )

        if trade:
            activity.trade_executed(
                symbol=symbol,
                side=direction,
                qty=quantity,
                price=current_price,
            )
            # Store news from PlusE if available
            if pluse_data and pluse_data.get("news_sentiment"):
                try:
                    db.insert_news({
                        "symbol": symbol,
                        "headline": f"AI Trade Signal: {signal['pattern']}",
                        "summary": pluse_data["news_sentiment"][:500],
                        "sentiment": signal["direction"],
                        "source": "pluse_finance",
                    })
                except Exception:
                    pass

        return trade
