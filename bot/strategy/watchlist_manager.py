"""
Dynamic Watchlist Manager.

Periodically scans Reddit (r/wallstreetbets, r/stocks, etc.) and news sources
to discover trending stocks. Uses AI to evaluate candidates and maintains
a dynamic watchlist that the trading bot subscribes to.
"""

import asyncio
import json
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from bot.config import config
from bot.utils.logger import log
from bot.utils import activity
from bot.data import reddit_scanner
from bot.data import news_scanner
from bot.data import supabase_client as db


# ── Configuration ─────────────────────────────────────────────

# Maximum total symbols on the watchlist (including base)
MAX_WATCHLIST_SIZE = 15

# Minimum combined score to be considered a candidate
MIN_DISCOVERY_SCORE = 5.0

# How many top candidates to evaluate with AI
MAX_AI_CANDIDATES = 10

# Symbols that should always be on the watchlist
CORE_SYMBOLS = {"SPY", "QQQ"}


# ── AI Evaluation ─────────────────────────────────────────────

WATCHLIST_EVAL_SYSTEM = """You are a stock market analyst who evaluates whether a trending stock is worth day-trading.

Given a list of candidate stocks with their Reddit buzz scores, news headlines, and source data,
decide which ones are good day-trading candidates.

Criteria for a GOOD day-trading candidate:
- High liquidity (well-known stocks, not micro-caps)
- Has a clear catalyst (earnings, news, FDA approval, etc.)
- Showing momentum / volatility (good for intraday moves)
- Not purely meme-driven with no substance
- Preferably >$5 share price and >1M average daily volume

Criteria for REJECTING a stock:
- Penny stock / OTC (under $1)
- Pure pump-and-dump with no real catalyst
- Already had its big move (buying the top)
- Low liquidity / hard to trade

Respond with valid JSON only:
{
    "approved": [
        {"symbol": "NVDA", "reason": "Strong AI catalyst, high volume", "priority": 1},
        {"symbol": "TSLA", "reason": "Earnings momentum", "priority": 2}
    ],
    "rejected": [
        {"symbol": "BBBY", "reason": "Bankrupt, pure meme"}
    ]
}"""


async def _ai_evaluate_candidates(candidates: list[dict]) -> list[dict]:
    """Use AI to evaluate and filter watchlist candidates."""
    from bot.ai.analyst import _call_ai

    prompt_parts = ["## Watchlist Candidates to Evaluate\n"]
    for c in candidates:
        prompt_parts.append(
            f"### {c['symbol']} (score: {c['score']})\n"
            f"- Sources: {', '.join(c.get('sources', []))}\n"
            f"- Source type: {c.get('source_type', 'unknown')}\n"
        )
        headlines = c.get("headlines", [])
        if headlines:
            prompt_parts.append(f"- Headlines: {'; '.join(headlines[:3])}\n")

    prompt_parts.append(
        "\nEvaluate each candidate. Which should we add to our day-trading watchlist? "
        "Respond with valid JSON only."
    )

    prompt = "\n".join(prompt_parts)

    activity.ai_request(
        agent="analyst",
        symbol=None,
        title=f"Evaluating {len(candidates)} watchlist candidates",
        prompt=prompt,
    )

    try:
        response = await _call_ai(prompt, WATCHLIST_EVAL_SYSTEM)

        # Parse JSON
        json_str = response.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1]
            json_str = json_str.rsplit("```", 1)[0]

        result = json.loads(json_str)
        approved = result.get("approved", [])

        log.info(
            f"AI approved {len(approved)} of {len(candidates)} candidates: "
            f"{', '.join(a['symbol'] for a in approved)}"
        )
        activity.ai_response(
            agent="analyst",
            symbol=None,
            title=f"Approved {len(approved)}/{len(candidates)} candidates",
            response=response[:1000],
            metadata={"approved": [a["symbol"] for a in approved]},
        )
        return approved

    except json.JSONDecodeError as e:
        log.error(f"AI watchlist evaluation JSON parse error: {e}")
        # Fall back to score-based ranking
        return [{"symbol": c["symbol"], "reason": "Score-based (AI unavailable)", "priority": i}
                for i, c in enumerate(candidates[:5], 1)]
    except Exception as e:
        log.error(f"AI watchlist evaluation failed: {e}")
        return [{"symbol": c["symbol"], "reason": "Score-based (AI error)", "priority": i}
                for i, c in enumerate(candidates[:5], 1)]


# ── Core Logic ───────────────────────────────────────────────

