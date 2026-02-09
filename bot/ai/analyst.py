"""
AI-powered trade analysis using Claude (Anthropic) or Gemini (Google).

Evaluates combined signals from candle patterns, price action, indicators,
and PlusE Finance data to make trade decisions with reasoning.
"""

import json
from typing import Any

from bot.config import config
from bot.utils.logger import log
from bot.utils import activity


# ── Provider abstraction ─────────────────────────────────────

async def _call_claude(prompt: str, system: str) -> str:
    """Call Anthropic Claude API."""
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text


async def _call_gemini(prompt: str, system: str) -> str:
    """Call Google Gemini API."""
    from google import genai

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    response = await client.aio.models.generate_content(
        model="gemini-3-pro-preview",
        contents=f"{system}\n\n{prompt}",
    )
    return response.text


async def _call_ai(prompt: str, system: str) -> str:
    """Call the configured AI provider."""
    if config.ANTHROPIC_API_KEY:
        return await _call_claude(prompt, system)
    elif config.GEMINI_API_KEY:
        return await _call_gemini(prompt, system)
    else:
        raise ValueError("No AI API key configured (ANTHROPIC_API_KEY or GEMINI_API_KEY)")


# ── System prompts ───────────────────────────────────────────

TRADE_ANALYST_SYSTEM = """You are an expert quantitative day-trading analyst evaluating 5-minute candle signals for US equities.

Your responses must be valid JSON with this exact structure:
{
    "decision": "enter_long" | "enter_short" | "skip",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of why",
    "entry_price": null or suggested price,
    "stop_loss": null or suggested stop,
    "take_profit": null or suggested target,
    "risk_reward_ratio": null or float,
    "key_factors": ["factor1", "factor2"]
}

Decision framework (prioritized):
1. PATTERN + TREND is the primary signal. A strong candlestick pattern aligned with the trend is enough to trade.
2. MOMENTUM (RSI/MACD/EMA) is a secondary confirmation, not a requirement. These indicators are correlated -- don't penalize if only 1-2 of 3 agree.
3. VOLUME is context, not a gate. Low relative volume on a 5-min bar is common and does NOT invalidate the pattern. Only flag volume if it directly contradicts the signal (e.g., spike in the opposite direction).
4. Risk/reward ratio should be at least 1.5:1, ideally 2:1+.

Rules:
- Recommend "enter_long" or "enter_short" if confidence >= 0.6
- DO NOT skip just because one indicator disagrees -- no setup is perfect
- DO skip if the pattern is counter-trend with no momentum support, or if risk/reward is poor
- Always set stop_loss and take_profit based on support/resistance and ATR
- Explain 2-3 key factors for your decision, not a laundry list"""


JOURNAL_SYSTEM = """You are a trading journal writer. Given trade details, write a concise
1-2 sentence summary explaining the trade setup, reasoning, and outcome in plain language.
Focus on what pattern triggered the trade, what confirmed it, and the result."""


# ── Public API ───────────────────────────────────────────────

