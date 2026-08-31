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

// One month of daily closes costs the same single request as one day, so we take the
// series too — it's what the sparkline draws. Real data or no chart; we never synthesize
// a shape to fill the space.
async function fetchQuote(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const result = (await res.json())?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("no price");
  const price = meta.regularMarketPrice;
  // Yahoo pads the series with nulls on non-trading days; drop them rather than letting
  // a gap render as a spike down to zero.
  const spark = (result?.indicators?.quote?.[0]?.close || []).filter((n) => typeof n === "number");
  // Careful: at range=1mo, `previousClose` is absent and `chartPreviousClose` is the close
  // from a MONTH ago, not yesterday — using it turns the tape's daily % into a monthly one.
  // Derive the previous close from the series: the final bar is today's still-moving one
  // whenever it matches the live price, so step back one to get the last completed close.
  let prevClose = null;
  if (spark.length >= 2) {
    const last = spark[spark.length - 1];
    prevClose = Math.abs(last - price) < Math.max(0.005, price * 1e-5) ? spark[spark.length - 2] : last;
  } else if (spark.length === 1 && spark[0] !== price) {
    prevClose = spark[0];
  }
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { symbol, price, changePercent, spark };
}

const _quoteCache = new Map(); // symbol -> { data, fetchedAt }

/** Price, % change and a 1-month daily series for one arbitrary symbol. Cached per symbol
 *  on the same 60s TTL as the tape, so a page full of lookups can't fan out to Yahoo. */
export async function quoteFor(symbol) {
  const key = String(symbol || "").toUpperCase();
  if (!/^[A-Z][A-Z.]{0,6}$/.test(key)) return null;
  const hit = _quoteCache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.data;
  try {
    const data = await fetchQuote(key);
    // Bound the cache so a crawler hitting many symbols can't grow it without limit.
    if (_quoteCache.size > 500) _quoteCache.clear();
    _quoteCache.set(key, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return hit ? hit.data : null; // stale beats nothing; null if we never had it
  }
}

/** Price + % change for the fixed ticker-tape symbol set, newest fetch cached 60s so
 *  request volume to Yahoo stays constant no matter how many visitors load the page. */
export async function tickerTape() {
  if (_cache.data && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache.data;
  const settled = await Promise.allSettled(SYMBOLS.map(fetchQuote));
  const quotes = settled.filter((r) => r.status === "fulfilled").map((r) => r.value);
  // Keep serving the last good batch rather than an empty tape if this refresh mostly failed.
  if (quotes.length >= SYMBOLS.length / 2 || !_cache.data) {
    _cache = { data: quotes, fetchedAt: Date.now() };
  }
  return _cache.data;
}
