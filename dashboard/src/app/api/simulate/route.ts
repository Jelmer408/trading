import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MASSIVE_BASE = "https://api.massive.com";

// ── Types ────────────────────────────────────────────────────

interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
}

interface PatternResult {
  name: string;
  direction: "bullish" | "bearish";
  confidence: number;
  description: string;
}

// ── Step 1: Fetch market data ────────────────────────────────

async function fetchCandles(symbol: string): Promise<Bar[]> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);

  const url =
    `${MASSIVE_BASE}/v2/aggs/ticker/${symbol}/range/5/minute/${fmt(from)}/${fmt(to)}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${MASSIVE_API_KEY}`;

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Massive API ${resp.status}`);
  const data = await resp.json();
  return (data.results || []) as Bar[];
}

// ── Step 2: Pattern detection ────────────────────────────────

function detectPatterns(bars: Bar[]): PatternResult[] {
  if (bars.length < 5) return [];
  const patterns: PatternResult[] = [];
  const last = bars.length - 1;

  const b = (i: number) => bars[i];
  const body = (i: number) => Math.abs(b(i).c - b(i).o);
  const range = (i: number) => b(i).h - b(i).l;
  const isBullish = (i: number) => b(i).c > b(i).o;
  const isBearish = (i: number) => b(i).c < b(i).o;

  // Hammer / Hanging Man
  const cur = b(last);
  const curBody = body(last);
  const curRange = range(last);
  const lowerWick = Math.min(cur.o, cur.c) - cur.l;
  if (curRange > 0 && lowerWick / curRange > 0.6 && curBody / curRange < 0.3) {
    const prevTrend = b(last - 3).c > b(last - 1).c ? "down" : "up";
    if (prevTrend === "down") {
      patterns.push({ name: "Hammer", direction: "bullish", confidence: 0.7, description: "Reversal pattern after downtrend. Long lower shadow signals buying pressure." });
    } else {
      patterns.push({ name: "Hanging Man", direction: "bearish", confidence: 0.6, description: "Potential reversal after uptrend. Long lower shadow signals distribution." });
    }
  }

  // Engulfing
  if (last >= 1) {
    if (isBearish(last - 1) && isBullish(last) && cur.o <= b(last - 1).c && cur.c >= b(last - 1).o && body(last) > body(last - 1)) {
      patterns.push({ name: "Bullish Engulfing", direction: "bullish", confidence: 0.75, description: "Current candle fully engulfs previous bearish candle. Strong reversal signal." });
    }
    if (isBullish(last - 1) && isBearish(last) && cur.o >= b(last - 1).c && cur.c <= b(last - 1).o && body(last) > body(last - 1)) {
      patterns.push({ name: "Bearish Engulfing", direction: "bearish", confidence: 0.75, description: "Current candle fully engulfs previous bullish candle. Strong reversal signal." });
    }
  }

  // Doji
  if (curRange > 0 && curBody / curRange < 0.1) {
    patterns.push({ name: "Doji", direction: "bullish", confidence: 0.5, description: "Indecision candle — open and close nearly equal. Watch for next candle for direction." });
  }

  // Three consecutive bullish / bearish (momentum)
  if (last >= 2 && isBullish(last) && isBullish(last - 1) && isBullish(last - 2)) {
    patterns.push({ name: "Three White Soldiers", direction: "bullish", confidence: 0.7, description: "Three consecutive bullish candles with higher closes. Strong momentum signal." });
  }
  if (last >= 2 && isBearish(last) && isBearish(last - 1) && isBearish(last - 2)) {
    patterns.push({ name: "Three Black Crows", direction: "bearish", confidence: 0.7, description: "Three consecutive bearish candles with lower closes. Strong selling pressure." });
  }

  // Morning star (simplified)
  if (last >= 2 && isBearish(last - 2) && body(last - 2) > body(last - 1) && isBullish(last) && body(last) > body(last - 1) * 2) {
    patterns.push({ name: "Morning Star", direction: "bullish", confidence: 0.8, description: "Three-candle reversal: bearish, small body, then bullish. High probability reversal." });
  }

  return patterns;
}

// ── Step 3: Technical indicators ─────────────────────────────

function computeIndicators(bars: Bar[]) {
  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const n = closes.length;

  // SMA
  const sma = (arr: number[], period: number) => {
    if (arr.length < period) return null;
    const slice = arr.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  };

  // RSI
  const rsi = (period = 14) => {
    if (n < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = n - period; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains += diff;
      else losses -= diff;
    }
    const rs = gains / Math.max(losses, 0.001);
    return 100 - 100 / (1 + rs);
  };

  // MACD (simplified)
  const ema = (arr: number[], period: number) => {
    if (arr.length < period) return null;
    const k = 2 / (period + 1);
    let val = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < arr.length; i++) {
      val = arr[i] * k + val * (1 - k);
    }
    return val;
  };

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 && ema26 ? ema12 - ema26 : null;

  // Volume trend
  const avgVol = sma(volumes, 20);
  const currentVol = volumes[n - 1];
  const relativeVolume = avgVol ? currentVol / avgVol : 1;

  // Trend
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const price = closes[n - 1];
  let trend = "neutral";
  if (sma20 && sma50) {
    if (price > sma20 && sma20 > sma50) trend = "bullish";
    else if (price < sma20 && sma20 < sma50) trend = "bearish";
  }

  // Support/resistance (simplified)
  const recent = closes.slice(-50);
  const low = Math.min(...recent);
  const high = Math.max(...recent);
  const mid = (low + high) / 2;

  return {
    price: price,
    rsi: rsi(),
    macd: macdLine,
    sma_20: sma20,
    sma_50: sma50,
    trend,
    volume: {
      current: currentVol,
      average: avgVol,
      relative: Math.round(relativeVolume * 100) / 100,
      trend: relativeVolume > 1.5 ? "high" : relativeVolume < 0.5 ? "low" : "normal",
    },
    support: Math.round(low * 100) / 100,
    resistance: Math.round(high * 100) / 100,
    mid: Math.round(mid * 100) / 100,
  };
}

// ── Step 4: AI evaluation ────────────────────────────────────

async function callGemini(symbol: string, patterns: PatternResult[], indicators: ReturnType<typeof computeIndicators>) {
  const system = `You are an expert quantitative day-trading analyst. You analyze candlestick patterns, technical indicators, price action, and market data to make trading decisions.

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
- Be conservative -- missing a trade is better than a bad trade`;

  const prompt = `## Analysis for ${symbol}

