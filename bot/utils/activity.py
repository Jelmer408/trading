"""
Activity logger -- writes every pipeline step to Supabase for full agent visibility.

Every scan, AI call, pattern detection, trade decision gets logged here so the
dashboard can show the entire agent network in real time.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any

from bot.utils.logger import log


# ── Buffered writer (batches DB writes) ──────────────────────

_buffer: list[dict] = []
_flush_lock = asyncio.Lock()


def _get_client():
    """Lazy import to avoid circular deps."""
    from bot.data.supabase_client import get_client
    return get_client()


async def _flush_buffer() -> None:
    """Write buffered events to Supabase."""
    global _buffer
    async with _flush_lock:
        if not _buffer:
            return
        batch = _buffer.copy()
        _buffer.clear()

    try:
        client = _get_client()
        client.table("activity_log").insert(batch).execute()
    except Exception as e:
        log.warning(f"Activity log flush failed ({len(batch)} events): {e}")
        # Don't re-add to buffer to avoid infinite growth


def emit(
    event_type: str,
    agent: str,
    title: str,
    detail: str | None = None,
    symbol: str | None = None,
    metadata: dict[str, Any] | None = None,
    level: str = "info",
) -> None:
    """
    Log an activity event (non-blocking).

    Args:
        event_type: Category like 'scan_reddit', 'ai_trade', 'pattern', etc.
        agent: Which agent produced this: 'scanner', 'analyst', 'strategist', 'executor', 'news_ai'
        title: Short human-readable title (shown in feed)
        detail: Longer text -- AI prompts, responses, analysis text
        symbol: Stock symbol if relevant
        metadata: Structured data (scores, decisions, tickers list)
        level: 'info', 'warn', 'error', 'success'
    """
    event = {
        "event_type": event_type,
        "agent": agent,
        "title": title,
        "detail": (detail or "")[:4000],  # Truncate to avoid huge payloads
        "symbol": symbol,
        "metadata": metadata or {},
        "level": level,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _buffer.append(event)

    # Auto-flush when buffer gets large
    if len(_buffer) >= 5:
        asyncio.ensure_future(_flush_buffer())


async def flush() -> None:
    """Force flush any remaining events."""
    await _flush_buffer()


# ── Convenience methods ──────────────────────────────────────

def scan_started(source: str) -> None:
    emit(
        event_type="scan_started",
        agent="scanner",
        title=f"Scan started: {source}",
        level="info",
    )


def scan_result(source: str, tickers: list[dict], count: int) -> None:
    top_5 = [t["symbol"] for t in tickers[:5]]
    # Include full ticker objects with posts for dashboard display
    ticker_objects = [
        {
            "symbol": t["symbol"],
            "score": t.get("score", 0),
            "sources": t.get("sources", []),
            "posts": t.get("posts", [])[:6],  # Cap posts per ticker in metadata
        }
        for t in tickers[:25]
    ]
    emit(
        event_type="scan_result",
        agent="scanner",
        title=f"{source.upper()} scan: {count} tickers found",
        detail=f"Top tickers: {', '.join(top_5)}" if top_5 else "No tickers found",
        metadata={"count": count, "top": top_5, "tickers": ticker_objects, "source": source},
        level="info" if count > 0 else "warn",
    )


def ai_request(agent: str, symbol: str | None, title: str, prompt: str) -> None:
    emit(
        event_type="ai_request",
        agent=agent,
        symbol=symbol,
        title=title,
        detail=prompt[:3000],
        level="info",
    )


def ai_response(agent: str, symbol: str | None, title: str, response: str, metadata: dict | None = None) -> None:
    emit(
        event_type="ai_response",
        agent=agent,
        symbol=symbol,
        title=title,
        detail=response[:3000],
        metadata=metadata or {},
        level="success",
    )


def pattern_detected(symbol: str, pattern: str, direction: str, strength: float) -> None:
    emit(
        event_type="pattern",
        agent="strategist",
        symbol=symbol,
        title=f"Pattern: {pattern.replace('_', ' ')}",
        detail=f"{direction.upper()} signal, strength {strength:.0%}",
        metadata={"pattern": pattern, "direction": direction, "strength": strength},
        level="info",
    )


def trade_decision(symbol: str, decision: str, confidence: float, reasoning: str) -> None:
    level = "success" if decision != "skip" else "info"
    emit(
        event_type="trade_decision",
        agent="analyst",
        symbol=symbol,
        title=f"AI Decision: {decision.upper()} ({confidence:.0%})",
        detail=reasoning,
        metadata={"decision": decision, "confidence": confidence},
        level=level,
    )


def trade_executed(symbol: str, side: str, qty: float, price: float) -> None:
    emit(
        event_type="trade",
        agent="executor",
        symbol=symbol,
        title=f"Trade: {side.upper()} {qty} {symbol} @ ${price:.2f}",
        metadata={"side": side, "quantity": qty, "price": price},
        level="success",
    )


def news_analysis(symbol: str, headline: str, analysis: str, sentiment: str) -> None:
    emit(
        event_type="news_analysis",
        agent="news_ai",
        symbol=symbol,
        title=f"News: {headline[:80]}",
        detail=analysis[:2000],
        metadata={"sentiment": sentiment},
        level="info",
    )


def watchlist_update(added: list[str], removed: list[str], total: int) -> None:
    emit(
        event_type="watchlist_update",
        agent="scanner",
        title=f"Watchlist: {total} symbols (+{len(added)} -{len(removed)})",
        detail=f"Added: {', '.join(added) or 'none'} | Removed: {', '.join(removed) or 'none'}",
        metadata={"added": added, "removed": removed, "total": total},
        level="success" if added else "info",
    )


def error(agent: str, title: str, detail: str, symbol: str | None = None) -> None:
    emit(
        event_type="error",
        agent=agent,
        symbol=symbol,
        title=title,
        detail=detail,
        level="error",
    )
