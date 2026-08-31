// Ticker tape — recent price + % change for a fixed set of well-known symbols, for the
// scrolling marquee at the top of the page.
//
// Source: Yahoo Finance's undocumented chart endpoint. Worth being straight about: this
// is not an official public API — Yahoo doesn't publish terms for it, it's the same
// endpoint the (very widely used) `yfinance` library scrapes, and Yahoo has already
// locked down its batch quote endpoint once. It can change or start blocking requests
// with no notice. Fine for a demo showing public price data; a real commercial launch
// should move to a licensed market-data provider (which real-time price redistribution
// normally requires anyway — exchanges charge for that, free-and-official don't coexist).
//
// Kept low-risk by design: one shared server-side cache (60s TTL) means the request
// volume to Yahoo is constant regardless of how many people load the page, not
// per-visitor polling.

const SYMBOLS = ["VOO", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "XOM", "CVX", "JPM", "LMT", "IEP", "MSTR", "DIS"];

const UA = "Mozilla/5.0 (compatible; PlainStreet/1.0; +https://plainstreet.app)";
const CACHE_TTL_MS = 60 * 1000;
let _cache = { data: null, fetchedAt: 0 };

// The windows the chart offers. Yahoo wants a (range, interval) pair; the interval is
// chosen so each window comes back with enough points to draw but not thousands.
export const RANGES = {
  "1D":  { range: "1d",  interval: "5m",  label: "today" },
  "1W":  { range: "5d",  interval: "30m", label: "past week" },
  "1M":  { range: "1mo", interval: "1d",  label: "past month" },
  "1Y":  { range: "1y",  interval: "1d",  label: "past year" },
  "ALL": { range: "max", interval: "1mo", label: "all time" },
};
export const RANGE_KEYS = Object.keys(RANGES);

// The series costs the same single request as the price alone, so we always take it —
// it's what the sparkline draws. Real data or no chart; we never synthesize a shape.
async function fetchQuote(symbol, key = "1M") {
  const spec = RANGES[key] || RANGES["1M"];
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${spec.interval}&range=${spec.range}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error(`${res.status}`);
  const result = (await res.json())?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("no price");
  const price = meta.regularMarketPrice;
  // Yahoo pads the series with nulls on non-trading periods; drop them rather than letting
  // a gap render as a spike down to zero. Closes and timestamps must be filtered together
  // or the two arrays desync and every point reports the wrong date.
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const stamps = result?.timestamp || [];
  const spark = [];
  const times = [];
  for (let i = 0; i < closes.length; i++) {
    if (typeof closes[i] !== "number") continue;
    spark.push(closes[i]);
    times.push(typeof stamps[i] === "number" ? stamps[i] : null);
  }

  // Change over the window being shown. `chartPreviousClose` is the close immediately
  // before the range starts, which is the right baseline for every window — yesterday's
  // close for 1D, the close a year ago for 1Y. At range=max there is nothing before the
  // first bar, so fall back to the earliest point we have (change since inception).
  const base = (typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0)
    ? meta.chartPreviousClose
    : (spark.length ? spark[0] : null);
  const changePercent = base ? ((price - base) / base) * 100 : 0;

  // The ticker tape always wants the DAILY move, whatever window we happened to fetch.
  // Only meaningful on a daily-interval series, so it's derived rather than taken from
  // chartPreviousClose (which at range=1mo is a month-old close, not yesterday's).
  let dailyChangePercent = changePercent;
  if (spec.interval === "1d" && spark.length >= 2) {
    const last = spark[spark.length - 1];
    const prev = Math.abs(last - price) < Math.max(0.005, price * 1e-5) ? spark[spark.length - 2] : last;
    if (prev) dailyChangePercent = ((price - prev) / prev) * 100;
  }
  // `base` is returned so the client can price any scrubbed point against the same
  // baseline the headline uses, instead of reverse-engineering it from the percentage.
  return { symbol, price, changePercent, dailyChangePercent, spark, times, base, range: key, label: spec.label };
}

const _quoteCache = new Map(); // `${symbol}:${range}` -> { data, fetchedAt }

/** Price, % change over the requested window, and the series to draw. Cached per
 *  symbol+range on the same 60s TTL as the tape, so a page of lookups can't fan out. */
export async function quoteFor(symbol, range = "1M") {
  const sym = String(symbol || "").toUpperCase();
  if (!/^[A-Z][A-Z.]{0,6}$/.test(sym)) return null;
  const key = RANGES[range] ? range : "1M";
  const id = `${sym}:${key}`;
  const hit = _quoteCache.get(id);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;
  try {
    const data = await fetchQuote(sym, key);
    // Bound the cache so a crawler hitting many symbols can't grow it without limit.
    if (_quoteCache.size > 500) _quoteCache.clear();
    _quoteCache.set(id, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return hit ? hit.data : null; // stale beats nothing; null if we never had it
  }
}

/** Price + % change for the fixed ticker-tape symbol set, newest fetch cached 60s so
 *  request volume to Yahoo stays constant no matter how many visitors load the page. */
export async function tickerTape() {
  if (_cache.data && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache.data;
  const settled = await Promise.allSettled(SYMBOLS.map((s) => fetchQuote(s, "1M")));
  const quotes = settled
    .filter((r) => r.status === "fulfilled")
    // The tape shows today's move, not the month's.
    .map((r) => ({ ...r.value, changePercent: r.value.dailyChangePercent }));
  // Keep serving the last good batch rather than an empty tape if this refresh mostly failed.
  if (quotes.length >= SYMBOLS.length / 2 || !_cache.data) {
    _cache = { data: quotes, fetchedAt: Date.now() };
  }
  return _cache.data;
}
