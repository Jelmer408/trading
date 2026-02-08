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
from bot.utils import activity
from bot.data import supabase_client as db
from bot.data import alpaca_client as alpaca
from bot.data.alpaca_stream import AlpacaBarStream
from bot.data import news_scanner
from bot.strategy.risk_manager import RiskManager
from bot.strategy.candle_strategy import CandleStrategy
from bot.strategy.watchlist_manager import update_watchlist
from bot.ai.news_analyst import analyze_news_batch
from bot.execution import position_tracker
from bot.utils.status_server import start_status_server, update_state, increment_state, push_log


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
        update_state(last_error=str(e))
        return

    increment_state("bars_received")
    update_state(last_bar_time=f"{symbol} @ {timestamp}")
    push_log(f"BAR {symbol} O={bar['open']:.2f} H={bar['high']:.2f} L={bar['low']:.2f} C={bar['close']:.2f} V={bar['volume']}")

    # Run the strategy (pattern detection -> AI -> execution)
    try:
        trade = await _strategy.on_bar(bar)
        if trade:
            log.info(f"Trade executed: {trade}")
            increment_state("trades_placed")
            push_log(f"TRADE {trade}")
    except Exception as e:
        log.error(f"Strategy error on {symbol}: {e}")
        update_state(last_error=str(e))


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

            update_state(
                equity=account["equity"],
                cash=account["cash"],
                buying_power=account["buying_power"],
                day_pnl=account["day_pnl"],
                open_positions=len(positions),
            )

            log.info(
                f"Snapshot: equity=${account['equity']:,.2f} "
                f"cash=${account['cash']:,.2f} "
                f"day_pnl=${account['day_pnl']:+,.2f} "
                f"positions={len(positions)}"
            )
        except Exception as e:
            log.error(f"Snapshot failed: {e}")
            update_state(last_error=str(e))

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


# ── Dynamic watchlist scan loop ──────────────────────────────

_stream_ref: AlpacaBarStream | None = None


