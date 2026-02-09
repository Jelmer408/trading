"""Fetch and cache fundamental data from Massive.com + Alpha Vantage APIs."""

import os
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx

from bot.config import config
from bot.data.supabase_client import get_client
from bot.utils.logger import log

MASSIVE_API_KEY = os.getenv("MASSIVE_API_KEY", "")
BASE_URL = "https://api.massive.com"
ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")

# Cache fundamentals for 24 hours (ratios update end-of-day)
CACHE_TTL_HOURS = 24


# ── Fetch from Massive.com ────────────────────────────────────

async def _fetch_ticker_details(symbol: str) -> dict[str, Any]:
    """Fetch company info from /v3/reference/tickers/{symbol}."""
    url = f"{BASE_URL}/v3/reference/tickers/{symbol}?apiKey={MASSIVE_API_KEY}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            log.warning(f"Ticker details API {resp.status_code} for {symbol}")
            return {}
        data = resp.json()
        results = data.get("results", {})
        return {
            "name": results.get("name"),
            "description": results.get("description"),
            "sector": results.get("sic_description"),
            "industry": results.get("sic_description"),
            "homepage_url": results.get("homepage_url"),
            "market_cap": results.get("market_cap"),
        }


async def _fetch_ratios(symbol: str) -> dict[str, Any]:
    """Fetch financial ratios from /stocks/financials/v1/ratios."""
    url = f"{BASE_URL}/stocks/financials/v1/ratios?ticker={symbol}&limit=1&apiKey={MASSIVE_API_KEY}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            log.warning(f"Ratios API {resp.status_code} for {symbol}")
            return {}
        data = resp.json()
        results = data.get("results", [])
        if not results:
            return {}
        r = results[0]
        return {
            "eps": r.get("earnings_per_share"),
            "pe_ratio": r.get("price_to_earnings"),
            "pb_ratio": r.get("price_to_book"),
            "ps_ratio": r.get("price_to_sales"),
            "price_to_cash_flow": r.get("price_to_cash_flow"),
            "price_to_free_cash_flow": r.get("price_to_free_cash_flow"),
            "ev_to_ebitda": r.get("ev_to_ebitda"),
            "ev_to_sales": r.get("ev_to_sales"),
            "enterprise_value": r.get("enterprise_value"),
            "return_on_equity": r.get("return_on_equity"),
            "return_on_assets": r.get("return_on_assets"),
            "debt_to_equity": r.get("debt_to_equity"),
            "current_ratio": r.get("current"),
            "quick_ratio": r.get("quick"),
            "cash_ratio": r.get("cash"),
            "free_cash_flow": r.get("free_cash_flow"),
            "avg_volume": r.get("average_volume"),
            "dividend_yield": r.get("dividend_yield"),
            "market_cap": r.get("market_cap"),
            "data_date": r.get("date"),
        }


async def _fetch_alpha_vantage(symbol: str) -> dict[str, Any]:
    """Fetch company overview from Alpha Vantage (free, has all ratios)."""
    if not ALPHA_VANTAGE_KEY:
        return {}

    url = f"https://www.alphavantage.co/query?function=OVERVIEW&symbol={symbol}&apikey={ALPHA_VANTAGE_KEY}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                log.warning(f"Alpha Vantage API {resp.status_code} for {symbol}")
                return {}
            data = resp.json()

        # Rate limit check
        if "Note" in data or "Information" in data:
            log.warning(f"Alpha Vantage rate limit for {symbol}")
            return {}

        if "Symbol" not in data:
            return {}

        def _float(key: str) -> float | None:
            v = data.get(key)
            if v and v != "None" and v != "-":
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return None
            return None

        return {
            "name": data.get("Name"),
            "description": data.get("Description"),
            "sector": data.get("Sector"),
            "industry": data.get("Industry"),
            "market_cap": _float("MarketCapitalization"),
            "eps": _float("EPS"),
            "pe_ratio": _float("PERatio"),
            "pb_ratio": _float("PriceToBookRatio"),
            "ps_ratio": _float("PriceToSalesRatioTTM"),
            "peg_ratio": _float("PEGRatio"),
            "forward_pe": _float("ForwardPE"),
            "ev_to_ebitda": _float("EVToEBITDA"),
            "ev_to_sales": _float("EVToRevenue"),
            "enterprise_value": _float("MarketCapitalization"),  # Approximation
            "return_on_equity": _float("ReturnOnEquityTTM"),
            "return_on_assets": _float("ReturnOnAssetsTTM"),
            "debt_to_equity": None,  # Not in AV overview, computed below
            "current_ratio": None,
            "free_cash_flow": None,
            "dividend_yield": _float("DividendYield"),
            "beta": _float("Beta"),
            "profit_margin": _float("ProfitMargin"),
            "analyst_target": _float("AnalystTargetPrice"),
            "earnings_growth": _float("QuarterlyEarningsGrowthYOY"),
            "revenue_growth": _float("QuarterlyRevenueGrowthYOY"),
            "book_value": _float("BookValue"),
            "avg_volume": None,
        }
    except Exception as e:
        log.error(f"Alpha Vantage fetch failed for {symbol}: {e}")
        return {}


