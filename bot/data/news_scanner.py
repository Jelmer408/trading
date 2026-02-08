"""
News-based stock scanner using Alpaca's news API.

Identifies trending stocks by analyzing recent news volume, headlines,
and extracting tickers from high-impact stories.
"""

import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone

from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import NewsRequest

from bot.config import config
from bot.utils.logger import log


# ── Core scanning ─────────────────────────────────────────────

def _get_news_client() -> StockHistoricalDataClient:
    """Get an Alpaca data client for news."""
    return StockHistoricalDataClient(
        api_key=config.ALPACA_API_KEY,
        secret_key=config.ALPACA_SECRET_KEY,
    )


async def scan_news(
    hours_back: int = 24,
    limit: int = 50,
) -> list[dict]:
    """
    Scan Alpaca news API for trending stocks.

    Analyzes recent news to find stocks with high news volume and
    significant headlines. Returns ranked list of tickers.
    """
    client = _get_news_client()
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours_back)

    try:
        request = NewsRequest(
            start=start,
            end=now,
            limit=limit,
            sort="desc",
            include_content=False,
        )
        news = await asyncio.to_thread(client.get_news, request)
    except Exception as e:
        log.error(f"Alpaca news fetch error: {e}")
        return []

    # Count ticker mentions across news articles
    mentions: Counter = Counter()
    headlines_map: dict[str, list[str]] = {}

    for article in news.news if hasattr(news, 'news') else news:
        symbols = getattr(article, 'symbols', []) or []
        headline = getattr(article, 'headline', '') or ''
        created_at = getattr(article, 'created_at', now)

        # Recency weight
        if isinstance(created_at, datetime):
            age_hours = (now - created_at).total_seconds() / 3600
        else:
            age_hours = 12

        if age_hours < 2:
            weight = 3.0
        elif age_hours < 6:
            weight = 2.0
        elif age_hours < 12:
            weight = 1.5
        else:
            weight = 1.0

        for sym in symbols:
            sym = sym.upper().strip()
            if len(sym) < 1 or len(sym) > 5:
                continue
            mentions[sym] += weight
            if sym not in headlines_map:
                headlines_map[sym] = []
            if len(headlines_map[sym]) < 3:  # Keep top 3 headlines
                headlines_map[sym].append(headline)

    # Build ranked result list
    results = []
    for ticker, score in mentions.most_common(30):
        results.append({
            "symbol": ticker,
            "score": round(score, 2),
            "sources": ["alpaca_news"],
            "source_type": "news",
            "headlines": headlines_map.get(ticker, []),
        })

    log.info(
        f"News scan complete: {len(results)} tickers found "
        f"(top: {', '.join(r['symbol'] for r in results[:5])})"
    )
    return results


async def scan_movers() -> list[dict]:
    """
    Get top market movers using Alpaca's most active / top gainers.

    Uses the Alpaca screener for additional discovery.
    """
    from alpaca.trading.client import TradingClient

    try:
        client = TradingClient(
            api_key=config.ALPACA_API_KEY,
            secret_key=config.ALPACA_SECRET_KEY,
            paper=config.ALPACA_PAPER,
        )

        # Get most active stocks by volume
        assets = await asyncio.to_thread(client.get_all_assets)

        # Filter for tradeable US equities
        active_symbols = [
            a.symbol for a in assets
            if a.tradable and a.status == "active"
            and a.exchange in ("NYSE", "NASDAQ")
            and not a.symbol.endswith("W")  # Skip warrants
            and "." not in a.symbol  # Skip preferred shares
        ]

        # We don't have a direct "movers" endpoint in alpaca-py,
        # so we'll rely on news + reddit for discovery
        log.debug(f"Alpaca has {len(active_symbols)} tradeable symbols")
        return []

    except Exception as e:
        log.warning(f"Movers scan failed: {e}")
        return []
