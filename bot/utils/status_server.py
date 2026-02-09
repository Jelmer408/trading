"""Lightweight HTTP status server for the trading bot.

Exposes:
  /         - HTML status page (auto-refresh)
  /health   - JSON health check for Fly.io
  /api/status - Full JSON status for dashboard polling
"""

import time
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from aiohttp import web

ET = ZoneInfo("America/New_York")

# ── Shared state (updated by the bot) ─────────────────────────

_state: dict = {
    "started_at": None,
    "equity": 0,
    "cash": 0,
    "buying_power": 0,
    "day_pnl": 0,
    "open_positions": 0,
    "bars_received": 0,
    "signals_generated": 0,
    "trades_placed": 0,
    "last_bar_time": None,
    "last_error": None,
    "watchlist": [],
    "watchlist_size": 0,
    "timeframe": "",
    "paper": True,
    "last_watchlist_scan": None,
}

_log_buffer: list[str] = []
MAX_LOG_LINES = 100


def update_state(**kwargs) -> None:
    """Update bot state from main loop."""
    _state.update(kwargs)


def increment_state(key: str, amount: int = 1) -> None:
    """Increment a counter in state."""
    _state[key] = _state.get(key, 0) + amount


def push_log(line: str) -> None:
    """Push a log line to the ring buffer."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    _log_buffer.append(f"[{ts}] {line}")
    if len(_log_buffer) > MAX_LOG_LINES:
        _log_buffer.pop(0)


def _uptime() -> str:
    if not _state["started_at"]:
        return "not started"
    secs = int(time.time() - _state["started_at"])
    days, secs = divmod(secs, 86400)
    hours, secs = divmod(secs, 3600)
    mins, secs = divmod(secs, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if mins:
        parts.append(f"{mins}m")
    parts.append(f"{secs}s")
    return " ".join(parts)


def _uptime_seconds() -> int:
    if not _state["started_at"]:
        return 0
    return int(time.time() - _state["started_at"])


def _market_schedule() -> dict:
    """Calculate market open/close times and next trading window."""
    now_et = datetime.now(ET)
    today = now_et.date()
    weekday = now_et.weekday()  # 0=Mon, 6=Sun

    market_open = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
    market_close = now_et.replace(hour=16, minute=0, second=0, microsecond=0)
    pre_market_open = now_et.replace(hour=4, minute=0, second=0, microsecond=0)

    is_weekday = weekday < 5
    is_market_hours = is_weekday and market_open <= now_et <= market_close
    is_pre_market = is_weekday and pre_market_open <= now_et < market_open

    # Calculate next open
    if is_market_hours:
        next_open = market_open  # already open
        closes_in = int((market_close - now_et).total_seconds())
    elif is_weekday and now_et < market_open:
        next_open = market_open
        closes_in = None
    else:
        # Find next weekday
        days_ahead = 1
        next_day = today + timedelta(days=days_ahead)
        while next_day.weekday() >= 5:  # skip weekend
            days_ahead += 1
            next_day = today + timedelta(days=days_ahead)
        next_open = datetime(next_day.year, next_day.month, next_day.day,
                            9, 30, tzinfo=ET)
        closes_in = None

    opens_in = None if is_market_hours else int((next_open - now_et).total_seconds())

    return {
        "now_et": now_et.strftime("%Y-%m-%d %H:%M:%S ET"),
        "is_market_open": is_market_hours,
        "is_pre_market": is_pre_market,
        "market_open": "09:30 ET",
        "market_close": "16:00 ET",
        "opens_in_seconds": max(opens_in, 0) if opens_in is not None else None,
        "closes_in_seconds": max(closes_in, 0) if closes_in is not None else None,
        "next_open": next_open.isoformat() if not is_market_hours else None,
        "trading_days": "Mon-Fri",
    }


def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


# ── Handlers ─────────────────────────────────────────────────

async def handle_api_status(request: web.Request) -> web.Response:
    """Full JSON status for the dashboard to poll."""
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "status": "online",
        "uptime": _uptime(),
        "uptime_seconds": _uptime_seconds(),
        "timestamp": now,
        "account": {
            "equity": _state["equity"],
            "cash": _state["cash"],
            "buying_power": _state["buying_power"],
            "day_pnl": _state["day_pnl"],
            "open_positions": _state["open_positions"],
        },
        "activity": {
            "bars_received": _state["bars_received"],
            "signals_generated": _state["signals_generated"],
            "trades_placed": _state["trades_placed"],
            "last_bar_time": _state["last_bar_time"],
        },
        "config": {
            "watchlist": _state["watchlist"],
            "watchlist_size": _state.get("watchlist_size", len(_state["watchlist"])),
            "timeframe": _state["timeframe"],
            "paper": _state["paper"],
        },
        "market": _market_schedule(),
        "strategy": {
            "name": "Candlestick Pattern + AI",
            "ai_model": "Gemini 2.5 Pro" if _state.get("gemini_active") else ("Claude Sonnet" if _state.get("claude_active") else "Gemini 2.5 Pro"),
            "news_model": "Gemini Flash",
            "timeframe": _state["timeframe"],
            "min_confidence": 0.6,
            "min_signal_strength": 0.6,
            "min_risk_reward": "2:1",
            "patterns": [
                "doji", "hammer", "inverted_hammer", "shooting_star",
                "marubozu", "spinning_top", "engulfing", "harami",
                "piercing_line", "dark_cloud_cover", "morning_star",
                "evening_star", "three_white_soldiers", "three_black_crows",
            ],
            "indicators": ["RSI", "MACD", "EMA crossover", "Volume", "ATR"],
            "confirmations": [
                "Trend alignment", "Volume confirmation", "RSI extremes",
                "MACD crossover", "EMA crossover", "Support/resistance breakout",
            ],
            "data_sources": [
                "Alpaca real-time bars (WebSocket)",
                "PlusE Finance analysis",
                "Reddit RSS (WSB, stocks, options)",
                "Alpaca news headlines",
                "ApeWisdom trending",
            ],
            "risk": {
                "max_position_pct": float(_state.get("max_position_pct", 0.05)),
                "max_positions": int(_state.get("max_positions", 3)),
                "stop_loss_pct": float(_state.get("stop_loss_pct", 0.02)),
                "take_profit_pct": float(_state.get("take_profit_pct", 0.04)),
                "daily_loss_limit_pct": float(_state.get("daily_loss_limit_pct", 0.03)),
            },
            "pipeline": [
                {"step": 1, "name": "Bar received", "desc": "5-min OHLCV candle from Alpaca WebSocket"},
                {"step": 2, "name": "Pattern detection", "desc": "14 candlestick patterns scanned"},
                {"step": 3, "name": "Signal scoring", "desc": "Patterns + indicators + price action combined"},
                {"step": 4, "name": "Risk check", "desc": "Position limits, daily loss limit, buying power"},
                {"step": 5, "name": "PlusE data", "desc": "Fetch LLM-friendly market analysis"},
                {"step": 6, "name": "AI evaluation", "desc": "Gemini evaluates signal with full context"},
                {"step": 7, "name": "Position sizing", "desc": "Calculate shares based on equity %"},
                {"step": 8, "name": "Execute", "desc": "Place limit order via Alpaca"},
            ],
            "scan_intervals": {
                "watchlist_scan": "15 min",
                "news_analysis": "10 min",
                "account_snapshot": "30 sec",
            },
        },
        "errors": {
            "last_error": _state["last_error"],
        },
        "logs": _log_buffer[-30:],  # Last 30 lines
    }
    return web.json_response(data, headers=_cors_headers())


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response(
        {"status": "ok", "uptime": _uptime()},
        headers=_cors_headers(),
    )


async def handle_options(request: web.Request) -> web.Response:
    """Handle CORS preflight."""
    return web.Response(status=204, headers=_cors_headers())


async def handle_index(request: web.Request) -> web.Response:
    """HTML status page (kept for direct Fly.io access)."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    watchlist = ", ".join(_state["watchlist"]) if _state["watchlist"] else "none"
    last_bar = _state["last_bar_time"] or "waiting..."
    last_err = _state["last_error"] or "none"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>CANDLEBOT // STATUS</title>
