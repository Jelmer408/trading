import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const MASSIVE_BASE = "https://api.massive.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// ── Supabase helpers ────────────────────────────────────────

async function supabaseQuery(path: string, opts?: RequestInit) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const resp = await fetch(url, { ...opts, headers: { ...headers, ...(opts?.headers as Record<string, string>) } });
  if (!resp.ok) return null;
  return resp.json();
}

// ── Massive.com data fetchers ───────────────────────────────

async function fetchTickerDetails(symbol: string) {
  try {
    const resp = await fetch(
      `${MASSIVE_BASE}/v3/reference/tickers/${symbol}?apiKey=${MASSIVE_API_KEY}`,
      { cache: "no-store" }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.results || null;
  } catch {
    return null;
  }
}

async function fetchRecentCandles(symbol: string) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 5);
  const url = `${MASSIVE_BASE}/v2/aggs/ticker/${symbol}/range/5/minute/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=500&apiKey=${MASSIVE_API_KEY}`;
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function fetchDailyCandles(symbol: string) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const url = `${MASSIVE_BASE}/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=200&apiKey=${MASSIVE_API_KEY}`;
  try {
    const resp = await fetch(url, { cache: "no-store" });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch {
    return [];
  }
}

// ── ApeWisdom direct lookup ──────────────────────────────────

interface ApeWisdomData {
  rank: number;
  mentions: number;
  upvotes: number;
  rank_24h_ago: number;
  mentions_24h_ago: number;
  name: string;
  filter: string;
}

async function fetchApeWisdomData(symbol: string): Promise<ApeWisdomData | null> {
  const filters = ["all-stocks", "wallstreetbets"];
  for (const filter of filters) {
    try {
      // Search up to 3 pages per filter
      for (let page = 1; page <= 3; page++) {
        const resp = await fetch(
          `https://apewisdom.io/api/v1.0/filter/${filter}/page/${page}`,
          { headers: { "User-Agent": "CandleBot/1.0" }, cache: "no-store" }
        );
        if (!resp.ok) continue;
        const data = await resp.json();
        const results = data.results || [];
        const match = results.find(
          (r: { ticker?: string }) => r.ticker?.toUpperCase() === symbol.toUpperCase()
        );
        if (match) {
          return {
            rank: Number(match.rank || 0),
            mentions: Number(match.mentions || 0),
            upvotes: Number(match.upvotes || 0),
            rank_24h_ago: Number(match.rank_24h_ago || 0),
            mentions_24h_ago: Number(match.mentions_24h_ago || 0),
            name: match.name || "",
            filter,
          };
        }
        // If fewer than 100 results, no more pages
        if (results.length < 100) break;
      }
    } catch {
      // Continue to next filter
    }
  }
  return null;
}

// ── RSS.app feeds (reliable, never blocked) ─────────────────

type RedditPost = {
  title: string;
  url: string;
  sub: string;
  time: string;
  upvotes: number;
  comments: number;
  upvote_ratio: number;
  content?: string;
};

// RSS.app JSON feeds for stock subreddits
const RSS_FEEDS: { url: string; sub: string }[] = [
  { url: "https://rss.app/feeds/v1.1/6gNr698SIoNU5ATK.json", sub: "r/wallstreetbets" },
];

// Ticker extraction regex
const TICKER_DOLLAR_RE = /\$([A-Z]{2,5})\b/g;
const TICKER_BARE_RE = /\b([A-Z]{2,5})\b/g;
const TICKER_IGNORE = new Set([
  "CEO", "IPO", "GDP", "SEC", "FDA", "USA", "API", "ETF", "DD",
  "IMO", "LOL", "WTF", "FYI", "PSA", "TIL", "ELI", "RIP", "ATH",
  "ATL", "YOLO", "HODL", "FOMO", "OTM", "ITM", "ATM", "DTE",
  "ALL", "FOR", "THE", "ARE", "NOT", "HAS", "HIS", "NEW", "ANY",
  "CAN", "NOW", "BIG", "OLD", "LOW", "TOP", "TWO", "GO", "SO",
  "UP", "AI", "OR", "NFA", "TLDR", "WSB", "DOJ", "FTC", "USD",
  "EBT", "EST", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN",
]);

