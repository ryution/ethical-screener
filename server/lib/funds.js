// Fund look-through — the point of the whole product for normal people.
//
// Most people don't hold Exxon directly; they hold an S&P 500 fund that holds Exxon.
// For a curated set of well-known index funds we know their constituents from public,
// published holdings, so we can look inside and surface the flagged companies.
//
// HONESTY RULES (this product's premise):
//   1. Only funds listed here are looked into. Anything else stays "not analyzed" —
//      we never guess at a fund's contents.
//   2. Each fund's actual constituent list, when we have it, comes from its latest SEC
//      NPORT-P filing (scripts/fetch-fund-holdings.mjs — free, official, no API key).
//      A fund without a fresh filing falls back to the hand-curated list below, so the
//      product still works if the fetch hasn't been run yet or a filing lookup fails.
//   3. We never attribute an exact dollar amount to a company *inside* a fund — that
//      needs per-name weights we don't have. We name the companies, not the dollars.
//
// The lists below are the fallback: screened companies established as large-cap
// members of each index, for when live NPORT-P data isn't available.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Screened companies that are established S&P 500 constituents.
const SP500 = [
  // fossil fuels
  "XOM", "CVX", "COP", "OXY", "SLB", "HAL", "KMI", "MPC", "VLO", "PSX",
  "WMB", "OKE", "DVN", "FANG", "EOG", "HES", "BKR", "CTRA",
  // weapons & defense
  "LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "TXT", "LDOS",
  // tobacco
  "MO", "PM",
  // gambling
  "LVS", "MGM", "WYNN", "CZR",
  // alcohol
  "STZ", "TAP", "BF.B",
  // surveillance & data
  "META", "GOOGL", "GOOG", "PLTR",
  // factory farming
  "TSN", "HRL",
];

// Total US market holds everything in the S&P 500 plus smaller-cap screened names.
const TOTAL = [...new Set([...SP500,
  "SWBI", "RGR", "OLN", "VSTO", "POWW", "AOUT",   // firearms
  "DKNG", "PENN", "BYD", "CHDN", "RSI", "GDEN",   // gambling
  "GEO", "CXW",                                    // private prisons
  "WRLD", "EZPW", "FCFS", "ENVA",                  // predatory lending
  "TPB", "UVV",                                    // tobacco
  "KTOS", "AVAV",                                  // defense
  "SAM",                                           // alcohol
])];

// Nasdaq-100 is tech-heavy: few of our screened names, mostly the data/ad giants.
const NASDAQ100 = ["META", "GOOGL", "GOOG", "PLTR"];

/** ticker -> { name, basis (plain-English index), holds (curated fallback constituents) }. */
export const FUNDS = {
  VOO:   { name: "Vanguard S&P 500 ETF",                    basis: "the S&P 500",        holds: SP500 },
  SPY:   { name: "SPDR S&P 500 ETF",                        basis: "the S&P 500",        holds: SP500 },
  IVV:   { name: "iShares Core S&P 500 ETF",                basis: "the S&P 500",        holds: SP500 },
  SPLG:  { name: "SPDR Portfolio S&P 500 ETF",              basis: "the S&P 500",        holds: SP500 },
  FXAIX: { name: "Fidelity 500 Index Fund",                 basis: "the S&P 500",        holds: SP500 },
  VFIAX: { name: "Vanguard 500 Index Fund",                 basis: "the S&P 500",        holds: SP500 },
  SWPPX: { name: "Schwab S&P 500 Index Fund",               basis: "the S&P 500",        holds: SP500 },
  VTI:   { name: "Vanguard Total Stock Market ETF",         basis: "the total US market", holds: TOTAL },
  ITOT:  { name: "iShares Core S&P Total US Stock Market",  basis: "the total US market", holds: TOTAL },
  VTSAX: { name: "Vanguard Total Stock Market Index Fund",  basis: "the total US market", holds: TOTAL },
  QQQ:   { name: "Invesco QQQ Trust (Nasdaq-100)",          basis: "the Nasdaq-100",     holds: NASDAQ100 },
};

// Live holdings from the latest SEC NPORT-P filing per fund (see file header). Loaded
// once at boot; re-run scripts/fetch-fund-holdings.mjs and restart to refresh.
const GENERATED = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "fund-holdings.json");
let _live = { lastUpdated: null, source: null, funds: {} };
try {
  if (existsSync(GENERATED)) _live = JSON.parse(readFileSync(GENERATED, "utf8"));
} catch { /* no live data yet — the app still runs on the curated fallback lists */ }

/** Freshness metadata for the UI, mirroring enriched.js's dataMeta(). */
export function fundHoldingsMeta() {
  return { lastUpdated: _live.lastUpdated, source: _live.source, fundCount: Object.keys(_live.funds).length };
}

/** The fund record for a ticker we can see inside, or null. Prefers live NPORT-P
 *  holdings over the curated fallback list when we have them. */
export function knownFund(t) {
  const fund = FUNDS[String(t || "").toUpperCase()];
  if (!fund) return null;
  const live = _live.funds[String(t).toUpperCase()];
  return live ? { ...fund, holds: live.holds, filingPeriodEnd: live.filingPeriodEnd, source: live.source } : fund;
}
