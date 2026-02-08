"""
Autonomous Candle Trading Bot - Entry Point

Connects to Alpaca WebSocket for real-time bars, detects candle patterns,
evaluates signals with AI, and executes trades autonomously.
"""

import asyncio
import signal
import sys
from datetime import datetime, timezone

from bot.config import config
from bot.utils.logger import log
from bot.data import supabase_client as db
from bot.data import alpaca_client as alpaca
from bot.data.alpaca_stream import AlpacaBarStream
from bot.strategy.risk_manager import RiskManager
from bot.strategy.candle_strategy import CandleStrategy
from bot.execution import position_tracker


# ── Global state ─────────────────────────────────────────────

_shutdown = asyncio.Event()
_risk_manager = RiskManager()
_strategy = CandleStrategy(_risk_manager)


def _signal_handler(sig, frame):
    log.info(f"Received signal {sig}, shutting down...")
    _shutdown.set()


# ── Bar handler ──────────────────────────────────────────────

async def on_bar(bar: dict) -> None:
    """
    Called for every new bar from the Alpaca WebSocket.
    This is the core event loop: write candle, detect patterns, decide, execute.
    """
    symbol = bar["symbol"]
    timestamp = bar["timestamp"]

    # Write candle to Supabase for dashboard charting
    try:
        db.upsert_candle(
            symbol=symbol,
            timeframe=config.TIMEFRAME,
            timestamp=timestamp,
            open_=bar["open"],
            high=bar["high"],
            low=bar["low"],
            close=bar["close"],
            volume=bar["volume"],
            vwap=bar.get("vwap"),
        )
    except Exception as e:
        log.error(f"Failed to write candle for {symbol}: {e}")
        return

    # Run the strategy (pattern detection -> AI -> execution)
    try:
        trade = await _strategy.on_bar(bar)
        if trade:
            log.info(f"Trade executed: {trade}")
    except Exception as e:
        log.error(f"Strategy error on {symbol}: {e}")


# ── Account snapshot loop ────────────────────────────────────

async def snapshot_loop() -> None:
    """Periodically snapshot the account balance for the equity curve."""
    while not _shutdown.is_set():
        try:
            account = alpaca.get_account()
            positions = alpaca.get_positions()

            db.insert_account_snapshot(
                equity=account["equity"],
                cash=account["cash"],
                buying_power=account["buying_power"],
                day_pnl=account["day_pnl"],
                day_pnl_pct=account["day_pnl_pct"],
                open_positions=len(positions),
            )

            # Sync positions to Supabase
            for pos in positions:
                db.upsert_position(pos)

            log.info(
                f"Snapshot: equity=${account['equity']:,.2f} "
                f"cash=${account['cash']:,.2f} "
                f"day_pnl=${account['day_pnl']:+,.2f} "
                f"positions={len(positions)}"
            )
        except Exception as e:
            log.error(f"Snapshot failed: {e}")

        # Check positions for stop-loss / take-profit hits
        try:
            await position_tracker.check_positions()
        except Exception as e:
            log.error(f"Position check failed: {e}")

        # Wait 30 seconds before next check
        try:
            await asyncio.wait_for(_shutdown.wait(), timeout=30)
            break
        except asyncio.TimeoutError:
            pass


# ── Backfill historical candles ──────────────────────────────

def backfill_candles() -> None:
    """Load recent historical candles into Supabase on startup."""
    log.info("Backfilling historical candles...")
    for symbol in config.WATCHLIST:
        try:
            bars = alpaca.get_historical_bars(
                symbol=symbol,
                timeframe=config.TIMEFRAME,
                limit=200,
            )
            for bar in bars:
                db.upsert_candle(
                    symbol=symbol,
                    timeframe=config.TIMEFRAME,
                    timestamp=bar["timestamp"],
                    open_=bar["open"],
                    high=bar["high"],
                    low=bar["low"],
                    close=bar["close"],
                    volume=bar["volume"],
                    vwap=bar.get("vwap"),
                )
            log.info(f"  {symbol}: {len(bars)} candles loaded")
        except Exception as e:
            log.error(f"  {symbol}: backfill failed - {e}")


# ── Main ─────────────────────────────────────────────────────

async def main() -> None:
    """Boot the trading bot."""
    log.info("=" * 60)
    log.info("  Autonomous Candle Trading Bot")
    log.info(f"  Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"  Timeframe: {config.TIMEFRAME}")
    log.info(f"  Paper mode: {config.ALPACA_PAPER}")
    log.info("=" * 60)

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # Verify connections
    try:
        account = alpaca.get_account()
        log.info(
            f"Alpaca connected: equity=${account['equity']:,.2f} "
            f"buying_power=${account['buying_power']:,.2f}"
        )
    except Exception as e:
        log.error(f"Alpaca connection failed: {e}")
        sys.exit(1)

    try:
        db.get_client()
        log.info("Supabase connected")
    except Exception as e:
        log.error(f"Supabase connection failed: {e}")
        sys.exit(1)

    # Backfill historical data
    backfill_candles()

    # Start background tasks
    stream = AlpacaBarStream(symbols=config.WATCHLIST, on_bar=on_bar)

    tasks = [
        asyncio.create_task(stream.start(), name="bar_stream"),
        asyncio.create_task(snapshot_loop(), name="snapshot_loop"),
    ]

    log.info("Bot is running. Waiting for bars...")

    # Wait for shutdown signal
    await _shutdown.wait()
    log.info("Shutting down...")

    stream.stop()
    for task in tasks:
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    log.info("Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
