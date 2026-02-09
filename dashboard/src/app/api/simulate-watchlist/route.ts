import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const MASSIVE_BASE = "https://api.massive.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// ── Types ────────────────────────────────────────────────────

interface Bar {
  t: number; o: number; h: number; l: number; c: number; v: number; vw?: number;
}

interface PatternResult {
  name: string;
  direction: "bullish" | "bearish";
  confidence: number;
  description: string;
}

interface Fundamentals {
  name?: string;
  sector?: string;
  market_cap?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  ps_ratio?: number;
  eps?: number;
  roe?: number;
  roa?: number;
  debt_to_equity?: number;
  current_ratio?: number;
  free_cash_flow?: number;
  avg_volume?: number;
  dividend_yield?: number;
  ev_to_ebitda?: number;
}

interface Indicators {
  price: number;
  // Moving averages
  ema_9: number | null;
  ema_21: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sma_200: number | null;
  ema_cross: string; // "golden_cross" | "death_cross" | "neutral"
  // MACD
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  macd_cross: string; // "bullish" | "bearish" | "neutral"
  // Momentum
  rsi: number | null;
  stoch_k: number | null;
  stoch_d: number | null;
  stoch_signal: string; // "overbought" | "oversold" | "neutral"
  // Volatility
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  bb_width: number | null;
  bb_position: string; // "above_upper" | "near_upper" | "middle" | "near_lower" | "below_lower"
  atr: number | null;
  atr_pct: number | null;
  // Volume
  volume_relative: number;
  volume_trend: string;
  obv_trend: string;
  vwap: number | null;
  vwap_position: string; // "above" | "below" | "at"
  // Trend
  trend: string;
  trend_strength: string; // "strong" | "moderate" | "weak"
  // Levels
  support: number;
  resistance: number;
}

interface TickerAnalysis {
  symbol: string;
  price: number;
  change_pct: number;
  bars_loaded: number;
  patterns: PatternResult[];
  indicators: Indicators;
  last_bar: { time: number; open: number; high: number; low: number; close: number; volume: number };
  fundamentals: Fundamentals;
}

// ── Step 1: Fetch watchlist from Supabase ─────────────────────

async function fetchWatchlist(): Promise<string[]> {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/watchlist?active=eq.true&select=symbol,score&order=score.desc`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      cache: "no-store",
    },
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data || []).map((r: { symbol: string }) => r.symbol);
}

// ── Step 2: Fetch candles ─────────────────────────────────────

async function fetchCandles(symbol: string): Promise<Bar[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const url =
    `${MASSIVE_BASE}/v2/aggs/ticker/${symbol}/range/5/minute/${fmt(from)}/${fmt(to)}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${MASSIVE_API_KEY}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data.results || []) as Bar[];
}

// ── Step 2b: Fetch fundamentals ───────────────────────────────

