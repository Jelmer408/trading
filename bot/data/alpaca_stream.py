"""Alpaca WebSocket streaming for real-time candle bars."""

import asyncio
from typing import Callable, Awaitable

from alpaca.data.live import StockDataStream

from bot.config import config
from bot.utils.logger import log


BarHandler = Callable[[dict], Awaitable[None]]


class AlpacaBarStream:
    """Manages a WebSocket connection to Alpaca for real-time bar data."""

    def __init__(self, symbols: list[str], on_bar: BarHandler):
        self.symbols = [s.strip().upper() for s in symbols]
        self.on_bar = on_bar
        self._stream: StockDataStream | None = None
        self._running = True

    async def _handle_bar(self, bar) -> None:
        """Process an incoming bar from the WebSocket."""
        bar_data = {
            "symbol": bar.symbol,
            "timestamp": bar.timestamp,
            "open": float(bar.open),
            "high": float(bar.high),
            "low": float(bar.low),
            "close": float(bar.close),
            "volume": int(bar.volume),
            "vwap": float(bar.vwap) if bar.vwap else None,
        }
        log.debug(
            f"Bar: {bar.symbol} O={bar_data['open']:.2f} "
            f"H={bar_data['high']:.2f} L={bar_data['low']:.2f} "
            f"C={bar_data['close']:.2f} V={bar_data['volume']}"
        )
        await self.on_bar(bar_data)

    async def start(self) -> None:
        """Start streaming bars with exponential backoff on failures."""
        if not config.ALPACA_API_KEY or not config.ALPACA_SECRET_KEY:
            raise ValueError("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set")

        backoff = 5  # start with 5 seconds

        while self._running:
            try:
                self._stream = StockDataStream(
                    api_key=config.ALPACA_API_KEY,
                    secret_key=config.ALPACA_SECRET_KEY,
                )

                self._stream.subscribe_bars(self._handle_bar, *self.symbols)
                log.info(f"Streaming bars for: {', '.join(self.symbols)}")

                # Run the stream (blocks until disconnected)
                await asyncio.to_thread(self._stream.run)

                # If we get here, stream ended cleanly
                backoff = 5

            except Exception as e:
                if not self._running:
                    break
                log.warning(
                    f"Stream error: {e} -- reconnecting in {backoff}s"
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 120)  # cap at 2 minutes

    def update_symbols(self, new_symbols: list[str]) -> None:
        """
        Update the symbol list. Triggers a stream restart to pick up new subs.

        The reconnect loop in start() will pick up the new symbols automatically.
        """
        new_set = set(s.strip().upper() for s in new_symbols)
        old_set = set(self.symbols)

        added = new_set - old_set
        removed = old_set - new_set

        if not added and not removed:
            return

        self.symbols = sorted(new_set)
        log.info(
            f"Watchlist updated: {len(self.symbols)} symbols "
            f"(+{len(added)}: {', '.join(sorted(added)) or 'none'}) "
            f"(-{len(removed)}: {', '.join(sorted(removed)) or 'none'})"
        )

        # Force stream reconnect so it subscribes to new symbols
        if self._stream:
            try:
                self._stream.stop()
            except Exception:
                pass

    def stop(self) -> None:
        """Stop the stream."""
        self._running = False
        if self._stream:
            try:
                self._stream.stop()
            except Exception:
                pass
            log.info("Bar stream stopped")