async def fetch_fundamentals(symbol: str) -> dict[str, Any]:
    """Fetch fundamentals for a ticker (Massive.com details + Alpha Vantage ratios)."""
    try:
        # Fetch from all sources in parallel
        tasks = [_fetch_ticker_details(symbol)] if MASSIVE_API_KEY else []
        tasks_av = [_fetch_alpha_vantage(symbol)] if ALPHA_VANTAGE_KEY else []

        import asyncio
        results = await asyncio.gather(*(tasks + tasks_av), return_exceptions=True)

        merged: dict[str, Any] = {}

        # Layer 1: Massive.com ticker details (name, description, sector, market_cap)
        if MASSIVE_API_KEY and results and not isinstance(results[0], Exception):
            merged.update({k: v for k, v in results[0].items() if v is not None})

        # Layer 2: Alpha Vantage (all the ratios + better sector/industry)
        av_idx = 1 if MASSIVE_API_KEY else 0
        if ALPHA_VANTAGE_KEY and len(results) > av_idx and not isinstance(results[av_idx], Exception):
            av_data = results[av_idx]
            # Only overwrite with non-None values
            for k, v in av_data.items():
                if v is not None:
                    merged[k] = v

        merged["symbol"] = symbol
        return merged if len(merged) > 1 else {}
    except Exception as e:
        log.error(f"Failed to fetch fundamentals for {symbol}: {e}")
        return {}


# ── Supabase Cache ────────────────────────────────────────────

def _get_cached(symbol: str) -> dict[str, Any] | None:
    """Get cached fundamentals from Supabase if still fresh."""
    try:
        client = get_client()
        resp = (
            client.table("fundamentals")
            .select("*")
            .eq("symbol", symbol)
            .execute()
        )
        if not resp.data:
            return None
        row = resp.data[0]
        updated = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - updated > timedelta(hours=CACHE_TTL_HOURS):
            return None  # Stale
        return row
    except Exception as e:
        log.debug(f"Cache lookup failed for {symbol}: {e}")
        return None


def _save_to_cache(data: dict[str, Any]) -> None:
    """Upsert fundamentals into Supabase cache."""
    try:
        client = get_client()
        row = {k: v for k, v in data.items() if v is not None}
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        client.table("fundamentals").upsert(row, on_conflict="symbol").execute()
    except Exception as e:
        log.error(f"Failed to cache fundamentals for {data.get('symbol')}: {e}")


# ── Public API ────────────────────────────────────────────────

async def get_fundamentals(symbol: str, force_refresh: bool = False) -> dict[str, Any]:
    """
    Get fundamentals for a ticker, using cache when available.

    Returns dict with keys like pe_ratio, market_cap, eps, sector, etc.
    Returns empty dict if data unavailable.
    """
    if not force_refresh:
        cached = _get_cached(symbol)
        if cached:
            log.debug(f"Using cached fundamentals for {symbol}")
            return cached

    data = await fetch_fundamentals(symbol)
    if data and data.get("symbol"):
        _save_to_cache(data)
        return data
    return {}


