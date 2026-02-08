"""
Reddit scanner for trending stock tickers from r/wallstreetbets, r/stocks, etc.

Uses aggregation APIs (ApeWisdom, Tradestie) that track Reddit mentions
without requiring direct Reddit API access. Falls back gracefully.
"""

import asyncio
from collections import Counter

import httpx

from bot.utils.logger import log


USER_AGENT = "CandleBot/1.0 (stock-scanner)"
TIMEOUT = 20.0

# Tickers to ignore (ETFs or common false positives in these APIs)
IGNORE_TICKERS = {"SPY", "QQQ", "IWM", "DIA", "VOO", "VTI"}


# ── ApeWisdom API (tracks Reddit/WSB mentions) ───────────────

async def _scan_apewisdom() -> list[dict]:
    """
    Fetch trending tickers from ApeWisdom.io.
    Free public API that tracks r/wallstreetbets mentions.

    Returns: [{"symbol": "NVDA", "mentions": 120, "rank": 1, "upvotes": 5000}]
    """
    url = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/1"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        tickers = []
        for item in results[:30]:  # Top 30
            ticker = item.get("ticker", "").upper()
            if not ticker or ticker in IGNORE_TICKERS:
                continue

            mentions = item.get("mentions", 0)
            rank = item.get("rank", 99)
            upvotes = item.get("upvotes", 0)

            # Score based on mentions and rank
            score = mentions * (1 + upvotes / 1000) / max(rank, 1)

            tickers.append({
                "symbol": ticker,
                "score": round(score, 2),
                "mentions": mentions,
                "rank": rank,
                "sources": ["r/wallstreetbets", "r/stocks"],
                "source_type": "reddit",
            })

        log.info(f"ApeWisdom: found {len(tickers)} trending tickers")
        return tickers

    except Exception as e:
        log.warning(f"ApeWisdom scan failed: {e}")
        return []


# ── Tradestie API (Reddit sentiment + mentions) ──────────────

async def _scan_tradestie() -> list[dict]:
    """
    Fetch trending tickers from Tradestie's Reddit API.
    Free API that tracks wallstreetbets mentions + sentiment.

    Returns: [{"symbol": "NVDA", "score": 15.0, "sentiment": "Bullish"}]
    """
    url = "https://tradestie.com/api/v1/apps/reddit"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        tickers = []
        for item in data[:30]:
            ticker = item.get("ticker", "").upper()
            if not ticker or ticker in IGNORE_TICKERS:
                continue

            comments = item.get("no_of_comments", 0)
            sentiment = item.get("sentiment", "Neutral")
            sentiment_score = item.get("sentiment_score", 0.5)

            # Weight bullish sentiment higher for day trading
            sentiment_mult = 1.5 if sentiment == "Bullish" else (0.8 if sentiment == "Bearish" else 1.0)
            score = comments * sentiment_mult * sentiment_score

            tickers.append({
                "symbol": ticker,
                "score": round(score, 2),
                "mentions": comments,
                "sentiment": sentiment,
                "sources": ["r/wallstreetbets"],
                "source_type": "reddit",
            })

        log.info(f"Tradestie: found {len(tickers)} trending tickers")
        return tickers

    except Exception as e:
        log.warning(f"Tradestie scan failed: {e}")
        return []


# ── Public API ───────────────────────────────────────────────

async def scan_all_subreddits(
    limit_per_sub: int = 25,  # kept for API compat, not used
) -> list[dict]:
    """
    Scan all Reddit-based sources and return ranked ticker list.

    Uses ApeWisdom + Tradestie APIs which aggregate Reddit mentions
    (r/wallstreetbets, r/stocks, etc.) without needing direct Reddit access.

    Returns list of dicts:
        [{"symbol": "NVDA", "score": 42.5, "sources": ["r/wallstreetbets"]}]
    """
    # Scan both sources concurrently
    ape_results, trade_results = await asyncio.gather(
        _scan_apewisdom(),
        _scan_tradestie(),
        return_exceptions=True,
    )

    if isinstance(ape_results, Exception):
        log.error(f"ApeWisdom error: {ape_results}")
        ape_results = []
    if isinstance(trade_results, Exception):
        log.error(f"Tradestie error: {trade_results}")
        trade_results = []

    # Merge scores from both sources
    combined: Counter = Counter()
    source_map: dict[str, set[str]] = {}
    sentiment_map: dict[str, str] = {}

    for item in ape_results:
        sym = item["symbol"]
        combined[sym] += item["score"]
        source_map.setdefault(sym, set()).update(item.get("sources", []))

    for item in trade_results:
        sym = item["symbol"]
        combined[sym] += item["score"]
        source_map.setdefault(sym, set()).update(item.get("sources", []))
        if "sentiment" in item:
            sentiment_map[sym] = item["sentiment"]

    # Build ranked result list
    results = []
    for ticker, score in combined.most_common(50):
        results.append({
            "symbol": ticker,
            "score": round(score, 2),
            "sources": sorted(source_map.get(ticker, set())),
            "source_type": "reddit",
            "sentiment": sentiment_map.get(ticker),
        })

    log.info(
        f"Reddit scan complete: {len(results)} tickers found "
        f"(top: {', '.join(r['symbol'] for r in results[:5])})"
    )
    return results
