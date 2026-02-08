"""
Reddit scanner -- extracts stock tickers from subreddit RSS feeds.

Simple, no auth needed. Parses r/wallstreetbets, r/stocks, r/options
RSS feeds and extracts $TICKER mentions from post titles.
"""

import re
import asyncio
from collections import Counter
from xml.etree import ElementTree

import httpx

from bot.utils.logger import log
from bot.utils import activity


USER_AGENT = "CandleBot/1.0 (stock-scanner)"
TIMEOUT = 15.0

# Subreddits to scan
SUBREDDITS = [
    "wallstreetbets",
    "stocks",
    "options",
    "stockmarket",
]

# Common false positives (ETFs, common words that look like tickers)
IGNORE = {
    "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "ETF",
    "CEO", "IPO", "GDP", "SEC", "FDA", "USA", "API",
    "IMO", "LOL", "WTF", "FYI", "PSA", "TIL", "ELI",
    "RIP", "ATH", "ATL", "DD", "YOLO", "HODL", "FOMO",
    "OTM", "ITM", "ATM", "DTE", "IV", "PM", "AM",
    "ALL", "FOR", "THE", "ARE", "NOT", "HAS", "HIS",
    "NEW", "ANY", "CAN", "NOW", "BIG", "OLD", "LOW",
    "TOP", "TWO", "GO", "SO", "UP", "AI", "OR",
}

# Regex: $TICKER or standalone 2-5 uppercase letters
TICKER_RE = re.compile(r'\$([A-Z]{2,5})\b')
BARE_TICKER_RE = re.compile(r'\b([A-Z]{2,5})\b')


async def _scan_subreddit(sub: str) -> list[dict]:
    """Fetch RSS feed for a subreddit and extract ticker mentions + posts from titles."""
    url = f"https://www.reddit.com/r/{sub}/hot.rss?limit=50"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            xml = resp.text
    except Exception as e:
        log.warning(f"RSS fetch failed for r/{sub}: {e}")
        return []

    # Parse Atom XML
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as e:
        log.warning(f"RSS parse failed for r/{sub}: {e}")
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    entries = root.findall("atom:entry", ns)

    mentions: Counter = Counter()
    # Map ticker -> list of posts that mention it
    posts_map: dict[str, list[dict]] = {}

    for entry in entries:
        title_el = entry.find("atom:title", ns)
        if title_el is None or title_el.text is None:
            continue
        title = title_el.text

        # Get post link and timestamp
        link_el = entry.find("atom:link", ns)
        link = link_el.get("href", "") if link_el is not None else ""
        updated_el = entry.find("atom:updated", ns)
        post_time = updated_el.text if updated_el is not None else ""

        post_info = {
            "title": title,
            "url": link,
            "sub": f"r/{sub}",
            "time": post_time,
        }

        found_tickers: set[str] = set()

        # Extract $TICKER mentions (high confidence)
        for match in TICKER_RE.findall(title):
            t = match.upper()
            if t not in IGNORE and len(t) >= 2:
                mentions[t] += 3  # $TICKER gets triple weight
                found_tickers.add(t)

        # Extract bare UPPERCASE words (lower confidence)
        for match in BARE_TICKER_RE.findall(title):
            t = match.upper()
            if t not in IGNORE and len(t) >= 3:  # Min 3 chars for bare tickers
                mentions[t] += 1
                found_tickers.add(t)

        # Link this post to all tickers it mentions
        for t in found_tickers:
            posts_map.setdefault(t, []).append(post_info)

    results = []
    for ticker, count in mentions.most_common(30):
        results.append({
            "symbol": ticker,
            "score": round(count, 2),
            "mentions": count,
            "sources": [f"r/{sub}"],
            "source_type": "reddit",
            "posts": posts_map.get(ticker, [])[:10],  # Max 10 posts per ticker
        })

    return results


# ── ApeWisdom (backup aggregator) ─────────────────────────────

async def _scan_apewisdom() -> list[dict]:
    """Fetch trending tickers from ApeWisdom.io as a secondary source."""
    url = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/1"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])
        tickers = []
        for item in results[:25]:
            ticker = item.get("ticker", "").upper()
            if not ticker or ticker in IGNORE:
                continue

            mentions = item.get("mentions", 0)
            rank = item.get("rank", 99)

            score = mentions / max(rank, 1)
            tickers.append({
                "symbol": ticker,
                "score": round(score, 2),
                "mentions": mentions,
                "sources": ["apewisdom"],
                "source_type": "reddit",
            })

        log.info(f"ApeWisdom: {len(tickers)} tickers")
        return tickers

    except Exception as e:
        log.warning(f"ApeWisdom failed: {e}")
        return []


# ── Public API ───────────────────────────────────────────────

async def scan_all_subreddits(
    limit_per_sub: int = 25,
) -> list[dict]:
    """
    Scan Reddit RSS feeds + ApeWisdom for trending stock tickers.

    Returns ranked list: [{"symbol": "NVDA", "score": 12, "sources": ["r/wallstreetbets"]}]
    """
    activity.scan_started("reddit (RSS + ApeWisdom)")

    # Scan all sources concurrently
    tasks = [_scan_subreddit(sub) for sub in SUBREDDITS] + [_scan_apewisdom()]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    # Merge all results
    combined: Counter = Counter()
    source_map: dict[str, set[str]] = {}
    posts_map: dict[str, list[dict]] = {}

    for result in raw_results:
        if isinstance(result, Exception):
            log.error(f"Scanner error: {result}")
            continue
        for item in result:
            sym = item["symbol"]
            combined[sym] += item["score"]
            source_map.setdefault(sym, set()).update(item.get("sources", []))
            # Merge posts, dedup by URL
            existing_urls = {p["url"] for p in posts_map.get(sym, [])}
            for post in item.get("posts", []):
                if post["url"] not in existing_urls:
                    posts_map.setdefault(sym, []).append(post)
                    existing_urls.add(post["url"])

    # Build ranked list
    results = []
    for ticker, score in combined.most_common(50):
        results.append({
            "symbol": ticker,
            "score": round(score, 2),
            "sources": sorted(source_map.get(ticker, set())),
            "source_type": "reddit",
            "posts": posts_map.get(ticker, [])[:8],  # Cap at 8 posts per ticker
        })

    log.info(
        f"Reddit scan: {len(results)} tickers "
        f"(top: {', '.join(r['symbol'] for r in results[:5])})"
    )
    activity.scan_result("reddit", results, len(results))
    return results
