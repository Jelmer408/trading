"""
Automated fundamental + AI analysis for all watchlist stocks.

Runs daily for each active stock: fetches fundamentals, market snapshot,
Reddit buzz, then asks Gemini for a comprehensive analysis. Results are
cached in Supabase so the dashboard always has fresh data.
"""

import asyncio
from datetime import datetime, timezone

from bot.config import config
from bot.data.supabase_client import get_client
from bot.data.fundamentals import (
    get_fundamentals,
    get_stock_snapshot,
    format_for_ai,
    format_snapshot_for_ai,
)
from bot.ai.analyst import _call_ai
from bot.utils.logger import log
from bot.utils import activity


# ── System prompt ────────────────────────────────────────────

FUNDAMENTAL_SYSTEM = """You are a senior equity analyst providing daily stock analysis for a day-trading system.

Your analysis should be:
- Actionable for intraday traders
- Data-driven using the provided fundamentals, technicals, and sentiment
- Honest about risks and uncertainties
- Concise but comprehensive

Format your response in clean markdown with sections:
1. **Company Overview** - What the company does, sector positioning
2. **Technical Analysis** - Current price action, key levels, trend
3. **Fundamental Assessment** - Valuation, financial health, growth
4. **Social Sentiment** - Reddit/social buzz analysis
5. **Day Trading Outlook** - Key levels, setups, risk/reward
6. **Rating** - STRONG BUY / BUY / NEUTRAL / SELL / STRONG SELL with conviction %"""


# ── Helpers ──────────────────────────────────────────────────

def _get_active_watchlist() -> list[str]:
    """Get all active symbols from the watchlist table."""
    try:
        client = get_client()
        resp = (
            client.table("watchlist")
            .select("symbol")
            .eq("active", True)
            .execute()
        )
        return [r["symbol"] for r in (resp.data or [])]
    except Exception as e:
        log.error(f"Failed to get active watchlist: {e}")
        return []