async def get_fundamentals_batch(symbols: list[str], force_refresh: bool = False) -> dict[str, dict[str, Any]]:
    """
    Get fundamentals for multiple tickers.

    Returns dict mapping symbol -> fundamentals dict.
    """
    import asyncio

    async def _get(sym: str) -> tuple[str, dict[str, Any]]:
        return sym, await get_fundamentals(sym, force_refresh)

    results = await asyncio.gather(*[_get(s) for s in symbols], return_exceptions=True)
    out: dict[str, dict[str, Any]] = {}
    for r in results:
        if isinstance(r, tuple):
            sym, data = r
            if data:
                out[sym] = data
        else:
            log.error(f"Fundamentals batch error: {r}")
    return out


async def get_stock_snapshot(symbol: str) -> dict[str, Any]:
    """
    Get current stock snapshot (price, volume, change) from Massive.com.
    Returns dict with price, change_pct, volume, prev_close, day_high, day_low, vwap.
    """
    if not MASSIVE_API_KEY:
        return {}

    url = f"{BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}?apiKey={MASSIVE_API_KEY}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return {}
            data = resp.json()
            ticker = data.get("ticker", {})
            day = ticker.get("day", {})
            prev = ticker.get("prevDay", {})
            minute = ticker.get("min", {})
            last_quote = ticker.get("lastQuote", {})
            last_trade = ticker.get("lastTrade", {})

            price = last_trade.get("p") or minute.get("c") or day.get("c", 0)
            prev_close = prev.get("c", 0)
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0

            return {
                "price": price,
                "prev_close": prev_close,
                "change_pct": round(change_pct, 2),
                "day_volume": day.get("v", 0),
                "day_high": day.get("h", 0),
                "day_low": day.get("l", 0),
                "day_open": day.get("o", 0),
                "day_vwap": day.get("vw", 0),
                "prev_volume": prev.get("v", 0),
                "bid": last_quote.get("P", 0),
                "ask": last_quote.get("p", 0),
                "spread": round(abs((last_quote.get("p", 0) or 0) - (last_quote.get("P", 0) or 0)), 4),
            }
    except Exception as e:
        log.debug(f"Snapshot fetch failed for {symbol}: {e}")
        return {}


