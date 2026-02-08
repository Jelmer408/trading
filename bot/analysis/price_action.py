"""
Price action analysis: support/resistance, trend detection, breakouts.
"""

import pandas as pd
import numpy as np
from typing import Any


# ── Support & Resistance ─────────────────────────────────────

def find_support_resistance(
    df: pd.DataFrame, window: int = 20, tolerance_pct: float = 0.005
) -> dict[str, list[float]]:
    """
    Find support and resistance levels by detecting swing highs/lows.

    Args:
        df: DataFrame with OHLCV data.
        window: Lookback for swing detection.
        tolerance_pct: Percentage tolerance for clustering levels.

    Returns:
        Dict with 'support' and 'resistance' price levels.
    """
    highs = df["high"].values
    lows = df["low"].values

    swing_highs = []
    swing_lows = []

    half = window // 2
    for i in range(half, len(df) - half):
        # Swing high: highest in window
        if highs[i] == max(highs[i - half : i + half + 1]):
            swing_highs.append(highs[i])
        # Swing low: lowest in window
        if lows[i] == min(lows[i - half : i + half + 1]):
            swing_lows.append(lows[i])

    # Cluster nearby levels
    resistance = _cluster_levels(swing_highs, tolerance_pct)
    support = _cluster_levels(swing_lows, tolerance_pct)

    return {"support": support, "resistance": resistance}


def _cluster_levels(levels: list[float], tolerance_pct: float) -> list[float]:
    """Cluster nearby price levels into zones."""
    if not levels:
        return []

    sorted_levels = sorted(levels)
    clusters: list[list[float]] = [[sorted_levels[0]]]

    for level in sorted_levels[1:]:
        cluster_avg = np.mean(clusters[-1])
        if abs(level - cluster_avg) / cluster_avg < tolerance_pct:
            clusters[-1].append(level)
        else:
            clusters.append([level])

    # Return the average of each cluster, weighted by count (stronger if tested more)
    return [round(float(np.mean(c)), 2) for c in clusters if len(c) >= 2]


# ── Trend Detection ──────────────────────────────────────────

def detect_trend(df: pd.DataFrame, lookback: int = 20) -> dict[str, Any]:
    """
    Detect the current trend using higher highs/lows analysis.

    Returns:
        Dict with 'trend' ('uptrend', 'downtrend', 'sideways'),
        'strength' (0-1), and details.
    """
    if len(df) < lookback:
        return {"trend": "sideways", "strength": 0.0, "details": {}}

    recent = df.tail(lookback)
    highs = recent["high"].values
    lows = recent["low"].values

    # Count higher highs and higher lows
    hh_count = sum(1 for i in range(1, len(highs)) if highs[i] > highs[i - 1])
    hl_count = sum(1 for i in range(1, len(lows)) if lows[i] > lows[i - 1])
    lh_count = sum(1 for i in range(1, len(highs)) if highs[i] < highs[i - 1])
    ll_count = sum(1 for i in range(1, len(lows)) if lows[i] < lows[i - 1])

    total = lookback - 1
    uptrend_score = (hh_count + hl_count) / (2 * total)
    downtrend_score = (lh_count + ll_count) / (2 * total)

    if uptrend_score > 0.6:
        trend = "uptrend"
        strength = min(uptrend_score, 1.0)
    elif downtrend_score > 0.6:
        trend = "downtrend"
        strength = min(downtrend_score, 1.0)
    else:
        trend = "sideways"
        strength = 1.0 - abs(uptrend_score - downtrend_score)

    return {
        "trend": trend,
        "strength": round(strength, 3),
        "details": {
            "higher_highs": hh_count,
            "higher_lows": hl_count,
            "lower_highs": lh_count,
            "lower_lows": ll_count,
        },
    }


# ── Breakout Detection ───────────────────────────────────────

def detect_breakout(
    df: pd.DataFrame,
    support_resistance: dict[str, list[float]] | None = None,
    volume_multiplier: float = 1.5,
) -> list[dict[str, Any]]:
    """
    Detect price breakouts above resistance or below support.

    Args:
        df: DataFrame with OHLCV data.
        support_resistance: Pre-computed S/R levels (or computed fresh).
        volume_multiplier: Volume must be this much above average for confirmation.

    Returns:
        List of breakout signals.
    """
    if support_resistance is None:
        support_resistance = find_support_resistance(df)

    if len(df) < 2:
        return []

    signals = []
    curr = df.iloc[-1]
    prev = df.iloc[-2]
    avg_volume = df["volume"].tail(20).mean()

    volume_confirmed = curr["volume"] > avg_volume * volume_multiplier

    # Breakout above resistance
    for level in support_resistance.get("resistance", []):
        if prev["close"] < level and curr["close"] > level:
            signals.append({
                "index": len(df) - 1,
                "timestamp": curr.get("timestamp"),
                "name": "breakout_above_resistance",
                "direction": "long",
                "strength": 0.8 if volume_confirmed else 0.5,
                "details": {
                    "level": level,
                    "volume_confirmed": volume_confirmed,
                },
            })

    # Breakdown below support
    for level in support_resistance.get("support", []):
        if prev["close"] > level and curr["close"] < level:
            signals.append({
                "index": len(df) - 1,
                "timestamp": curr.get("timestamp"),
                "name": "breakdown_below_support",
                "direction": "short",
                "strength": 0.8 if volume_confirmed else 0.5,
                "details": {
                    "level": level,
                    "volume_confirmed": volume_confirmed,
                },
            })

    return signals


# ── Volume Analysis ──────────────────────────────────────────

def analyze_volume(df: pd.DataFrame, lookback: int = 20) -> dict[str, Any]:
    """Analyze volume relative to recent average."""
    if len(df) < lookback:
        return {"relative_volume": 1.0, "trend": "normal"}

    avg_vol = df["volume"].tail(lookback).mean()
    current_vol = df.iloc[-1]["volume"]

    if avg_vol == 0:
        return {"relative_volume": 0.0, "trend": "no_volume"}

    relative = current_vol / avg_vol

    if relative > 2.0:
        trend = "very_high"
    elif relative > 1.5:
        trend = "high"
    elif relative > 0.7:
        trend = "normal"
    else:
        trend = "low"

    return {
        "relative_volume": round(relative, 2),
        "trend": trend,
        "current": int(current_vol),
        "average": int(avg_vol),
    }


# ── Master Analysis ──────────────────────────────────────────

def analyze_price_action(df: pd.DataFrame) -> dict[str, Any]:
    """
    Run full price action analysis on a DataFrame.

    Returns a dict with trend, support/resistance, breakouts, and volume.
    """
    sr = find_support_resistance(df)
    trend = detect_trend(df)
    breakouts = detect_breakout(df, sr)
    volume = analyze_volume(df)

    return {
        "trend": trend,
        "support_resistance": sr,
        "breakouts": breakouts,
        "volume": volume,
    }