async def discover_candidates() -> list[dict]:
    """
    Run all scanners and merge results into a ranked candidate list.
    """
    # Run Reddit and news scans concurrently
    reddit_results, news_results = await asyncio.gather(
        reddit_scanner.scan_all_subreddits(limit_per_sub=25),
        news_scanner.scan_news(hours_back=24, limit=50),
        return_exceptions=True,
    )

    if isinstance(reddit_results, Exception):
        log.error(f"Reddit scan failed: {reddit_results}")
        reddit_results = []
    if isinstance(news_results, Exception):
        log.error(f"News scan failed: {news_results}")
        news_results = []

    # Merge scores
    combined_scores: Counter = Counter()
    source_map: dict[str, set[str]] = {}
    headlines_map: dict[str, list[str]] = {}
    type_map: dict[str, set[str]] = {}

    for item in reddit_results:
        sym = item["symbol"]
        combined_scores[sym] += item["score"]
        source_map.setdefault(sym, set()).update(item.get("sources", []))
        type_map.setdefault(sym, set()).add("reddit")

    for item in news_results:
        sym = item["symbol"]
        # News gets a 1.5x boost since it's more reliable
        combined_scores[sym] += item["score"] * 1.5
        source_map.setdefault(sym, set()).update(item.get("sources", []))
        type_map.setdefault(sym, set()).add("news")
        headlines_map.setdefault(sym, []).extend(item.get("headlines", []))

    # Filter by minimum score and exclude core symbols (they're always included)
    candidates = []
    base_symbols = set(config.WATCHLIST) | CORE_SYMBOLS

    for sym, score in combined_scores.most_common(MAX_AI_CANDIDATES * 2):
        if score < MIN_DISCOVERY_SCORE:
            break
        if sym in base_symbols:
            continue  # Already on watchlist

        candidates.append({
            "symbol": sym,
            "score": round(score, 2),
            "sources": sorted(source_map.get(sym, set())),
            "source_type": "+".join(sorted(type_map.get(sym, set()))),
            "headlines": headlines_map.get(sym, [])[:3],
        })

    log.info(
        f"Discovery found {len(candidates)} candidates above threshold "
        f"(reddit: {len(reddit_results)}, news: {len(news_results)})"
    )

    return candidates[:MAX_AI_CANDIDATES]


async def update_watchlist() -> list[str]:
    """
    Full watchlist update cycle:
    1. Discover candidates from Reddit + News
    2. AI-evaluate candidates
    3. Merge with base watchlist
    4. Persist to Supabase
    5. Return the new active watchlist

    Returns the updated list of symbols.
    """
    log.info("=" * 40)
    log.info("Starting dynamic watchlist update...")

    # Step 1: Discover
    candidates = await discover_candidates()

    # Step 2: AI evaluation (skip if no candidates)
    approved: list[dict] = []
    if candidates:
        approved = await _ai_evaluate_candidates(candidates)

    # Step 3: Build new watchlist
    # Start with base watchlist + core symbols
    new_watchlist = list(CORE_SYMBOLS | set(config.WATCHLIST))
    added_symbols: list[dict] = []

    for item in sorted(approved, key=lambda x: x.get("priority", 99)):
        sym = item["symbol"]
        if sym not in new_watchlist and len(new_watchlist) < MAX_WATCHLIST_SIZE:
            new_watchlist.append(sym)
            added_symbols.append(item)

    # Step 4: Persist to Supabase
    now = datetime.now(timezone.utc)
    try:
        _save_watchlist_to_db(new_watchlist, added_symbols, candidates, now)
    except Exception as e:
        log.error(f"Failed to persist watchlist to Supabase: {e}")

    log.info(
        f"Watchlist updated: {len(new_watchlist)} symbols "
        f"({len(added_symbols)} new from discovery)"
    )
    if added_symbols:
        for item in added_symbols:
            log.info(f"  + {item['symbol']}: {item.get('reason', 'N/A')}")

    log.info("=" * 40)
    return new_watchlist


def _save_watchlist_to_db(
    watchlist: list[str],
    added: list[dict],
    candidates: list[dict],
    timestamp: datetime,
) -> None:
    """Persist the watchlist state to Supabase."""
    client = db.get_client()

    # Deactivate all current entries
    client.table("watchlist").update(
        {"active": False, "updated_at": timestamp.isoformat()}
    ).eq("active", True).execute()

    # Insert/update each symbol
    for sym in watchlist:
        # Find if it was added from discovery
        discovered = next((a for a in added if a["symbol"] == sym), None)
        candidate = next((c for c in candidates if c["symbol"] == sym), None)

        source = "base"
        reason = "Core/base watchlist"
        score = 0.0
        sources_list: list[str] = []

        if discovered:
            source = "ai_approved"
            reason = discovered.get("reason", "AI approved")
            if candidate:
                score = candidate.get("score", 0)
                sources_list = candidate.get("sources", [])
        elif candidate:
            source = "discovered"
            reason = "Score-based"
            score = candidate.get("score", 0)
            sources_list = candidate.get("sources", [])

        client.table("watchlist").upsert(
            {
                "symbol": sym,
                "source": source,
                "reason": reason,
                "score": score,
                "discovery_sources": sources_list,
                "active": True,
                "added_at": timestamp.isoformat(),
                "updated_at": timestamp.isoformat(),
            },
            on_conflict="symbol",
        ).execute()


# ── Utility ──────────────────────────────────────────────────

def get_active_watchlist() -> list[str]:
    """Get the current active watchlist from Supabase."""
    try:
        client = db.get_client()
        resp = (
            client.table("watchlist")
            .select("symbol")
            .eq("active", True)
            .order("score", desc=True)
            .execute()
        )
        symbols = [r["symbol"] for r in (resp.data or [])]
        if symbols:
            return symbols
    except Exception as e:
        log.warning(f"Failed to load watchlist from DB: {e}")

    # Fallback to config
    return list(set(config.WATCHLIST) | CORE_SYMBOLS)
