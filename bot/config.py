"""Configuration loaded from environment variables."""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Alpaca
    ALPACA_API_KEY: str = os.getenv("ALPACA_API_KEY", "")
    ALPACA_SECRET_KEY: str = os.getenv("ALPACA_SECRET_KEY", "")
    ALPACA_PAPER: bool = os.getenv("ALPACA_PAPER", "true").lower() == "true"

    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    # PlusE Finance
    PLUSE_API_KEY: str = os.getenv("PLUSE_API_KEY", "")

    # AI Provider
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    # Massive.com (Polygon.io) for fundamentals
    MASSIVE_API_KEY: str = os.getenv("MASSIVE_API_KEY", "")

    # Alpha Vantage (free tier for financial ratios)
    ALPHA_VANTAGE_API_KEY: str = os.getenv("ALPHA_VANTAGE_API_KEY", "")

    # Trading
    WATCHLIST: list[str] = os.getenv("WATCHLIST", "AAPL,MSFT,NVDA,TSLA,SPY").split(",")
    TIMEFRAME: str = os.getenv("TIMEFRAME", "5Min")
    MAX_POSITION_PCT: float = float(os.getenv("MAX_POSITION_PCT", "0.05"))
    MAX_POSITIONS: int = int(os.getenv("MAX_POSITIONS", "3"))
    STOP_LOSS_PCT: float = float(os.getenv("STOP_LOSS_PCT", "0.02"))
    TAKE_PROFIT_PCT: float = float(os.getenv("TAKE_PROFIT_PCT", "0.04"))
    DAILY_LOSS_LIMIT_PCT: float = float(os.getenv("DAILY_LOSS_LIMIT_PCT", "0.03"))


config = Config()