Current Price: $${indicators.price.toFixed(2)}

### Patterns Detected
${patterns.length > 0 ? patterns.map((p) => `- ${p.name} (${p.direction}, confidence: ${p.confidence}): ${p.description}`).join("\n") : "No patterns detected"}

### Technical Indicators
- RSI(14): ${indicators.rsi?.toFixed(1) ?? "N/A"}
- MACD: ${indicators.macd?.toFixed(4) ?? "N/A"}
- SMA(20): ${indicators.sma_20?.toFixed(2) ?? "N/A"}
- SMA(50): ${indicators.sma_50?.toFixed(2) ?? "N/A"}
- Trend: ${indicators.trend}
- Volume: ${indicators.volume.trend} (${indicators.volume.relative}x average)
- Support: $${indicators.support}
- Resistance: $${indicators.resistance}

### Decision Required
Based on all the above data, should we enter a trade? Respond with valid JSON only.`;

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

  // Parse JSON from response — handle ```json ... ``` fencing
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else if (jsonStr.startsWith("```")) {
    // Fallback: remove opening/closing fences line by line
    const lines = jsonStr.split("\n");
    jsonStr = lines
      .filter((l: string) => !l.trim().startsWith("```"))
      .join("\n")
      .trim();
  }

  // Last resort: extract first { ... } block
  if (!jsonStr.startsWith("{")) {
    const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (braceMatch) jsonStr = braceMatch[0];
  }

  try {
    return { raw: text, parsed: JSON.parse(jsonStr), prompt };
  } catch {
    // Return a safe fallback so the page still renders
    return {
      raw: text,
      parsed: {
        decision: "skip",
        confidence: 0,
        reasoning: "Failed to parse AI response",
        entry_price: null,
        stop_loss: null,
        take_profit: null,
        risk_reward_ratio: null,
        key_factors: ["Parse error — raw response logged"],
      },
      prompt,
    };
  }
}

// ── Main handler ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "SPY";

  try {
    // Step 1: Market data
    const bars = await fetchCandles(symbol);
    if (bars.length < 20) {
      return NextResponse.json({ error: "Not enough candle data" }, { status: 400 });
    }

    const lastBar = bars[bars.length - 1];
    const last20 = bars.slice(-20);

    // Step 2: Pattern detection
    const patterns = detectPatterns(bars);

    // Step 3: Technical indicators
    const indicators = computeIndicators(bars);

    // Step 4: AI evaluation
    const ai = await callGemini(symbol, patterns, indicators);

    // Step 5: Risk assessment
    const equity = 100000;
    const maxRiskPct = 0.02;
    const positionSize = Math.floor((equity * maxRiskPct) / indicators.price);
    const stopLoss = ai.parsed.stop_loss || indicators.price * 0.98;
    const takeProfit = ai.parsed.take_profit || indicators.price * 1.04;
    const riskReward = Math.abs(takeProfit - indicators.price) / Math.abs(indicators.price - stopLoss);

    return NextResponse.json({
      symbol,
      timestamp: new Date().toISOString(),
      steps: {
        market_data: {
          bars_loaded: bars.length,
          timeframe: "5Min",
          last_bar: { time: lastBar.t, open: lastBar.o, high: lastBar.h, low: lastBar.l, close: lastBar.c, volume: lastBar.v },
          recent_candles: last20.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v })),
        },
        patterns: {
          detected: patterns,
          count: patterns.length,
        },
        indicators,
        ai_evaluation: {
          model: "gemini-2.0-flash",
          prompt: ai.prompt,
          response: ai.raw,
          decision: ai.parsed,
        },
        risk_assessment: {
          account_equity: equity,
          max_risk_pct: maxRiskPct * 100,
          position_size: positionSize,
          stop_loss: Math.round(stopLoss * 100) / 100,
          take_profit: Math.round(takeProfit * 100) / 100,
          risk_reward: Math.round(riskReward * 100) / 100,
          max_loss: Math.round(positionSize * Math.abs(indicators.price - stopLoss) * 100) / 100,
          max_gain: Math.round(positionSize * Math.abs(takeProfit - indicators.price) * 100) / 100,
        },
        execution: {
          would_execute: ai.parsed.decision !== "skip" && ai.parsed.confidence >= 0.6,
          order_type: "limit",
          side: ai.parsed.decision === "enter_long" ? "buy" : ai.parsed.decision === "enter_short" ? "sell" : "none",
          quantity: positionSize,
          limit_price: indicators.price,
          time_in_force: "day",
        },
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
