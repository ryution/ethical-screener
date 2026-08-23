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

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "generated", "fund-holdings.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// One authoritative, daily-published fund per basis. QQQ's issuer (Invesco) blocks
// scripted downloads, so the Nasdaq-100 basis stays curated in funds.js.
const ssga = (f) => `https://www.ssga.com/us/en/intermediary/etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${f}.xlsx`;
const SOURCES = {
  sp500:        { fund: "SPY",  label: "SPDR S&P 500 ETF",                                   url: ssga("spy") },
  total:        { fund: "SPTM", label: "SPDR Portfolio S&P 1500 Composite Stock Market ETF", url: ssga("sptm") },
  large_growth: { fund: "SPYG", label: "SPDR Portfolio S&P 500 Growth ETF",                  url: ssga("spyg") },
  large_value:  { fund: "SPYV", label: "SPDR Portfolio S&P 500 Value ETF",                   url: ssga("spyv") },
};

// A holding counts as screened if EITHER layer flags it. Class shares differ by dot vs
// dash across sources (BF.B / BF-B), so we try both separators and return the form our
// data actually recognizes — that's the form the analyzer will re-match on.
function screenedForm(rawTicker) {
  const t = String(rawTicker || "").trim().toUpperCase();
  if (!t) return null;
  const variants = [t, t.replace(/\./g, "-"), t.replace(/-/g, ".")];
  for (const v of variants) {
    if (flagsFor(v, SCREEN_KEYS).length || enrichedFlagsFor(v, SCREEN_KEYS).length) return v;
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

function extract(rows) {
  // Header row is the one that names the "Ticker" column; data follows it.
  let hi = -1, tcol = -1;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i].indexOf("Ticker");
    if (c >= 0) { hi = i; tcol = c; break; }
  }
  if (hi < 0) throw new Error("no 'Ticker' header found — holdings file format changed");
  const tickers = rows.slice(hi + 1).map((r) => r[tcol]).filter((t) => t && /^[A-Z0-9.-]{1,6}$/.test(t));
  // "As of DD-Mon-YYYY" appears in the file's header block.
  let asOf = null;
  outer: for (const r of rows) for (const cell of r) {
    const m = decode(cell).match(/As of (\d{1,2}-[A-Za-z]{3}-\d{4})/);
    if (m) { asOf = m[1]; break outer; }
  }
  return { tickers, asOf };
}

async function main() {
  const baskets = {};
  const sources = {};
  for (const [basisKey, src] of Object.entries(SOURCES)) {
    process.stdout.write(`Fetching ${src.fund} (${basisKey})… `);
    try {
      const buf = await fetchBuffer(src.url);
      const { tickers, asOf } = extract(parseXlsx(buf));
      // Keep the screened names, deduped, in the file's own order (index weight order).
      const seen = new Set();
      const screened = [];
      for (const raw of tickers) {
        const form = screenedForm(raw);
        if (form && !seen.has(form)) { seen.add(form); screened.push(form); }
      }
      baskets[basisKey] = screened;
      sources[basisKey] = { fund: src.fund, label: src.label, asOf, totalHoldings: tickers.length, screened: screened.length };
      console.log(`${tickers.length} holdings, ${screened.length} screened (as of ${asOf || "n/a"})`);
    } catch (e) {
      console.log(`FAILED: ${e.message} — keeping curated fallback for ${basisKey}`);
      sources[basisKey] = { fund: src.fund, label: src.label, error: e.message };
    }
  }
  sources.nasdaq100 = { curated: true, note: "No free live source (Invesco blocks scripted downloads); curated fallback in funds.js." };

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
  }, null, 0) + "\n");
  const total = Object.values(baskets).reduce((n, b) => n + b.length, 0);
  console.log(`\nWrote ${Object.keys(baskets).length} live baskets (${total} screened constituents) → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
