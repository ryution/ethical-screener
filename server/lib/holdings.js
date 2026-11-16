// Live fund holdings — the fresh, issuer-sourced half of fund look-through.
//
// funds.js maps each fund to a BASIS (the S&P 500, the total US market, …). The
// static baskets there are a conservative hand-curated fallback. This module loads
// scripts/fetch-holdings.mjs's output (server/generated/fund-holdings.json), which
// re-derives each basis's screened constituents from the issuer's daily-published
// holdings file, so a name that joins or leaves the index is reflected without a
// hand-edit.
//
// HONESTY: a basket is overlaid only when we actually fetched it. If the generated
// file is missing, stale, or lacks a basis, funds.js keeps the curated fallback — we
// never present an empty or half-built live basket as the fund's contents.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GEN = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
const FILE = join(GEN, "fund-holdings.json");
// Funds read from SEC Form N-PORT filings (scripts/fetch-nport.mjs).
const NPORT_FILE = join(GEN, "fund-holdings-nport.json");

let _data = { lastUpdated: null, source: null, baskets: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no live holdings yet — funds.js falls back to its curated baskets */ }
// A fund in the N-PORT file is added only where that fetch worked, so a failed filing
// never replaces what the SPDR file or the curated list already gives.
try {
  if (existsSync(NPORT_FILE)) {
    const n = JSON.parse(readFileSync(NPORT_FILE, "utf8"));
    _data.sources = { ...(_data.sources || {}) };
    _data.baskets = { ...(_data.baskets || {}) };
    _data.weights = { ...(_data.weights || {}) };
    _data.top = { ...(_data.top || {}) };
    for (const [k, src] of Object.entries(n.sources || {})) {
      if (src.error || !Array.isArray(n.baskets?.[k])) continue;
      _data.sources[k] = src;
      _data.baskets[k] = n.baskets[k];
      if (n.weights?.[k]) _data.weights[k] = n.weights[k];
      if (n.top?.[k]) _data.top[k] = n.top[k];
    }
  }
} catch { /* keep whatever loaded above */ }

/** Live screened constituents for a basis key (e.g. "sp500"), or null if we don't have them. */
// An empty basket counts when the download itself worked: a sector fund can hold 25
// companies and none of them be on our lists. Without that check the fund vanished from
// the catalogue and showed up as an unknown symbol.
export function basketFor(basisKey) {
  const b = _data.baskets?.[basisKey];
  if (!Array.isArray(b)) return null;
  if (b.length) return b;
  const src = _data.sources?.[basisKey];
  return src && !src.error && src.totalHoldings > 0 ? b : null;
}

/** Percent of the fund each flagged ticker is, for a basis ({ TICKER: 2.31 }), or null when
 *  the source file had no weights. Market-cap weights from the issuer file or SEC filing. */
export function weightsFor(basisKey) {
  return _data.weights?.[basisKey] || null;
}

/** The fund's largest holdings, flagged or not: [[TICKER, percent], ...], or null. */
export function topHoldingsFor(basisKey) {
  return _data.top?.[basisKey] || null;
}

/** Freshness metadata for the UI ("holdings as of …"), per basis. */
export function holdingsMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, sources: _data.sources || {} };
}
