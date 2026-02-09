"""
Reddit scanner -- extracts trending stock tickers from social media.

Uses ApeWisdom API (free, no auth) as primary source for Reddit/social
stock mentions with upvotes, rank, and trend data.
Falls back to direct Reddit JSON scraping when running locally.
"""

import re
import asyncio
from collections import Counter

import httpx

from bot.utils.logger import log
from bot.utils import activity


USER_AGENT = "CandleBot/1.0 (stock-scanner; compatible)"
TIMEOUT = 15.0

# Subreddits to scan (direct fallback)
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


# ── ApeWisdom (primary source) ───────────────────────────────

async def _scan_apewisdom_filter(filter_name: str, pages: int = 2) -> list[dict]:
    """Fetch trending tickers from ApeWisdom for a specific filter.

    Filters: all-stocks, wallstreetbets, stocks, investing, crypto, 4chan
    """
    headers = {"User-Agent": USER_AGENT}
    all_results = []

    for page in range(1, pages + 1):
        url = f"https://apewisdom.io/api/v1.0/filter/{filter_name}/page/{page}"
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()

            for item in data.get("results", []):
                ticker = item.get("ticker", "").upper()
                if not ticker or ticker in IGNORE:
                    continue

                mentions = int(item.get("mentions") or 0)
                upvotes = int(item.get("upvotes") or 0)
                rank = int(item.get("rank") or 99)
                rank_24h = int(item.get("rank_24h_ago") or 99)
                mentions_24h = int(item.get("mentions_24h_ago") or 0)
                name = item.get("name") or ""

                # Score: weighted by mentions, upvotes, and rank improvement
                rank_change = rank_24h - rank  # Positive = moving up
                mention_change = mentions - mentions_24h
                score = mentions + (upvotes / 50) + max(rank_change * 0.5, 0)

                all_results.append({
                    "symbol": ticker,
                    "name": name,
                    "score": round(score, 2),
                    "mentions": mentions,
                    "total_upvotes": upvotes,
                    "rank": rank,
                    "rank_24h_ago": rank_24h,
                    "mentions_24h_ago": mentions_24h,
                    "rank_change": rank_change,
                    "mention_change": mention_change,
                    "sources": [filter_name],
                    "source_type": "reddit",
                    "posts": [{
                        "title": f"#{rank} trending on r/{filter_name} — {mentions} mentions, {upvotes} upvotes"
                               + (f" (↑{rank_change} ranks)" if rank_change > 0 else ""),
                        "url": f"https://apewisdom.io/stocks/{ticker}/",
                        "sub": f"r/{filter_name}",
                        "time": "",
                        "upvotes": upvotes,
                        "comments": 0,
                        "upvote_ratio": 0,
                    }],
                })

        except Exception as e:
            log.warning(f"ApeWisdom {filter_name} page {page} failed: {e}")

    log.info(f"ApeWisdom [{filter_name}]: {len(all_results)} tickers")
    return all_results


# ── Direct Reddit scraping (fallback, blocked from cloud) ────

async def _scan_subreddit(sub: str) -> list[dict]:
    """Fetch JSON feed for a subreddit and extract ticker mentions + upvotes.

    NOTE: This is blocked from cloud IPs (Fly.io etc). Works locally only.
    """
    url = f"https://www.reddit.com/r/{sub}/hot.json?limit=50&raw_json=1"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        # Don't warn loudly -- expected to fail from cloud
        log.debug(f"Reddit direct fetch failed for r/{sub}: {e}")
        return []

    children = data.get("data", {}).get("children", [])

    mentions: Counter = Counter()
    posts_map: dict[str, list[dict]] = {}

    for child in children:
        post = child.get("data", {})
        title = post.get("title", "")
        if not title:
            continue

        # Extract engagement data
        upvotes = post.get("score", 0)
        num_comments = post.get("num_comments", 0)
        upvote_ratio = post.get("upvote_ratio", 0.5)
        permalink = post.get("permalink", "")
        created_utc = post.get("created_utc", 0)
        link = f"https://www.reddit.com{permalink}" if permalink else ""

        post_info = {
            "title": title,
            "url": link,
            "sub": f"r/{sub}",
            "time": str(int(created_utc)) if created_utc else "",
            "upvotes": upvotes,
            "comments": num_comments,
            "upvote_ratio": round(upvote_ratio, 2),
        }

        found_tickers: set[str] = set()

        # Extract $TICKER mentions (high confidence)
        for match in TICKER_RE.findall(title):
            t = match.upper()
            if t not in IGNORE and len(t) >= 2:
                upvote_bonus = min(upvotes / 100, 5)
                mentions[t] += 3 + upvote_bonus
                found_tickers.add(t)

        # Extract bare UPPERCASE words (lower confidence)
        for match in BARE_TICKER_RE.findall(title):
            t = match.upper()
            if t not in IGNORE and len(t) >= 3:
                upvote_bonus = min(upvotes / 200, 2)
                mentions[t] += 1 + upvote_bonus
                found_tickers.add(t)

        for t in found_tickers:
            posts_map.setdefault(t, []).append(post_info)

    results = []
    for ticker, count in mentions.most_common(30):
        ticker_posts = posts_map.get(ticker, [])[:10]
        total_upvotes = sum(p.get("upvotes", 0) for p in ticker_posts)
        results.append({
            "symbol": ticker,
            "score": round(count, 2),
            "mentions": len(ticker_posts),
            "total_upvotes": total_upvotes,
            "sources": [f"r/{sub}"],
            "source_type": "reddit",
            "posts": ticker_posts,
        })

    return results


# ── RSS.app feeds (reliable from cloud, real post titles) ────