async function fetchTickerDetails(symbol: string): Promise<Partial<Fundamentals>> {
  try {
    const url = `${MASSIVE_BASE}/v3/reference/tickers/${symbol}?apiKey=${MASSIVE_API_KEY}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return {};
    const data = await resp.json();
    const r = data.results || {};
    return {
      name: r.name,
      sector: r.sic_description,
      market_cap: r.market_cap,
    };
  } catch { return {}; }
}

async function fetchAlphaVantage(symbol: string): Promise<Partial<Fundamentals>> {
  if (!ALPHA_VANTAGE_KEY) return {};
  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return {};
    const data = await resp.json();
    if (!data.Symbol || data.Note || data.Information) return {};
    const f = (key: string): number | undefined => {
      const v = data[key];
      if (v && v !== "None" && v !== "-") {
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
      }
      return undefined;
    };
    return {
      name: data.Name || undefined,
      sector: data.Sector || undefined,
      market_cap: f("MarketCapitalization"),
      pe_ratio: f("PERatio"),
      pb_ratio: f("PriceToBookRatio"),
      ps_ratio: f("PriceToSalesRatioTTM"),
      eps: f("EPS"),
      roe: f("ReturnOnEquityTTM"),
      roa: f("ReturnOnAssetsTTM"),
      ev_to_ebitda: f("EVToEBITDA"),
      dividend_yield: f("DividendYield"),
    };
  } catch { return {}; }
}

async function fetchFundamentals(symbol: string): Promise<Fundamentals> {
  const [details, av] = await Promise.all([
    fetchTickerDetails(symbol),
    fetchAlphaVantage(symbol),
  ]);
  // Alpha Vantage values take precedence (has ratios), Massive.com as fallback for basics
  return { ...details, ...av };
}

// ── Step 3: Pattern detection ─────────────────────────────────

function detectPatterns(bars: Bar[]): PatternResult[] {
  if (bars.length < 5) return [];
  const patterns: PatternResult[] = [];
  const last = bars.length - 1;
  const b = (i: number) => bars[i];
  const body = (i: number) => Math.abs(b(i).c - b(i).o);
  const range = (i: number) => b(i).h - b(i).l;
  const isBullish = (i: number) => b(i).c > b(i).o;
  const isBearish = (i: number) => b(i).c < b(i).o;

  const cur = b(last);
  const curBody = body(last);
  const curRange = range(last);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;

  if (curRange > 0 && lowerWick / curRange > 0.6 && curBody / curRange < 0.3) {
    const prevTrend = b(last - 3).c > b(last - 1).c ? "down" : "up";
    if (prevTrend === "down") {
      patterns.push({ name: "Hammer", direction: "bullish", confidence: 0.7, description: "Reversal after downtrend." });
    } else {
      patterns.push({ name: "Hanging Man", direction: "bearish", confidence: 0.6, description: "Potential reversal after uptrend." });
    }
  }

  if (last >= 1) {
    if (isBearish(last - 1) && isBullish(last) && cur.o <= b(last - 1).c && cur.c >= b(last - 1).o && body(last) > body(last - 1)) {
      patterns.push({ name: "Bullish Engulfing", direction: "bullish", confidence: 0.75, description: "Strong reversal signal." });
    }
    if (isBullish(last - 1) && isBearish(last) && cur.o >= b(last - 1).c && cur.c <= b(last - 1).o && body(last) > body(last - 1)) {
      patterns.push({ name: "Bearish Engulfing", direction: "bearish", confidence: 0.75, description: "Strong reversal signal." });
    }
  }

  if (curRange > 0 && curBody / curRange < 0.1) {
    patterns.push({ name: "Doji", direction: "bullish", confidence: 0.5, description: "Indecision — watch next candle." });
  }

  if (last >= 2 && isBullish(last) && isBullish(last - 1) && isBullish(last - 2)) {
    patterns.push({ name: "Three White Soldiers", direction: "bullish", confidence: 0.7, description: "Strong momentum." });
  }
  if (last >= 2 && isBearish(last) && isBearish(last - 1) && isBearish(last - 2)) {
    patterns.push({ name: "Three Black Crows", direction: "bearish", confidence: 0.7, description: "Strong selling pressure." });
  }

  if (last >= 2 && isBearish(last - 2) && body(last - 2) > body(last - 1) && isBullish(last) && body(last) > body(last - 1) * 2) {
    patterns.push({ name: "Morning Star", direction: "bullish", confidence: 0.8, description: "High probability reversal." });
  }

  return patterns;
}

// ── Step 4: Technical indicators (full quant suite) ───────────

function computeIndicators(bars: Bar[]): Indicators {
  const closes = bars.map((b) => b.c);
  const highs = bars.map((b) => b.h);
  const lows = bars.map((b) => b.l);
  const volumes = bars.map((b) => b.v);
  const n = closes.length;
  const price = closes[n - 1];
  const r = (v: number) => Math.round(v * 100) / 100;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;

  // ── Helpers ──
  const sma = (arr: number[], period: number): number | null => {
    if (arr.length < period) return null;
    return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
  };

  const ema = (arr: number[], period: number): number | null => {
    if (arr.length < period) return null;
    const k = 2 / (period + 1);
    let val = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < arr.length; i++) val = arr[i] * k + val * (1 - k);
    return val;
  };

  const emaArray = (arr: number[], period: number): number[] => {
    if (arr.length < period) return [];
    const k = 2 / (period + 1);
    const out: number[] = [];
    let val = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    out.push(val);
    for (let i = period; i < arr.length; i++) {
      val = arr[i] * k + val * (1 - k);
      out.push(val);
    }
    return out;
  };

  // ── Moving Averages ──
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  let emaCross = "neutral";
  if (ema9 && ema21) {
    const prevEma9 = ema(closes.slice(0, -1), 9);
    const prevEma21 = ema(closes.slice(0, -1), 21);
    if (prevEma9 && prevEma21 && prevEma9 < prevEma21 && ema9 > ema21) emaCross = "golden_cross";
    else if (prevEma9 && prevEma21 && prevEma9 > prevEma21 && ema9 < ema21) emaCross = "death_cross";
  }

  // ── MACD (12, 26, 9) ──
  const ema12arr = emaArray(closes, 12);
  const ema26arr = emaArray(closes, 26);
  let macdLine: number | null = null;
  let macdSignal: number | null = null;
  let macdHist: number | null = null;
  let macdCross = "neutral";
  if (ema12arr.length >= 26 && ema26arr.length > 0) {
    // Align arrays: ema26arr starts at index 26, ema12arr at index 12
    const offset = 26 - 12; // = 14
    const macdArr: number[] = [];
    for (let i = 0; i < ema26arr.length; i++) {
      macdArr.push(ema12arr[i + offset] - ema26arr[i]);
    }
    macdLine = macdArr[macdArr.length - 1];
    const sigArr = emaArray(macdArr, 9);
    if (sigArr.length > 0) {
      macdSignal = sigArr[sigArr.length - 1];
      macdHist = macdLine - macdSignal;
      if (sigArr.length >= 2 && macdArr.length >= 2) {
        const prevMacd = macdArr[macdArr.length - 2];
        const prevSig = sigArr[sigArr.length - 2];
        if (prevMacd < prevSig && macdLine > macdSignal) macdCross = "bullish";
        else if (prevMacd > prevSig && macdLine < macdSignal) macdCross = "bearish";
      }
    }
  }

  // ── RSI (14) ──
  let rsiVal: number | null = null;
  if (n >= 15) {
    let gains = 0, losses = 0;
    for (let i = n - 14; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    rsiVal = 100 - 100 / (1 + gains / Math.max(losses, 0.001));
  }

  // ── Stochastic RSI (14, 3, 3) ──
  let stochK: number | null = null;
  let stochD: number | null = null;
  let stochSignal = "neutral";
  if (n >= 17) {
    // Compute RSI series for last 17 bars, then stochastic on last 14 RSIs
    const rsiSeries: number[] = [];
    for (let end = n - 16; end <= n; end++) {
      let g = 0, l = 0;
      for (let i = end - 14; i < end; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) g += diff; else l -= diff;
      }
      rsiSeries.push(100 - 100 / (1 + g / Math.max(l, 0.001)));
    }
    const kValues: number[] = [];
    for (let i = 13; i < rsiSeries.length; i++) {
      const window = rsiSeries.slice(i - 13, i + 1);
      const minRsi = Math.min(...window);
      const maxRsi = Math.max(...window);
      kValues.push(maxRsi - minRsi > 0 ? ((rsiSeries[i] - minRsi) / (maxRsi - minRsi)) * 100 : 50);
    }
    stochK = kValues[kValues.length - 1];
    stochD = kValues.length >= 3 ? (kValues[kValues.length - 1] + kValues[kValues.length - 2] + kValues[kValues.length - 3]) / 3 : stochK;
    if (stochK > 80 && stochD && stochD > 80) stochSignal = "overbought";
    else if (stochK < 20 && stochD && stochD < 20) stochSignal = "oversold";
  }

  // ── Bollinger Bands (20, 2) ──
  let bbUpper: number | null = null;
  let bbMiddle: number | null = null;
  let bbLower: number | null = null;
  let bbWidth: number | null = null;
  let bbPosition = "middle";
  if (sma20 && n >= 20) {
    const window = closes.slice(-20);
    const mean = sma20;
    const variance = window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / 20;
    const stddev = Math.sqrt(variance);
    bbUpper = mean + 2 * stddev;
    bbMiddle = mean;
    bbLower = mean - 2 * stddev;
    bbWidth = (bbUpper - bbLower) / mean;
    if (price > bbUpper) bbPosition = "above_upper";
    else if (price > mean + stddev) bbPosition = "near_upper";
    else if (price < bbLower) bbPosition = "below_lower";
    else if (price < mean - stddev) bbPosition = "near_lower";
  }

  // ── ATR (14) ──
  let atr: number | null = null;
  let atrPct: number | null = null;
  if (n >= 15) {
    let sum = 0;
    for (let i = n - 14; i < n; i++) {
      const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
      sum += tr;
    }
    atr = sum / 14;
    atrPct = (atr / price) * 100;
  }

  // ── VWAP (intraday) ──
  let vwap: number | null = null;
  let vwapPosition = "at";
  {
    let cumPV = 0, cumV = 0;
    // Use last ~78 bars (~1 trading day of 5-min bars)
    const vwapBars = bars.slice(-78);
    for (const bar of vwapBars) {
      const typical = (bar.h + bar.l + bar.c) / 3;
      cumPV += typical * bar.v;
      cumV += bar.v;
    }
    if (cumV > 0) {
      vwap = cumPV / cumV;
      if (price > vwap * 1.002) vwapPosition = "above";
      else if (price < vwap * 0.998) vwapPosition = "below";
    }
  }

  // ── OBV Trend ──
  let obvTrend = "neutral";
  if (n >= 20) {
    let obv = 0;
    const obvArr: number[] = [0];
    for (let i = 1; i < n; i++) {
      if (closes[i] > closes[i - 1]) obv += volumes[i];
      else if (closes[i] < closes[i - 1]) obv -= volumes[i];
      obvArr.push(obv);
    }
    const obvRecent = obvArr.slice(-10);
    const obvOld = obvArr.slice(-20, -10);
    const avgRecent = obvRecent.reduce((a, b) => a + b, 0) / obvRecent.length;
    const avgOld = obvOld.reduce((a, b) => a + b, 0) / obvOld.length;
    if (avgRecent > avgOld * 1.05) obvTrend = "accumulation";
    else if (avgRecent < avgOld * 0.95) obvTrend = "distribution";
  }

  // ── Volume ──
  const avgVol = sma(volumes, 20);
  const currentVol = volumes[n - 1];
  const relVol = avgVol ? currentVol / avgVol : 1;

  // ── Trend composite ──
  let trend = "neutral";
  let trendStrength = "weak";
  if (sma20 && sma50) {
    if (price > sma20 && sma20 > sma50) trend = "bullish";
    else if (price < sma20 && sma20 < sma50) trend = "bearish";
  }
  // Count confirming indicators
  let bullCount = 0, bearCount = 0;
  if (rsiVal && rsiVal > 50) bullCount++; else bearCount++;
  if (macdHist && macdHist > 0) bullCount++; else bearCount++;
  if (vwapPosition === "above") bullCount++; else if (vwapPosition === "below") bearCount++;
  if (obvTrend === "accumulation") bullCount++; else if (obvTrend === "distribution") bearCount++;
  if (emaCross === "golden_cross") bullCount += 2; else if (emaCross === "death_cross") bearCount += 2;
  const dominant = Math.max(bullCount, bearCount);
  if (dominant >= 4) trendStrength = "strong";
  else if (dominant >= 2) trendStrength = "moderate";

  // ── Support / Resistance ──
  const recent = closes.slice(-50);

  return {
    price,
    ema_9: ema9 ? r(ema9) : null,
    ema_21: ema21 ? r(ema21) : null,
    sma_20: sma20 ? r(sma20) : null,
    sma_50: sma50 ? r(sma50) : null,
    sma_200: sma200 ? r(sma200) : null,
    ema_cross: emaCross,
    macd_line: macdLine ? r4(macdLine) : null,
    macd_signal: macdSignal ? r4(macdSignal) : null,
    macd_histogram: macdHist ? r4(macdHist) : null,
    macd_cross: macdCross,
    rsi: rsiVal ? r(rsiVal) : null,
    stoch_k: stochK ? r(stochK) : null,
    stoch_d: stochD ? r(stochD) : null,
    stoch_signal: stochSignal,
    bb_upper: bbUpper ? r(bbUpper) : null,
    bb_middle: bbMiddle ? r(bbMiddle) : null,
    bb_lower: bbLower ? r(bbLower) : null,
    bb_width: bbWidth ? r4(bbWidth) : null,
    bb_position: bbPosition,
    atr: atr ? r(atr) : null,
    atr_pct: atrPct ? r(atrPct) : null,
    volume_relative: r(relVol),
    volume_trend: relVol > 1.5 ? "high" : relVol < 0.5 ? "low" : "normal",
    obv_trend: obvTrend,
    vwap: vwap ? r(vwap) : null,
    vwap_position: vwapPosition,
    trend,
    trend_strength: trendStrength,
    support: r(Math.min(...recent)),
    resistance: r(Math.max(...recent)),
  };
}

// ── Step 5: Analyze single ticker ─────────────────────────────

async function analyzeTicker(symbol: string): Promise<TickerAnalysis | null> {
  try {
    const [bars, fund] = await Promise.all([fetchCandles(symbol), fetchFundamentals(symbol)]);
    if (bars.length < 20) return null;

    const patterns = detectPatterns(bars);
    const ind = computeIndicators(bars);
    const lastBar = bars[bars.length - 1];

    // Compute % change over last trading day
    const dayBars = bars.slice(-78); // ~6.5hrs of 5min bars
    const openPrice = dayBars[0]?.o || ind.price;
    const changePct = ((ind.price - openPrice) / openPrice) * 100;

    return {
      symbol,
      price: ind.price,
      change_pct: Math.round(changePct * 100) / 100,
      bars_loaded: bars.length,
      patterns,
      fundamentals: fund,
      indicators: ind,
      last_bar: { time: lastBar.t, open: lastBar.o, high: lastBar.h, low: lastBar.l, close: lastBar.c, volume: lastBar.v },
    };
  } catch {
    return null;
  }
}

// ── Step 6: AI ranking — single prompt for all tickers ────────

function formatFundamentals(f: Fundamentals): string {
  const parts: string[] = [];
  if (f.name) parts.push(f.name);
  if (f.sector) parts.push(`Sector: ${f.sector}`);
  if (f.market_cap) {
    const mc = f.market_cap;
    parts.push(`MCap: ${mc >= 1e12 ? `$${(mc / 1e12).toFixed(1)}T` : mc >= 1e9 ? `$${(mc / 1e9).toFixed(1)}B` : `$${(mc / 1e6).toFixed(0)}M`}`);
  }
  if (f.pe_ratio) parts.push(`P/E: ${f.pe_ratio.toFixed(1)}`);
  if (f.pb_ratio) parts.push(`P/B: ${f.pb_ratio.toFixed(1)}`);
  if (f.eps) parts.push(`EPS: $${f.eps.toFixed(2)}`);
  if (f.roe) parts.push(`ROE: ${(f.roe * 100).toFixed(1)}%`);
  if (f.debt_to_equity != null) parts.push(`D/E: ${f.debt_to_equity.toFixed(2)}`);
  if (f.free_cash_flow) {
    const fcf = f.free_cash_flow;
    parts.push(`FCF: ${Math.abs(fcf) >= 1e9 ? `$${(fcf / 1e9).toFixed(1)}B` : `$${(fcf / 1e6).toFixed(0)}M`}`);
  }
  if (f.ev_to_ebitda) parts.push(`EV/EBITDA: ${f.ev_to_ebitda.toFixed(1)}`);
  if (f.dividend_yield && f.dividend_yield > 0) parts.push(`Div: ${(f.dividend_yield * 100).toFixed(2)}%`);
  return parts.length > 0 ? parts.join(" | ") : "N/A";
}

async function rankWithAI(analyses: TickerAnalysis[]) {
  const tickerSummaries = analyses.map((a) => {
    const patternStr = a.patterns.length > 0
      ? a.patterns.map((p) => `${p.name}(${p.direction}, ${(p.confidence * 100).toFixed(0)}%)`).join(", ")
      : "none";
    const fundStr = formatFundamentals(a.fundamentals);
    const ind = a.indicators;
    return `### ${a.symbol} — $${a.price.toFixed(2)} (${a.change_pct >= 0 ? "+" : ""}${a.change_pct}%)
Fundamentals: ${fundStr}
Patterns: ${patternStr}
MAs: EMA9=${ind.ema_9 ?? "N/A"} EMA21=${ind.ema_21 ?? "N/A"} SMA50=${ind.sma_50 ?? "N/A"} SMA200=${ind.sma_200 ?? "N/A"} | Cross: ${ind.ema_cross}
MACD: line=${ind.macd_line ?? "N/A"} signal=${ind.macd_signal ?? "N/A"} hist=${ind.macd_histogram ?? "N/A"} cross=${ind.macd_cross}
RSI: ${ind.rsi ?? "N/A"} | StochRSI: K=${ind.stoch_k ?? "N/A"} D=${ind.stoch_d ?? "N/A"} (${ind.stoch_signal})
Bollinger: upper=${ind.bb_upper ?? "N/A"} mid=${ind.bb_middle ?? "N/A"} lower=${ind.bb_lower ?? "N/A"} position=${ind.bb_position} width=${ind.bb_width ?? "N/A"}
ATR: ${ind.atr ?? "N/A"} (${ind.atr_pct ?? "N/A"}% of price) | VWAP: $${ind.vwap ?? "N/A"} (${ind.vwap_position})
Volume: ${ind.volume_relative}x avg (${ind.volume_trend}) | OBV: ${ind.obv_trend}
Trend: ${ind.trend} (${ind.trend_strength}) | S/R: $${ind.support} — $${ind.resistance}`;
  }).join("\n\n");

  const system = `You are an expert quantitative day-trading analyst managing a portfolio. You evaluate multiple stocks using BOTH technical analysis AND fundamental data to make informed decisions. Consider valuation (P/E, P/B), profitability (ROE, ROA), financial health (D/E, current ratio), and cash flow alongside price action and patterns.

Your response must be valid JSON with this exact structure:
{
  "rankings": [
    {
      "symbol": "TICKER",
      "rank": 1,
      "action": "enter_long" | "enter_short" | "skip",
      "confidence": 0.0-1.0,
      "reasoning": "one-sentence explanation",
      "entry_price": number or null,
      "stop_loss": number or null,
      "take_profit": number or null,
      "key_factors": ["factor1", "factor2"]
    }
  ],
  "best_trade": "TICKER" or null,
  "market_overview": "1-2 sentence overall market assessment"
}

Rules:
- Rank ALL tickers from best to worst opportunity
- Only recommend action != "skip" if confidence >= 0.6
- Conservative — missing a trade is better than a bad trade
- Consider correlation (don't go long on 5 correlated tech stocks)
- Pick at most 2-3 actionable trades from the watchlist`;

  const prompt = `## Watchlist Analysis (${analyses.length} tickers)

${tickerSummaries}

### Decision Required
Rank all tickers and identify the best trades. Respond with valid JSON only.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }],
      }),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse JSON — handle code fences
  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.split("\n").filter((l: string) => !l.trim().startsWith("```")).join("\n").trim();
  }
  if (!jsonStr.startsWith("{")) {
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  try {
    return { raw: text, parsed: JSON.parse(jsonStr), prompt };
  } catch {
    return {
      raw: text,
      parsed: {
        rankings: analyses.map((a, i) => ({
          symbol: a.symbol, rank: i + 1, action: "skip", confidence: 0,
          reasoning: "Failed to parse AI response", entry_price: null,
          stop_loss: null, take_profit: null, key_factors: [],
        })),
        best_trade: null,
        market_overview: "AI response could not be parsed.",
      },
      prompt,
    };
  }
}

