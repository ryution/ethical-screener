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
// The lists below are screened companies (from screens.js) that are established
// large-cap members of each index. Deliberately conservative: a name is included only
// where its membership is stable and well-known. They are the FALLBACK — when
// fetch-holdings.mjs has run, holdings.js overlays the issuer's live constituents.

import { basketFor } from "./holdings.js";

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

// Large-cap growth split — the data/ad giants sit on the growth side.
const GROWTH = ["META", "GOOGL", "GOOG", "PLTR"];
// Large-cap value split — energy, defense, and tobacco are classic value sectors.
const VALUE = ["XOM", "CVX", "COP", "OXY", "SLB", "HAL", "MPC", "VLO", "PSX", "WMB", "OKE",
  "LMT", "RTX", "NOC", "GD", "LHX", "MO", "PM"];
// Health-care sector — mostly opioid culpability (makers + distributors).
const HEALTHCARE = ["JNJ", "MCK", "CAH", "COR"];

// Each fund tracks one BASIS. The screened constituents for a basis come, when we've
// fetched them, from the issuer's daily holdings (see holdings.js / fetch-holdings.mjs);
// otherwise from the conservative curated fallback above. Grouping by basis means one
// authoritative live source refreshes every fund that tracks it (SPY→S&P 500, SPTM→total,
// SPYG→growth, SPYV→value). The Nasdaq-100 has no free live source, so it stays curated.
const FALLBACK = { sp500: SP500, total: TOTAL, nasdaq100: NASDAQ100, large_growth: GROWTH, large_value: VALUE, healthcare: HEALTHCARE };
const holdsFor = (basisKey) => basketFor(basisKey) || FALLBACK[basisKey];

const CATALOGUE = {
  VOO:   { name: "Vanguard S&P 500 ETF",                    basis: "the S&P 500",             basisKey: "sp500" },
  SPY:   { name: "SPDR S&P 500 ETF",                        basis: "the S&P 500",             basisKey: "sp500" },
  IVV:   { name: "iShares Core S&P 500 ETF",                basis: "the S&P 500",             basisKey: "sp500" },
  SPLG:  { name: "SPDR Portfolio S&P 500 ETF",              basis: "the S&P 500",             basisKey: "sp500" },
  FXAIX: { name: "Fidelity 500 Index Fund",                 basis: "the S&P 500",             basisKey: "sp500" },
  VFIAX: { name: "Vanguard 500 Index Fund",                 basis: "the S&P 500",             basisKey: "sp500" },
  SWPPX: { name: "Schwab S&P 500 Index Fund",               basis: "the S&P 500",             basisKey: "sp500" },
  VTI:   { name: "Vanguard Total Stock Market ETF",         basis: "the total US market",     basisKey: "total" },
  ITOT:  { name: "iShares Core S&P Total US Stock Market",  basis: "the total US market",     basisKey: "total" },
  VTSAX: { name: "Vanguard Total Stock Market Index Fund",  basis: "the total US market",     basisKey: "total" },
  SCHB:  { name: "Schwab U.S. Broad Market ETF",            basis: "the total US market",     basisKey: "total" },
  QQQ:   { name: "Invesco QQQ Trust (Nasdaq-100)",          basis: "the Nasdaq-100",          basisKey: "nasdaq100" },
  XLV:   { name: "Health Care Select Sector SPDR",          basis: "the U.S. health-care sector", basisKey: "healthcare" },
  VUG:   { name: "Vanguard Growth ETF",                     basis: "large-cap US growth",     basisKey: "large_growth" },
  IWF:   { name: "iShares Russell 1000 Growth ETF",         basis: "large-cap US growth",     basisKey: "large_growth" },
  SCHG:  { name: "Schwab U.S. Large-Cap Growth ETF",        basis: "large-cap US growth",     basisKey: "large_growth" },
  VTV:   { name: "Vanguard Value ETF",                      basis: "large-cap US value",      basisKey: "large_value" },
  IWD:   { name: "iShares Russell 1000 Value ETF",          basis: "large-cap US value",      basisKey: "large_value" },
  SCHV:  { name: "Schwab U.S. Large-Cap Value ETF",         basis: "large-cap US value",      basisKey: "large_value" },
};

/** ticker -> { name, basis (plain-English index), holds (screened constituents) }. */
export const FUNDS = Object.fromEntries(
  Object.entries(CATALOGUE).map(([t, f]) => [t, { name: f.name, basis: f.basis, holds: holdsFor(f.basisKey) }]),
);

/** The fund record for a ticker we can see inside, or null. */
export const knownFund = (t) => FUNDS[String(t || "").toUpperCase()] || null;

// Widely-held funds we RECOGNIZE but deliberately don't analyze — our screens cover
// US-listed companies by line of business, which doesn't fit foreign equities, bonds, or
// commodities. Naming them explicitly lets the UI say "not analyzed" honestly, instead of
// letting a popular international/bond fund read as "clean" just because we track nothing
// inside it. (HONESTY RULE #1: not analyzed ≠ clean.)
const NOT_ANALYZED = {
  VEA:  { name: "Vanguard FTSE Developed Markets ETF",        kind: "international" },
  IEFA: { name: "iShares Core MSCI EAFE ETF",                 kind: "international" },
  VXUS: { name: "Vanguard Total International Stock ETF",      kind: "international" },
  VWO:  { name: "Vanguard FTSE Emerging Markets ETF",         kind: "international" },
  IEMG: { name: "iShares Core MSCI Emerging Markets ETF",     kind: "international" },
  BND:  { name: "Vanguard Total Bond Market ETF",             kind: "bond" },
  AGG:  { name: "iShares Core U.S. Aggregate Bond ETF",       kind: "bond" },
  BNDX: { name: "Vanguard Total International Bond ETF",       kind: "bond" },
  GLD:  { name: "SPDR Gold Shares",                           kind: "commodity" },
};
const NOT_ANALYZED_REASON = {
  international: "An international fund — our screens cover US-listed companies, so we don't look inside this one yet.",
  bond: "A bond fund — our screens flag companies by their line of business, which doesn't apply to bond holdings.",
  commodity: "A commodity fund — it holds an asset (not companies), so there's nothing to screen.",
};

/** A widely-held fund we recognize but don't analyze, or null. */
export function unanalyzedFund(t) {
  const f = NOT_ANALYZED[String(t || "").toUpperCase()];
  return f ? { name: f.name, reason: NOT_ANALYZED_REASON[f.kind] } : null;
}

/** [ticker, name] for every fund we recognize — for search autocomplete. */
export const fundNames = () => [
  ...Object.entries(FUNDS).map(([s, f]) => [s, f.name]),
  ...Object.entries(NOT_ANALYZED).map(([s, f]) => [s, f.name]),
];