function postMentionsTicker(title: string, content: string, symbol: string): boolean {
  const upperSymbol = symbol.toUpperCase();
  const text = `${title} ${content}`;

  // Check $TICKER mentions (high confidence)
  for (const match of text.matchAll(TICKER_DOLLAR_RE)) {
    if (match[1] === upperSymbol) return true;
  }

  // Check bare TICKER in title only (medium confidence, needs 3+ chars)
  if (upperSymbol.length >= 3) {
    for (const match of title.matchAll(TICKER_BARE_RE)) {
      if (match[1] === upperSymbol && !TICKER_IGNORE.has(match[1])) return true;
    }
  }

  // Check company name mentions in title (e.g. "Tesla" for TSLA)
  // Common mappings
  const nameMap: Record<string, string[]> = {
    TSLA: ["tesla", "elon"],
    AAPL: ["apple", "iphone"],
    MSFT: ["microsoft", "azure"],
    GOOGL: ["google", "alphabet"],
    GOOG: ["google", "alphabet"],
    AMZN: ["amazon", "aws"],
    META: ["meta", "facebook", "zuckerberg"],
    NVDA: ["nvidia", "jensen"],
    AMD: ["amd"],
    PLTR: ["palantir"],
    HIMS: ["hims"],
    RDDT: ["reddit"],
    GDRX: ["goodrx"],
    UBER: ["uber"],
  };

  const names = nameMap[upperSymbol];
  if (names) {
    const lower = title.toLowerCase();
    for (const name of names) {
      if (lower.includes(name)) return true;
    }
  }

  return false;
}

async function fetchRSSFeeds(symbol: string): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        headers: { "User-Agent": "CandleBot/1.0" },
        cache: "no-store",
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const items = data.items || [];

      for (const item of items) {
        const title = item.title || "";
        const content = item.content_text || "";
        if (!title) continue;

        // Check if post mentions the ticker
        if (!postMentionsTicker(title, content, symbol)) continue;

        posts.push({
          title,
          url: item.url || "",
          sub: feed.sub,
          time: item.date_published
            ? String(Math.floor(new Date(item.date_published).getTime() / 1000))
            : "",
          upvotes: 0, // RSS doesn't have upvotes, ApeWisdom provides aggregate
          comments: 0,
          upvote_ratio: 0,
          content: content.slice(0, 500), // Truncate for AI context
        });
      }
    } catch {
      // Continue silently
    }
  }

  return posts;
}

// Fallback: direct Reddit search (may be blocked from some servers)
async function fetchRedditSearch(symbol: string): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];
  try {
    const resp = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(`$${symbol} OR "${symbol}" stock`)}&sort=hot&t=week&limit=25&raw_json=1`,
      {
        headers: { "User-Agent": "CandleBot/1.0 (stock-dashboard)" },
        cache: "no-store",
      }
    );
    if (!resp.ok) return [];
    const data = await resp.json();
    for (const child of (data?.data?.children || [])) {
      const d = child?.data;
      if (!d?.title) continue;
      const permalink = d.permalink || "";
      const url = permalink ? `https://www.reddit.com${permalink}` : "";
      if (!url) continue;
      posts.push({
        title: d.title,
        url,
        sub: `r/${d.subreddit || "unknown"}`,
        time: d.created_utc ? String(Math.floor(d.created_utc)) : "",
        upvotes: d.score || 0,
        comments: d.num_comments || 0,
        upvote_ratio: d.upvote_ratio || 0.5,
      });
    }
  } catch {
    // Reddit may block — continue silently
  }
  return posts;
}

// ── Reddit posts from activity_log + ApeWisdom + Live Reddit ─

interface SocialData {
  posts: Array<RedditPost>;
  apewisdom: ApeWisdomData | null;
  total_upvotes: number;
  mentions: number;
}

