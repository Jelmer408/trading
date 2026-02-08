"""
AI-powered trade analysis using Claude (Anthropic) or Gemini (Google).

Evaluates combined signals from candle patterns, price action, indicators,
and PlusE Finance data to make trade decisions with reasoning.
"""

import json
from typing import Any

from bot.config import config
from bot.utils.logger import log


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
        model="gemini-2.0-flash",
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

TRADE_ANALYST_SYSTEM = """You are an expert quantitative day-trading analyst. You analyze candlestick patterns, technical indicators, price action, and market data to make trading decisions.

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

Rules:
- Only recommend "enter_long" or "enter_short" if confidence >= 0.6
- Always explain the key factors driving the decision
- Consider risk/reward ratio (minimum 2:1 preferred)
- Account for current trend direction
- Factor in volume confirmation
- If data is insufficient or conflicting, recommend "skip"
- Be conservative -- missing a trade is better than a bad trade"""


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

    sections.append(
        "\n### Decision Required\n"
        "Based on all the above data, should we enter a trade? "
        "Respond with valid JSON only."
    )

    prompt = "\n".join(sections)

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
        return decision

    except json.JSONDecodeError as e:
        log.error(f"AI response not valid JSON: {e}")
        return {
            "decision": "skip",
            "confidence": 0.0,
            "reasoning": f"AI response parsing failed: {e}",
            "key_factors": ["parse_error"],
        }
    except Exception as e:
        log.error(f"AI evaluation failed: {e}")
        return {
            "decision": "skip",
            "confidence": 0.0,
            "reasoning": f"AI error: {e}",
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
