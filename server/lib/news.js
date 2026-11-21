// Hot news — recent headlines that mention a company we track, pulled from outlets'
// own RSS feeds (BBC, The New York Times, The Wall Street Journal, The Guardian, NPR, CBS News, MarketWatch, Fox
// Business, ProPublica, Grist). Deliberately NOT Google News RSS: its own feed license
// restricts reuse to "a personal feed reader for personal, non-commercial use", so it's
// off the table. Each outlet here publishes its own feed; we show only the headline,
// photo and a link back, which is what those feeds are for. If PlainStreet starts
// charging, re-check each outlet's feed terms.
//
// HONESTY RULE, same as everywhere else in this app: we show a headline, its outlet,
// and a link to the original story — never a summary or characterization we wrote.
// The reader forms their own view from the actual reporting, not from us.
//
// Matching a headline to a company is name-based (word-boundary, case-insensitive)
// against the same curated + EDGAR-enriched universe the rest of the app uses — so
// "hot news" only ever surfaces for a company we already have something to say about.

import { SCREENS, flagsFor, SCREEN_KEYS } from "./screens.js";
import { enrichedTickers, enrichedName, enrichedFlagsFor } from "./enriched.js";
import { filingFlagsFor, filingTickers, filingName } from "./filings.js";

const NYT = (section) => ({ source: "The New York Times", url: `https://rss.nytimes.com/services/xml/rss/nyt/${section}.xml` });
const BBC = (section) => ({ source: "BBC", url: `https://feeds.bbci.co.uk/news/${section}/rss.xml` });
const GUARDIAN = (path) => ({ source: "The Guardian", url: `https://www.theguardian.com/${path}/rss` });
// A spread of outlets, so one newsroom's coverage isn't the whole picture: public
// broadcasters, newspapers left and right of center, market news, and two investigative
// and climate desks that report on the issues our categories cover.
export const FEEDS = [
  BBC("business"), BBC("technology"), BBC("science_and_environment"),
  NYT("Business"), NYT("Technology"), NYT("Economy"), NYT("EnergyEnvironment"), NYT("Dealbook"),
  NYT("YourMoney"), NYT("MediaandAdvertising"), NYT("Climate"), NYT("Health"),
  GUARDIAN("business"), GUARDIAN("us/environment"), GUARDIAN("us/technology"),
  { source: "NPR", url: "https://feeds.npr.org/1006/rss.xml" },
  { source: "CBS News", url: "https://www.cbsnews.com/latest/rss/moneywatch" },
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { source: "Fox Business", url: "https://moxie.foxbusiness.com/google-publisher/latest.xml" },
  { source: "ProPublica", url: "https://www.propublica.org/feeds/propublica/main" },
  { source: "Grist", url: "https://grist.org/feed/" },
  ...["WSJcomUSBusiness", "RSSMarketsMain", "RSSWSJD", "socialeconomyfeed"]
    .map((f) => ({ source: "The Wall Street Journal", url: `https://feeds.content.dowjones.io/public/rss/${f}` })),
];
// Where story photos come from. The page's security policy allows these hosts and no
// others, so a photo from anywhere else is dropped rather than shown broken.
const IMAGE_HOSTS = /^https:\/\/(ichef\.bbci\.co\.uk|static01\.nyt\.com|static\.nytimes\.com|i\.guim\.co\.uk|media\.npr\.org|npr\.brightspotcdn\.com|[a-z0-9-]+\.cbsnewsstatic\.com|images\.mktw\.net|static\.foxbusiness\.com|www\.propublica\.org|grist\.org|images\.wsj\.net|opinion-images\.wsj\.net)\//;

const UA = "PlainStreet News research@plainstreet.app";
const CACHE_TTL_MS = 15 * 60 * 1000; // be a good citizen — don't refetch on every request
const _cache = new Map(); // feed url -> { items, fetchedAt }

function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    // Numbered characters, like the WSJ's &#x2019; for a curly apostrophe.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

export function parseFeed(xml) {
  const items = [];
  for (const block of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const body = block[1];
    const title = decodeEntities(body.match(/<title>([\s\S]*?)<\/title>/)?.[1]);
    const link = decodeEntities(body.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
    const description = decodeEntities(body.match(/<description>([\s\S]*?)<\/description>/)?.[1]);
    const pubDate = body.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    // Outlets put the photo in different places: BBC <media:thumbnail>, NYT and the
    // Guardian <media:content>, MarketWatch <enclosure>, CBS <image>, and NPR,
    // ProPublica and Grist an <img> inside the story text.
    const unescaped = decodeEntities(body);
    const candidate = body.match(/<media:thumbnail[^>]*\burl="([^"]+)"/)?.[1]
      || body.match(/<media:content[^>]*\burl="([^"]+)"/)?.[1]
      || body.match(/<enclosure[^>]*\burl="([^"]+)"[^>]*type="image/)?.[1]
      || body.match(/<image>\s*(https:[^<\s]+)\s*<\/image>/)?.[1]
      || unescaped.match(/<img[^>]+src=["'](https:[^"']+)["']/)?.[1] || null;
    const image = candidate && IMAGE_HOSTS.test(decodeEntities(candidate)) ? decodeEntities(candidate) : null;
    if (!title || !link) continue;
    // Videos and quizzes ride along in some feeds; this strip is
    // for reported stories.
    if (/\/videos?\//.test(link)) continue;
    items.push({ title, link, description, image, publishedAt: pubDate ? new Date(pubDate).toISOString() : null });
  }
  return items;
}