// ── Step 7: Deep analysis with Gemini Pro (best pick only) ───

async function deepAnalysis(
  analysis: TickerAnalysis,
  flashRanking: { action: string; confidence: number; reasoning: string; key_factors: string[] },
) {
  const ind = analysis.indicators;
  const fundStr = formatFundamentals(analysis.fundamentals);
  const patternStr = analysis.patterns.length > 0
    ? analysis.patterns.map((p) => `- ${p.name} (${p.direction}, ${(p.confidence * 100).toFixed(0)}%): ${p.description}`).join("\n")
    : "No patterns detected";

  const system = `You are a senior quantitative portfolio manager performing final trade authorization. You have deep expertise in technical analysis, fundamental analysis, and risk management. This is the FINAL decision gate — you must be thorough and precise.

Your response must be valid JSON:
{
  "authorized": true/false,
  "action": "enter_long" | "enter_short" | "skip",
  "confidence": 0.0-1.0,
  "reasoning": "Detailed 2-3 sentence explanation",
  "entry_price": number,
  "stop_loss": number,
  "take_profit": number,
  "risk_reward_ratio": number,
  "position_size_pct": 0.01-0.05,
  "key_factors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"],
  "conviction_level": "high" | "medium" | "low"
}

Critical rules:
- You are the LAST line of defense. Only authorize if you would bet your own money.
- Require minimum 2:1 risk/reward ratio
- Check for confirmation across multiple indicator types (momentum, trend, volume, volatility)
- Check fundamentals — avoid overvalued stocks for longs, undervalued for shorts
- Factor MACD crossover + RSI + Bollinger Band position as key signals
- If indicators conflict, do NOT authorize
- Use ATR for stop loss placement (1.5-2x ATR from entry)`;

  const prompt = `## FINAL AUTHORIZATION: ${analysis.symbol} @ $${analysis.price.toFixed(2)}

### Flash Screening Result
Initial AI recommended: ${flashRanking.action} (${(flashRanking.confidence * 100).toFixed(0)}% confidence)
Flash reasoning: ${flashRanking.reasoning}

### Fundamentals
${fundStr}

### Candlestick Patterns
${patternStr}

### Full Technical Analysis
Moving Averages: EMA(9)=$${ind.ema_9} EMA(21)=$${ind.ema_21} SMA(20)=$${ind.sma_20} SMA(50)=$${ind.sma_50} SMA(200)=$${ind.sma_200 ?? "N/A"}
EMA Cross: ${ind.ema_cross}

MACD: Line=${ind.macd_line} Signal=${ind.macd_signal} Histogram=${ind.macd_histogram} | Cross: ${ind.macd_cross}

RSI(14): ${ind.rsi} | Stochastic RSI: K=${ind.stoch_k} D=${ind.stoch_d} (${ind.stoch_signal})

Bollinger Bands: Upper=$${ind.bb_upper} Mid=$${ind.bb_middle} Lower=$${ind.bb_lower} | Width=${ind.bb_width} | Position: ${ind.bb_position}

ATR(14): $${ind.atr} (${ind.atr_pct}% of price)
VWAP: $${ind.vwap} | Price vs VWAP: ${ind.vwap_position}

Volume: ${ind.volume_relative}x average (${ind.volume_trend}) | OBV: ${ind.obv_trend}

Composite Trend: ${ind.trend} (strength: ${ind.trend_strength})
Support: $${ind.support} | Resistance: $${ind.resistance}

### Decision
Perform deep analysis. Should we authorize this trade? Respond with valid JSON only.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${system}\n\n${prompt}` }] }],
      }),
    },
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini Pro API ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let jsonStr = text.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.split("\n").filter((l: string) => !l.trim().startsWith("```")).join("\n").trim();
  }
  if (!jsonStr.startsWith("{")) {
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  try {
    return { raw: text, parsed: JSON.parse(jsonStr), prompt };
  } catch {
    return {
      raw: text,
      parsed: {
        authorized: false, action: "skip", confidence: 0,
        reasoning: "Failed to parse Gemini Pro response",
        entry_price: null, stop_loss: null, take_profit: null,
        risk_reward_ratio: null, position_size_pct: 0.02,
        key_factors: ["parse_error"], risks: ["AI response error"],
        conviction_level: "low",
      },
      prompt,
    };
  }
}

