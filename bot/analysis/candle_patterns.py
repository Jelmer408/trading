"""
Candlestick pattern detection engine.

Detects single-candle, double-candle, and triple-candle patterns
from OHLCV data and returns pattern signals with direction and strength.
"""

import pandas as pd
import numpy as np
from typing import Any


# ── Helpers ──────────────────────────────────────────────────

def _body(row: pd.Series) -> float:
    return abs(row["close"] - row["open"])


def _upper_shadow(row: pd.Series) -> float:
    return row["high"] - max(row["close"], row["open"])


def _lower_shadow(row: pd.Series) -> float:
    return min(row["close"], row["open"]) - row["low"]


def _range(row: pd.Series) -> float:
    return row["high"] - row["low"]


def _is_bullish(row: pd.Series) -> bool:
    return row["close"] > row["open"]


def _is_bearish(row: pd.Series) -> bool:
    return row["close"] < row["open"]


# ── Single Candle Patterns ───────────────────────────────────

def detect_doji(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect doji patterns (body < 10% of range)."""
    signals = []
    for i in range(len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue
        body_ratio = _body(row) / r

        if body_ratio < 0.1:
            upper = _upper_shadow(row)
            lower = _lower_shadow(row)

            if upper < r * 0.1:
                name = "dragonfly_doji"
            elif lower < r * 0.1:
                name = "gravestone_doji"
            elif upper > r * 0.3 and lower > r * 0.3:
                name = "long_legged_doji"
            else:
                name = "doji"

            signals.append({
                "index": i,
                "timestamp": row.get("timestamp"),
                "name": name,
                "direction": "neutral",
                "strength": 0.5,
                "details": {"body_ratio": round(body_ratio, 4)},
            })
    return signals


def detect_hammer(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect hammer (bullish) and hanging man (bearish context)."""
    signals = []
    for i in range(1, len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue

        body = _body(row)
        lower = _lower_shadow(row)
        upper = _upper_shadow(row)

        # Hammer: small body at top, long lower shadow
        if body < r * 0.35 and lower > body * 2 and upper < body * 0.5:
            # Check context: bullish after downtrend
            prev_close = df.iloc[i - 1]["close"]
            if row["close"] < prev_close:
                signals.append({
                    "index": i,
                    "timestamp": row.get("timestamp"),
                    "name": "hammer",
                    "direction": "long",
                    "strength": 0.7,
                    "details": {"lower_shadow_ratio": round(lower / r, 4)},
                })
    return signals


def detect_inverted_hammer(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect inverted hammer (bullish reversal signal)."""
    signals = []
    for i in range(1, len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue

        body = _body(row)
        upper = _upper_shadow(row)
        lower = _lower_shadow(row)

        if body < r * 0.35 and upper > body * 2 and lower < body * 0.5:
            prev_close = df.iloc[i - 1]["close"]
            if row["close"] < prev_close:
                signals.append({
                    "index": i,
                    "timestamp": row.get("timestamp"),
                    "name": "inverted_hammer",
                    "direction": "long",
                    "strength": 0.6,
                    "details": {"upper_shadow_ratio": round(upper / r, 4)},
                })
    return signals


def detect_shooting_star(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect shooting star (bearish reversal)."""
    signals = []
    for i in range(1, len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue

        body = _body(row)
        upper = _upper_shadow(row)
        lower = _lower_shadow(row)

        if body < r * 0.35 and upper > body * 2 and lower < body * 0.5:
            prev_close = df.iloc[i - 1]["close"]
            if row["close"] > prev_close:
                signals.append({
                    "index": i,
                    "timestamp": row.get("timestamp"),
                    "name": "shooting_star",
                    "direction": "short",
                    "strength": 0.7,
                    "details": {"upper_shadow_ratio": round(upper / r, 4)},
                })
    return signals


def detect_marubozu(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect marubozu (strong momentum candle, tiny shadows)."""
    signals = []
    for i in range(len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue

        body = _body(row)
        upper = _upper_shadow(row)
        lower = _lower_shadow(row)

        if body > r * 0.85 and upper < r * 0.08 and lower < r * 0.08:
            direction = "long" if _is_bullish(row) else "short"
            signals.append({
                "index": i,
                "timestamp": row.get("timestamp"),
                "name": f"{'bullish' if direction == 'long' else 'bearish'}_marubozu",
                "direction": direction,
                "strength": 0.8,
                "details": {"body_ratio": round(body / r, 4)},
            })
    return signals


def detect_spinning_top(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect spinning top (small body, shadows on both sides)."""
    signals = []
    for i in range(len(df)):
        row = df.iloc[i]
        r = _range(row)
        if r == 0:
            continue

        body = _body(row)
        upper = _upper_shadow(row)
        lower = _lower_shadow(row)

        if 0.1 < body / r < 0.35 and upper > body * 0.5 and lower > body * 0.5:
            signals.append({
                "index": i,
                "timestamp": row.get("timestamp"),
                "name": "spinning_top",
                "direction": "neutral",
                "strength": 0.4,
                "details": {"body_ratio": round(body / r, 4)},
            })
    return signals


# ── Double Candle Patterns ───────────────────────────────────

def detect_engulfing(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect bullish and bearish engulfing patterns."""
    signals = []
    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        curr = df.iloc[i]

        # Bullish engulfing: bearish candle followed by larger bullish candle
        if (
            _is_bearish(prev)
            and _is_bullish(curr)
            and curr["open"] <= prev["close"]
            and curr["close"] >= prev["open"]
            and _body(curr) > _body(prev)
        ):
            signals.append({
                "index": i,
                "timestamp": curr.get("timestamp"),
                "name": "bullish_engulfing",
                "direction": "long",
                "strength": 0.8,
                "details": {
                    "body_ratio": round(_body(curr) / _body(prev), 4)
                    if _body(prev) > 0
                    else 999,
                },
            })

        # Bearish engulfing: bullish candle followed by larger bearish candle
        if (
            _is_bullish(prev)
            and _is_bearish(curr)
            and curr["open"] >= prev["close"]
            and curr["close"] <= prev["open"]
            and _body(curr) > _body(prev)
        ):
            signals.append({
                "index": i,
                "timestamp": curr.get("timestamp"),
                "name": "bearish_engulfing",
                "direction": "short",
                "strength": 0.8,
                "details": {
                    "body_ratio": round(_body(curr) / _body(prev), 4)
                    if _body(prev) > 0
                    else 999,
                },
            })
    return signals


def detect_harami(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect bullish and bearish harami patterns."""
    signals = []
    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        curr = df.iloc[i]

        prev_body_high = max(prev["open"], prev["close"])
        prev_body_low = min(prev["open"], prev["close"])
        curr_body_high = max(curr["open"], curr["close"])
        curr_body_low = min(curr["open"], curr["close"])

        inside = curr_body_high < prev_body_high and curr_body_low > prev_body_low

        if inside and _body(curr) < _body(prev) * 0.6:
            if _is_bearish(prev) and _is_bullish(curr):
                signals.append({
                    "index": i,
                    "timestamp": curr.get("timestamp"),
                    "name": "bullish_harami",
                    "direction": "long",
                    "strength": 0.65,
                    "details": {},
                })
            elif _is_bullish(prev) and _is_bearish(curr):
                signals.append({
                    "index": i,
                    "timestamp": curr.get("timestamp"),
                    "name": "bearish_harami",
                    "direction": "short",
                    "strength": 0.65,
                    "details": {},
                })
    return signals


def detect_piercing_dark_cloud(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect piercing line (bullish) and dark cloud cover (bearish)."""
    signals = []
    for i in range(1, len(df)):
        prev = df.iloc[i - 1]
        curr = df.iloc[i]

        prev_mid = (prev["open"] + prev["close"]) / 2

        # Piercing line: bearish candle, then bullish candle opening below
        # prev close and closing above prev midpoint
        if (
            _is_bearish(prev)
            and _is_bullish(curr)
            and curr["open"] < prev["close"]
            and curr["close"] > prev_mid
            and curr["close"] < prev["open"]
        ):
            signals.append({
                "index": i,
                "timestamp": curr.get("timestamp"),
                "name": "piercing_line",
                "direction": "long",
                "strength": 0.7,
                "details": {},
            })

        # Dark cloud cover: bullish candle, then bearish candle opening above
        # prev close and closing below prev midpoint
        if (
            _is_bullish(prev)
            and _is_bearish(curr)
            and curr["open"] > prev["close"]
            and curr["close"] < prev_mid
            and curr["close"] > prev["open"]
        ):
            signals.append({
                "index": i,
                "timestamp": curr.get("timestamp"),
                "name": "dark_cloud_cover",
                "direction": "short",
                "strength": 0.7,
                "details": {},
            })
    return signals


# ── Triple Candle Patterns ───────────────────────────────────

def detect_morning_evening_star(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect morning star (bullish) and evening star (bearish)."""
    signals = []
    for i in range(2, len(df)):
        first = df.iloc[i - 2]
        second = df.iloc[i - 1]
        third = df.iloc[i]

        second_body = _body(second)
        first_body = _body(first)
        third_body = _body(third)

        # Small middle candle
        if first_body == 0 or second_body > first_body * 0.5:
            continue

        first_mid = (first["open"] + first["close"]) / 2

        # Morning star: bearish, small, bullish closing above first midpoint
        if (
            _is_bearish(first)
            and _is_bullish(third)
            and third["close"] > first_mid
            and third_body > second_body
        ):
            signals.append({
                "index": i,
                "timestamp": third.get("timestamp"),
                "name": "morning_star",
                "direction": "long",
                "strength": 0.85,
                "details": {},
            })

        # Evening star: bullish, small, bearish closing below first midpoint
        if (
            _is_bullish(first)
            and _is_bearish(third)
            and third["close"] < first_mid
            and third_body > second_body
        ):
            signals.append({
                "index": i,
                "timestamp": third.get("timestamp"),
                "name": "evening_star",
                "direction": "short",
                "strength": 0.85,
                "details": {},
            })
    return signals


def detect_three_soldiers_crows(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect three white soldiers (bullish) and three black crows (bearish)."""
    signals = []
    for i in range(2, len(df)):
        c1 = df.iloc[i - 2]
        c2 = df.iloc[i - 1]
        c3 = df.iloc[i]

        # Three white soldiers: three consecutive bullish candles with
        # higher closes and opens within previous body
        if (
            _is_bullish(c1)
            and _is_bullish(c2)
            and _is_bullish(c3)
            and c2["close"] > c1["close"]
            and c3["close"] > c2["close"]
            and c2["open"] > c1["open"]
            and c3["open"] > c2["open"]
            and _body(c1) > _range(c1) * 0.5
            and _body(c2) > _range(c2) * 0.5
            and _body(c3) > _range(c3) * 0.5
        ):
            signals.append({
                "index": i,
                "timestamp": c3.get("timestamp"),
                "name": "three_white_soldiers",
                "direction": "long",
                "strength": 0.9,
                "details": {},
            })

        # Three black crows: three consecutive bearish candles with
        # lower closes
        if (
            _is_bearish(c1)
            and _is_bearish(c2)
            and _is_bearish(c3)
            and c2["close"] < c1["close"]
            and c3["close"] < c2["close"]
            and c2["open"] < c1["open"]
            and c3["open"] < c2["open"]
            and _body(c1) > _range(c1) * 0.5
            and _body(c2) > _range(c2) * 0.5
            and _body(c3) > _range(c3) * 0.5
        ):
            signals.append({
                "index": i,
                "timestamp": c3.get("timestamp"),
                "name": "three_black_crows",
                "direction": "short",
                "strength": 0.9,
                "details": {},
            })
    return signals


# ── Master detector ──────────────────────────────────────────

ALL_DETECTORS = [
    detect_doji,
    detect_hammer,
    detect_inverted_hammer,
    detect_shooting_star,
    detect_marubozu,
    detect_spinning_top,
    detect_engulfing,
    detect_harami,
    detect_piercing_dark_cloud,
    detect_morning_evening_star,
    detect_three_soldiers_crows,
]


def detect_all_patterns(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Run all pattern detectors on a DataFrame of candles.

    Args:
        df: DataFrame with columns: open, high, low, close, volume, timestamp

    Returns:
        List of detected pattern signals, sorted by index (most recent last).
    """
    all_signals = []
    for detector in ALL_DETECTORS:
        try:
            signals = detector(df)
            all_signals.extend(signals)
        except Exception:
            pass  # Individual detector failures shouldn't crash the system

    all_signals.sort(key=lambda s: s["index"])
    return all_signals
