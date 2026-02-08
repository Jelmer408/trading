"""Alpaca WebSocket streaming for real-time candle bars."""

import asyncio
from datetime import datetime, timezone
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
        """Start streaming bars for all watchlist symbols."""
        if not config.ALPACA_API_KEY or not config.ALPACA_SECRET_KEY:
            raise ValueError("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set")

        self._stream = StockDataStream(
            api_key=config.ALPACA_API_KEY,
            secret_key=config.ALPACA_SECRET_KEY,
        )

        self._stream.subscribe_bars(self._handle_bar, *self.symbols)
        log.info(f"Streaming bars for: {', '.join(self.symbols)}")

        # Run the stream (blocks until disconnected)
        await asyncio.to_thread(self._stream.run)

    def stop(self) -> None:
        """Stop the stream."""
        if self._stream:
            self._stream.stop()
            log.info("Bar stream stopped")
