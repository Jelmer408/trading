"""Structured logging for the trading bot."""

import logging
import sys
from datetime import datetime, timezone


def setup_logger(name: str = "trade-bot", level: int = logging.INFO) -> logging.Logger:
    """Create a structured logger with timestamp and level formatting."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    fmt = logging.Formatter(
        "[%(asctime)s] %(levelname)-8s %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(fmt)
    logger.addHandler(handler)

    return logger


log = setup_logger()


def log_trade(action: str, symbol: str, details: str = "") -> None:
    """Log a trade-specific event."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    log.info(f"[TRADE {ts}] {action} {symbol} {details}")


def log_signal(signal_type: str, symbol: str, direction: str, strength: float) -> None:
    """Log a detected signal."""
    log.info(
        f"[SIGNAL] {signal_type} on {symbol} | {direction} | strength={strength:.2f}"
    )
