"""
Dynamic Watchlist Manager.

Periodically scans Reddit (r/wallstreetbets, r/stocks, etc.) and news sources
to discover trending stocks. Enriches each candidate with fundamentals + live
market data before using AI to evaluate. Only adds stocks that pass both the
data screen AND AI evaluation.
"""

import asyncio
import json
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any

from bot.config import config
from bot.utils.logger import log
from bot.utils import activity
from bot.data import reddit_scanner
from bot.data import news_scanner
from bot.data import supabase_client as db
from bot.data.fundamentals import (
    get_fundamentals_batch,
    get_stock_snapshots_batch,
    format_for_ai,
    format_snapshot_for_ai,
)


# ── Configuration ─────────────────────────────────────────────

# Maximum total symbols on the watchlist (including base)
MAX_WATCHLIST_SIZE = 15

# Minimum combined score to be considered a candidate
MIN_DISCOVERY_SCORE = 5.0

# How many top candidates to evaluate with AI
MAX_AI_CANDIDATES = 10

# Symbols that should always be on the watchlist
CORE_SYMBOLS = {"SPY", "QQQ"}

# How long to cooldown a rejected symbol before re-evaluating (hours)
REJECTION_COOLDOWN_HOURS = 6


# ── Rejection Cooldown ────────────────────────────────────────
# Tracks recently rejected symbols so we don't re-evaluate them
# every 15-minute cycle. Persisted to Supabase + kept in memory.

_rejection_cache: dict[str, datetime] = {}  # symbol -> rejected_at (UTC)
_rejection_cache_loaded = False


def _load_rejections_from_db() -> None:
    """Load recent rejections from Supabase watchlist table on first run."""
    global _rejection_cache_loaded
    if _rejection_cache_loaded:
        return
    _rejection_cache_loaded = True

    try:
        client = db.get_client()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=REJECTION_COOLDOWN_HOURS)).isoformat()
        resp = (
            client.table("watchlist")
            .select("symbol, updated_at")
            .eq("source", "rejected")
            .gte("updated_at", cutoff)
            .execute()
        )
        for row in (resp.data or []):
            sym = row["symbol"]
            ts = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
            _rejection_cache[sym] = ts
        if _rejection_cache:
            log.info(f"Loaded {len(_rejection_cache)} recent rejections from DB: {', '.join(_rejection_cache.keys())}")
    except Exception as e:
        log.warning(f"Failed to load rejections from DB: {e}")


def _is_on_cooldown(symbol: str) -> bool:
    """Check if a symbol was recently rejected and is still on cooldown."""
    ts = _rejection_cache.get(symbol)
    if not ts:
        return False
    elapsed = datetime.now(timezone.utc) - ts
    if elapsed > timedelta(hours=REJECTION_COOLDOWN_HOURS):
        # Cooldown expired, remove from cache
        del _rejection_cache[symbol]
        return False
    return True


def _record_rejection(symbol: str, reason: str) -> None:
    """Record a rejection in memory and persist to Supabase."""
    now = datetime.now(timezone.utc)
    _rejection_cache[symbol] = now

    # Persist to DB so it survives deploys
    try:
        client = db.get_client()
        client.table("watchlist").upsert(
            {
                "symbol": symbol,
                "source": "rejected",
                "reason": reason,
                "score": 0,
                "discovery_sources": [],
                "active": False,
                "updated_at": now.isoformat(),
            },
            on_conflict="symbol",
        ).execute()
    except Exception as e:
        log.debug(f"Failed to persist rejection for {symbol}: {e}")


def _record_rejections_batch(rejected: list[dict]) -> None:
    """Record multiple rejections from AI response."""
    for r in rejected:
        sym = r.get("symbol", "")
        reason = r.get("reason", "AI rejected")
        if sym:
            _record_rejection(sym, reason)


# ── AI Evaluation ─────────────────────────────────────────────

