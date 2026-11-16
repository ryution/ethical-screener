// Live ETF holdings — keep fund look-through current from issuer-published data.
//
// funds.js groups every fund by BASIS (the S&P 500, the total US market, …). Index
// membership drifts — names get added and dropped — so a hand-typed constituent list
// goes stale. State Street (SPDR) publishes each fund's FULL holdings as a daily .xlsx,
// free and without an API key. We fetch one authoritative fund per basis, keep only the
// holdings our screens actually flag, and write the screened baskets to
// server/generated/fund-holdings.json with an "as of" date. holdings.js overlays them.
//
// One live source refreshes every fund that tracks the same basis (SPY → VOO/IVV/…).
//
// HONESTY: we keep a holding only if the curated screens (screens.js) or the EDGAR
// enrichment (enriched.js) already flag it — this script never invents a new flag, it
// only refreshes WHICH flagged names are currently inside each index. The Nasdaq-100 has
// no free live source, so it stays curated and is marked as such.
//
// Zero dependencies: an .xlsx is a zip of XML, and `unzip` ships on macOS and the CI
// runner. Usage:  node scripts/fetch-holdings.mjs
//
// SPDR asks for a normal browser User-Agent; we send one and hit only public files.

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { flagsFor, SCREEN_KEYS } from "../server/lib/screens.js";
import { enrichedFlagsFor } from "../server/lib/enriched.js";
import { filingFlagsFor } from "../server/lib/filings.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "generated", "fund-holdings.json");
// Every CUSIP-to-ticker pair seen in these files. fetch-nport.mjs uses it to turn SEC
// filings, which list CUSIPs and names but rarely tickers, into tickers.
const CUSIP_OUT = join(HERE, "..", "server", "generated", "cusip-tickers.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// One authoritative, daily-published fund per basis. QQQ's issuer (Invesco) blocks
// scripted downloads, so the Nasdaq-100 basis stays curated in funds.js.
const ssga = (f) => `https://www.ssga.com/us/en/intermediary/etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${f}.xlsx`;
const SOURCES = {
  sp500:        { fund: "SPY",  label: "SPDR S&P 500 ETF",                                   url: ssga("spy") },
  total:        { fund: "SPTM", label: "SPDR Portfolio S&P 1500 Composite Stock Market ETF", url: ssga("sptm") },
  large_growth: { fund: "SPYG", label: "SPDR Portfolio S&P 500 Growth ETF",                  url: ssga("spyg") },
  large_value:  { fund: "SPYV", label: "SPDR Portfolio S&P 500 Value ETF",                   url: ssga("spyv") },
  healthcare:   { fund: "XLV",  label: "Health Care Select Sector SPDR",                     url: ssga("xlv") },
  // The two "responsible" cuts of the S&P 500 — the most-asked question is whether an
  // ESG fund is actually clean, and these let the product answer it from the issuer's
  // own holdings rather than guess.
  sp500_esg:    { fund: "EFIV", label: "SPDR S&P 500 ESG ETF",                               url: ssga("efiv") },
  sp500_ffree:  { fund: "SPYX", label: "SPDR S&P 500 Fossil Fuel Reserves Free ETF",         url: ssga("spyx") },
  dow30:        { fund: "DIA",  label: "SPDR Dow Jones Industrial Average ETF",              url: ssga("dia") },
  midcap:       { fund: "SPMD", label: "SPDR Portfolio S&P 400 Mid Cap ETF",                 url: ssga("spmd") },
  smallcap:     { fund: "SPSM", label: "SPDR Portfolio S&P 600 Small Cap ETF",               url: ssga("spsm") },
  // Sector, industry and dividend SPDRs. Each tracks its own index, so each is its own
  // basis with its own daily file.
  xlk: { fund: "XLK", label: "Technology Select Sector SPDR", url: ssga("xlk") },
  xlf: { fund: "XLF", label: "Financial Select Sector SPDR", url: ssga("xlf") },
  xle: { fund: "XLE", label: "Energy Select Sector SPDR", url: ssga("xle") },
  xly: { fund: "XLY", label: "Consumer Discretionary Select Sector SPDR", url: ssga("xly") },
  xlp: { fund: "XLP", label: "Consumer Staples Select Sector SPDR", url: ssga("xlp") },
  xli: { fund: "XLI", label: "Industrial Select Sector SPDR", url: ssga("xli") },
  xlb: { fund: "XLB", label: "Materials Select Sector SPDR", url: ssga("xlb") },
  xlu: { fund: "XLU", label: "Utilities Select Sector SPDR", url: ssga("xlu") },
  xlre: { fund: "XLRE", label: "Real Estate Select Sector SPDR", url: ssga("xlre") },
  xlc: { fund: "XLC", label: "Communication Services Select Sector SPDR", url: ssga("xlc") },
  xbi: { fund: "XBI", label: "SPDR S&P Biotech ETF", url: ssga("xbi") },
  xph: { fund: "XPH", label: "SPDR S&P Pharmaceuticals ETF", url: ssga("xph") },
  xhe: { fund: "XHE", label: "SPDR S&P Health Care Equipment ETF", url: ssga("xhe") },
  xhs: { fund: "XHS", label: "SPDR S&P Health Care Services ETF", url: ssga("xhs") },
  xop: { fund: "XOP", label: "SPDR S&P Oil & Gas Exploration & Production ETF", url: ssga("xop") },
  xes: { fund: "XES", label: "SPDR S&P Oil & Gas Equipment & Services ETF", url: ssga("xes") },
  xme: { fund: "XME", label: "SPDR S&P Metals & Mining ETF", url: ssga("xme") },
  xrt: { fund: "XRT", label: "SPDR S&P Retail ETF", url: ssga("xrt") },
  xhb: { fund: "XHB", label: "SPDR S&P Homebuilders ETF", url: ssga("xhb") },
  kre: { fund: "KRE", label: "SPDR S&P Regional Banking ETF", url: ssga("kre") },
  kbe: { fund: "KBE", label: "SPDR S&P Bank ETF", url: ssga("kbe") },
  kie: { fund: "KIE", label: "SPDR S&P Insurance ETF", url: ssga("kie") },
  kce: { fund: "KCE", label: "SPDR S&P Capital Markets ETF", url: ssga("kce") },
  xar: { fund: "XAR", label: "SPDR S&P Aerospace & Defense ETF", url: ssga("xar") },
  xsd: { fund: "XSD", label: "SPDR S&P Semiconductor ETF", url: ssga("xsd") },
  xsw: { fund: "XSW", label: "SPDR S&P Software & Services ETF", url: ssga("xsw") },
  xtl: { fund: "XTL", label: "SPDR S&P Telecom ETF", url: ssga("xtl") },
  xtn: { fund: "XTN", label: "SPDR S&P Transportation ETF", url: ssga("xtn") },
  xntk: { fund: "XNTK", label: "SPDR NYSE Technology ETF", url: ssga("xntk") },
  sdy: { fund: "SDY", label: "SPDR S&P Dividend ETF", url: ssga("sdy") },
  spyd: { fund: "SPYD", label: "SPDR Portfolio S&P 500 High Dividend ETF", url: ssga("spyd") },
};

// A holding counts as screened if EITHER layer flags it. Class shares differ by dot vs
// dash across sources (BF.B / BF-B), so we try both separators and return the form our
// data actually recognizes — that's the form the analyzer will re-match on.
function screenedForm(rawTicker) {
  const t = String(rawTicker || "").trim().toUpperCase();
  if (!t) return null;
  const variants = [t, t.replace(/\./g, "-"), t.replace(/-/g, ".")];
  for (const v of variants) {
    if (flagsFor(v, SCREEN_KEYS).length || enrichedFlagsFor(v, SCREEN_KEYS).length || filingFlagsFor(v, SCREEN_KEYS).length) return v;
  }
  return null;
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

// Parse an .xlsx buffer into rows of string/number cells (zero-dependency).
function parseXlsx(buf) {
  const tmp = join(tmpdir(), `holdings-${process.pid}-${Math.floor(Math.random() * 1e9)}.xlsx`);
  writeFileSync(tmp, buf);
  try {
    const unzipEntry = (entry) => execFileSync("unzip", ["-p", tmp, entry], { maxBuffer: 64 * 1024 * 1024 }).toString();
    const ss = unzipEntry("xl/sharedStrings.xml");
    const strings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)]
      .map((si) => [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
    const sheet = unzipEntry("xl/worksheets/sheet1.xml");
    return [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
      [...r[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => {
        const attrs = c[1], body = c[2];
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (v === undefined) return (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || "";
        return /t="s"/.test(attrs) ? (strings[Number(v)] ?? "") : v;
      }),
    );
  } finally {
    try { rmSync(tmp); } catch { /* best effort */ }
  }
}

// Decode the entities the shared strings may carry (SPDR uses &amp; in the "as of" block).
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

// "ALPHABET INC CL A" and "ALPHABET INC CL C" are one company holding two listed share
// classes. Dropping the trailing class marker is what makes them collide, which is how
// the total comes to mean companies rather than lines in a spreadsheet.
const companyKey = (name) => String(name ?? "")
  .toUpperCase()
  .replace(/\s+/g, " ")
  .trim()
  .replace(/\s+(?:CL|CLASS)\s+[A-Z0-9]$/, "")
  .trim();

function extract(rows) {
  // Header row is the one that names the "Ticker" column; data follows it.
  let hi = -1, tcol = -1;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].indexOf("Ticker");
    if (c >= 0) { hi = i; tcol = c; break; }
  }
  if (hi < 0) throw new Error("no 'Ticker' header found — holdings file format changed");
  // An index holds share classes, not companies: SPY lists GOOGL and GOOG as separate
  // rows. The UI merges those into one company on the flagged side, so the total has to
  // be counted the same way or the sentence compares companies against line items and
  // overstates the denominator. Counting distinct names is exactly what the UI does.
  const ncol = rows[hi].findIndex((c) => /^name$/i.test(String(c ?? "").trim()));
  const icol = rows[hi].findIndex((c) => /^identifier$/i.test(String(c ?? "").trim()));
  // Percent of the fund each line is. Kept for the flagged names, so the page can say how much
  // of the fund they are, not just how many.
  const wcol = rows[hi].findIndex((c) => /^weight$/i.test(String(c ?? "").trim()));
  // A holdings file carries non-equity lines too: DIA ends with ticker "-" named
  // "US DOLLAR", which is the fund's cash, not a company. Requiring a letter in the
  // ticker drops those without hardcoding what any issuer happens to call them.
  const dataRows = rows.slice(hi + 1)
    .filter((r) => r[tcol] && /^[A-Z0-9.-]{1,6}$/.test(r[tcol]) && /[A-Z]/.test(r[tcol]));
  const tickers = dataRows.map((r) => r[tcol]);
  // The issuer writes each class as its own name ("ALPHABET INC CL A" / "CL C"), so the
  // raw names never collide. Strip the trailing class marker and they do.
  const names = ncol >= 0 ? dataRows.map((r) => String(r[ncol] ?? "").trim()) : [];
  // Only trust the company count when every row actually carries a name; otherwise leave
  // it null and let the UI fall back rather than publish a number built on gaps.
  const totalCompanies = names.length === dataRows.length && names.every(Boolean)
    ? new Set(names.map(companyKey)).size
    : null;
  // "As of DD-Mon-YYYY" appears in the file's header block.
  let asOf = null;
  outer: for (const r of rows) for (const cell of r) {
    const m = decode(cell).match(/As of (\d{1,2}-[A-Za-z]{3}-\d{4})/);
    if (m) { asOf = m[1]; break outer; }
  }
  const cusips = icol >= 0
    ? dataRows.map((r) => [String(r[icol] ?? "").trim().toUpperCase(), r[tcol]]).filter(([c]) => /^[0-9A-Z]{9}$/.test(c))
    : [];
  const weights = wcol >= 0 ? dataRows.map((r) => Number(r[wcol]) || 0) : null;
  return { tickers, totalCompanies, asOf, cusips, weights };
}

// The fund's largest holdings by weight, whether or not they're flagged, so a stock's page
// can say which funds hold it and how much. Class shares (GOOGL, GOOG) stay separate.
export const TOP_N = 25;
function topHoldings(tickers, w) {
  const by = new Map();
  tickers.forEach((raw, i) => {
    const t = String(raw || "").trim().toUpperCase().replace(/-/g, ".");
    if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(t) || !(w[i] > 0)) return;
    by.set(t, (by.get(t) || 0) + w[i]);
  });
  return [...by].sort((a, b) => b[1] - a[1]).slice(0, TOP_N).map(([t, p]) => [t, Number(p.toFixed(3))]);
}

async function main() {
  const baskets = {};
  const sources = {};
  const cusipMap = {};
  const weights = {};   // basisKey -> { TICKER: percent of the fund }
  const top = {};       // basisKey -> [[TICKER, percent], ...] the largest holdings, flagged or not
  for (const [basisKey, src] of Object.entries(SOURCES)) {
    process.stdout.write(`Fetching ${src.fund} (${basisKey})… `);
    try {
      const buf = await fetchBuffer(src.url);
      const { tickers, totalCompanies, asOf, cusips, weights: w } = extract(parseXlsx(buf));
      for (const [c, t] of cusips) cusipMap[c] = t;
      // A file with no holdings means the fund closed or the file moved. Keep the old data.
      if (!tickers.length) throw new Error(`no holdings in the file (as of ${asOf || "unknown"})`);
      // Keep the screened names, deduped, in the file's own order (index weight order).
      const seen = new Set();
      const screened = [];
      const wt = {};
      tickers.forEach((raw, i) => {
        const form = screenedForm(raw);
        if (!form) return;
        if (!seen.has(form)) { seen.add(form); screened.push(form); }
        if (w) wt[form] = Number(((wt[form] || 0) + w[i]).toFixed(4));
      });
      baskets[basisKey] = screened;
      if (w) weights[basisKey] = wt;
      if (w) top[basisKey] = topHoldings(tickers, w);
      sources[basisKey] = { fund: src.fund, label: src.label, asOf, totalHoldings: tickers.length, totalCompanies, screened: screened.length };
      console.log(`${tickers.length} holdings${totalCompanies ? ` / ${totalCompanies} companies` : ""}, ${screened.length} screened (as of ${asOf || "n/a"})`);
    } catch (e) {
      console.log(`FAILED: ${e.message} — keeping curated fallback for ${basisKey}`);
      sources[basisKey] = { fund: src.fund, label: src.label, error: e.message };
    }
  }
  // Invesco blocks scripted downloads. fetch-nport.mjs fills the Nasdaq-100 from QQQ's SEC
  // filing; this marker only matters if that file is missing.
  sources.nasdaq100 = { curated: true, note: "Filled from QQQ's SEC N-PORT filing by fetch-nport.mjs; curated fallback in funds.js otherwise." };

  if (!Object.keys(baskets).length) {
    console.error("\nNo baskets fetched — leaving fund-holdings.json untouched.");
    process.exit(1);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Issuer daily-published holdings (State Street SPDR)",
    sources,
    baskets,
    weights,
    top,
  }, null, 0) + "\n");
  writeFileSync(CUSIP_OUT, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "CUSIP and ticker columns of the SPDR daily holdings files", count: Object.keys(cusipMap).length, map: cusipMap }) + "\n");
  console.log(`Wrote ${Object.keys(cusipMap).length} CUSIP-to-ticker pairs → ${CUSIP_OUT}`);
  const total = Object.values(baskets).reduce((n, b) => n + b.length, 0);
  console.log(`\nWrote ${Object.keys(baskets).length} live baskets (${total} screened constituents) → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
