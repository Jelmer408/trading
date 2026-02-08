"""
News-based stock scanner using Alpaca's news REST API.

Identifies trending stocks by analyzing recent news volume, headlines,
and extracting tickers from high-impact stories.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone

import httpx

from bot.config import config
from bot.utils.logger import log
from bot.utils import activity


ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news"
TIMEOUT = 20.0


async def scan_news(
    hours_back: int = 24,
    limit: int = 50,
) -> list[dict]:
    """
    Scan Alpaca news REST API for trending stocks.

    Analyzes recent news to find stocks with high news volume and
    significant headlines. Returns ranked list of tickers.
    """
    if not config.ALPACA_API_KEY or not config.ALPACA_SECRET_KEY:
        log.warning("Alpaca keys not set, skipping news scan")
        return []

    activity.scan_started("alpaca_news")

    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours_back)

    headers = {
        "APCA-API-KEY-ID": config.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": config.ALPACA_SECRET_KEY,
    }
    params = {
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "limit": limit,
        "sort": "desc",
        "include_content": "false",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(ALPACA_NEWS_URL, headers=headers, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as e:
        log.error(f"Alpaca news HTTP error: {e}")
        return []
    except Exception as e:
        log.error(f"Alpaca news fetch error: {e}")
        return []

    articles = data.get("news", [])
    if not articles:
        log.info("No news articles found")
        return []

    # Count ticker mentions across news articles
    mentions: Counter = Counter()
    headlines_map: dict[str, list[str]] = {}

    for article in articles:
        symbols = article.get("symbols", []) or []
        headline = article.get("headline", "") or ""
        created_at_str = article.get("created_at", "")

        # Parse timestamp for recency weight
        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            age_hours = (now - created_at).total_seconds() / 3600
        except (ValueError, TypeError):
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
            if len(headlines_map[sym]) < 3:
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
    activity.scan_result("news", results, len(results))
    return results
