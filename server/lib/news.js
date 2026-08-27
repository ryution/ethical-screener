// Hot news — recent headlines that mention a company we track, pulled from outlets'
// own RSS feeds (BBC, The New York Times). Deliberately NOT Google News RSS: its own
// feed license restricts reuse to "a personal feed reader for personal, non-commercial
// use" — this app isn't that, so it's off the table. BBC and NYT both publish RSS
// specifically for syndication/aggregation instead.
//
// HONESTY RULE, same as everywhere else in this app: we show a headline, its outlet,
// and a link to the original story — never a summary or characterization we wrote.
// The reader forms their own view from the actual reporting, not from us.
//
// Matching a headline to a company is name-based (word-boundary, case-insensitive)
// against the same curated + EDGAR-enriched universe the rest of the app uses — so
// "hot news" only ever surfaces for a company we already have something to say about.

import { SCREENS } from "./screens.js";
import { enrichedTickers, enrichedName } from "./enriched.js";

const FEEDS = [
  { source: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
  { source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
];

const UA = "PlainStreet News research@plainstreet.app";
const CACHE_TTL_MS = 15 * 60 * 1000; // be a good citizen — don't refetch on every request
const _cache = new Map(); // feed url -> { items, fetchedAt }

function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .trim();
}

function parseFeed(xml) {
  const items = [];
  for (const block of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = block[1];
    const title = decodeEntities(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const link = decodeEntities(body.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const description = decodeEntities(body.match(/<description>([\s\S]*?)<\/description>/)?.[1]);
    const pubDate = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    // BBC uses <media:thumbnail url="...">; NYT uses <media:content url="...">.
    const image = body.match(/<media:thumbnail[^>]*\burl="([^"]+)"/)?.[1]
      || body.match(/<media:content[^>]*\burl="([^"]+)"/)?.[1] || null;
    if (!title || !link) continue;
    items.push({ title, link, description, image, publishedAt: pubDate ? new Date(pubDate).toISOString() : null });
  }
  return items;
}

async function fetchFeed({ source, url }) {
  const cached = _cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`${res.status}`);
    const items = parseFeed(await res.text()).map((it) => ({ ...it, source }));
    _cache.set(url, { items, fetchedAt: Date.now() });
    return items;
  } catch {
    return cached?.items || []; // stale-if-error rather than a blank feed
  }
}

// Built once per process from the same name sources the rest of the app uses
// (companyName()'s parsing isn't exported, so curated names are re-derived here the
// same way: the text before " — " in a screen's reason string).
let _index = null;
function companyIndex() {
  if (_index) return _index;
  const byTicker = new Map();
  for (const s of SCREENS) for (const [t, reason] of Object.entries(s.tickers)) if (!byTicker.has(t)) byTicker.set(t, reason.split(" — ")[0]);
  for (const t of enrichedTickers()) if (!byTicker.has(t)) { const n = enrichedName(t); if (n) byTicker.set(t, n); }

  _index = [...byTicker.entries()]
    .filter(([, name]) => name.length >= 4) // skip names too short/generic to word-match safely
    .map(([ticker, name]) => ({
      ticker,
      name,
      re: new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    }));
  return _index;
}

function matchCompanies(text) {
  const out = [];
  for (const c of companyIndex()) if (c.re.test(text)) out.push({ ticker: c.ticker, name: c.name });
  return out;
}

/** Recent headlines mentioning a tracked company, newest first. Optionally scoped to
 *  one ticker. Never includes full article text — headline, outlet, link only. */
export async function hotNews({ symbol, limit = 30 } = {}) {
  const wantTicker = symbol ? String(symbol).toUpperCase() : null;
  const feedResults = await Promise.all(FEEDS.map(fetchFeed));
  const items = [];
  const seen = new Set(); // same outlet sometimes cross-posts one story into two of its own section feeds (e.g. NYT Business + Technology)
  for (const feedItems of feedResults) {
    for (const it of feedItems) {
      if (seen.has(it.link)) continue;
      const companies = matchCompanies(`${it.title} ${it.description || ""}`);
      const matched = wantTicker ? companies.filter((c) => c.ticker === wantTicker) : companies;
      if (!matched.length) continue;
      seen.add(it.link);
      items.push({
        title: it.title, link: it.link, source: it.source, image: it.image,
        publishedAt: it.publishedAt, companies: matched,
      });
    }
  }
  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  return items.slice(0, limit);
}