WATCHLIST_EVAL_SYSTEM = """You are a senior equity analyst who screens stocks for an autonomous day-trading bot.

You receive candidate stocks enriched with:
1. **Social buzz** — ApeWisdom rank (cross-Reddit trending), Reddit mentions, upvotes, rank trend (24h), actual post titles
2. **News headlines** — recent market-moving headlines
3. **Fundamentals** — market cap, P/E, EPS, ROE, D/E, FCF, sector
4. **Live market data** — current price, volume, change %, spread, day range

NOTE: ApeWisdom rank is a key signal — it tracks the most discussed stocks across all Reddit stock communities. A rank of #1-10 means the stock is extremely hot right now. A rising rank (↑) means momentum is building.

Evaluate each candidate holistically. ALL data sources matter.

## APPROVAL CRITERIA (must meet MOST of these):
- Market cap > $500M (no micro-caps / penny stocks)
- Share price > $5
- Day volume > 500K shares (or relative volume > 1.5x average)
- Reasonable spread (< 0.1% for large caps, < 0.5% for mid caps)
- Has a clear catalyst (earnings, news, FDA, product launch, sector momentum)
- Showing intraday momentum or volatility (good for day-trading setups)
- Fundamentals support the direction (e.g. growth stock with positive EPS trend)
- Social buzz is backed by real substance (not pure pump-and-dump)
- Financial health: not excessive debt (D/E < 3), positive or improving FCF

## REJECTION CRITERIA (any ONE is enough to reject):
- Penny stock / OTC (price < $1)
- Market cap < $100M — too illiquid for safe day trading
- Pure meme with zero fundamental basis and no catalyst
- Already had its big move today (> 20% and fading) — buying the top
- Extremely wide spread (> 1%) — hard to trade profitably
- Company in bankruptcy or facing delisting
- No volume — fewer than 100K shares traded today
- Terrible fundamentals AND no catalyst (value trap)

## RESPONSE FORMAT — valid JSON only:
{
    "approved": [
        {"symbol": "NVDA", "reason": "AI sector catalyst, strong fundamentals (P/E 35, ROE 115%), 2.5x volume surge, bullish Reddit sentiment backed by earnings beat", "priority": 1},
        {"symbol": "TSLA", "reason": "Delivery numbers catalyst, $800B market cap, 1.8x relative volume, healthy momentum", "priority": 2}
    ],
    "rejected": [
        {"symbol": "BBBY", "reason": "Bankrupt, $0.15 share price, pure meme with no fundamental basis"}
    ],
    "market_context": "Brief 1-sentence summary of overall market conditions based on the data you see"
}"""


async def _ai_evaluate_candidates(candidates: list[dict]) -> list[dict]:
    """
    Use AI to evaluate and filter watchlist candidates.
    Each candidate is enriched with fundamentals + live market data.
    """
    from bot.ai.analyst import _call_ai

    prompt_parts = [
        f"## Watchlist Candidates to Evaluate ({len(candidates)} stocks)\n",
        f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n",
    ]

    for c in candidates:
        sym = c["symbol"]
        prompt_parts.append(f"\n### {sym}")
        prompt_parts.append(f"**Social Score:** {c['score']} | Sources: {', '.join(c.get('sources', []))}")

        # Reddit + ApeWisdom data
        reddit_data = c.get("reddit_data", {})
        if reddit_data:
            rank = reddit_data.get("rank")
            rank_change = reddit_data.get("rank_change")
            mention_change = reddit_data.get("mention_change")

            rank_str = ""
            if rank is not None:
                rank_str = f" | **ApeWisdom Rank: #{rank}**"
                if rank_change is not None and rank_change != 0:
                    rank_str += f" ({'↑' if rank_change > 0 else '↓'}{abs(rank_change)} vs 24h ago)"
                if mention_change is not None and mention_change != 0:
                    rank_str += f" | Mention trend: {'+' if mention_change > 0 else ''}{mention_change}"

            prompt_parts.append(
                f"**Reddit:** {reddit_data.get('mentions', 0)} mentions, "
                f"{reddit_data.get('total_upvotes', 0)} total upvotes{rank_str}"
            )
            top_posts = reddit_data.get("top_posts", [])
            if top_posts:
                prompt_parts.append("**Top Reddit posts:**")
                for p in top_posts[:5]:
                    upv = p.get('upvotes', 0)
                    meta = f"[{upv} upvotes]" if upv > 0 else ""
                    content_snippet = p.get('content', '')[:150]
                    prompt_parts.append(f"  {meta} {p.get('title', '')[:120]}")
                    if content_snippet:
                        prompt_parts.append(f"    > {content_snippet}")

        # News
        headlines = c.get("headlines", [])
        if headlines:
            prompt_parts.append(f"**Headlines:** {'; '.join(headlines[:3])}")

        # Fundamentals
        fund_str = c.get("fundamentals_str")
        if fund_str and fund_str != "No fundamental data available.":
            prompt_parts.append(f"**Fundamentals:** {fund_str}")
        else:
            prompt_parts.append("**Fundamentals:** No data available (caution: may be OTC or very new)")

        # Live market data
        snap_str = c.get("snapshot_str")
        if snap_str and snap_str != "No market data available.":
            prompt_parts.append(f"**Live Market:** {snap_str}")
        else:
            prompt_parts.append("**Live Market:** No data (market may be closed — weekend/holiday/after-hours)")

        prompt_parts.append("")  # blank line

    # Add market hours context
    now = datetime.now(timezone.utc)
    weekday = now.weekday()  # 0=Mon, 6=Sun
    hour = now.hour
    is_market_hours = weekday < 5 and 13 <= hour <= 21  # ~9:30-4:30 ET in UTC
    if not is_market_hours:
        prompt_parts.append(
            "**⚠️ NOTE: Markets are currently CLOSED (weekend/holiday/after-hours). "
            "Live market data may be unavailable or stale. "
            "Evaluate candidates based on fundamentals, social buzz, and news. "
            "Do NOT reject solely because live market data is missing.**\n"
        )

    prompt_parts.append(
        "---\n"
        "Evaluate each candidate using ALL available data above. "
        "If live market data is unavailable due to market closure, rely on fundamentals, social buzz, and news catalysts. "
        "Only approve stocks that are genuinely suitable for day trading.\n"
        "Respond with valid JSON only."
    )

    prompt = "\n".join(prompt_parts)

    activity.ai_request(
        agent="analyst",
        symbol=None,
        title=f"Evaluating {len(candidates)} watchlist candidates (with fundamentals + market data)",
        prompt=prompt,
    )

    try:
        response = await _call_ai(prompt, WATCHLIST_EVAL_SYSTEM)

        # Parse JSON - handle markdown code fences
        json_str = response.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1]
            json_str = json_str.rsplit("```", 1)[0]
        # Try to extract JSON from mixed text
        if not json_str.startswith("{"):
            start = json_str.find("{")
            end = json_str.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = json_str[start:end]

        result = json.loads(json_str)
        approved = result.get("approved", [])
        rejected = result.get("rejected", [])
        context = result.get("market_context", "")

        log.info(
            f"AI approved {len(approved)} of {len(candidates)} candidates: "
            f"{', '.join(a['symbol'] for a in approved)}"
        )
        if rejected:
            log.info(
                f"AI rejected {len(rejected)}: "
                f"{', '.join(r['symbol'] + ' (' + r.get('reason', '')[:40] + ')' for r in rejected)}"
            )
        if context:
            log.info(f"Market context: {context}")

        # Record rejections so we don't re-evaluate them next cycle
        _record_rejections_batch(rejected)

        activity.ai_response(
            agent="analyst",
            symbol=None,
            title=f"Approved {len(approved)}/{len(candidates)} candidates",
            response=response[:2000],
            metadata={
                "approved": [a["symbol"] for a in approved],
                "rejected": [r["symbol"] for r in rejected],
                "market_context": context,
            },
        )
        return approved

    except json.JSONDecodeError as e:
        log.error(f"AI watchlist evaluation JSON parse error: {e}")
        # Fall back: only approve candidates that pass basic data screens
        return _fallback_screen(candidates)
    except Exception as e:
        log.error(f"AI watchlist evaluation failed: {e}")
        return _fallback_screen(candidates)