async function fetchSocialData(symbol: string): Promise<SocialData> {
  // Fetch RSS feeds, activity_log, ApeWisdom, and direct Reddit in parallel
  const [rssPosts, rows, apeData, redditSearch] = await Promise.all([
    fetchRSSFeeds(symbol),
    supabaseQuery(
      `activity_log?agent=eq.scanner&event_type=eq.scan_result&order=created_at.desc&limit=10&select=metadata,created_at`
    ),
    fetchApeWisdomData(symbol),
    fetchRedditSearch(symbol),
  ]);

  const posts: SocialData["posts"] = [];
  const seenUrls = new Set<string>();
  let storedMentions = 0;
  let storedUpvotes = 0;

  // 1. Add RSS feed posts (reliable, real post titles + content)
  for (const p of rssPosts) {
    if (p.url && !seenUrls.has(p.url)) {
      posts.push(p);
      seenUrls.add(p.url);
    }
  }

  // 2. Add direct Reddit search results (has upvotes, may be blocked)
  for (const p of redditSearch) {
    if (p.url && !seenUrls.has(p.url)) {
      posts.push(p);
      seenUrls.add(p.url);
    }
  }

  // 2. Add posts from activity_log (bot scanner results)
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const meta = row.metadata;
      if (meta?.source !== "reddit") continue;
      const tickers = meta?.tickers;
      if (!Array.isArray(tickers)) continue;
      const match = tickers.find(
        (t: { symbol?: string }) =>
          t && typeof t === "object" && t.symbol?.toUpperCase() === symbol.toUpperCase()
      );
      if (!match) continue;
      storedMentions = Math.max(storedMentions, match.mentions || 0);
      storedUpvotes = Math.max(storedUpvotes, match.total_upvotes || 0);
      for (const p of match.posts || []) {
        // Skip synthetic ApeWisdom posts if we already have real ones
        if (p.url?.includes("apewisdom.io") && posts.length > 0) continue;
        if (p.url && !seenUrls.has(p.url)) {
          posts.push({
            title: p.title || "",
            url: p.url,
            sub: p.sub || "",
            time: p.time || "",
            upvotes: p.upvotes || 0,
            comments: p.comments || 0,
            upvote_ratio: p.upvote_ratio || 0,
          });
          seenUrls.add(p.url);
        }
      }
    }
  }

  // Sort by upvotes descending
  posts.sort((a, b) => b.upvotes - a.upvotes);

  // Use ApeWisdom data for totals if available (most accurate aggregate)
  const liveUpvotes = posts.reduce((a, p) => a + p.upvotes, 0);
  const totalUpvotes = apeData?.upvotes || storedUpvotes || liveUpvotes;
  const mentions = apeData?.mentions || storedMentions || posts.length;

  return {
    posts: posts.slice(0, 25),
    apewisdom: apeData,
    total_upvotes: totalUpvotes,
    mentions,
  };
}

// ── Cached fundamentals from Supabase ───────────────────────

