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
from bot.strategy.watchlist_manager import update_watchlist, reassess_watchlist, needs_reassessment, evaluate_news_candidates
from bot.ai.news_analyst import analyze_news_batch
from bot.ai.fundamental_analyst import analyze_watchlist
from bot.execution import position_tracker
from bot.execution import order_manager
from bot.utils.status_server import start_status_server, update_state, increment_state, push_log, set_rescan_callback


# ── Global state ─────────────────────────────────────────────

_shutdown = asyncio.Event()
_risk_manager = RiskManager()
_strategy = CandleStrategy(_risk_manager)


def _signal_handler(sig, frame):
    log.info(f"Received signal {sig}, shutting down...")
    _shutdown.set()


# ── Manual rescan ─────────────────────────────────────────────

async def rescan_symbol(symbol: str) -> dict:
    """
    Force a manual rescan for a symbol using latest candle data from Supabase.
    Returns a summary dict of what happened.
    """
    log.info(f"Manual rescan triggered for {symbol}")
    push_log(f"RESCAN {symbol} (manual)")

    # Fetch latest candles from Supabase
    candles = db.get_candles(symbol, config.TIMEFRAME, limit=100)
    if not candles or len(candles) < 20:
        return {"status": "skipped", "reason": f"Only {len(candles)} candles available, need 20+"}

    latest = candles[-1]

    # Build a synthetic bar from the most recent candle
    bar = {
        "symbol": symbol,
        "timestamp": latest["timestamp"],
        "open": float(latest["open"]),
        "high": float(latest["high"]),
        "low": float(latest["low"]),
        "close": float(latest["close"]),
        "volume": int(latest["volume"]),
        "vwap": float(latest.get("vwap") or latest["close"]),
    }

    try:
        trade = await _strategy.on_bar(bar)
        if trade:
            increment_state("trades_placed")
            push_log(f"RESCAN TRADE {trade}")
            return {"status": "trade_executed", "trade": str(trade)}
        else:
            return {"status": "no_trade", "reason": "AI or strategy declined"}
    except Exception as e:
        log.error(f"Rescan error for {symbol}: {e}")
        return {"status": "error", "reason": str(e)}


# ── Order status sync ─────────────────────────────────────────

async def _sync_order_statuses() -> None:
    """Sync pending/filled trade statuses from Alpaca back to Supabase."""
    open_trades = db.get_open_trades()
    if not open_trades:
        return

    # Get current Alpaca positions to detect bracket SL/TP fills
    try:
        alpaca_positions = await asyncio.to_thread(alpaca.get_positions)
        position_symbols = {p["symbol"] for p in alpaca_positions}
    except Exception:
        position_symbols = None  # Fall back to order-only sync

    for trade in open_trades:
        order_id = trade.get("alpaca_order_id")
        if not order_id:
            continue
        try:
            order = await asyncio.to_thread(alpaca.get_order, order_id)
            alpaca_status = order.get("status", "")

            # Map Alpaca statuses to our trade statuses
            if alpaca_status == "filled" and trade["status"] == "pending":
                db.update_trade(trade["id"], {
                    "status": "filled",
                    "entry_price": order.get("filled_avg_price") or trade.get("entry_price"),
                })
            elif alpaca_status in ("canceled", "cancelled", "expired", "rejected"):
                db.update_trade(trade["id"], {"status": "cancelled"})
                log.info(f"Order {order_id} for {trade.get('symbol')} marked as {alpaca_status}")

            # Detect bracket SL/TP fills: order is filled but position is gone
            # This means a child order (stop-loss or take-profit) executed
            if (
                trade["status"] == "filled"
                and alpaca_status == "filled"
                and position_symbols is not None
                and trade["symbol"] not in position_symbols
            ):
                # Position closed by bracket SL/TP — figure out exit price
                exit_price = order.get("filled_avg_price") or trade.get("entry_price", 0)
                # Try to get last known price from positions cache
                try:
                    recent_snap = await asyncio.to_thread(alpaca.get_account)
                except Exception:
                    recent_snap = None

                position_tracker._close_trade(trade, exit_price, "bracket_exit")
                log.info(f"Bracket exit detected for {trade['symbol']}")

        except Exception as e:
            log.debug(f"Could not sync order {order_id}: {e}")


# ── EOD liquidation ───────────────────────────────────────────

_eod_closed_today = False