async function fetchFeed({ source, url }) {
  const cached = _cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;
  try {
    // One slow outlet must not hold up the whole strip.
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const items = parseFeed(await res.text()).map((it) => ({ ...it, source }));
    _cache.set(url, { items, fetchedAt: Date.now() });
    return items;
  } catch {
    return cached?.items || []; // stale-if-error rather than a blank feed
  }
}

// Headlines say "Exxon" and "Lockheed", not "EXXON MOBIL CORP" or "Lockheed Martin Corp".
// SEC names are cut down to how a reporter would write them: legal suffixes and SEC
// state tags dropped, all-caps names put back in normal case.
const LEGAL = /[,\s]+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|l\.?p|n\.?v|s\.?a|ag|se|the)\.?$/i;
function shortName(raw) {
  let n = String(raw || "").replace(/\s*\/[A-Z0-9 .]+\/?\s*$/, "").trim();
  for (let k = 0; k < 3; k++) n = n.replace(LEGAL, "").trim();
  if (n === n.toUpperCase()) n = n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  return n.replace(/[,.]+$/, "").trim();
}
// The names reporters actually use for the best-known flagged companies. Each is only
// used if that ticker is flagged by at least one layer.
const ALIASES = {
  Exxon: "XOM", ExxonMobil: "XOM", Chevron: "CVX", ConocoPhillips: "COP", Halliburton: "HAL", Occidental: "OXY",
  Google: "GOOGL", Alphabet: "GOOGL", YouTube: "GOOGL", Meta: "META", Facebook: "META", Instagram: "META", WhatsApp: "META",
  Lockheed: "LMT", Raytheon: "RTX", Boeing: "BA", Northrop: "NOC", "General Dynamics": "GD", Palantir: "PLTR",
  Altria: "MO", Marlboro: "PM", "Philip Morris": "PM", Tyson: "TSN", Hormel: "HRL",
  DraftKings: "DKNG", FanDuel: "FLUT", "MGM Resorts": "MGM", "Las Vegas Sands": "LVS",
  "Berkshire Hathaway": "BRK.B", Berkshire: "BRK.B", "Smith & Wesson": "SWBI", "Sturm Ruger": "RGR",
  "Johnson & Johnson": "JNJ", McKesson: "MCK", Cencora: "COR", "Cardinal Health": "CAH",
};
// Company names that are also everyday words. In a title-case headline "Block" or
// "Target" can't be told from the word, so these never match on their own.
const COMMON_WORDS = new Set(["block", "target", "gap", "snap", "visa", "chime", "ring", "bonk", "tron", "ford", "match", "box", "shift", "square", "compass", "clean energy", "energy", "first capital", "strategy", "progress", "dominion", "entergy", "southern", "constellation"]);

let _index = null;
function companyIndex() {
  if (_index) return _index;
  const flagged = (t) => flagsFor(t, SCREEN_KEYS).length || enrichedFlagsFor(t, SCREEN_KEYS).length || filingFlagsFor(t, SCREEN_KEYS).length;
  const byName = new Map();   // match text -> ticker; the first source to claim a name keeps it
  const add = (name, ticker) => {
    const n = shortName(name);
    if (n.length < 4 || COMMON_WORDS.has(n.toLowerCase()) || byName.has(n.toLowerCase())) return;
    byName.set(n.toLowerCase(), { ticker, name: n });
  };
  for (const [alias, t] of Object.entries(ALIASES)) if (flagged(t)) add(alias, t);
  for (const s of SCREENS) for (const [t, reason] of Object.entries(s.tickers)) add(reason.split(" \u2014 ")[0], t);   // the name before the screens.js separator
  for (const t of filingTickers()) add(filingName(t), t);
  for (const t of enrichedTickers()) add(enrichedName(t), t);

  _index = [...byName.values()].map(({ ticker, name }) => ({
    ticker, name,
    re: new RegExp(`(^|[^\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu"),
  }));
  return _index;
}

// The flag labels a company carries — shown on the card so the reader can see WHY a
// story about Apple belongs in a feed about ethical screens.
function flagLabels(ticker) {
  const seen = new Set();
  for (const f of [...filingFlagsFor(ticker, SCREEN_KEYS), ...flagsFor(ticker, SCREEN_KEYS), ...enrichedFlagsFor(ticker, SCREEN_KEYS)]) seen.add(f.label);
  return [...seen];
}
function matchCompanies(text) {
  const out = [];
  // Two names for one company ("Facebook and Instagram") are one tag, not two.
  for (const c of companyIndex()) if (c.re.test(text) && !out.some((o) => o.ticker === c.ticker)) out.push({ ticker: c.ticker, name: c.name, flags: flagLabels(c.ticker) });
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
      // Headline only. A company named in the summary is often a passing mention (an
      // Nvidia story citing Apple), and tagging it would misdescribe the story.
      const companies = matchCompanies(it.title);
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
  // One company on a launch week (five Apple stories in a row) shouldn't be the whole
  // strip. At most two per lead company unless the caller asked for that company.
  if (wantTicker) return items.slice(0, limit);
  const perCompany = new Map();
  const spread = [];
  for (const it of items) {
    const lead = it.companies[0]?.ticker;
    const n = perCompany.get(lead) || 0;
    if (n >= 2) continue;
    perCompany.set(lead, n + 1);
    spread.push(it);
  }
  return spread.slice(0, limit);
}
