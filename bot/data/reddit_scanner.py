"""
Reddit scanner for trending stock tickers from r/wallstreetbets, r/stocks, etc.

Uses Reddit's public JSON API (no auth required) to scan hot/rising posts
and extract ticker mentions. Rate-limited but sufficient for periodic scans.
"""

import re
import asyncio
from collections import Counter
from datetime import datetime, timezone

import httpx

from bot.utils.logger import log


# ── Configuration ─────────────────────────────────────────────

SUBREDDITS = [
    "wallstreetbets",
    "stocks",
    "options",
    "daytrading",
    "pennystocks",
]

# Common words that look like tickers but aren't
FALSE_TICKERS = {
    "I", "A", "AM", "PM", "CEO", "CFO", "IPO", "ETF", "GDP", "CPI",
    "DD", "FD", "YOLO", "FOMO", "IMO", "TLDR", "TA", "EPS", "PE",
    "ATH", "ATL", "OTM", "ITM", "IV", "DTE", "EOD", "AH", "PM",
    "RH", "WSB", "SEC", "FBI", "FDA", "FED", "USA", "USD", "EUR",
    "UK", "US", "AI", "ML", "API", "EV", "PT", "IT", "LOL", "OMG",
    "WTF", "LMAO", "RIP", "TBH", "FYI", "PSA", "IMO", "EDIT",
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN",
    "HAD", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HAS",
    "HIM", "HIS", "HOW", "ITS", "MAY", "NEW", "NOW", "OLD", "SEE",
    "WAY", "WHO", "BOY", "DID", "MAN", "LET", "SAY", "SHE", "TOO",
    "USE", "ANY", "BIG", "GO", "UP", "SO", "IF", "OR", "NO", "ON",
    "DO", "MY", "OK", "BE", "HE", "IS", "BY", "AT", "TO", "OF",
    "IN", "AS", "ME", "WE", "AN", "IT", "VS", "OP", "RE",
    "JUST", "LIKE", "THIS", "THAT", "WITH", "HAVE", "FROM",
    "THEY", "BEEN", "SAID", "EACH", "THAN", "MORE", "MOST",
    "VERY", "WILL", "MUCH", "SOME", "WHEN", "WHAT", "YOUR",
    "ALSO", "BACK", "ONLY", "COME", "MADE", "CALL", "PUT",
    "LONG", "SHORT", "SELL", "BUY", "HOLD", "GAIN", "LOSS",
    "BEAR", "BULL", "MOON", "DIP", "PUMP", "DUMP", "CASH",
    "FREE", "DEBT", "OPEN", "NEXT", "BEST", "GOOD", "HIGH",
    "LOW", "REAL", "SAFE", "RISK", "PLAY", "MOVE", "DOWN",
    "HUGE", "BABY", "WISH", "HOLY", "DAMN", "EVER", "THEM",
    "NEED", "LOOK", "EVEN", "ELSE", "NICE", "KEEP", "LAST",
    "DONE", "LMFAO", "STILL", "WEEK", "YEAR",
}

# Regex: $TICKER or standalone 1-5 letter uppercase words
TICKER_RE = re.compile(r"\$([A-Z]{1,5})\b|(?<!\w)([A-Z]{1,5})(?!\w)")

USER_AGENT = "CandleBot/1.0 (stock-scanner)"
TIMEOUT = 15.0


# ── Core scanning ─────────────────────────────────────────────

async def _fetch_subreddit_posts(
    subreddit: str,
    sort: str = "hot",
    limit: int = 25,
) -> list[dict]:
    """Fetch posts from a subreddit using the public JSON API."""
    url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
    params = {"limit": limit, "raw_json": 1}
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            posts = data.get("data", {}).get("children", [])
            return [p["data"] for p in posts if p.get("data")]
    except httpx.HTTPError as e:
        log.warning(f"Reddit HTTP error for r/{subreddit}: {e}")
        return []
    except Exception as e:
        log.warning(f"Reddit fetch error for r/{subreddit}: {e}")
        return []


def _extract_tickers(text: str) -> list[str]:
    """Extract potential stock tickers from text."""
    if not text:
        return []

    tickers = []
    for match in TICKER_RE.finditer(text):
        ticker = match.group(1) or match.group(2)
        if ticker and ticker not in FALSE_TICKERS and len(ticker) >= 2:
            tickers.append(ticker)
    return tickers


async def scan_subreddit(
    subreddit: str,
    sort: str = "hot",
    limit: int = 25,
) -> Counter:
    """
    Scan a subreddit and return a Counter of ticker mentions.

    Analyzes both post titles and selftext bodies.
    Weights by upvotes and recency.
    """
    posts = await _fetch_subreddit_posts(subreddit, sort, limit)
    mentions: Counter = Counter()

    now = datetime.now(timezone.utc).timestamp()

    for post in posts:
        title = post.get("title", "")
        selftext = post.get("selftext", "")
        score = max(post.get("score", 1), 1)
        created = post.get("created_utc", now)

        # Recency weight: posts from last 6 hours get 2x, last 24h get 1.5x
        age_hours = (now - created) / 3600
        if age_hours < 6:
            recency_weight = 2.0
        elif age_hours < 24:
            recency_weight = 1.5
        else:
            recency_weight = 1.0

        # Upvote weight: log-scale so viral posts count more but not overwhelmingly
        import math
        upvote_weight = 1 + math.log10(score) if score > 1 else 1

        weight = recency_weight * upvote_weight

        # Extract tickers from title (higher weight) and body
        for ticker in _extract_tickers(title):
            mentions[ticker] += weight * 2  # Title mentions worth 2x
        for ticker in _extract_tickers(selftext):
            mentions[ticker] += weight

    return mentions


# ── Public API ───────────────────────────────────────────────

async def scan_all_subreddits(
    limit_per_sub: int = 25,
) -> list[dict]:
    """
    Scan all configured subreddits and return ranked ticker list.

    Returns list of dicts:
        [{"symbol": "NVDA", "score": 42.5, "sources": ["wallstreetbets", "stocks"]}]
    """
    all_mentions: Counter = Counter()
    source_map: dict[str, set[str]] = {}

    # Scan all subreddits concurrently (with small stagger to be polite)
    tasks = []
    for sub in SUBREDDITS:
        tasks.append(_scan_sub_with_source(sub, limit_per_sub, all_mentions, source_map))

    await asyncio.gather(*tasks)

    # Build ranked result list
    results = []
    for ticker, score in all_mentions.most_common(50):
        results.append({
            "symbol": ticker,
            "score": round(score, 2),
            "sources": sorted(source_map.get(ticker, set())),
            "source_type": "reddit",
        })

    log.info(
        f"Reddit scan complete: {len(results)} tickers found "
        f"(top: {', '.join(r['symbol'] for r in results[:5])})"
    )
    return results


async def _scan_sub_with_source(
    subreddit: str,
    limit: int,
    all_mentions: Counter,
    source_map: dict[str, set[str]],
) -> None:
    """Scan one subreddit and merge results into shared counters."""
    # Small stagger between requests to avoid rate limits
    await asyncio.sleep(0.5)

    for sort in ["hot", "rising"]:
        mentions = await scan_subreddit(subreddit, sort, limit)
        for ticker, score in mentions.items():
            all_mentions[ticker] += score
            if ticker not in source_map:
                source_map[ticker] = set()
            source_map[ticker].add(f"r/{subreddit}")

        # Be polite to Reddit API
        await asyncio.sleep(1.0)