async def _eod_liquidation() -> None:
    """Close all positions at 3:55 PM ET to avoid overnight risk."""
    global _eod_closed_today
    from datetime import datetime, timezone, timedelta

    et = timezone(timedelta(hours=-5))
    now = datetime.now(et)

    # Reset flag at midnight
    if now.hour < 9:
        _eod_closed_today = False
        return

    # Only trigger between 3:55 PM and 4:00 PM ET, once per day
    if _eod_closed_today or now.hour != 15 or now.minute < 55:
        return

    positions = alpaca.get_positions()
    if not positions:
        _eod_closed_today = True
        return

    log.warning(f"EOD LIQUIDATION: Closing {len(positions)} positions before market close")
    for pos in positions:
        symbol = pos["symbol"]
        try:
            result = await order_manager.exit_position(symbol, "eod_close")
            if result:
                # Update trade in DB
                open_trades = db.get_open_trades()
                for trade in open_trades:
                    if trade["symbol"] == symbol and trade["status"] in ("pending", "filled"):
                        position_tracker._close_trade(trade, pos["current_price"], "eod_close", pos=pos)
                        break
                log.info(f"  EOD closed {symbol} @ ${pos['current_price']:.2f}")
        except Exception as e:
            log.error(f"  EOD close failed for {symbol}: {e}")

    _eod_closed_today = True
    activity.emit(
        event_type="eod_close",
        agent="executor",
        title=f"EOD: Closed {len(positions)} positions",
        detail=", ".join(p["symbol"] for p in positions),
        level="warn",
    )


# ── Startup protection ────────────────────────────────────────


async def _protect_orphaned_positions() -> None:
    """
    Re-establish SL/TP protection for positions whose bracket child orders
    expired (e.g., TIF=DAY orders from a previous session).

    On startup, compares open Alpaca positions against open orders.
    Any position without an active SL/TP order gets a new OCO exit order.
    """
    try:
        positions = await asyncio.to_thread(alpaca.get_positions)
        open_orders = await asyncio.to_thread(alpaca.get_open_orders)
    except Exception as e:
        log.error(f"Failed to check orphaned positions: {e}")
        return

    if not positions:
        log.info("No open positions to protect")
        return

    # Build set of symbols that already have pending exit orders
    protected_symbols: set[str] = set()
    for order in open_orders:
        # Any stop or limit order on the exit side means protection exists
        if order.get("order_type") in ("stop", "limit", "stop_limit"):
            protected_symbols.add(order["symbol"])

    # Also check by order_class — bracket/oco child orders protect the position
    for order in open_orders:
        if order.get("order_class") in ("bracket", "oco"):
            protected_symbols.add(order["symbol"])

    # Get trade records to find SL/TP levels
    open_trades = db.get_open_trades()
    trade_map = {t["symbol"]: t for t in open_trades if t["status"] in ("filled", "pending")}

    orphaned = 0
    for pos in positions:
        symbol = pos["symbol"]
        if symbol in protected_symbols:
            continue

        trade = trade_map.get(symbol)
        if not trade or not trade.get("stop_loss") or not trade.get("take_profit"):
            log.warning(f"  {symbol}: no trade record with SL/TP, skipping protection")
            continue

        try:
            alpaca.place_oco_exit(
                symbol=symbol,
                qty=pos["quantity"],
                side=trade["side"],
                stop_loss=trade["stop_loss"],
                take_profit=trade["take_profit"],
            )
            orphaned += 1
            log.info(
                f"  {symbol}: re-established SL=${trade['stop_loss']:.2f} "
                f"TP=${trade['take_profit']:.2f}"
            )
        except Exception as e:
            log.error(f"  {symbol}: failed to place OCO exit: {e}")

    if orphaned:
        log.warning(f"Re-protected {orphaned} orphaned positions")
        activity.emit(
            event_type="system",
            agent="startup",
            title=f"Re-protected {orphaned} orphaned positions",
            detail="Bracket child orders expired; placed new OCO exits",
            level="warn",
        )
    else:
        log.info(f"All {len(positions)} positions have active protection")


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

        # Sync order statuses from Alpaca -> Supabase
        try:
            await _sync_order_statuses()
        except Exception as e:
            log.error(f"Order sync failed: {e}")

        # EOD auto-liquidation: close all positions at 3:55 PM ET
        try:
            await _eod_liquidation()
        except Exception as e:
            log.error(f"EOD liquidation check failed: {e}")

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
            # ── Daily reassessment: prune stale stocks first ──
            if needs_reassessment():
                push_log("WATCHLIST: Running daily reassessment...")
                pruned = await reassess_watchlist()

                # Update stream after pruning
                if _stream_ref:
                    _stream_ref.update_symbols(pruned)

                push_log(f"WATCHLIST REASSESSMENT: {len(pruned)} stocks remain")
                await activity.flush()

            # ── Normal cycle: discover + add new candidates ──
            new_watchlist = await update_watchlist()

            # Update the stream subscriptions if watchlist changed
            if _stream_ref:
                _stream_ref.update_symbols(new_watchlist)

            # Backfill candles for any newly added symbols (in thread to avoid blocking event loop)
            current_symbols = set(config.WATCHLIST)
            new_symbols = set(new_watchlist) - current_symbols
            for symbol in new_symbols:
                try:
                    await asyncio.to_thread(_backfill_symbol, symbol, config.TIMEFRAME, 100)
                    log.info(f"  Backfilled 100 candles for new symbol {symbol}")
                except Exception as e:
                    log.warning(f"  Failed to backfill {symbol}: {e}")

            update_state(
                watchlist=new_watchlist,
                watchlist_size=len(new_watchlist),
                last_watchlist_scan=datetime.now(timezone.utc).isoformat(),
            )
            push_log(f"WATCHLIST SCAN: {len(new_watchlist)} symbols active → {', '.join(new_watchlist)}")
            log.info(f"Active watchlist: {', '.join(new_watchlist)}")

            # ── Run AI fundamental analysis for watchlist stocks ──
            try:
                push_log("ANALYSIS: Running fundamentals + AI for watchlist...")
                analysis_results = await analyze_watchlist()
                if analysis_results:
                    push_log(f"ANALYSIS: Completed for {len(analysis_results)} stocks: {', '.join(analysis_results.keys())}")
                else:
                    push_log("ANALYSIS: All stocks already analyzed today")
            except Exception as e:
                log.error(f"Watchlist analysis failed: {e}")
                activity.error("analyst", "Watchlist analysis failed", str(e))

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

                    # Feed news-triggered watchlist candidates into the watchlist manager
                    wl_candidates = result.get("watchlist_candidates", [])
                    if wl_candidates:
                        push_log(f"NEWS AI: {len(wl_candidates)} watchlist candidates identified")
                        new_wl = await evaluate_news_candidates(wl_candidates)
                        if new_wl and _stream_ref:
                            _stream_ref.update_symbols(new_wl)
                            push_log(f"NEWS AI: Watchlist updated to {len(new_wl)} symbols")
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

