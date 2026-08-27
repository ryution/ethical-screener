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

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "fund-holdings.json");

let _data = { lastUpdated: null, source: null, baskets: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no live holdings yet — funds.js falls back to its curated baskets */ }

/** Live screened constituents for a basis key (e.g. "sp500"), or null if we don't have them. */
export function basketFor(basisKey) {
  const b = _data.baskets?.[basisKey];
  return Array.isArray(b) && b.length ? b : null;
}

/** Freshness metadata for the UI ("holdings as of …"), per basis. */
export function holdingsMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, sources: _data.sources || {} };
}