<style>
  *{{margin:0;padding:0;box-sizing:border-box}}
  body{{background:#000;color:#ccc;font-family:'JetBrains Mono',monospace;padding:2rem;font-size:13px}}
  .c{{max-width:800px;margin:0 auto}}
  h1{{font-size:1.1rem;color:#00ff41;letter-spacing:.15em;text-transform:uppercase}}
  .sub{{color:#555;font-size:.75rem;letter-spacing:.1em;margin-bottom:2rem;text-transform:uppercase}}
  .st{{display:flex;align-items:center;gap:8px;margin:1rem 0 2rem}}
  .dot{{width:8px;height:8px;background:#00ff41;animation:p 2s infinite}}
  @keyframes p{{0%,100%{{opacity:1}}50%{{opacity:.3}}}}
  .g{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;background:#222;border:1px solid #222;margin-bottom:2rem}}
  .g>div{{background:#000;padding:12px 16px}}
  .l{{font-size:.65rem;color:#555;text-transform:uppercase;letter-spacing:.15em;margin-bottom:4px}}
  .v{{font-size:1.3rem;font-weight:700;font-variant-numeric:tabular-nums}}
  .grn{{color:#00ff41}}.red{{color:#ff0040}}.amb{{color:#f0b400}}.blu{{color:#0088ff}}
  table{{width:100%;border-collapse:collapse}}
  td{{padding:6px 12px;border-bottom:1px solid #111;font-size:.8rem}}
  td:first-child{{color:#555;text-transform:uppercase;letter-spacing:.1em;font-size:.7rem;width:140px}}
  .ft{{margin-top:2rem;color:#333;font-size:.65rem;text-align:center;letter-spacing:.1em;text-transform:uppercase}}
</style>
</head>
<body>
<div class="c">
  <h1>/// CANDLEBOT</h1>
  <p class="sub">Autonomous Trading System // Status Monitor</p>
  <div class="st"><div class="dot"></div><span style="color:#00ff41">ONLINE</span> &mdash; uptime {_uptime()}</div>
  <div class="g">
    <div><div class="l">Equity</div><div class="v">${_state['equity']:,.2f}</div></div>
    <div><div class="l">Day P&amp;L</div><div class="v {'grn' if _state['day_pnl']>=0 else 'red'}">${_state['day_pnl']:+,.2f}</div></div>
    <div><div class="l">Cash</div><div class="v">${_state['cash']:,.2f}</div></div>
    <div><div class="l">Buying Power</div><div class="v">${_state['buying_power']:,.2f}</div></div>
  </div>
  <div class="g">
    <div><div class="l">Positions</div><div class="v blu">{_state['open_positions']}</div></div>
    <div><div class="l">Bars Received</div><div class="v">{_state['bars_received']}</div></div>
    <div><div class="l">Signals</div><div class="v amb">{_state['signals_generated']}</div></div>
    <div><div class="l">Trades</div><div class="v grn">{_state['trades_placed']}</div></div>
  </div>
  <table>
    <tr><td>Watchlist</td><td>{watchlist}</td></tr>
    <tr><td>Timeframe</td><td>{_state['timeframe']}</td></tr>
    <tr><td>Paper Mode</td><td>{'YES' if _state['paper'] else 'NO ⚠'}</td></tr>
    <tr><td>Last Bar</td><td>{last_bar}</td></tr>
    <tr><td>Last Error</td><td style="color:#ff0040">{last_err}</td></tr>
  </table>
  <p class="ft">Auto-refresh 15s &mdash; {now}</p>
</div>
</body>
</html>"""
    return web.Response(text=html, content_type="text/html")


# ── Rescan callback (set by main.py) ─────────────────────────

_rescan_callback = None

def set_rescan_callback(fn):
    """Register the rescan function from main.py."""
    global _rescan_callback
    _rescan_callback = fn


async def handle_rescan(request: web.Request) -> web.Response:
    """Trigger a manual signal rescan for a symbol."""
    symbol = request.match_info.get("symbol", "").upper()
    if not symbol:
        return web.json_response({"error": "Missing symbol"}, status=400, headers=_cors_headers())
    if not _rescan_callback:
        return web.json_response({"error": "Rescan not available"}, status=503, headers=_cors_headers())

    import asyncio
    try:
        result = await asyncio.wait_for(_rescan_callback(symbol), timeout=30)
        return web.json_response({"status": "ok", "symbol": symbol, "result": result}, headers=_cors_headers())
    except asyncio.TimeoutError:
        return web.json_response({"error": "Rescan timed out"}, status=504, headers=_cors_headers())
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500, headers=_cors_headers())


# ── Server startup ───────────────────────────────────────────

async def start_status_server(port: int = 8080) -> None:
    """Start the status HTTP server as a background task."""
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/api/status", handle_api_status)
    app.router.add_get("/api/rescan/{symbol}", handle_rescan)
    app.router.add_route("OPTIONS", "/api/status", handle_options)
    app.router.add_route("OPTIONS", "/api/rescan/{symbol}", handle_options)
    app.router.add_route("OPTIONS", "/health", handle_options)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
