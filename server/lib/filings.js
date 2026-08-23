// Filing-cited flags — the richest layer: flags found by reading companies' actual 10-K
// filings, each carrying a plain-English summary of what happened, a VERBATIM quote from
// the filing, and a link to the source. Built by the classification pipeline (see
// scripts/classify-10k.mjs and METHODOLOGY.md §2/§6), human-reviewed before shipping.
//
// This is what lets the app say WHY a company is flagged as a story with a receipt —
// "Walmart paid a $3.3B opioid-dispensing settlement," with the sentence from the 10-K —
// instead of a bare "Walmart · opioids" that would just read as a mistake.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { screenLabel } from "./screens.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "10k-flags.json");

let _data = { lastUpdated: null, source: null, companies: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no filing layer yet — the app runs on curated + SIC alone */ }

/** Filing-cited flags for a ticker, filtered to the active screens. Each carries a
 *  human summary (reason), the verbatim quote, source URL, and the filing it came from. */
export function filingFlagsFor(ticker, activeKeys) {
  const c = _data.companies[String(ticker || "").toUpperCase()];
  if (!c) return [];
  const active = new Set(activeKeys);
  return (c.flags || [])
    .filter((f) => active.has(f.key))
    .map((f) => ({ key: f.key, label: screenLabel(f.key), reason: f.summary, quote: f.quote, source: f.source, asOf: f.asOf }));
}

/** Display name for a ticker if the filing layer knows it. */
export const filingName = (t) => _data.companies[String(t || "").toUpperCase()]?.name || null;

/** Every ticker the filing layer flags for a screen — used to widen fund look-through. */
export function filingTickersForScreen(key) {
  const out = [];
  for (const [t, c] of Object.entries(_data.companies)) if ((c.flags || []).some((f) => f.key === key)) out.push(t);
  return out;
}

/** All tickers with any filing-cited flag — for the screened universe in fetch-holdings. */
export const filingTickers = () => Object.keys(_data.companies);

/** Freshness metadata for the UI. */
export function filingMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, count: Object.keys(_data.companies).length };
}
