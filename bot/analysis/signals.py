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

    # RSI confirmation
    rsi = indicators.get("rsi", {})
    rsi_signal = rsi.get("signal", "neutral")
    if direction == "long" and rsi_signal == "oversold":
        strength += 0.1
        confirmations.append("rsi_oversold")
    elif direction == "short" and rsi_signal == "overbought":
        strength += 0.1
        confirmations.append("rsi_overbought")

    # MACD confirmation
    macd = indicators.get("macd", {})
    macd_signal = macd.get("signal", "neutral")
    if direction == "long" and macd_signal == "bullish":
        strength += 0.05
        confirmations.append("macd_bullish")
    elif direction == "short" and macd_signal == "bearish":
        strength += 0.05
        confirmations.append("macd_bearish")

    # EMA crossover confirmation
    ema = indicators.get("ema_cross", {})
    ema_signal = ema.get("signal", "neutral")
    if direction == "long" and ema_signal == "bullish":
        strength += 0.05
        confirmations.append("ema_bullish")
    elif direction == "short" and ema_signal == "bearish":
        strength += 0.05
        confirmations.append("ema_bearish")

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