async function getCachedFundamentals(symbol: string) {
  const rows = await supabaseQuery(
    `fundamentals?symbol=eq.${symbol}&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

// ── Check if AI analysis is fresh (done today) ─────────────

function isAnalysisFresh(row: { ai_analyzed_at?: string } | null): boolean {
  if (!row?.ai_analyzed_at) return false;
  const analyzed = new Date(row.ai_analyzed_at);
  const now = new Date();
  // Same calendar day (UTC)
  return (
    analyzed.getUTCFullYear() === now.getUTCFullYear() &&
    analyzed.getUTCMonth() === now.getUTCMonth() &&
    analyzed.getUTCDate() === now.getUTCDate()
  );
}

// ── Compute key indicators from candles ─────────────────────

function computeQuickIndicators(bars: Array<{ o: number; h: number; l: number; c: number; v: number }>) {
  if (bars.length < 14) return null;

  const closes = bars.map((b) => b.c);
  const volumes = bars.map((b) => b.v);
  const latest = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const changeP = ((latest - prev) / prev) * 100;

  // RSI-14
  let gains = 0, losses = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Volume vs average
  const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
  const relVol = volumes[volumes.length - 1] / (avgVol || 1);

  // 20-period SMA
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length);

  // Day range
  const dayHigh = Math.max(...bars.slice(-78).map((b) => b.h)); // ~1 trading day of 5min bars
  const dayLow = Math.min(...bars.slice(-78).map((b) => b.l));

  return {
    price: latest,
    change_pct: changeP,
    rsi,
    rel_volume: relVol,
    avg_volume: avgVol,
    sma20,
    day_high: dayHigh,
    day_low: dayLow,
  };
}

// ── Gemini Pro AI Analysis ──────────────────────────────────

async function runAIAnalysis(
  symbol: string,
  fundamentals: Record<string, unknown> | null,
  indicators: ReturnType<typeof computeQuickIndicators>,
  socialData: SocialData,
  dailyBars: Array<{ o: number; h: number; l: number; c: number; v: number }>
) {
  const prompt = buildAnalysisPrompt(symbol, fundamentals, indicators, socialData, dailyBars);

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis unavailable";
  return text;
}

function buildAnalysisPrompt(
  symbol: string,
  fund: Record<string, unknown> | null,
  ind: ReturnType<typeof computeQuickIndicators>,
  social: SocialData,
  dailyBars: Array<{ o: number; h: number; l: number; c: number; v: number }>
): string {
  let prompt = `You are a senior equity analyst specializing in both quantitative and social sentiment analysis. Provide a comprehensive daily analysis for ${symbol}.

## Your Analysis Should Cover:
1. **Company Overview** - What the company does, sector positioning
2. **Technical Analysis** - Current price action, key levels, trend direction
3. **Fundamental Assessment** - Valuation, financial health, growth metrics
4. **Social Sentiment Analysis** - Read EVERY Reddit post title below. Analyze the collective mood, narrative themes, and sentiment direction. Weight by upvotes (high-upvote posts reflect broader crowd sentiment). Note whether retail is bullish, bearish, or uncertain, and identify any catalysts or narratives driving discussion.
5. **Day Trading Outlook** - Key levels, potential setups, risk/reward for intraday
6. **Overall Rating** - STRONG BUY / BUY / NEUTRAL / SELL / STRONG SELL with conviction level

## Data:
`;

  if (fund) {
    prompt += `\n### Fundamentals
- Name: ${fund.name || "N/A"}
- Sector: ${fund.sector || "N/A"} / Industry: ${fund.industry || "N/A"}
- Market Cap: ${fund.market_cap ? `$${(Number(fund.market_cap) / 1e9).toFixed(1)}B` : "N/A"}
- P/E: ${fund.pe_ratio || "N/A"} | Forward P/E: ${fund.forward_pe || "N/A"} | PEG: ${fund.peg_ratio || "N/A"}
- P/B: ${fund.pb_ratio || "N/A"} | P/S: ${fund.ps_ratio || "N/A"}
- EPS: ${fund.eps || "N/A"} | ROE: ${fund.return_on_equity || "N/A"} | ROA: ${fund.return_on_assets || "N/A"}
- D/E: ${fund.debt_to_equity || "N/A"} | Current Ratio: ${fund.current_ratio || "N/A"}
- FCF: ${fund.free_cash_flow ? `$${(Number(fund.free_cash_flow) / 1e9).toFixed(1)}B` : "N/A"}
- EV/EBITDA: ${fund.ev_to_ebitda || "N/A"}
- Beta: ${fund.beta || "N/A"} | Profit Margin: ${fund.profit_margin || "N/A"}
- Earnings Growth: ${fund.earnings_growth || "N/A"} | Revenue Growth: ${fund.revenue_growth || "N/A"}
- Analyst Target: ${fund.analyst_target ? `$${fund.analyst_target}` : "N/A"}
`;
  }

  if (ind) {
    prompt += `\n### Technical Indicators (5-min bars)
- Price: $${ind.price.toFixed(2)} (${ind.change_pct >= 0 ? "+" : ""}${ind.change_pct.toFixed(2)}%)
- RSI(14): ${ind.rsi.toFixed(1)}
- Relative Volume: ${ind.rel_volume.toFixed(1)}x avg
- SMA(20): $${ind.sma20.toFixed(2)}
- Day Range: $${ind.day_low.toFixed(2)} - $${ind.day_high.toFixed(2)}
`;
  }

  if (dailyBars.length > 0) {
    const recent = dailyBars.slice(-10);
    prompt += `\n### Recent Daily Bars (last ${recent.length} days)
`;
    for (const b of recent) {
      const chg = ((b.c - b.o) / b.o * 100).toFixed(1);
      prompt += `  O:${b.o.toFixed(2)} H:${b.h.toFixed(2)} L:${b.l.toFixed(2)} C:${b.c.toFixed(2)} V:${(b.v / 1e6).toFixed(1)}M (${Number(chg) >= 0 ? "+" : ""}${chg}%)\n`;
    }
  }

  // Social sentiment section — feed ALL posts to the AI
  const ape = social.apewisdom;
  const posts = social.posts;

  prompt += `\n### Social Sentiment Data\n`;

  if (ape) {
    prompt += `**ApeWisdom Aggregate** (cross-Reddit tracking):\n`;
    prompt += `- Rank: #${ape.rank} on r/${ape.filter} | Mentions: ${ape.mentions} | Upvotes: ${ape.upvotes}\n`;
    if (ape.rank_24h_ago) {
      const rankDelta = ape.rank_24h_ago - ape.rank;
      prompt += `- 24h Trend: Rank ${rankDelta > 0 ? `↑${rankDelta}` : rankDelta < 0 ? `↓${Math.abs(rankDelta)}` : "unchanged"}`;
      if (ape.mentions_24h_ago) {
        const mentionDelta = ape.mentions - ape.mentions_24h_ago;
        prompt += ` | Mentions ${mentionDelta > 0 ? `+${mentionDelta}` : mentionDelta}`;
      }
      prompt += `\n`;
    }
  }

  if (posts.length > 0) {
    const totalUpvotes = posts.reduce((a, p) => a + p.upvotes, 0);
    const totalComments = posts.reduce((a, p) => a + p.comments, 0);
    const avgRatio = posts.filter(p => p.upvote_ratio > 0).length > 0
      ? (posts.reduce((a, p) => a + p.upvote_ratio, 0) / posts.filter(p => p.upvote_ratio > 0).length)
      : 0;

    prompt += `\n**Reddit Posts** (${posts.length} posts, ${totalUpvotes.toLocaleString()} total upvotes, ${totalComments.toLocaleString()} total comments, avg upvote ratio: ${(avgRatio * 100).toFixed(0)}%):\n`;
    prompt += `IMPORTANT: Analyze each post title for sentiment. High-upvote posts reflect broader crowd opinion.\n\n`;

    for (const p of posts.slice(0, 25)) {
      const meta = [];
      if (p.upvotes > 0) meta.push(`↑${p.upvotes}`);
      if (p.comments > 0) meta.push(`💬${p.comments}`);
      if (p.upvote_ratio > 0) meta.push(`${(p.upvote_ratio * 100).toFixed(0)}%`);
      const metaStr = meta.length > 0 ? `[${meta.join(" ")}] ` : "";
      prompt += `  ${metaStr}${p.sub}: "${p.title}"\n`;
      // Include post content snippet for deeper sentiment analysis
      const content = (p as RedditPost & { content?: string }).content;
      if (content && content.length > 20) {
        prompt += `    > ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}\n`;
      }
    }
  } else if (!ape) {
    prompt += `No Reddit activity found for ${symbol}.\n`;
  }

  prompt += `\nProvide your analysis in clear markdown format. Be specific about price levels and actionable for a day trader. In the Social Sentiment section, cite specific post titles and their upvote counts as evidence. Today's date: ${new Date().toISOString().split("T")[0]}.`;

  return prompt;
}

// ── Save AI analysis to Supabase ────────────────────────────

async function saveAIAnalysis(symbol: string, summary: string) {
  await supabaseQuery(`fundamentals?symbol=eq.${symbol}`, {
    method: "PATCH",
    body: JSON.stringify({
      ai_summary: summary,
      ai_analyzed_at: new Date().toISOString(),
    }),
  });
}

async function fetchAlphaVantageRatios(symbol: string): Promise<Record<string, unknown>> {
  if (!ALPHA_VANTAGE_KEY) return {};
  try {
    const resp = await fetch(
      `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`,
      { cache: "no-store" }
    );
    if (!resp.ok) return {};
    const data = await resp.json();
    if (!data.Symbol || data.Note || data.Information) return {};
    const f = (key: string): number | null => {
      const v = data[key];
      if (v && v !== "None" && v !== "-") {
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
      }
      return null;
    };
    return {
      pe_ratio: f("PERatio"),
      pb_ratio: f("PriceToBookRatio"),
      ps_ratio: f("PriceToSalesRatioTTM"),
      eps: f("EPS"),
      return_on_equity: f("ReturnOnEquityTTM"),
      return_on_assets: f("ReturnOnAssetsTTM"),
      ev_to_ebitda: f("EVToEBITDA"),
      dividend_yield: f("DividendYield"),
      beta: f("Beta"),
      forward_pe: f("ForwardPE"),
      peg_ratio: f("PEGRatio"),
      profit_margin: f("ProfitMargin"),
      earnings_growth: f("QuarterlyEarningsGrowthYOY"),
      revenue_growth: f("QuarterlyRevenueGrowthYOY"),
      analyst_target: f("AnalystTargetPrice"),
      book_value: f("BookValue"),
    };
  } catch { return {}; }
}

async function upsertFundamentals(symbol: string, details: Record<string, unknown>, avData: Record<string, unknown>) {
  const existing = await getCachedFundamentals(symbol);
  const payload: Record<string, unknown> = {
    symbol,
    name: details.name || null,
    description: details.description || null,
    sector: avData.sector || details.sic_description || null,
    industry: avData.industry || details.type || null,
    homepage_url: details.homepage_url || null,
    market_cap: avData.market_cap || details.market_cap || null,
    updated_at: new Date().toISOString(),
  };
  // Merge Alpha Vantage ratios (only non-null)
  for (const [k, v] of Object.entries(avData)) {
    if (v !== null && v !== undefined) {
      payload[k] = v;
    }
  }
  if (existing) {
    await supabaseQuery(`fundamentals?symbol=eq.${symbol}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    await supabaseQuery("fundamentals", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

// ── Main handler ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol parameter" }, { status: 400 });
  }

  try {
    // Parallel fetch everything we need
    const [cached, recentBars, dailyBars, socialData, tickerDetails, avRatios] = await Promise.all([
      getCachedFundamentals(symbol),
      fetchRecentCandles(symbol),
      fetchDailyCandles(symbol),
      fetchSocialData(symbol),
      fetchTickerDetails(symbol),
      fetchAlphaVantageRatios(symbol),
    ]);

    // Upsert fundamentals with Alpha Vantage ratios
    if (tickerDetails || Object.keys(avRatios).length > 0) {
      await upsertFundamentals(symbol, tickerDetails || {}, avRatios);
    }

    // Compute quick indicators
    const indicators = recentBars.length > 14 ? computeQuickIndicators(recentBars) : null;

    // Check if AI analysis is fresh
    let aiSummary = cached?.ai_summary || null;
    const fresh = isAnalysisFresh(cached);

    if (!fresh && GEMINI_API_KEY) {
      // Run fresh AI analysis
      const fundData = cached || (tickerDetails ? { ...tickerDetails } : null);
      aiSummary = await runAIAnalysis(symbol, fundData, indicators, socialData, dailyBars);
      // Save to DB (don't await, fire-and-forget)
      saveAIAnalysis(symbol, aiSummary).catch(() => {});
    }

    // Build response
    const response = {
      symbol,
      fundamentals: cached || {
        name: tickerDetails?.name,
        sector: tickerDetails?.sic_description,
        market_cap: tickerDetails?.market_cap,
      },
      indicators,
      reddit: {
        posts: socialData.posts,
        total_upvotes: socialData.total_upvotes,
        post_count: socialData.posts.length,
        mentions: socialData.mentions,
        apewisdom: socialData.apewisdom,
        sentiment: computeSentiment(socialData.posts),
      },
      ai_analysis: aiSummary,
      ai_fresh: fresh || !!aiSummary,
      daily_bars: dailyBars.slice(-30).map((b: { t: number; o: number; h: number; l: number; c: number; v: number }) => ({
        time: b.t / 1000,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      })),
    };

    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Analysis failed" },
      { status: 500 }
    );
  }
}

// ── Sentiment from Reddit posts ─────────────────────────────

function computeSentiment(posts: Array<{ title: string; upvotes: number; comments: number; upvote_ratio: number }>) {
  if (posts.length === 0) return { score: 0, label: "neutral", confidence: 0, post_count: 0 };

  const bullishWords = ["buy", "calls", "moon", "rocket", "bullish", "pump", "squeeze", "yolo", "long", "breaking out", "undervalued", "green", "rip", "tendies", "diamond", "rally", "surge", "soar", "breakout", "upgrade", "beat"];
  const bearishWords = ["sell", "puts", "crash", "dump", "bearish", "short", "overvalued", "red", "tank", "fall", "drop", "bag", "plunge", "downgrade", "miss", "warning", "fear", "bubble", "correction", "recession"];

  let bullScore = 0;
  let bearScore = 0;

  for (const post of posts) {
    const lower = post.title.toLowerCase();
    // Weight by upvotes + engagement (comments indicate discussion)
    const engagement = Math.max(1, Math.log2(post.upvotes + 1)) + Math.log2((post.comments || 0) + 1) * 0.5;
    // Upvote ratio > 0.7 means the community agrees with the post's sentiment
    const ratioBoost = post.upvote_ratio > 0.7 ? 1.3 : post.upvote_ratio < 0.4 ? 0.5 : 1.0;

    for (const word of bullishWords) {
      if (lower.includes(word)) bullScore += engagement * ratioBoost;
    }
    for (const word of bearishWords) {
      if (lower.includes(word)) bearScore += engagement * ratioBoost;
    }
  }

  const total = bullScore + bearScore;
  if (total === 0) return { score: 0.5, label: "neutral", confidence: 0, post_count: posts.length };

  const score = bullScore / total;
  const label = score > 0.65 ? "bullish" : score < 0.35 ? "bearish" : "neutral";
  const confidence = Math.abs(score - 0.5) * 2;

  return {
    score: Math.round(score * 100) / 100,
    label,
    confidence: Math.round(confidence * 100) / 100,
    post_count: posts.length,
  };
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}