def _backfill_symbol(symbol: str, timeframe: str, limit: int) -> int:
    """Backfill candles for a single symbol (runs in thread). Retries on transient errors."""
    import time as _time

    bars = alpaca.get_historical_bars(symbol=symbol, timeframe=timeframe, limit=limit)
    for bar in bars:
        for attempt in range(3):
            try:
                db.upsert_candle(
                    symbol=symbol,
                    timeframe=timeframe,
                    timestamp=bar["timestamp"],
                    open_=bar["open"],
                    high=bar["high"],
                    low=bar["low"],
                    close=bar["close"],
                    volume=bar["volume"],
                    vwap=bar.get("vwap"),
                )
                break
            except Exception as e:
                if attempt < 2:
                    _time.sleep(1.5 * (attempt + 1))  # 1.5s, 3s
                else:
                    raise e
    return len(bars)


async def backfill_candles() -> None:
    """Load recent historical candles into Supabase on startup (non-blocking)."""
    log.info("Backfilling historical candles...")
    for symbol in config.WATCHLIST:
        for attempt in range(3):
            try:
                count = await asyncio.to_thread(_backfill_symbol, symbol, config.TIMEFRAME, 200)
                log.info(f"  {symbol}: {count} candles loaded")
                break
            except Exception as e:
                if attempt < 2:
                    log.warning(f"  {symbol}: backfill attempt {attempt+1} failed, retrying... ({e})")
                    await asyncio.sleep(2 * (attempt + 1))  # 2s, 4s
                else:
                    log.error(f"  {symbol}: backfill failed after 3 attempts - {e}")


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
    set_rescan_callback(rescan_symbol)
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

    # Backfill historical data (runs in thread to keep status server responsive)
    await backfill_candles()

    # Re-establish bracket protection for orphaned positions
    await _protect_orphaned_positions()

    # Start background tasks
    global _stream_ref
    stream = AlpacaBarStream(symbols=config.WATCHLIST, on_bar=on_bar)
    _stream_ref = stream

    tasks = [
        asyncio.create_task(stream.start(), name="bar_stream"),
        asyncio.create_task(snapshot_loop(), name="snapshot_loop"),
        asyncio.create_task(watchlist_scan_loop(), name="watchlist_scan"),
        asyncio.create_task(news_analysis_loop(), name="news_analysis"),
        asyncio.create_task(activity.periodic_flush(10), name="activity_flush"),
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
