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

async function fetchQuote(symbol) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const meta = (await res.json())?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== "number") throw new Error("no price");
  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  return { symbol, price, changePercent };
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
