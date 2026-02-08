"""
PlusE Finance API client for LLM-friendly stock data.

PlusE provides pre-digested technical analysis, ML predictions,
and news sentiment via their MCP-compatible REST API.
Docs: https://plusefin.com
"""

import httpx
from typing import Any

from bot.config import config
from bot.utils.logger import log


BASE_URL = "https://mcp.plusefin.com"
TIMEOUT = 30.0


def _get_headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
    }


async def _call_tool(tool_name: str, arguments: dict[str, Any]) -> Any:
    """
    Call a PlusE Finance MCP tool via their HTTP endpoint.

    The PlusE MCP server accepts JSON-RPC style requests.
    """
    if not config.PLUSE_API_KEY:
        log.warning("PLUSE_API_KEY not set, skipping PlusE request")
        return None

    url = f"{BASE_URL}/mcp/?apikey={config.PLUSE_API_KEY}"

    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
        "id": 1,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=_get_headers())
            resp.raise_for_status()
            data = resp.json()

            if "result" in data:
                content = data["result"].get("content", [])
                if content and isinstance(content, list):
                    return content[0].get("text", "")
                return content
            elif "error" in data:
                log.error(f"PlusE error: {data['error']}")
                return None
            return data
    except httpx.HTTPError as e:
        log.error(f"PlusE HTTP error: {e}")
        return None
    except Exception as e:
        log.error(f"PlusE request failed: {e}")
        return None


# ── Public API ───────────────────────────────────────────────

async def get_price_summary(symbol: str) -> str | None:
    """
    Get a pre-digested price summary for a symbol.

    Returns LLM-friendly text with price trends, YTD changes, Sharpe ratios.
    """
    result = await _call_tool("get_price_summary", {"symbol": symbol})
    if result:
        log.info(f"PlusE price summary for {symbol}: {len(str(result))} chars")
    return result


async def get_technical_analysis(symbol: str) -> str | None:
    """
    Get technical analysis summary.

    Returns conclusions like "Long-term MA trending up, short-term bearish
    divergence suggests pullback" instead of raw indicator values.
    """
    result = await _call_tool("get_technical_analysis", {"symbol": symbol})
    if result:
        log.info(f"PlusE technical analysis for {symbol}: {len(str(result))} chars")
    return result


async def get_ml_prediction(symbol: str) -> str | None:
    """
    Get machine learning prediction.

    Returns probability-based predictions like "65% probability of sideways
    or slight dip in next 5 days, range $67-$72".
    """
    result = await _call_tool("get_ml_prediction", {"symbol": symbol})
    if result:
        log.info(f"PlusE ML prediction for {symbol}: {len(str(result))} chars")
    return result


async def get_news_sentiment(symbol: str) -> str | None:
    """
    Get aggregated news and social media sentiment for a symbol.
    """
    result = await _call_tool("get_news_sentiment", {"symbol": symbol})
    if result:
        log.info(f"PlusE news sentiment for {symbol}: {len(str(result))} chars")
    return result


async def get_full_analysis(symbol: str) -> dict[str, str | None]:
    """
    Get all available PlusE analysis for a symbol.

    Returns a dict with all analysis components that can be fed to the AI.
    """
    import asyncio

    price, technical, ml, news = await asyncio.gather(
        get_price_summary(symbol),
        get_technical_analysis(symbol),
        get_ml_prediction(symbol),
        get_news_sentiment(symbol),
        return_exceptions=True,
    )

    return {
        "price_summary": price if isinstance(price, str) else None,
        "technical_analysis": technical if isinstance(technical, str) else None,
        "ml_prediction": ml if isinstance(ml, str) else None,
        "news_sentiment": news if isinstance(news, str) else None,
    }
