"""
Signal aggregation: combines candle patterns, price action, and indicators
into a single scored signal.
"""

import pandas as pd
from typing import Any

from bot.analysis.candle_patterns import detect_all_patterns
from bot.analysis.price_action import analyze_price_action
from bot.analysis.indicators import add_all_indicators, get_indicator_summary


def analyze_symbol(df: pd.DataFrame, symbol: str) -> dict[str, Any]:
    """
    Run full analysis on a symbol's candle data.

    Args:
        df: DataFrame with OHLCV data (columns: open, high, low, close, volume, timestamp).
        symbol: The ticker symbol.

    Returns:
        Dict with all analysis results and a combined signal.
    """
    if len(df) < 5:
        return {
            "symbol": symbol,
            "signal": None,
            "patterns": [],
            "price_action": {},
            "indicators": {},
        }

    # Run all analysis
    patterns = detect_all_patterns(df)
    price_action = analyze_price_action(df)

    df_with_indicators = add_all_indicators(df)
    indicator_summary = get_indicator_summary(df_with_indicators)

    # Get only the most recent patterns (last candle)
    last_idx = len(df) - 1
    recent_patterns = [p for p in patterns if p["index"] >= last_idx - 1]

    # Build combined signal
    combined = _build_combined_signal(
        recent_patterns, price_action, indicator_summary
    )

    return {
        "symbol": symbol,
        "signal": combined,
        "patterns": recent_patterns,
        "price_action": price_action,
        "indicators": indicator_summary,
    }


def _build_combined_signal(
    patterns: list[dict],
    price_action: dict[str, Any],
    indicators: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Combine all signal sources into a single directional signal.

    Returns None if no actionable signal, or a dict with direction and strength.
    """
    if not patterns:
        return None

    # Start with the strongest pattern signal
    best_pattern = max(patterns, key=lambda p: p["strength"])
    direction = best_pattern["direction"]

    if direction == "neutral":
        return None

    # Base strength from pattern
    strength = best_pattern["strength"]
    confirmations = [best_pattern["name"]]

    # Trend alignment bonus/penalty
    trend = price_action.get("trend", {})
    trend_dir = trend.get("trend", "sideways")

    if direction == "long" and trend_dir == "uptrend":
        strength += 0.1
        confirmations.append("trend_aligned")
    elif direction == "short" and trend_dir == "downtrend":
        strength += 0.1
        confirmations.append("trend_aligned")
    elif (direction == "long" and trend_dir == "downtrend") or (
        direction == "short" and trend_dir == "uptrend"
    ):
        strength -= 0.15  # Counter-trend penalty
        confirmations.append("counter_trend")

    # Volume confirmation
    volume = price_action.get("volume", {})
    if volume.get("trend") in ("high", "very_high"):
        strength += 0.1
        confirmations.append("volume_confirmed")

    # Momentum confirmation (RSI + MACD + EMA grouped as one signal)
    # These indicators are highly correlated -- count them as a single
    # "momentum" factor instead of triple-counting the same information.
    rsi = indicators.get("rsi", {})
    macd = indicators.get("macd", {})
    ema = indicators.get("ema_cross", {})

    momentum_votes = 0
    momentum_details = []

    rsi_signal = rsi.get("signal", "neutral")
    if (direction == "long" and rsi_signal == "oversold") or \
       (direction == "short" and rsi_signal == "overbought"):
        momentum_votes += 1
        momentum_details.append(f"rsi_{rsi_signal}")

    macd_signal = macd.get("signal", "neutral")
    if (direction == "long" and macd_signal == "bullish") or \
       (direction == "short" and macd_signal == "bearish"):
        momentum_votes += 1
        momentum_details.append(f"macd_{macd_signal}")

    ema_signal = ema.get("signal", "neutral")
    if (direction == "long" and ema_signal == "bullish") or \
       (direction == "short" and ema_signal == "bearish"):
        momentum_votes += 1
        momentum_details.append(f"ema_{ema_signal}")

    # Award a single momentum bonus based on consensus (max +0.15)
    if momentum_votes >= 2:
        strength += 0.15
        confirmations.append("momentum_confirmed")
        confirmations.extend(momentum_details)
    elif momentum_votes == 1:
        strength += 0.05
        confirmations.extend(momentum_details)

    # Breakout bonus
    breakouts = price_action.get("breakouts", [])
    for bo in breakouts:
        if bo["direction"] == direction:
            strength += 0.15
            confirmations.append(bo["name"])

    # Clamp strength
    strength = round(min(max(strength, 0.0), 1.0), 3)

    return {
        "direction": direction,
        "strength": strength,
        "pattern": best_pattern["name"],
        "confirmations": confirmations,
        "actionable": strength >= 0.6,
    }