async def get_stock_snapshots_batch(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Get current stock snapshots for multiple tickers in parallel."""
    import asyncio

    async def _get(sym: str) -> tuple[str, dict[str, Any]]:
        return sym, await get_stock_snapshot(sym)

    results = await asyncio.gather(*[_get(s) for s in symbols], return_exceptions=True)
    out: dict[str, dict[str, Any]] = {}
    for r in results:
        if isinstance(r, tuple):
            sym, data = r
            if data:
                out[sym] = data
        else:
            log.debug(f"Snapshot batch error: {r}")
    return out


def format_snapshot_for_ai(snapshot: dict[str, Any]) -> str:
    """Format a stock snapshot into a concise string for AI prompts."""
    if not snapshot:
        return "No market data available."
    parts = []
    p = snapshot.get("price", 0)
    if p:
        parts.append(f"Price: ${p:.2f}")
    chg = snapshot.get("change_pct", 0)
    parts.append(f"Change: {'+' if chg >= 0 else ''}{chg:.1f}%")
    vol = snapshot.get("day_volume", 0)
    if vol:
        if vol >= 1e6:
            parts.append(f"Volume: {vol / 1e6:.1f}M")
        elif vol >= 1e3:
            parts.append(f"Volume: {vol / 1e3:.0f}K")
    prev_vol = snapshot.get("prev_volume", 0)
    if vol and prev_vol:
        rel = vol / prev_vol if prev_vol else 0
        parts.append(f"Rel Vol: {rel:.1f}x")
    spread = snapshot.get("spread", 0)
    if spread and p:
        spread_pct = spread / p * 100
        parts.append(f"Spread: {spread_pct:.2f}%")
    h = snapshot.get("day_high", 0)
    l = snapshot.get("day_low", 0)
    if h and l:
        parts.append(f"Range: ${l:.2f}-${h:.2f}")
    return " | ".join(parts)


def format_for_ai(fundamentals: dict[str, Any]) -> str:
    """Format fundamentals into a concise string for AI prompts."""
    if not fundamentals:
        return "No fundamental data available."

    parts = []
    sym = fundamentals.get("symbol", "?")
    name = fundamentals.get("name")
    if name:
        parts.append(f"{sym} ({name})")
    else:
        parts.append(sym)

    sector = fundamentals.get("sector") or fundamentals.get("industry")
    if sector:
        parts.append(f"Sector: {sector}")

    mc = fundamentals.get("market_cap")
    if mc:
        if mc >= 1e12:
            parts.append(f"Market Cap: ${mc / 1e12:.1f}T")
        elif mc >= 1e9:
            parts.append(f"Market Cap: ${mc / 1e9:.1f}B")
        elif mc >= 1e6:
            parts.append(f"Market Cap: ${mc / 1e6:.0f}M")

    pe = fundamentals.get("pe_ratio")
    if pe:
        parts.append(f"P/E: {pe:.1f}")

    pb = fundamentals.get("pb_ratio")
    if pb:
        parts.append(f"P/B: {pb:.1f}")

    ps = fundamentals.get("ps_ratio")
    if ps:
        parts.append(f"P/S: {ps:.1f}")

    eps = fundamentals.get("eps")
    if eps:
        parts.append(f"EPS: ${eps:.2f}")

    roe = fundamentals.get("return_on_equity")
    if roe:
        parts.append(f"ROE: {roe * 100:.1f}%" if abs(roe) < 1 else f"ROE: {roe:.1f}%")

    roa = fundamentals.get("return_on_assets")
    if roa:
        parts.append(f"ROA: {roa * 100:.1f}%" if abs(roa) < 1 else f"ROA: {roa:.1f}%")

    de = fundamentals.get("debt_to_equity")
    if de:
        parts.append(f"D/E: {de:.2f}")

    cr = fundamentals.get("current_ratio")
    if cr:
        parts.append(f"Current Ratio: {cr:.2f}")

    fcf = fundamentals.get("free_cash_flow")
    if fcf:
        if abs(fcf) >= 1e9:
            parts.append(f"FCF: ${fcf / 1e9:.1f}B")
        elif abs(fcf) >= 1e6:
            parts.append(f"FCF: ${fcf / 1e6:.0f}M")

    dy = fundamentals.get("dividend_yield")
    if dy and dy > 0:
        parts.append(f"Div Yield: {dy * 100:.2f}%" if dy < 1 else f"Div Yield: {dy:.2f}%")

    av = fundamentals.get("avg_volume")
    if av:
        if av >= 1e6:
            parts.append(f"Avg Vol: {av / 1e6:.1f}M")
        else:
            parts.append(f"Avg Vol: {av / 1e3:.0f}K")

    # Alpha Vantage extras
    beta = fundamentals.get("beta")
    if beta:
        parts.append(f"Beta: {beta:.2f}")

    fpe = fundamentals.get("forward_pe")
    if fpe:
        parts.append(f"Fwd P/E: {fpe:.1f}")

    peg = fundamentals.get("peg_ratio")
    if peg:
        parts.append(f"PEG: {peg:.2f}")

    pm = fundamentals.get("profit_margin")
    if pm:
        parts.append(f"Profit Margin: {pm * 100:.1f}%" if abs(pm) < 1 else f"Profit Margin: {pm:.1f}%")

    eg = fundamentals.get("earnings_growth")
    if eg:
        parts.append(f"Earnings Growth: {eg * 100:.1f}%" if abs(eg) < 10 else f"Earnings Growth: {eg:.0f}%")

    rg = fundamentals.get("revenue_growth")
    if rg:
        parts.append(f"Revenue Growth: {rg * 100:.1f}%" if abs(rg) < 10 else f"Revenue Growth: {rg:.0f}%")

    at = fundamentals.get("analyst_target")
    if at:
        parts.append(f"Analyst Target: ${at:.2f}")

    return " | ".join(parts)