def _fallback_screen(candidates: list[dict]) -> list[dict]:
    """
    Fallback screening when AI is unavailable.
    Uses fundamentals + market data to do basic filtering.
    """
    approved = []
    for i, c in enumerate(candidates[:7], 1):
        snap = c.get("snapshot", {})
        fund = c.get("fundamentals", {})

        price = snap.get("price", 0)
        volume = snap.get("day_volume", 0)
        market_cap = fund.get("market_cap", 0)

        # Basic data-driven filters
        if price and price < 1:
            continue  # Penny stock
        if market_cap and market_cap < 100e6:
            continue  # Too small
        if volume and volume < 50_000:
            continue  # No volume

        reasons = []
        if c["score"] >= 10:
            reasons.append(f"high social score ({c['score']})")
        if volume and volume > 500_000:
            reasons.append("good volume")
        if market_cap and market_cap > 1e9:
            reasons.append("large cap")

        approved.append({
            "symbol": c["symbol"],
            "reason": f"Data-screened (AI unavailable): {', '.join(reasons) or 'meets basic criteria'}",
            "priority": i,
        })

    return approved


# ── Core Logic ───────────────────────────────────────────────

async def discover_candidates(current_watchlist: list[str] | None = None) -> list[dict]:
    """
    Run all scanners, merge results, then enrich top candidates with
    fundamentals + live market data before returning.
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
    reddit_data_map: dict[str, dict] = {}  # Per-ticker reddit data

    for item in reddit_results:
        sym = item["symbol"]
        combined_scores[sym] += item["score"]
        source_map.setdefault(sym, set()).update(item.get("sources", []))
        type_map.setdefault(sym, set()).add("reddit")
        # Store reddit-specific data (upvotes, posts, ApeWisdom rank/trends)
        existing = reddit_data_map.get(sym, {
            "mentions": 0, "total_upvotes": 0, "top_posts": [],
            "rank": None, "rank_24h_ago": None, "rank_change": None,
            "mention_change": None, "name": "",
        })
        existing["mentions"] += item.get("mentions", 0)
        existing["total_upvotes"] += item.get("total_upvotes", 0)
        # Keep ApeWisdom rank data (prefer lowest/best rank)
        if item.get("rank") is not None:
            if existing["rank"] is None or item["rank"] < existing["rank"]:
                existing["rank"] = item.get("rank")
                existing["rank_24h_ago"] = item.get("rank_24h_ago")
                existing["rank_change"] = item.get("rank_change")
                existing["mention_change"] = item.get("mention_change")
                existing["name"] = item.get("name", "")
        for p in item.get("posts", []):
            if len(existing["top_posts"]) < 5:
                existing["top_posts"].append(p)
        reddit_data_map[sym] = existing

    for item in news_results:
        sym = item["symbol"]
        # News gets a 1.5x boost since it's more reliable
        combined_scores[sym] += item["score"] * 1.5
        source_map.setdefault(sym, set()).update(item.get("sources", []))
        type_map.setdefault(sym, set()).add("news")
        headlines_map.setdefault(sym, []).extend(item.get("headlines", []))

    # Load rejection history (once per process lifetime)
    _load_rejections_from_db()

    # Skip symbols already on the active watchlist OR recently rejected
    already_active = set(config.WATCHLIST) | CORE_SYMBOLS
    if current_watchlist:
        already_active |= set(current_watchlist)

    raw_candidates = []
    cooldown_skipped = 0
    for sym, score in combined_scores.most_common(MAX_AI_CANDIDATES * 2):
        if score < MIN_DISCOVERY_SCORE:
            break
        if sym in already_active:
            continue
        if _is_on_cooldown(sym):
            cooldown_skipped += 1
            continue

        raw_candidates.append({
            "symbol": sym,
            "score": round(score, 2),
            "sources": sorted(source_map.get(sym, set())),
            "source_type": "+".join(sorted(type_map.get(sym, set()))),
            "headlines": headlines_map.get(sym, [])[:3],
            "reddit_data": reddit_data_map.get(sym, {}),
        })

    # Trim to top candidates before enriching (API calls are expensive)
    raw_candidates = raw_candidates[:MAX_AI_CANDIDATES]

    if cooldown_skipped:
        log.info(f"  Skipped {cooldown_skipped} symbols on rejection cooldown ({REJECTION_COOLDOWN_HOURS}h)")

    if not raw_candidates:
        log.info(
            f"Discovery found 0 NEW candidates "
            f"(reddit: {len(reddit_results)}, news: {len(news_results)}, "
            f"skipped {len(already_active)} already-active, {cooldown_skipped} on cooldown)"
        )
        return []

    # ── Enrich with fundamentals + live market data ──────────
    symbols = [c["symbol"] for c in raw_candidates]
    log.info(f"Enriching {len(symbols)} candidates with fundamentals + market data...")

    fund_data, snap_data = await asyncio.gather(
        get_fundamentals_batch(symbols),
        get_stock_snapshots_batch(symbols),
        return_exceptions=True,
    )

    if isinstance(fund_data, Exception):
        log.error(f"Fundamentals batch failed: {fund_data}")
        fund_data = {}
    if isinstance(snap_data, Exception):
        log.error(f"Snapshots batch failed: {snap_data}")
        snap_data = {}

    # ── Pre-filter: reject obvious misses before AI ──────────
    enriched = []
    for c in raw_candidates:
        sym = c["symbol"]
        fund = fund_data.get(sym, {})
        snap = snap_data.get(sym, {})

        # Store raw data for fallback screening
        c["fundamentals"] = fund
        c["snapshot"] = snap
        c["fundamentals_str"] = format_for_ai(fund)
        c["snapshot_str"] = format_snapshot_for_ai(snap)

        # Hard filters: reject before even sending to AI (also cooldown these)
        price = snap.get("price", 0)
        if price and price < 0.50:
            log.info(f"  Pre-filter REJECT {sym}: penny stock (${price:.2f})")
            _record_rejection(sym, f"Penny stock (${price:.2f})")
            continue

        market_cap = fund.get("market_cap", 0)
        if market_cap and market_cap < 50e6:
            log.info(f"  Pre-filter REJECT {sym}: micro-cap (${market_cap / 1e6:.0f}M)")
            _record_rejection(sym, f"Micro-cap (${market_cap / 1e6:.0f}M)")
            continue

        enriched.append(c)

    log.info(
        f"Discovery: {len(enriched)} enriched candidates "
        f"(from {len(raw_candidates)} raw, {len(raw_candidates) - len(enriched)} pre-filtered, "
        f"{cooldown_skipped} on cooldown, "
        f"reddit: {len(reddit_results)}, news: {len(news_results)})"
    )

    return enriched


async def evaluate_news_candidates(news_candidates: list[dict]) -> list[str]:
    """
    Evaluate stocks suggested by the news AI and add qualifying ones to the watchlist.

    Called from the news analysis loop when Gemini identifies high-urgency catalysts.
    Skips stocks already on the watchlist or on rejection cooldown.

    Returns the updated list of active watchlist symbols (or empty if nothing changed).
    """
    if not news_candidates:
        return []

    _load_rejections_from_db()
    current_active = get_active_watchlist()

    # Early exit if watchlist is full
    if len(current_active) >= MAX_WATCHLIST_SIZE:
        log.info(f"News candidates: watchlist at capacity ({len(current_active)}/{MAX_WATCHLIST_SIZE}) — skipping")
        return []

    already_active = set(current_active) | CORE_SYMBOLS | set(config.WATCHLIST)

    # Filter out already-active and cooldown symbols
    new_candidates = []
    for c in news_candidates:
        sym = c.get("symbol", "").upper().strip()
        if not sym or len(sym) > 5:
            continue
        if sym in already_active:
            continue
        if _is_on_cooldown(sym):
            continue
        new_candidates.append(c)

    if not new_candidates:
        log.info("News candidates: all already on watchlist or on cooldown")
        return []

    # Enrich with fundamentals + market data before AI eval
    symbols = [c["symbol"] for c in new_candidates]
    log.info(f"News-triggered: enriching {len(symbols)} candidates: {', '.join(symbols)}")

    fund_data, snap_data = await asyncio.gather(
        get_fundamentals_batch(symbols),
        get_stock_snapshots_batch(symbols),
        return_exceptions=True,
    )
    if isinstance(fund_data, Exception):
        fund_data = {}
    if isinstance(snap_data, Exception):
        snap_data = {}

    enriched = []
    for c in new_candidates:
        sym = c["symbol"]
        fund = fund_data.get(sym, {})
        snap = snap_data.get(sym, {})

        # Basic filters
        price = snap.get("price", 0)
        if price and price < 0.50:
            _record_rejection(sym, f"Penny stock (${price:.2f})")
            continue
        market_cap = fund.get("market_cap", 0)
        if market_cap and market_cap < 50e6:
            _record_rejection(sym, f"Micro-cap (${market_cap / 1e6:.0f}M)")
            continue

        enriched.append({
            "symbol": sym,
            "score": 15,  # High base score for news-driven candidates
            "sources": ["news_ai"],
            "source_type": "news_catalyst",
            "headlines": [c.get("reason", "")],
            "reddit_data": {},
            "fundamentals": fund,
            "snapshot": snap,
            "fundamentals_str": format_for_ai(fund),
            "snapshot_str": format_snapshot_for_ai(snap),
            "news_catalyst": c.get("catalyst", "unknown"),
            "news_sentiment": c.get("sentiment", "neutral"),
            "news_reason": c.get("reason", ""),
        })

    if not enriched:
        log.info("News candidates: all filtered out by pre-filters")
        return []

    # Run through the same AI evaluation as regular candidates
    approved = await _ai_evaluate_candidates(enriched)

    if not approved:
        log.info("News candidates: AI approved none")
        return []

    # Add to watchlist
    new_watchlist = list(set(current_active) | CORE_SYMBOLS | set(config.WATCHLIST))
    added_symbols: list[dict] = []

    for item in sorted(approved, key=lambda x: x.get("priority", 99)):
        sym = item["symbol"]
        if sym not in new_watchlist and len(new_watchlist) < MAX_WATCHLIST_SIZE:
            new_watchlist.append(sym)
            # Tag as news-triggered
            item["reason"] = f"[NEWS] {item.get('reason', '')}"
            added_symbols.append(item)

    if not added_symbols:
        return []

    # Persist
    now = datetime.now(timezone.utc)
    try:
        _save_watchlist_to_db(new_watchlist, added_symbols, enriched, now)
    except Exception as e:
        log.error(f"Failed to persist news-triggered watchlist update: {e}")

    added_syms = [s["symbol"] for s in added_symbols]
    log.info(f"News-triggered watchlist add: +{len(added_symbols)}: {', '.join(added_syms)}")
    for item in added_symbols:
        log.info(f"  + {item['symbol']}: {item.get('reason', '')[:120]}")

    activity.emit(
        event_type="watchlist_update",
        agent="news_ai",
        title=f"News catalyst: added {', '.join(added_syms)} to watchlist",
        detail="; ".join(f"{s['symbol']}: {s.get('reason', '')}" for s in added_symbols),
        metadata={"added": added_syms, "source": "news_catalyst"},
        level="success",
    )

    # Update config
    config.WATCHLIST = new_watchlist
    log.info(f"Watchlist updated: {len(new_watchlist)} symbols (+{len(added_symbols)} from news)")
    log.info("=" * 40)

    return new_watchlist


async def update_watchlist() -> list[str]:
    """
    Full watchlist update cycle:
    1. Load current active watchlist (preserves previously approved symbols)
    2. Discover NEW candidates (skips already-active symbols)
    3. AI-evaluate only new candidates
    4. Merge with current watchlist
    5. Persist to Supabase
    6. Return the updated active watchlist

    Returns the updated list of symbols.
    """
    log.info("=" * 40)
    log.info("Starting dynamic watchlist update...")

    # Step 0: Load current active watchlist so we don't re-evaluate existing symbols
    current_active = get_active_watchlist()
    log.info(f"Current watchlist: {', '.join(current_active)}")

    # Early exit: skip discovery + AI if watchlist is already at capacity
    if len(current_active) >= MAX_WATCHLIST_SIZE:
        log.info(f"Watchlist at capacity ({len(current_active)}/{MAX_WATCHLIST_SIZE}) — skipping discovery")
        log.info("=" * 40)
        return current_active

    # Step 1: Discover only NEW candidates (already-active symbols are skipped)
    candidates = await discover_candidates(current_watchlist=current_active)

    # Step 2: AI evaluation (skip if no new candidates)
    approved: list[dict] = []
    if candidates:
        approved = await _ai_evaluate_candidates(candidates)
    else:
        log.info("No new candidates to evaluate — watchlist unchanged")

    # Step 3: Build new watchlist — start from current active (preserves previous approvals)
    new_watchlist = list(CORE_SYMBOLS | set(config.WATCHLIST) | set(current_active))
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

    # Load existing metadata so we can preserve source/reason for non-new symbols
    existing_meta: dict[str, dict] = {}
    try:
        resp = (
            client.table("watchlist")
            .select("symbol, source, reason, score, discovery_sources, added_at")
            .eq("active", True)
            .execute()
        )
        for row in (resp.data or []):
            existing_meta[row["symbol"]] = row
    except Exception:
        pass

    # Deactivate all current entries
    client.table("watchlist").update(
        {"active": False, "updated_at": timestamp.isoformat()}
    ).eq("active", True).execute()

    # Insert/update each symbol
    for sym in watchlist:
        # Find if it was NEWLY added from this cycle's discovery
        discovered = next((a for a in added if a["symbol"] == sym), None)
        candidate = next((c for c in candidates if c["symbol"] == sym), None)
        existing = existing_meta.get(sym, {})

        if discovered:
            # Newly AI-approved this cycle
            source = "ai_approved"
            reason = discovered.get("reason", "AI approved")
            score = candidate.get("score", 0) if candidate else 0.0
            sources_list = candidate.get("sources", []) if candidate else []
            added_at = timestamp.isoformat()
        elif existing and existing.get("source") not in ("base", None):
            # Previously discovered/approved — preserve original metadata
            source = existing.get("source", "ai_approved")
            reason = existing.get("reason", "Previously approved")
            score = existing.get("score", 0)
            sources_list = existing.get("discovery_sources", [])
            added_at = existing.get("added_at", timestamp.isoformat())
        elif candidate:
            source = "discovered"
            reason = "Score-based"
            score = candidate.get("score", 0)
            sources_list = candidate.get("sources", [])
            added_at = timestamp.isoformat()
        else:
            # Base/core watchlist symbol
            source = "base"
            reason = "Core/base watchlist"
            score = 0.0
            sources_list = []
            added_at = existing.get("added_at", timestamp.isoformat())

        client.table("watchlist").upsert(
            {
                "symbol": sym,
                "source": source,
                "reason": reason,
                "score": score,
                "discovery_sources": sources_list,
                "active": True,
                "added_at": added_at,
                "updated_at": timestamp.isoformat(),
            },
            on_conflict="symbol",
        ).execute()


# ── Daily Reassessment ────────────────────────────────────────

REASSESS_SYSTEM = """You are a senior equity analyst performing a daily review of an active day-trading watchlist.