async def watchlist_scan_loop() -> None:
    """Periodically scan Reddit + News for trending stocks and update watchlist."""
    global _stream_ref

    # Wait a bit after startup before first scan
    try:
        await asyncio.wait_for(_shutdown.wait(), timeout=60)
        return
    except asyncio.TimeoutError:
        pass

    while not _shutdown.is_set():
        try:
            new_watchlist = await update_watchlist()

            # Update the stream subscriptions if watchlist changed
            if _stream_ref:
                _stream_ref.update_symbols(new_watchlist)

            # Backfill candles for any newly added symbols
            current_symbols = set(config.WATCHLIST)
            new_symbols = set(new_watchlist) - current_symbols
            for symbol in new_symbols:
                try:
                    bars = alpaca.get_historical_bars(
                        symbol=symbol,
                        timeframe=config.TIMEFRAME,
                        limit=100,
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
                    log.info(f"  Backfilled {len(bars)} candles for new symbol {symbol}")
                except Exception as e:
                    log.warning(f"  Failed to backfill {symbol}: {e}")

            update_state(
                watchlist=new_watchlist,
                watchlist_size=len(new_watchlist),
                last_watchlist_scan=datetime.now(timezone.utc).isoformat(),
            )
            push_log(f"WATCHLIST SCAN: {len(new_watchlist)} symbols active → {', '.join(new_watchlist)}")
            log.info(f"Active watchlist: {', '.join(new_watchlist)}")

        except Exception as e:
            log.error(f"Watchlist scan failed: {e}")
            activity.error("scanner", "Watchlist scan failed", str(e))
            update_state(last_error=f"Watchlist scan: {e}")

        # Flush activity events to Supabase
        await activity.flush()

        # Scan every 15 minutes
        try:
            await asyncio.wait_for(_shutdown.wait(), timeout=900)
            break
        except asyncio.TimeoutError:
            pass


# ── News analysis loop (Gemini Flash) ────────────────────────

async def news_analysis_loop() -> None:
    """Periodically analyze news with Gemini Flash for market intelligence."""
    # Wait 90s after startup before first analysis
    try:
        await asyncio.wait_for(_shutdown.wait(), timeout=90)
        return
    except asyncio.TimeoutError:
        pass

    while not _shutdown.is_set():
        try:
            activity.emit(
                event_type="news_cycle",
                agent="news_ai",
                title="Starting news analysis cycle",
                level="info",
            )
            push_log("NEWS AI: Starting Gemini Flash analysis cycle...")

            # Fetch fresh news headlines
            raw_news = await news_scanner.scan_news(hours_back=6, limit=30)

            # Build headline list for Gemini Flash
            headlines = []
            for item in raw_news:
                sym = item["symbol"]
                for h in item.get("headlines", []):
                    headlines.append({
                        "symbol": sym,
                        "headline": h,
                        "source": "alpaca",
                    })

            if headlines:
                result = await analyze_news_batch(headlines)
                if result:
                    mood = result.get("market_mood", "unknown")
                    alerts = result.get("alerts", [])
                    push_log(
                        f"NEWS AI: {mood.upper()} mood, {len(alerts)} alerts — "
                        f"{result.get('summary', '')[:100]}"
                    )
            else:
                activity.emit(
                    event_type="news_cycle",
                    agent="news_ai",
                    title="No headlines to analyze",
                    level="warn",
                )

            await activity.flush()

        except Exception as e:
            log.error(f"News analysis loop failed: {e}")
            activity.error("news_ai", "News analysis cycle failed", str(e))

        # Run every 10 minutes
        try:
            await asyncio.wait_for(_shutdown.wait(), timeout=600)
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
    import time

    log.info("=" * 60)
    log.info("  Autonomous Candle Trading Bot")
    log.info(f"  Watchlist: {', '.join(config.WATCHLIST)}")
    log.info(f"  Timeframe: {config.TIMEFRAME}")
    log.info(f"  Paper mode: {config.ALPACA_PAPER}")
    log.info("=" * 60)

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    # Start status web server IMMEDIATELY so Fly.io proxy can detect it
    update_state(
        started_at=time.time(),
        watchlist=config.WATCHLIST,
        timeframe=config.TIMEFRAME,
        paper=config.ALPACA_PAPER,
        max_position_pct=config.MAX_POSITION_PCT,
        max_positions=config.MAX_POSITIONS,
        stop_loss_pct=config.STOP_LOSS_PCT,
        take_profit_pct=config.TAKE_PROFIT_PCT,
        daily_loss_limit_pct=config.DAILY_LOSS_LIMIT_PCT,
        gemini_active=bool(config.GEMINI_API_KEY),
        claude_active=bool(config.ANTHROPIC_API_KEY),
    )
    await start_status_server(port=8080)
    log.info("Status page running on port 8080")

    # Verify connections
    try:
        account = alpaca.get_account()
        log.info(
            f"Alpaca connected: equity=${account['equity']:,.2f} "
            f"buying_power=${account['buying_power']:,.2f}"
        )
        update_state(
            equity=account["equity"],
            cash=account["cash"],
            buying_power=account["buying_power"],
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
    global _stream_ref
    stream = AlpacaBarStream(symbols=config.WATCHLIST, on_bar=on_bar)
    _stream_ref = stream

    tasks = [
        asyncio.create_task(stream.start(), name="bar_stream"),
        asyncio.create_task(snapshot_loop(), name="snapshot_loop"),
        asyncio.create_task(watchlist_scan_loop(), name="watchlist_scan"),
        asyncio.create_task(news_analysis_loop(), name="news_analysis"),
    ]

    log.info("Bot is running. Waiting for bars...")

    # Wait for shutdown signal
    await _shutdown.wait()
    log.info("Shutting down...")

    await activity.flush()
    stream.stop()
    for task in tasks:
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)
    log.info("Bot stopped.")


if __name__ == "__main__":
    asyncio.run(main())