// ── Main handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const customSymbols = req.nextUrl.searchParams.get("symbols");

  try {
    // Step 1: Get watchlist
    let symbols: string[];
    if (customSymbols) {
      symbols = customSymbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else {
      symbols = await fetchWatchlist();
    }
    if (symbols.length === 0) {
      symbols = ["SPY", "AAPL", "MSFT", "NVDA", "TSLA"];
    }

    // Step 2: Analyze tickers in batches to avoid Massive.com rate limits
    // Free tier allows ~5 requests/min, each ticker makes 2 calls (candles + fundamentals)
    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 1500; // 1.5s between batches
    const results: (TickerAnalysis | null)[] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(batch.map(analyzeTicker));
      results.push(...batchResults);
      // Wait between batches (skip delay after last batch)
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    const analyses = results.filter((r): r is TickerAnalysis => r !== null);

    if (analyses.length === 0) {
      return NextResponse.json({ error: "No ticker data available" }, { status: 400 });
    }

    // Step 3: AI ranks all tickers
    const ai = await rankWithAI(analyses);

    // Step 4: Deep analysis on the best candidate with Gemini Pro
    const bestSymbol = ai.parsed.best_trade;
    const bestRanking = ai.parsed.rankings?.find(
      (r: { symbol: string; action?: string }) => r.symbol === bestSymbol && r.action !== "skip",
    );
    const bestAnalysis = analyses.find((a) => a.symbol === bestSymbol);

    let deep = null;
    if (bestRanking && bestAnalysis) {
      try {
        deep = await deepAnalysis(bestAnalysis, bestRanking);
      } catch (e) {
        deep = {
          raw: "", prompt: "",
          parsed: {
            authorized: false, action: "skip", confidence: 0,
            reasoning: `Deep analysis failed: ${e instanceof Error ? e.message : "unknown"}`,
            key_factors: ["error"], risks: ["Deep analysis unavailable"],
            conviction_level: "low",
          },
        };
      }
    }

    // Step 5: Build execution plan using deep analysis results
    let execution = null;
    if (deep?.parsed?.authorized && bestAnalysis) {
      const d = deep.parsed;
      const equity = 100000;
      const sizePct = d.position_size_pct || 0.02;
      const positionSize = Math.floor((equity * sizePct) / bestAnalysis.price);
      const stopLoss = d.stop_loss || bestAnalysis.price * 0.98;
      const takeProfit = d.take_profit || bestAnalysis.price * 1.04;
      const riskReward = d.risk_reward_ratio || Math.abs(takeProfit - bestAnalysis.price) / Math.max(Math.abs(bestAnalysis.price - stopLoss), 0.01);

      execution = {
        symbol: bestSymbol,
        side: d.action === "enter_long" ? "buy" : "sell",
        confidence: d.confidence,
        conviction: d.conviction_level,
        position_size: positionSize,
        entry_price: d.entry_price || bestAnalysis.price,
        stop_loss: Math.round(stopLoss * 100) / 100,
        take_profit: Math.round(takeProfit * 100) / 100,
        risk_reward: Math.round(riskReward * 100) / 100,
        max_loss: Math.round(positionSize * Math.abs(bestAnalysis.price - stopLoss) * 100) / 100,
        max_gain: Math.round(positionSize * Math.abs(takeProfit - bestAnalysis.price) * 100) / 100,
        account_equity: equity,
        would_execute: d.authorized && d.confidence >= 0.6,
        risks: d.risks,
      };
    } else if (bestRanking && bestAnalysis && bestRanking.confidence >= 0.6) {
      // Fallback: flash ranking said go but pro said no
      execution = {
        symbol: bestSymbol,
        side: bestRanking.action === "enter_long" ? "buy" : "sell",
        confidence: bestRanking.confidence,
        conviction: "low",
        position_size: 0,
        entry_price: bestAnalysis.price,
        stop_loss: 0,
        take_profit: 0,
        risk_reward: 0,
        max_loss: 0,
        max_gain: 0,
        account_equity: 100000,
        would_execute: false,
        risks: ["Gemini Pro did not authorize this trade"],
        vetoed_by_pro: true,
      };
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      watchlist: symbols,
      steps: {
        watchlist_scan: {
          symbols,
          count: symbols.length,
        },
        market_data: {
          analyzed: analyses.length,
          failed: symbols.length - analyses.length,
          tickers: analyses.map((a) => ({
            symbol: a.symbol,
            price: a.price,
            change_pct: a.change_pct,
            bars: a.bars_loaded,
            patterns: a.patterns.length,
            trend: a.indicators.trend,
            trend_strength: a.indicators.trend_strength,
            rsi: a.indicators.rsi,
            macd_hist: a.indicators.macd_histogram,
            macd_cross: a.indicators.macd_cross,
            stoch_signal: a.indicators.stoch_signal,
            bb_position: a.indicators.bb_position,
            vwap_pos: a.indicators.vwap_position,
            volume: a.indicators.volume_relative,
            obv: a.indicators.obv_trend,
          })),
        },
        fundamentals: {
          loaded: analyses.filter((a) => a.fundamentals.pe_ratio || a.fundamentals.market_cap).length,
          tickers: analyses.map((a) => ({
            symbol: a.symbol,
            name: a.fundamentals.name,
            sector: a.fundamentals.sector,
            market_cap: a.fundamentals.market_cap,
            pe_ratio: a.fundamentals.pe_ratio,
            pb_ratio: a.fundamentals.pb_ratio,
            eps: a.fundamentals.eps,
            roe: a.fundamentals.roe,
            roa: a.fundamentals.roa,
            debt_to_equity: a.fundamentals.debt_to_equity,
            current_ratio: a.fundamentals.current_ratio,
            free_cash_flow: a.fundamentals.free_cash_flow,
            dividend_yield: a.fundamentals.dividend_yield,
            ev_to_ebitda: a.fundamentals.ev_to_ebitda,
          })),
        },
        pattern_summary: {
          total_patterns: analyses.reduce((sum, a) => sum + a.patterns.length, 0),
          by_ticker: analyses
            .filter((a) => a.patterns.length > 0)
            .map((a) => ({
              symbol: a.symbol,
              patterns: a.patterns,
            })),
        },
        ai_ranking: {
          model: "gemini-2.0-flash",
          market_overview: ai.parsed.market_overview,
          rankings: ai.parsed.rankings,
          best_trade: ai.parsed.best_trade,
          prompt: ai.prompt,
          raw_response: ai.raw,
        },
        deep_analysis: deep ? {
          model: "gemini-2.5-pro-preview",
          symbol: bestSymbol,
          authorized: deep.parsed.authorized,
          action: deep.parsed.action,
          confidence: deep.parsed.confidence,
          conviction: deep.parsed.conviction_level,
          reasoning: deep.parsed.reasoning,
          key_factors: deep.parsed.key_factors,
          risks: deep.parsed.risks,
          prompt: deep.prompt,
          raw_response: deep.raw,
        } : null,
        execution,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Simulation failed" },
      { status: 500 },
    );
  }
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}