For each stock currently on the watchlist, you receive:
1. **Why it was added** — original reason and source
2. **Fundamentals** — market cap, P/E, EPS, ROE, D/E, FCF, sector
3. **Live market data** — current price, volume, change %, spread
4. **Current Reddit buzz** — whether it's still being discussed
5. **How long it's been on the watchlist**

Your job: decide which stocks should STAY and which should be REMOVED.

## KEEP criteria (should meet most):
- Still has an active catalyst or momentum
- Volume remains healthy (> 500K/day or above average)
- Fundamentals still support day-trading (reasonable spread, liquid)
- Still generating social buzz or news flow
- Haven't completed their move yet (still has room to run)

## REMOVE criteria (any ONE is enough):
- Catalyst has expired (earnings already reported, news is old)
- Volume has dried up significantly
- Reddit buzz has completely died — no longer trending
- Stock has completed its move and is now flat/ranging
- Been on watchlist > 3 days with no trades executed on it
- Fundamentals have deteriorated (downgrade, guidance cut, etc.)
- Better candidates are available and watchlist is at capacity

Be decisive. A lean, focused watchlist is better than a bloated one.

## RESPONSE FORMAT — valid JSON only:
{
    "keep": [
        {"symbol": "NVDA", "reason": "AI catalyst still active, 2x avg volume, earnings next week"}
    ],
    "remove": [
        {"symbol": "XYZ", "reason": "Catalyst expired (earnings were 4 days ago), volume back to normal, Reddit buzz dead"}
    ],
    "summary": "Brief 1-sentence summary of the reassessment"
}"""

_last_reassessment: datetime | None = None


def needs_reassessment() -> bool:
    """Check if a daily reassessment is due."""
    global _last_reassessment

    # Load last reassessment time from DB on first check
    if _last_reassessment is None:
        try:
            client = db.get_client()
            resp = (
                client.table("activity_log")
                .select("created_at")
                .eq("event_type", "watchlist_reassessment")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if resp.data:
                _last_reassessment = datetime.fromisoformat(
                    resp.data[0]["created_at"].replace("Z", "+00:00")
                )
            else:
                # Never reassessed — force one
                _last_reassessment = datetime.min.replace(tzinfo=timezone.utc)
        except Exception:
            _last_reassessment = datetime.min.replace(tzinfo=timezone.utc)

    elapsed = datetime.now(timezone.utc) - _last_reassessment
    return elapsed > timedelta(hours=24)


async def reassess_watchlist() -> list[str]:
    """
    Daily reassessment: review every non-base stock on the watchlist.
    Fetches fresh fundamentals + market data + Reddit buzz, then asks
    AI which stocks should stay and which should be removed.

    Returns the pruned watchlist.
    """
    global _last_reassessment
    from bot.ai.analyst import _call_ai

    log.info("=" * 40)
    log.info("DAILY REASSESSMENT — reviewing entire watchlist...")

    current = get_active_watchlist()
    protected = set(config.WATCHLIST) | CORE_SYMBOLS
    reviewable = [s for s in current if s not in protected]

    if not reviewable:
        log.info("No non-base stocks to reassess.")
        _last_reassessment = datetime.now(timezone.utc)
        return current

    log.info(f"Reassessing {len(reviewable)} discovered stocks: {', '.join(reviewable)}")
    log.info(f"Protected (always keep): {', '.join(sorted(protected))}")

    # Fetch fresh data for all reviewable stocks
    fund_data, snap_data, reddit_results = await asyncio.gather(
        get_fundamentals_batch(reviewable),
        get_stock_snapshots_batch(reviewable),
        reddit_scanner.scan_all_subreddits(limit_per_sub=25),
        return_exceptions=True,
    )

    if isinstance(fund_data, Exception):
        log.error(f"Reassess fundamentals failed: {fund_data}")
        fund_data = {}
    if isinstance(snap_data, Exception):
        log.error(f"Reassess snapshots failed: {snap_data}")
        snap_data = {}
    if isinstance(reddit_results, Exception):
        log.error(f"Reassess Reddit scan failed: {reddit_results}")
        reddit_results = []

    # Build reddit buzz lookup (with ApeWisdom rank data)
    reddit_buzz: dict[str, dict] = {}
    for item in (reddit_results if isinstance(reddit_results, list) else []):
        sym = item.get("symbol", "")
        if sym in reviewable:
            existing = reddit_buzz.get(sym, {
                "score": 0, "mentions": 0, "total_upvotes": 0,
                "rank": None, "rank_change": None, "mention_change": None,
            })
            existing["score"] = max(existing["score"], item.get("score", 0))
            existing["mentions"] += item.get("mentions", 0)
            existing["total_upvotes"] += item.get("total_upvotes", 0)
            if item.get("rank") is not None:
                if existing["rank"] is None or item["rank"] < existing["rank"]:
                    existing["rank"] = item.get("rank")
                    existing["rank_change"] = item.get("rank_change")
                    existing["mention_change"] = item.get("mention_change")
            reddit_buzz[sym] = existing

    # Load watchlist metadata (when added, why, source)
    watchlist_meta: dict[str, dict] = {}
    try:
        client = db.get_client()
        resp = (
            client.table("watchlist")
            .select("symbol, source, reason, score, added_at")
            .eq("active", True)
            .execute()
        )
        for row in (resp.data or []):
            watchlist_meta[row["symbol"]] = row
    except Exception:
        pass

    # Build the AI prompt
    prompt_parts = [
        f"## Daily Watchlist Reassessment ({len(reviewable)} stocks to review)\n",
        f"Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n",
        f"Protected symbols (always kept): {', '.join(sorted(protected))}\n",
    ]

    for sym in reviewable:
        fund = fund_data.get(sym, {})
        snap = snap_data.get(sym, {})
        buzz = reddit_buzz.get(sym, {})
        meta = watchlist_meta.get(sym, {})

        prompt_parts.append(f"\n### {sym}")

        # Why it was added
        added_at = meta.get("added_at", "")
        if added_at:
            try:
                added_dt = datetime.fromisoformat(added_at.replace("Z", "+00:00"))
                days_on = (datetime.now(timezone.utc) - added_dt).days
                prompt_parts.append(f"**On watchlist for:** {days_on} day(s)")
            except Exception:
                pass
        prompt_parts.append(f"**Originally added because:** {meta.get('reason', 'Unknown')}")
        prompt_parts.append(f"**Source:** {meta.get('source', 'unknown')} | Original score: {meta.get('score', 0)}")

        # Current fundamentals
        fund_str = format_for_ai(fund)
        if fund_str != "No fundamental data available.":
            prompt_parts.append(f"**Fundamentals:** {fund_str}")
        else:
            prompt_parts.append("**Fundamentals:** No data")

        # Current market data
        snap_str = format_snapshot_for_ai(snap)
        if snap_str != "No market data available.":
            prompt_parts.append(f"**Live Market:** {snap_str}")
        else:
            prompt_parts.append("**Live Market:** No data (market may be closed)")

        # Current Reddit buzz + ApeWisdom rank
        if buzz:
            buzz_parts = [
                f"score {buzz.get('score', 0)}",
                f"{buzz.get('mentions', 0)} mentions",
                f"{buzz.get('total_upvotes', 0)} upvotes",
            ]
            rank = buzz.get("rank")
            if rank is not None:
                rank_str = f"ApeWisdom Rank #{rank}"
                rc = buzz.get("rank_change")
                if rc is not None and rc != 0:
                    rank_str += f" ({'↑' if rc > 0 else '↓'}{abs(rc)} vs 24h ago)"
                mc = buzz.get("mention_change")
                if mc is not None and mc != 0:
                    rank_str += f", mentions {'+' if mc > 0 else ''}{mc} vs 24h"
                buzz_parts.append(rank_str)
            prompt_parts.append(f"**Current Reddit Buzz:** {', '.join(buzz_parts)}")
        else:
            prompt_parts.append("**Current Reddit Buzz:** None — not trending on Reddit right now")

        prompt_parts.append("")

    prompt_parts.append(
        "---\n"
        "Review each stock. Be ruthless — remove anything that no longer has a reason to be watched.\n"
        "A focused 5-8 stock watchlist is better than a bloated 15-stock one.\n"
        "Respond with valid JSON only."
    )

    prompt = "\n".join(prompt_parts)

    activity.ai_request(
        agent="analyst",
        symbol=None,
        title=f"Daily reassessment of {len(reviewable)} watchlist stocks",
        prompt=prompt,
    )

    removed_symbols: list[str] = []

    try:
        response = await _call_ai(prompt, REASSESS_SYSTEM)

        # Parse JSON
        json_str = response.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1]
            json_str = json_str.rsplit("```", 1)[0]
        if not json_str.startswith("{"):
            start = json_str.find("{")
            end = json_str.rfind("}") + 1
            if start >= 0 and end > start:
                json_str = json_str[start:end]

        result = json.loads(json_str)
        keep_list = result.get("keep", [])
        remove_list = result.get("remove", [])
        summary = result.get("summary", "")

        keep_symbols = {k["symbol"] for k in keep_list}
        removed_symbols = [r["symbol"] for r in remove_list]

        log.info(f"Reassessment: KEEP {len(keep_list)}, REMOVE {len(remove_list)}")
        for k in keep_list:
            log.info(f"  KEEP {k['symbol']}: {k.get('reason', '')[:80]}")
        for r in remove_list:
            log.info(f"  REMOVE {r['symbol']}: {r.get('reason', '')[:80]}")
        if summary:
            log.info(f"Summary: {summary}")

        activity.ai_response(
            agent="analyst",
            symbol=None,
            title=f"Reassessment: keep {len(keep_list)}, remove {len(remove_list)}",
            response=response[:2000],
            metadata={
                "keep": [k["symbol"] for k in keep_list],
                "removed": removed_symbols,
                "summary": summary,
            },
        )

    except Exception as e:
        log.error(f"Reassessment AI failed: {e} — keeping all stocks")
        keep_symbols = set(reviewable)

    # Build pruned watchlist: protected + kept
    pruned = list(protected)
    for sym in reviewable:
        if sym in keep_symbols:
            pruned.append(sym)

    # Deactivate removed stocks in DB
    now = datetime.now(timezone.utc)
    if removed_symbols:
        try:
            client = db.get_client()
            for sym in removed_symbols:
                client.table("watchlist").update({
                    "active": False,
                    "source": "removed",
                    "reason": next(
                        (r.get("reason", "Removed in daily reassessment")
                         for r in remove_list if r["symbol"] == sym),
                        "Removed in daily reassessment"
                    ),
                    "updated_at": now.isoformat(),
                }).eq("symbol", sym).execute()
        except Exception as e:
            log.error(f"Failed to deactivate removed symbols: {e}")

    # Log the reassessment event
    activity.emit(
        event_type="watchlist_reassessment",
        agent="analyst",
        title=f"Daily reassessment: {len(pruned)} kept, {len(removed_symbols)} removed",
        detail=f"Removed: {', '.join(removed_symbols) or 'none'}",
        level="info",
        metadata={
            "kept": [s for s in pruned if s not in protected],
            "removed": removed_symbols,
            "protected": sorted(protected),
        },
    )

    _last_reassessment = now

    log.info(
        f"Reassessment complete: {len(pruned)} stocks remain "
        f"({len(removed_symbols)} removed: {', '.join(removed_symbols) or 'none'})"
    )
    log.info("=" * 40)

    return pruned


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
