import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

async function supabaseQuery(path: string) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    cache: "no-store",
  });
  if (!resp.ok) return [];
  return resp.json();
}

// ── ApeWisdom direct fetch (live trending data) ─────────────

interface TrendingTicker {
  symbol: string;
  name: string;
  rank: number;
  mentions: number;
  upvotes: number;
  rank_24h_ago: number;
  mentions_24h_ago: number;
  rank_change: number;
  mention_change: number;
  sources: string[];
}

// Tickers to exclude (ETFs, common words)
const IGNORE = new Set([
  "SPY", "QQQ", "IWM", "DIA", "VOO", "VTI", "ETF",
  "CEO", "IPO", "GDP", "SEC", "FDA", "USA", "API",
  "ALL", "FOR", "THE", "ARE", "NOT", "HAS", "NEW",
  "ANY", "CAN", "NOW", "BIG", "OLD", "LOW", "TOP",
  "AI", "OR", "DD", "PM", "AM", "GO", "SO", "UP",
]);

async function fetchApeWisdomTrending(): Promise<TrendingTicker[]> {
  const filters = ["all-stocks", "wallstreetbets"];
  const tickerMap = new Map<string, TrendingTicker>();

  for (const filter of filters) {
    try {
      const resp = await fetch(
        `https://apewisdom.io/api/v1.0/filter/${filter}/page/1`,
        { headers: { "User-Agent": "CandleBot/1.0" }, cache: "no-store" }
      );
      if (!resp.ok) continue;
      const data = await resp.json();

      for (const item of (data.results || [])) {
        const ticker = (item.ticker || "").toUpperCase();
        if (!ticker || IGNORE.has(ticker) || ticker.length < 2) continue;

        const rank = Number(item.rank || 99);
        const mentions = Number(item.mentions || 0);
        const upvotes = Number(item.upvotes || 0);
        const rank24h = Number(item.rank_24h_ago || 99);
        const mentions24h = Number(item.mentions_24h_ago || 0);

        const existing = tickerMap.get(ticker);
        if (existing) {
          // Merge: keep best rank, sum mentions/upvotes, add source
          existing.rank = Math.min(existing.rank, rank);
          existing.mentions = Math.max(existing.mentions, mentions);
          existing.upvotes = Math.max(existing.upvotes, upvotes);
          existing.sources.push(filter);
        } else {
          tickerMap.set(ticker, {
            symbol: ticker,
            name: item.name || "",
            rank,
            mentions,
            upvotes,
            rank_24h_ago: rank24h,
            mentions_24h_ago: mentions24h,
            rank_change: rank24h - rank,
            mention_change: mentions - mentions24h,
            sources: [filter],
          });
        }
      }
    } catch {
      // Continue
    }
  }

  // Sort by rank (best rank first)
  return [...tickerMap.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 25);
}

// ── RSS.app feed for real WSB posts ─────────────────────────

interface RedditPost {
  title: string;
  url: string;
  sub: string;
  time: string;
  upvotes: number;
  comments: number;
}

const RSS_FEEDS = [
  { url: "https://rss.app/feeds/v1.1/6gNr698SIoNU5ATK.json", sub: "r/wallstreetbets" },
];

async function fetchRSSPosts(): Promise<(RedditPost & { symbol?: string })[]> {
  const posts: (RedditPost & { symbol?: string })[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const resp = await fetch(feed.url, {
        headers: { "User-Agent": "CandleBot/1.0" },
        cache: "no-store",
      });
      if (!resp.ok) continue;
      const data = await resp.json();

      for (const item of (data.items || [])) {
        const title = item.title || "";
        if (!title) continue;

        // Extract ticker from title
        const tickerMatch = title.match(/\$([A-Z]{2,5})\b/);
        const symbol = tickerMatch ? tickerMatch[1] : undefined;

        let time = "";
        if (item.date_published) {
          try {
            time = String(Math.floor(new Date(item.date_published).getTime() / 1000));
          } catch { /* */ }
        }

        posts.push({
          title,
          url: item.url || "",
          sub: feed.sub,
          time,
          upvotes: 0,
          comments: 0,
          symbol,
        });
      }
    } catch {
      // Continue
    }
  }

  return posts;
}

/**
 * GET /api/overview
 * 
 * Returns consolidated data for the overview page:
 * - Top trending tickers from ApeWisdom (live)
 * - Top reddit posts from RSS feeds + activity_log
 * - Watchlist AI analysis summaries
 */
export async function GET() {
  try {
    // Fetch everything in parallel
    const [trending, rssPosts, scannerEvents, fundRows] = await Promise.all([
      fetchApeWisdomTrending(),
      fetchRSSPosts(),
      supabaseQuery(
        "activity_log?agent=eq.scanner&event_type=eq.scan_result&order=created_at.desc&limit=5&select=metadata,created_at"
      ),
      supabaseQuery(
        "fundamentals?ai_summary=not.is.null&order=ai_analyzed_at.desc&limit=20&select=symbol,name,sector,market_cap,pe_ratio,ai_summary,ai_analyzed_at"
      ),
    ]);

    // Collect posts from activity_log (bot scanner results, may have upvotes)
    const allPosts: (RedditPost & { symbol: string })[] = [];
    const seenUrls = new Set<string>();

    // Add RSS posts first (real, fresh titles)
    for (const p of rssPosts) {
      if (p.url && !seenUrls.has(p.url)) {
        allPosts.push({ ...p, symbol: p.symbol || "" });
        seenUrls.add(p.url);
      }
    }

    // Add posts from activity_log
    for (const event of (scannerEvents || [])) {
      const meta = event?.metadata;
      if (meta?.source !== "reddit") continue;
      const tickers = meta?.tickers;
      if (!Array.isArray(tickers)) continue;

      for (const t of tickers) {
        if (!t?.symbol) continue;
        for (const p of (t.posts || [])) {
          // Skip synthetic ApeWisdom posts if we have real posts
          if (p.url?.includes("apewisdom.io") && allPosts.length > 0) continue;
          if (p.url && !seenUrls.has(p.url)) {
            allPosts.push({
              title: p.title || "",
              url: p.url,
              sub: p.sub || "",
              time: p.time || "",
              upvotes: p.upvotes || 0,
              comments: p.comments || 0,
              symbol: t.symbol,
            });
            seenUrls.add(p.url);
          }
        }
      }
    }

    // Sort posts by upvotes (posts with upvotes first, then by recency)
    allPosts.sort((a, b) => {
      if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
      return Number(b.time || 0) - Number(a.time || 0);
    });

    const totalUpvotes = allPosts.reduce((a, p) => a + p.upvotes, 0);

    return NextResponse.json({
      top_posts: allPosts.slice(0, 20),
      top_tickers: trending,
      total_posts: allPosts.length,
      total_upvotes: totalUpvotes,
      ai_analyses: fundRows || [],
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load overview" },
      { status: 500 }
    );
  }
}