def _needs_analysis(symbol: str) -> bool:
    """Check if a symbol needs fresh AI analysis (not done today)."""
    try:
        client = get_client()
        resp = (
            client.table("fundamentals")
            .select("ai_analyzed_at")
            .eq("symbol", symbol)
            .execute()
        )
        if not resp.data:
            return True
        row = resp.data[0]
        if not row.get("ai_analyzed_at"):
            return True
        analyzed = datetime.fromisoformat(row["ai_analyzed_at"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        # Fresh if same calendar day (UTC)
        return not (
            analyzed.year == now.year
            and analyzed.month == now.month
            and analyzed.day == now.day
        )
    except Exception as e:
        log.debug(f"Analysis freshness check failed for {symbol}: {e}")
        return True


def _get_reddit_buzz(symbol: str) -> list[dict]:
    """Pull latest Reddit posts for a symbol from activity_log."""
    try:
        client = get_client()
        resp = (
            client.table("activity_log")
            .select("metadata")
            .eq("agent", "scanner")
            .eq("event_type", "scan_result")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        posts = []
        seen = set()
        for row in (resp.data or []):
            tickers = (row.get("metadata") or {}).get("tickers", [])
            for t in tickers:
                if t.get("symbol", "").upper() != symbol.upper():
                    continue
                for p in t.get("posts", []):
                    url = p.get("url", "")
                    if url and url not in seen:
                        posts.append(p)
                        seen.add(url)
        posts.sort(key=lambda p: p.get("upvotes", 0), reverse=True)
        return posts[:10]
    except Exception as e:
        log.debug(f"Reddit buzz fetch failed for {symbol}: {e}")
        return []


def _get_apewisdom_data(symbol: str) -> dict | None:
    """Fetch live ApeWisdom ranking data for a symbol."""
    import httpx

    filters = ["all-stocks", "wallstreetbets"]
    for filter_name in filters:
        try:
            resp = httpx.get(
                f"https://apewisdom.io/api/v1.0/filter/{filter_name}/page/1",
                headers={"User-Agent": "CandleBot/1.0"},
                timeout=10,
            )
            if resp.status_code != 200:
                continue
            data = resp.json()
            for item in data.get("results", []):
                if (item.get("ticker") or "").upper() == symbol.upper():
                    return {
                        "rank": int(item.get("rank") or 99),
                        "mentions": int(item.get("mentions") or 0),
                        "upvotes": int(item.get("upvotes") or 0),
                        "rank_24h_ago": int(item.get("rank_24h_ago") or 99),
                        "mentions_24h_ago": int(item.get("mentions_24h_ago") or 0),
                        "filter": filter_name,
                    }
        except Exception:
            continue
    return None


def _save_analysis(symbol: str, summary: str) -> None:
    """Save the AI analysis to the fundamentals table."""
    try:
        client = get_client()
        client.table("fundamentals").upsert(
            {
                "symbol": symbol,
                "ai_summary": summary,
                "ai_analyzed_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="symbol",
        ).execute()
    except Exception as e:
        log.error(f"Failed to save AI analysis for {symbol}: {e}")


# ── Build prompt ─────────────────────────────────────────────

def _build_prompt(
    symbol: str,
    fundamentals: dict,
    snapshot: dict,
    reddit_posts: list[dict],
    apewisdom: dict | None = None,
) -> str:
    """Build the analysis prompt with all available data."""
    parts = [f"Provide a comprehensive daily analysis for **{symbol}**."]
    parts.append(f"\nToday's date: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}")

    # Fundamentals
    fund_str = format_for_ai(fundamentals)
    if fund_str and "No fundamental" not in fund_str:
        parts.append(f"\n### Fundamentals\n{fund_str}")

    # Live market data
    snap_str = format_snapshot_for_ai(snapshot)
    if snap_str and "No market" not in snap_str:
        parts.append(f"\n### Live Market Data\n{snap_str}")

    # ApeWisdom trending data
    parts.append("\n### Social Sentiment")
    if apewisdom:
        rank = apewisdom.get("rank", "N/A")
        mentions = apewisdom.get("mentions", 0)
        upvotes = apewisdom.get("upvotes", 0)
        rank_24h = apewisdom.get("rank_24h_ago", 99)
        mentions_24h = apewisdom.get("mentions_24h_ago", 0)
        filter_name = apewisdom.get("filter", "all-stocks")
        rank_change = rank_24h - rank if isinstance(rank, int) else 0
        mention_change = mentions - mentions_24h

        parts.append(f"**ApeWisdom Rank: #{rank}** on r/{filter_name}")
        parts.append(f"  Mentions: {mentions} | Upvotes: {upvotes}")
        if rank_change != 0:
            parts.append(f"  24h Rank Trend: {'↑' if rank_change > 0 else '↓'}{abs(rank_change)} positions")
        if mention_change != 0:
            parts.append(f"  24h Mention Trend: {'+' if mention_change > 0 else ''}{mention_change}")
    else:
        parts.append("ApeWisdom: Not currently in top trending on Reddit stock communities.")

    # Reddit posts
    if reddit_posts:
        total_upvotes = sum(p.get("upvotes", 0) for p in reddit_posts)
        parts.append(f"\n**Reddit Posts** ({len(reddit_posts)} posts, {total_upvotes} total upvotes):")
        for p in reddit_posts[:8]:
            upv = p.get("upvotes", 0)
            sub = p.get("sub", "")
            title = p.get("title", "")
            meta = f"[{upv} upvotes]" if upv > 0 else ""
            parts.append(f"  {meta} {sub}: \"{title}\"")
            content = p.get("content", "")
            if content and len(content) > 20:
                parts.append(f"    > {content[:200]}")
    elif not apewisdom:
        parts.append("\nNo Reddit activity detected for this stock.")

    return "\n".join(parts)


# ── Public API ───────────────────────────────────────────────

async def analyze_single(symbol: str, force: bool = False) -> str | None:
    """Run fundamental + AI analysis for a single stock.

    Returns the AI summary text, or None if skipped/failed.
    """
    if not force and not _needs_analysis(symbol):
        log.debug(f"AI analysis fresh for {symbol}, skipping")
        return None

    log.info(f"Running AI analysis for {symbol}...")

    # Fetch data in parallel
    fund_task = get_fundamentals(symbol)
    snap_task = get_stock_snapshot(symbol)
    fundamentals, snapshot = await asyncio.gather(fund_task, snap_task)

    reddit_posts = _get_reddit_buzz(symbol)
    apewisdom = _get_apewisdom_data(symbol)

    prompt = _build_prompt(symbol, fundamentals, snapshot, reddit_posts, apewisdom)

    try:
        summary = await _call_ai(prompt, FUNDAMENTAL_SYSTEM)
        _save_analysis(symbol, summary)
        log.info(f"AI analysis complete for {symbol} ({len(summary)} chars)")

        activity.emit(
            event_type="ai_analysis",
            agent="analyst",
            symbol=symbol,
            title=f"Daily AI analysis: {symbol}",
            detail=summary[:2000],
            metadata={"type": "fundamental_analysis"},
            level="success",
        )
        return summary
    except Exception as e:
        log.error(f"AI analysis failed for {symbol}: {e}")
        activity.error("analyst", f"AI analysis failed for {symbol}", str(e))
        return None


async def analyze_watchlist(force: bool = False) -> dict[str, str]:
    """Run AI analysis for all active watchlist stocks.

    Processes stocks sequentially to avoid rate limits.
    Returns dict of symbol -> AI summary for newly analyzed stocks.
    """
    symbols = _get_active_watchlist()
    if not symbols:
        # Fall back to config watchlist
        symbols = list(config.WATCHLIST)

    log.info(f"Starting watchlist analysis for {len(symbols)} stocks...")

    results: dict[str, str] = {}
    analyzed = 0
    skipped = 0

    for symbol in symbols:
        try:
            summary = await analyze_single(symbol, force=force)
            if summary:
                results[symbol] = summary
                analyzed += 1
                # Small delay between API calls to avoid rate limits
                await asyncio.sleep(2)
            else:
                skipped += 1
        except Exception as e:
            log.error(f"Analysis failed for {symbol}: {e}")

    log.info(f"Watchlist analysis done: {analyzed} analyzed, {skipped} skipped (already fresh)")
    return results