RSS_FEEDS = [
    {"url": "https://rss.app/feeds/v1.1/6gNr698SIoNU5ATK.json", "sub": "wallstreetbets"},
]


async def _scan_rss_feed(feed_url: str, sub: str) -> list[dict]:
    """Fetch posts from an RSS.app JSON feed and extract ticker mentions."""
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(feed_url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        log.warning(f"RSS feed fetch failed for r/{sub}: {e}")
        return []

    items = data.get("items", [])
    mentions: Counter = Counter()
    posts_map: dict[str, list[dict]] = {}

    for item in items:
        title = item.get("title", "")
        content = item.get("content_text", "")
        if not title:
            continue

        url = item.get("url", "")
        date_str = item.get("date_published", "")
        try:
            from datetime import datetime as dt
            created_utc = int(dt.fromisoformat(date_str.replace("Z", "+00:00")).timestamp()) if date_str else 0
        except Exception:
            created_utc = 0

        post_info = {
            "title": title,
            "url": url,
            "sub": f"r/{sub}",
            "time": str(created_utc) if created_utc else "",
            "upvotes": 0,  # RSS doesn't provide upvotes
            "comments": 0,
            "upvote_ratio": 0,
            "content": content[:500] if content else "",
        }

        found_tickers: set[str] = set()
        text = f"{title} {content}"

        # Extract $TICKER mentions (high confidence)
        for match in TICKER_RE.findall(text):
            t = match.upper()
            if t not in IGNORE and len(t) >= 2:
                mentions[t] += 3
                found_tickers.add(t)

        # Extract bare UPPERCASE words from title only (medium confidence)
        for match in BARE_TICKER_RE.findall(title):
            t = match.upper()
            if t not in IGNORE and len(t) >= 3:
                mentions[t] += 1
                found_tickers.add(t)

        for t in found_tickers:
            posts_map.setdefault(t, []).append(post_info)

    results = []
    for ticker, count in mentions.most_common(30):
        ticker_posts = posts_map.get(ticker, [])[:10]
        results.append({
            "symbol": ticker,
            "score": round(count, 2),
            "mentions": len(ticker_posts),
            "total_upvotes": 0,
            "sources": [f"rss/r/{sub}"],
            "source_type": "reddit",
            "posts": ticker_posts,
        })

    log.info(f"RSS [{sub}]: {len(results)} tickers from {len(items)} posts")
    return results


# ── Public API ───────────────────────────────────────────────

async def scan_all_subreddits(
    limit_per_sub: int = 25,
) -> list[dict]:
    """
    Scan ApeWisdom (primary) + RSS feeds + direct Reddit (fallback) for trending stock tickers.

    Returns ranked list: [{"symbol": "NVDA", "score": 12, "sources": [...], ...}]
    """
    activity.scan_started("reddit (ApeWisdom + RSS + direct)")

    # Primary: ApeWisdom (works from cloud, has upvotes/rank data)
    apewisdom_tasks = [
        _scan_apewisdom_filter("all-stocks", pages=2),
        _scan_apewisdom_filter("wallstreetbets", pages=1),
    ]

    # RSS.app feeds (reliable from cloud, real post titles + content)
    rss_tasks = [
        _scan_rss_feed(feed["url"], feed["sub"]) for feed in RSS_FEEDS
    ]

    # Fallback: Direct Reddit scraping (works locally, blocked from cloud)
    reddit_tasks = [_scan_subreddit(sub) for sub in SUBREDDITS]

    raw_results = await asyncio.gather(
        *apewisdom_tasks, *rss_tasks, *reddit_tasks,
        return_exceptions=True,
    )

    # Merge all results
    combined: Counter = Counter()
    source_map: dict[str, set[str]] = {}
    posts_map: dict[str, list[dict]] = {}
    ticker_data: dict[str, dict] = {}  # Extra metadata per ticker

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
                if post.get("url") and post["url"] not in existing_urls:
                    posts_map.setdefault(sym, []).append(post)
                    existing_urls.add(post["url"])

            # Keep richest metadata (ApeWisdom data preferred)
            if "rank" in item and (sym not in ticker_data or "rank" not in ticker_data[sym]):
                ticker_data[sym] = {
                    "rank": item.get("rank"),
                    "rank_24h_ago": item.get("rank_24h_ago"),
                    "mentions_24h_ago": item.get("mentions_24h_ago"),
                    "rank_change": item.get("rank_change"),
                    "mention_change": item.get("mention_change"),
                    "name": item.get("name", ""),
                }

    # Build ranked list
    results = []
    for ticker, score in combined.most_common(50):
        ticker_posts = posts_map.get(ticker, [])[:8]
        # Sort posts by upvotes descending
        ticker_posts.sort(key=lambda p: p.get("upvotes", 0), reverse=True)
        total_upvotes = sum(p.get("upvotes", 0) for p in ticker_posts)
        extra = ticker_data.get(ticker, {})

        results.append({
            "symbol": ticker,
            "name": extra.get("name", ""),
            "score": round(score, 2),
            "mentions": len(ticker_posts),
            "total_upvotes": total_upvotes,
            "rank": extra.get("rank"),
            "rank_24h_ago": extra.get("rank_24h_ago"),
            "rank_change": extra.get("rank_change"),
            "mention_change": extra.get("mention_change"),
            "sources": sorted(source_map.get(ticker, set())),
            "source_type": "reddit",
            "posts": ticker_posts,
        })

    log.info(
        f"Reddit scan: {len(results)} tickers "
        f"(top: {', '.join(r['symbol'] for r in results[:5])})"
    )
    activity.scan_result("reddit", results, len(results))
    return results