async def evaluate_signal(
    symbol: str,
    signal: dict[str, Any],
    price_action: dict[str, Any],
    indicators: dict[str, Any],
    pluse_data: dict[str, str | None] | None = None,
    current_price: float | None = None,
    fundamentals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Have the AI evaluate a trading signal and decide whether to trade.

    Args:
        symbol: Ticker symbol.
        signal: Combined signal from signals.py.
        price_action: Price action analysis results.
        indicators: Technical indicator summary.
        pluse_data: PlusE Finance analysis (optional).
        current_price: Current stock price.

    Returns:
        AI decision dict with decision, confidence, reasoning, etc.
    """
    # Build the analysis prompt
    sections = [f"## Analysis for {symbol}"]

    if current_price:
        sections.append(f"Current Price: ${current_price:.2f}")

    sections.append(f"\n### Signal Detected\n{json.dumps(signal, indent=2)}")

    sections.append(
        f"\n### Price Action\n"
        f"Trend: {price_action.get('trend', {}).get('trend', 'unknown')} "
        f"(strength: {price_action.get('trend', {}).get('strength', 0)})\n"
        f"Volume: {price_action.get('volume', {}).get('trend', 'unknown')} "
        f"(relative: {price_action.get('volume', {}).get('relative_volume', 0)}x)\n"
        f"Support levels: {price_action.get('support_resistance', {}).get('support', [])}\n"
        f"Resistance levels: {price_action.get('support_resistance', {}).get('resistance', [])}"
    )

    sections.append(f"\n### Technical Indicators\n{json.dumps(indicators, indent=2)}")

    if pluse_data:
        sections.append("\n### PlusE Finance Analysis")
        for key, value in pluse_data.items():
            if value:
                sections.append(f"\n**{key}**: {value}")

    if fundamentals:
        from bot.data.fundamentals import format_for_ai
        fund_str = format_for_ai(fundamentals)
        if fund_str and "No fundamental" not in fund_str:
            sections.append(f"\n### Fundamentals\n{fund_str}")

    sections.append(
        "\n### Decision Required\n"
        "Based on all the above data (technicals + fundamentals), should we enter a trade? "
        "Respond with valid JSON only."
    )

    prompt = "\n".join(sections)

    activity.ai_request(
        agent="analyst",
        symbol=symbol,
        title=f"Trade evaluation: {signal.get('pattern', 'unknown')} on {symbol}",
        prompt=prompt,
    )

    try:
        response = await _call_ai(prompt, TRADE_ANALYST_SYSTEM)

        # Parse JSON from response (handle markdown code blocks)
        json_str = response.strip()
        if json_str.startswith("```"):
            json_str = json_str.split("\n", 1)[1]
            json_str = json_str.rsplit("```", 1)[0]

        decision = json.loads(json_str)
        log.info(
            f"AI decision for {symbol}: {decision.get('decision', 'unknown')} "
            f"(confidence: {decision.get('confidence', 0)})"
        )
        activity.trade_decision(
            symbol=symbol,
            decision=decision.get("decision", "skip"),
            confidence=decision.get("confidence", 0),
            reasoning=decision.get("reasoning", ""),
        )
        return decision

    except json.JSONDecodeError as e:
        log.error(f"AI response not valid JSON: {e}")
        reasoning = f"AI response parsing failed: {e}"
        activity.trade_decision(
            symbol=symbol,
            decision="skip",
            confidence=0.0,
            reasoning=reasoning,
        )
        return {
            "decision": "skip",
            "confidence": 0.0,
            "reasoning": reasoning,
            "key_factors": ["parse_error"],
        }
    except Exception as e:
        log.error(f"AI evaluation failed: {e}")
        reasoning = f"AI error: {e}"
        activity.trade_decision(
            symbol=symbol,
            decision="skip",
            confidence=0.0,
            reasoning=reasoning,
        )
        return {
            "decision": "skip",
            "confidence": 0.0,
            "reasoning": reasoning,
            "key_factors": ["error"],
        }


async def generate_trade_journal(
    symbol: str,
    side: str,
    entry_price: float,
    exit_price: float | None = None,
    pnl: float | None = None,
    pattern: str = "",
    confirmations: list[str] | None = None,
) -> str:
    """Generate a human-readable trade journal entry."""
    prompt = (
        f"Trade: {side.upper()} {symbol}\n"
        f"Entry: ${entry_price:.2f}\n"
        f"Exit: {'${:.2f}'.format(exit_price) if exit_price else 'Open'}\n"
        f"P&L: {'${:+.2f}'.format(pnl) if pnl else 'Pending'}\n"
        f"Pattern: {pattern}\n"
        f"Confirmations: {', '.join(confirmations or [])}"
    )

    try:
        return await _call_ai(prompt, JOURNAL_SYSTEM)
    except Exception as e:
        log.error(f"Journal generation failed: {e}")
        return f"{side.upper()} {symbol} @ ${entry_price:.2f} ({pattern})"
