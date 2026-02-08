"""
Technical indicators: RSI, MACD, EMA, VWAP, Bollinger Bands.
Uses the `ta` library for calculation.
"""

import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator, SMAIndicator
from ta.volatility import BollingerBands
from typing import Any


def add_rsi(df: pd.DataFrame, period: int = 14) -> pd.DataFrame:
    """Add RSI column to the DataFrame."""
    indicator = RSIIndicator(close=df["close"], window=period)
    df[f"rsi_{period}"] = indicator.rsi()
    return df


def add_macd(
    df: pd.DataFrame,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> pd.DataFrame:
    """Add MACD, signal, and histogram columns."""
    indicator = MACD(
        close=df["close"],
        window_fast=fast,
        window_slow=slow,
        window_sign=signal,
    )
    df["macd"] = indicator.macd()
    df["macd_signal"] = indicator.macd_signal()
    df["macd_hist"] = indicator.macd_diff()
    return df


def add_ema(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Add EMA column."""
    indicator = EMAIndicator(close=df["close"], window=period)
    df[f"ema_{period}"] = indicator.ema_indicator()
    return df


def add_sma(df: pd.DataFrame, period: int = 50) -> pd.DataFrame:
    """Add SMA column."""
    indicator = SMAIndicator(close=df["close"], window=period)
    df[f"sma_{period}"] = indicator.sma_indicator()
    return df


def add_bollinger_bands(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """Add Bollinger Band columns (upper, middle, lower)."""
    indicator = BollingerBands(close=df["close"], window=period)
    df["bb_upper"] = indicator.bollinger_hband()
    df["bb_middle"] = indicator.bollinger_mavg()
    df["bb_lower"] = indicator.bollinger_lband()
    return df


def add_vwap(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate VWAP from OHLCV data."""
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    cum_tp_vol = (typical_price * df["volume"]).cumsum()
    cum_vol = df["volume"].cumsum()
    df["vwap_calc"] = cum_tp_vol / cum_vol.replace(0, float("nan"))
    return df


def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add a standard set of indicators to the DataFrame."""
    df = df.copy()
    df = add_rsi(df, 14)
    df = add_macd(df)
    df = add_ema(df, 9)
    df = add_ema(df, 20)
    df = add_sma(df, 50)
    df = add_bollinger_bands(df, 20)
    df = add_vwap(df)
    return df


def get_indicator_summary(df: pd.DataFrame) -> dict[str, Any]:
    """
    Get a summary of current indicator values from the last row.
    Assumes indicators have already been added.
    """
    if len(df) == 0:
        return {}

    last = df.iloc[-1]
    summary = {}

    # RSI
    if "rsi_14" in df.columns and pd.notna(last.get("rsi_14")):
        rsi = last["rsi_14"]
        summary["rsi"] = {
            "value": round(rsi, 2),
            "signal": "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral",
        }

    # MACD
    if "macd" in df.columns and pd.notna(last.get("macd")):
        summary["macd"] = {
            "value": round(last["macd"], 4),
            "signal_line": round(last["macd_signal"], 4) if pd.notna(last.get("macd_signal")) else None,
            "histogram": round(last["macd_hist"], 4) if pd.notna(last.get("macd_hist")) else None,
            "signal": "bullish" if last["macd"] > last.get("macd_signal", 0) else "bearish",
        }

    # EMA crossover
    if "ema_9" in df.columns and "ema_20" in df.columns:
        if pd.notna(last.get("ema_9")) and pd.notna(last.get("ema_20")):
            summary["ema_cross"] = {
                "ema_9": round(last["ema_9"], 2),
                "ema_20": round(last["ema_20"], 2),
                "signal": "bullish" if last["ema_9"] > last["ema_20"] else "bearish",
            }

    # Bollinger Bands
    if "bb_upper" in df.columns and pd.notna(last.get("bb_upper")):
        close = last["close"]
        summary["bollinger"] = {
            "upper": round(last["bb_upper"], 2),
            "middle": round(last["bb_middle"], 2),
            "lower": round(last["bb_lower"], 2),
            "signal": (
                "overbought"
                if close > last["bb_upper"]
                else "oversold"
                if close < last["bb_lower"]
                else "neutral"
            ),
        }

    # Price vs VWAP
    if "vwap_calc" in df.columns and pd.notna(last.get("vwap_calc")):
        summary["vwap"] = {
            "value": round(last["vwap_calc"], 2),
            "signal": "above" if last["close"] > last["vwap_calc"] else "below",
        }

    return summary
