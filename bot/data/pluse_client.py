"""
PlusE Finance API client for LLM-friendly stock data.

PlusE provides pre-digested technical analysis, ML predictions,
and news sentiment via their MCP-compatible REST API (Streamable HTTP).
Docs: https://plusefin.com
"""

import httpx
import json
from typing import Any

from bot.config import config
from bot.utils.logger import log


BASE_URL = "https://mcp.plusefin.com"
TIMEOUT = 30.0

# MCP session state (refreshed per bot lifetime)
_session_id: str | None = None
_request_id: int = 0


def _next_id() -> int:
    global _request_id
    _request_id += 1
    return _request_id


def _get_headers(include_session: bool = True) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if include_session and _session_id:
        headers["Mcp-Session-Id"] = _session_id
    return headers


def _parse_sse_response(text: str) -> dict | None:
    """Parse SSE (text/event-stream) response to extract JSON data."""
    for line in text.split("\n"):
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                continue
    return None


async def _init_session() -> bool:
    """Initialize MCP session with PlusE server."""
    global _session_id

    if not config.PLUSE_API_KEY:
        log.warning("PLUSE_API_KEY not set, skipping PlusE")
        return False

    url = f"{BASE_URL}/mcp?apikey={config.PLUSE_API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Step 1: Send initialize request
            resp = await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "trade-bot", "version": "1.0.0"},
                    },
                    "id": _next_id(),
                },
                headers=_get_headers(include_session=False),
            )
            resp.raise_for_status()

            # Extract session ID from response header
            _session_id = resp.headers.get("mcp-session-id")
            if not _session_id:
                log.error("PlusE: no session ID in initialize response")
                return False

            # Step 2: Send initialized notification
            await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                },
                headers=_get_headers(),
            )

            log.info(f"PlusE session initialized: {_session_id[:12]}...")
            return True

    except Exception as e:
        log.error(f"PlusE session init failed: {e}")
        return False


async def _call_tool(tool_name: str, arguments: dict[str, Any]) -> Any:
    """Call a PlusE Finance MCP tool via their Streamable HTTP endpoint."""
    global _session_id

    if not config.PLUSE_API_KEY:
        return None

    # Initialize session if needed
    if not _session_id:
        ok = await _init_session()
        if not ok:
            return None

    url = f"{BASE_URL}/mcp?apikey={config.PLUSE_API_KEY}"

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
        "id": _next_id(),
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=_get_headers())
            resp.raise_for_status()

            # Parse SSE response
            data = _parse_sse_response(resp.text)
            if not data:
                log.error(f"PlusE: empty SSE response for {tool_name}")
                return None

            if "result" in data:
                content = data["result"].get("content", [])
                if content and isinstance(content, list):
                    return content[0].get("text", "")
                return content
            elif "error" in data:
                err = data["error"]
                log.error(f"PlusE error on {tool_name}: {err}")
                # Session might be expired, reset it
                if "session" in str(err).lower():
                    _session_id = None
                return None
            return data

    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403, 406):
            _session_id = None  # Force re-init
            log.error(f"PlusE auth/session error on {tool_name}: {e}")
        else:
            log.error(f"PlusE HTTP error on {tool_name}: {e}")
        return None
    except Exception as e:
        log.error(f"PlusE request failed for {tool_name}: {e}")
        return None


# ── Public API ───────────────────────────────────────────────


async def get_ticker_data(ticker: str) -> str | None:
    """
    Get comprehensive report: overview, news, metrics, sector/industry
    valuation, performance, dates, analyst recommendations.
    """
    result = await _call_tool("get_ticker_data", {"ticker": ticker})
    if result:
        log.info(f"PlusE ticker data for {ticker}: {len(str(result))} chars")
    return result


async def get_price_history(ticker: str, period: str = "1mo") -> str | None:
    """
    Get historical price data digest with technical indicators (ta-lib),
    risk metrics, and quantitative analysis.
    """
    result = await _call_tool("get_price_history", {"ticker": ticker, "period": period})
    if result:
        log.info(f"PlusE price history for {ticker}: {len(str(result))} chars")
    return result


async def get_price_prediction(ticker: str) -> str | None:
    """
    ML model prediction: whether price will be lower than threshold
    in next 5 days, with confusion matrix and probability.
    """
    result = await _call_tool("price_prediction", {"ticker": ticker})
    if result:
        log.info(f"PlusE prediction for {ticker}: {len(str(result))} chars")
    return result


async def get_ticker_news(ticker: str) -> str | None:
    """Get latest financial news for a ticker."""
    result = await _call_tool("get_ticker_news_tool", {"ticker": ticker})
    if result:
        log.info(f"PlusE news for {ticker}: {len(str(result))} chars")
    return result


async def get_market_sentiment() -> str | None:
    """
    Get market-wide sentiment: CNN Fear & Greed Index, Market RSI, VIX.
    """
    result = await _call_tool("get_overall_sentiment_tool", {})
    if result:
        log.info(f"PlusE market sentiment: {len(str(result))} chars")
    return result


async def get_full_analysis(symbol: str) -> dict[str, str | None]:
    """
    Get all available PlusE analysis for a symbol.
    Returns a dict with all analysis components for AI consumption.
    """
    import asyncio

    ticker_data, price_hist, prediction, news = await asyncio.gather(
        get_ticker_data(symbol),
        get_price_history(symbol, period="1mo"),
        get_price_prediction(symbol),
        get_ticker_news(symbol),
        return_exceptions=True,
    )

    return {
        "ticker_data": ticker_data if isinstance(ticker_data, str) else None,
        "price_history": price_hist if isinstance(price_hist, str) else None,
        "ml_prediction": prediction if isinstance(prediction, str) else None,
        "news": news if isinstance(news, str) else None,
    }
