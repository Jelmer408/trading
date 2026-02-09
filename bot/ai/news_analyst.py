"""
News analysis using Gemini Flash for fast, cheap market intelligence.

Analyzes news headlines and produces actionable summaries for the dashboard.
Uses gemini-2.0-flash-001 for speed and low cost.
"""

import json
import asyncio
from typing import Any

from bot.config import config
from bot.utils.logger import log
from bot.utils import activity


FLASH_MODEL = "gemini-2.0-flash-001"

NEWS_SYSTEM = """You are a financial news analyst for a day-trading system. Analyze the given news headlines and produce a brief, actionable market intelligence report.

For each significant item:
- Identify the stock impact (bullish/bearish/neutral)
- Rate urgency for day trading (high/medium/low)
- Give a 1-sentence actionable insight

IMPORTANT: Also identify stocks that should be ADDED TO THE WATCHLIST based on breaking catalysts.
A stock deserves watchlist consideration if it has:
- A major earnings beat/miss, FDA approval, M&A news, contract win, or similar catalyst
- High urgency (likely to move significantly at market open or during the session)
- Sufficient liquidity (well-known stocks, not penny stocks)

Respond with valid JSON:
{
    "market_mood": "bullish" | "bearish" | "mixed" | "neutral",
    "summary": "2-3 sentence market overview",
    "alerts": [
        {
            "symbol": "TSLA",
            "sentiment": "bullish",
            "urgency": "high",
            "headline": "Original headline",
            "insight": "Actionable trading insight"
        }
    ],
    "watchlist_candidates": [
        {
            "symbol": "NVDA",
            "reason": "Earnings beat by 20%, raised guidance, likely gap up at open",
            "catalyst": "earnings",
            "sentiment": "bullish",
            "priority": 1
        }
    ]
}

Only include watchlist_candidates for stocks with STRONG, clear catalysts. An empty array is fine if nothing stands out."""


async def analyze_news_batch(
    headlines: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """
    Analyze a batch of news headlines using Gemini Flash.

    Args:
        headlines: List of dicts with 'symbol', 'headline', 'source' keys.

    Returns:
        Analysis dict with market_mood, summary, and alerts.
    """
    if not config.GEMINI_API_KEY:
        log.warning("No Gemini API key, skipping news analysis")
        return None

    if not headlines:
        return None

    # Build prompt
    prompt_lines = ["## Recent Market Headlines\n"]
    for i, h in enumerate(headlines[:20], 1):  # Max 20 headlines
        sym = h.get("symbol", "???")
        headline = h.get("headline", "")
        source = h.get("source", "unknown")
        prompt_lines.append(f"{i}. [{sym}] {headline} (via {source})")

    prompt_lines.append(
        "\n\nAnalyze these headlines for day-trading relevance. "
        "Which stocks have actionable catalysts? What's the overall market mood? "
        "Respond with valid JSON only."
    )

    prompt = "\n".join(prompt_lines)

    # Log the AI request
    activity.ai_request(
        agent="news_ai",
        symbol=None,
        title=f"Analyzing {len(headlines)} headlines with Gemini Flash",
        prompt=prompt,
    )

    try:
        from google import genai

        client = genai.Client(api_key=config.GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model=FLASH_MODEL,
            contents=f"{NEWS_SYSTEM}\n\n{prompt}",
        )

        response_text = response.text or ""

        # Parse JSON
        json_str = response_text.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1]
            json_str = json_str.rsplit("```", 1)[0]

        result = json.loads(json_str)

        # Log the response
        activity.ai_response(
            agent="news_ai",
            symbol=None,
            title=f"News analysis: {result.get('market_mood', 'unknown')} mood, {len(result.get('alerts', []))} alerts",
            response=result.get("summary", ""),
            metadata={
                "market_mood": result.get("market_mood"),
                "alert_count": len(result.get("alerts", [])),
            },
        )

        # Log individual alerts
        for alert in result.get("alerts", []):
            activity.news_analysis(
                symbol=alert.get("symbol", "???"),
                headline=alert.get("headline", ""),
                analysis=alert.get("insight", ""),
                sentiment=alert.get("sentiment", "neutral"),
            )

        # Log watchlist candidates from news
        wl_candidates = result.get("watchlist_candidates", [])
        if wl_candidates:
            syms = [c.get("symbol", "?") for c in wl_candidates]
            log.info(f"News AI suggests watchlist adds: {', '.join(syms)}")

        log.info(
            f"News analysis complete: {result.get('market_mood')} mood, "
            f"{len(result.get('alerts', []))} alerts"
        )
        return result

    except json.JSONDecodeError as e:
        log.error(f"News analysis JSON parse error: {e}")
        activity.error("news_ai", "JSON parse failed", str(e))
        return None
    except Exception as e:
        log.error(f"News analysis failed: {e}")
        activity.error("news_ai", "News analysis failed", str(e))
        return None
