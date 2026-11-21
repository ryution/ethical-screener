// Well-known investors who hold a stock, from their SEC 13F filings (built by
// scripts/fetch-13f.mjs). Each line carries the filing date and a link to the filing.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "notable-investors.json");
let _data = { investors: [], holdings: {} };
try { if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8")); } catch { /* none */ }

/** Investors holding a ticker, largest stake first:
 *  [{ name, person, valueUsd, shares, pctOfPortfolio, asOf, url }]. */
export function notableInvestorsFor(ticker) {
  const rows = _data.holdings?.[String(ticker || "").toUpperCase()] || [];
  return rows.map(([i, valueUsd, shares, pct]) => {
    const inv = _data.investors[i];
    return inv ? { name: inv.name, person: inv.person, valueUsd, shares, pctOfPortfolio: pct, asOf: inv.asOf, url: inv.url } : null;
  }).filter(Boolean);
}
