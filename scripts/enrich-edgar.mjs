// EDGAR enrichment — build a free, broad company→screens dataset from SEC data.
//
// SEC publishes, free and without an API key:
//   • the full ticker↔CIK universe   (~10,400 US filers)
//   • each filer's SIC industry code  (via the submissions API)
//
// We fetch the SIC per company and map it to our screens (see sic.js). The result is
// written to server/generated/companies.json with a `lastUpdated` stamp, so the app can
// show data freshness honestly. Fuzzy screens (surveillance, gambling, …) are NOT set
// here — they stay curated and get AI-classified over time.
//
// Usage:
//   node scripts/enrich-edgar.mjs            # full run (~10k companies, ~20 min, polite)
//   node scripts/enrich-edgar.mjs --limit 50 # sample run, for testing
//
// SEC asks for a descriptive User-Agent with contact info and ≤10 requests/second.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { screensForSic, SIC_FALSE_POSITIVES } from "../server/lib/sic.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "generated", "companies.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer research@plainstreet.app";

const args = process.argv.slice(2);
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
const seedArg = args.indexOf("--seed");           // comma-separated tickers, for a targeted run
const SEED = seedArg >= 0 ? args[seedArg + 1].split(",").map((t) => t.trim().toUpperCase()) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad10 = (cik) => String(cik).padStart(10, "0");

// Same shape lint-data.mjs requires: plain tickers + class shares like BF.B. SEC's
// universe also lists warrants/preferred/rights with hyphens (NE-WT, BFH-PA, PBR-A) —
// not common stock a brokerage would hold under that symbol, so skip them here.
const TICKER_RE = /^[A-Z][A-Z.]{0,6}$/;

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function main() {
  console.log("Fetching the SEC ticker universe…");
  const universe = await getJson("https://www.sec.gov/files/company_tickers.json");
  let rows = Object.values(universe); // { cik_str, ticker, title }
  rows = rows.filter((r) => TICKER_RE.test(String(r.ticker).toUpperCase()));
  if (SEED) rows = rows.filter((r) => SEED.includes(String(r.ticker).toUpperCase()));
  if (Number.isFinite(LIMIT)) rows = rows.slice(0, LIMIT);
  console.log(`Classifying ${rows.length} companies by SIC…`);

  // Reuse anything we already have so a re-run is incremental, not a full refetch.
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).companies || {} : {};

  // Plain common-stock tickers only. SEC's universe also lists preferred shares (BFH-PA),
  // warrants (OXY-WT), rights (GFR-RW) and separately-quoted class lines (PBR-A) with a
  // dash suffix — secondary securities whose issuer's common stock already carries the
  // flag, so they add symbol-format noise, not coverage. Skipping them pre-fetch also
  // spares SEC the request. (Matches lint-data.mjs's TICKER_RE.)
  const isCommonTicker = (t) => /^[A-Z][A-Z.]{0,6}$/.test(t);

  const companies = {};
  const reclassified = new Set(); // tickers successfully re-fetched this run, whatever the result
  let flagged = 0, done = 0;
  for (const r of rows) {
    const ticker = String(r.ticker).toUpperCase();
    if (!isCommonTicker(ticker)) continue;
    if (SIC_FALSE_POSITIVES.has(ticker)) continue; // known SEC miscode — don't flag
    try {
      const sub = await getJson(`https://data.sec.gov/submissions/CIK${pad10(r.cik_str)}.json`);
      reclassified.add(ticker);
      const flags = screensForSic(sub.sic, ticker);
      if (flags.length) {
        companies[ticker] = { name: sub.name || r.title, sic: sub.sic, sicDescription: sub.sicDescription, flags };
        flagged++;
      }
      // else: no flags now — leave `companies` untouched here; the merge below removes
      // any stale prior entry for tickers we successfully reclassified (e.g. a SIC
      // mapping rule was narrowed and this ticker no longer qualifies).
    } catch (e) {
      // Fetch failed — keep any prior classification for this ticker rather than
      // dropping it, since we have no fresh answer to replace it with.
      if (prev[ticker]) companies[ticker] = prev[ticker];
      console.warn(`  skip ${ticker}: ${e.message}`);
    }
    if (++done % 250 === 0) console.log(`  …${done}/${rows.length} (${flagged} flagged)`);
    await sleep(120); // ~8 req/s, within SEC's limit
  }

  // Merge: keep prior entries we didn't re-fetch (e.g. on a --limit/--seed run), but drop
  // a prior entry for anything we DID successfully reclassify this run and found no
  // longer flags — otherwise a narrowed SIC rule can never actually un-flag a company,
  // since its stale flag would just survive every future merge forever.
  let merged = Object.fromEntries(
    Object.entries({ ...prev, ...companies })
      .filter(([t]) => TICKER_RE.test(t))
      .filter(([t]) => companies[t] || !reclassified.has(t))
  );
  // Purge known false positives even if a prior run stored them.
  for (const t of SIC_FALSE_POSITIVES) delete merged[t];
  // Drop duplicate securities: a warrant/unit/right (TICKER + W/U/R) whose underlying common
  // stock is itself flagged and present. These add symbol noise, not coverage — the issuer's
  // flag already lives on the base ticker. Only removes the suffixed symbol when the exact
  // base exists in the set, so standalone tickers that merely end in those letters are kept.
  for (const t of Object.keys(merged)) {
    if (t.length >= 5 && /[WUR]$/.test(t) && merged[t.slice(0, -1)]) delete merged[t];
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "SEC EDGAR (SIC classification)",
    count: Object.keys(merged).length,
    companies: merged,
  }, null, 0) + "\n");
  console.log(`\nWrote ${Object.keys(merged).length} flagged companies → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
