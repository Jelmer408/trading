"""Lightweight HTTP status page for the trading bot."""

import asyncio
import time
from datetime import datetime, timezone

from aiohttp import web

# Shared state updated by the bot
_state = {
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
    "timeframe": "",
    "paper": True,
}


def update_state(**kwargs):
    """Update bot state from main loop."""
    _state.update(kwargs)


def increment_state(key: str, amount: int = 1):
    """Increment a counter in state."""
    _state[key] = _state.get(key, 0) + amount


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


def _format_money(val):
    return f"${val:,.2f}"


async def handle_index(request):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    last_bar = _state["last_bar_time"] or "waiting..."
    last_err = _state["last_error"] or "none"
    watchlist = ", ".join(_state["watchlist"]) if _state["watchlist"] else "none"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>CandleBot Status</title>
<style>
  * {{ margin:0; padding:0; box-sizing:border-box }}
  body {{ background:#0a0a0a; color:#e4e4e7; font-family:system-ui,-apple-system,sans-serif; padding:2rem }}
  .container {{ max-width:720px; margin:0 auto }}
  h1 {{ font-size:1.5rem; margin-bottom:.25rem }}
  .sub {{ color:#71717a; font-size:.875rem; margin-bottom:2rem }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin-bottom:2rem }}
  .card {{ background:#18181b; border:1px solid #27272a; border-radius:.5rem; padding:1rem }}
  .card .label {{ font-size:.75rem; color:#71717a; text-transform:uppercase; letter-spacing:.05em; margin-bottom:.25rem }}
  .card .value {{ font-size:1.5rem; font-weight:700 }}
  .green {{ color:#22c55e }}
  .red {{ color:#ef4444 }}
  .blue {{ color:#3b82f6 }}
  .yellow {{ color:#eab308 }}
  .status-row {{ display:flex; align-items:center; gap:.5rem; margin-bottom:2rem }}
  .dot {{ width:10px; height:10px; border-radius:50%; background:#22c55e; animation:pulse 2s infinite }}
  @keyframes pulse {{ 0%,100%{{opacity:1}} 50%{{opacity:.4}} }}
  table {{ width:100%; border-collapse:collapse; margin-top:1rem }}
  th,td {{ text-align:left; padding:.5rem .75rem; border-bottom:1px solid #27272a; font-size:.875rem }}
  th {{ color:#71717a; font-size:.75rem; text-transform:uppercase }}
  .footer {{ margin-top:2rem; color:#52525b; font-size:.75rem; text-align:center }}
</style>
</head>
<body>
<div class="container">
  <h1>CandleBot</h1>
  <p class="sub">Autonomous Candle Pattern Trading Bot</p>

  <div class="status-row">
    <div class="dot"></div>
    <span style="font-size:.875rem">Running &mdash; uptime {_uptime()}</span>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Equity</div>
      <div class="value">{_format_money(_state['equity'])}</div>
    </div>
    <div class="card">
      <div class="label">Day P&amp;L</div>
      <div class="value {'green' if _state['day_pnl'] >= 0 else 'red'}">{_format_money(_state['day_pnl'])}</div>
    </div>
    <div class="card">
      <div class="label">Cash</div>
      <div class="value">{_format_money(_state['cash'])}</div>
    </div>
    <div class="card">
      <div class="label">Buying Power</div>
      <div class="value">{_format_money(_state['buying_power'])}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="label">Open Positions</div>
      <div class="value blue">{_state['open_positions']}</div>
    </div>
    <div class="card">
      <div class="label">Bars Received</div>
      <div class="value">{_state['bars_received']}</div>
    </div>
    <div class="card">
      <div class="label">Signals Generated</div>
      <div class="value yellow">{_state['signals_generated']}</div>
    </div>
    <div class="card">
      <div class="label">Trades Placed</div>
      <div class="value green">{_state['trades_placed']}</div>
    </div>
  </div>

  <table>
    <tr><th>Detail</th><th>Value</th></tr>
    <tr><td>Watchlist</td><td>{watchlist}</td></tr>
    <tr><td>Timeframe</td><td>{_state['timeframe']}</td></tr>
    <tr><td>Paper Mode</td><td>{'Yes' if _state['paper'] else 'No'}</td></tr>
    <tr><td>Last Bar</td><td>{last_bar}</td></tr>
    <tr><td>Last Error</td><td style="color:#ef4444">{last_err}</td></tr>
  </table>

  <p class="footer">Auto-refreshes every 30s &mdash; {now}</p>
</div>
</body>
</html>"""
    return web.Response(text=html, content_type="text/html")


async def handle_health(request):
    return web.json_response({"status": "ok", "uptime": _uptime()})


async def start_status_server(port: int = 8080):
    """Start the status HTTP server as a background task."""
    app = web.Application()
    app.router.add_get("/", handle_index)
    app.router.add_get("/health", handle_health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
