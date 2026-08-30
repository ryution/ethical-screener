// Search autocomplete — match a typed query against ticker symbols and company names, so
// a visitor can type "Apple" or "Vanguard" instead of knowing the exact symbol. Sources:
// our fund catalogue (ETFs/mutual funds) + the EDGAR universe of ~9,900 US filers
// (generated/tickers.json). Suggesting a name we don't flag is fine — an honest "no flags"
// result is still useful.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fundNames } from "./funds.js";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "tickers.json");
let _rows = [];
try { if (existsSync(FILE)) _rows = JSON.parse(readFileSync(FILE, "utf8")).tickers || []; } catch { /* no index */ }
const _funds = fundNames();

/** Ranked suggestions for a query. Exact ticker → ticker prefix → name match; funds first. */
export function suggest(q, limit = 8) {
  const s = String(q || "").trim().toUpperCase();
  if (!s) return [];
  const hits = [];
  const scan = (pairs, kind, base) => {
    for (const [t, n] of pairs) {
      const name = String(n || ""); const N = name.toUpperCase();
      if (t === s) hits.push({ t, n: name, kind, rank: base });
      else if (t.startsWith(s)) hits.push({ t, n: name, kind, rank: base + 1 });
      else if (N.startsWith(s)) hits.push({ t, n: name, kind, rank: base + 2 });
      // A WORD in the name starts with the query — not just any substring position.
      // Plain .includes() here matched "tes" inside "STATES" or "ASSOCIATES", burying
      // the one relevant hit (Tesla) under four unrelated companies.
      else if (N.split(/[^A-Z0-9]+/).some((w) => w.startsWith(s))) hits.push({ t, n: name, kind, rank: base + 3 });
    }
  };
  scan(_funds, "fund", 0);   // small, high-signal — surface ETFs first
  scan(_rows, "stock", 1);
  hits.sort((a, b) => a.rank - b.rank || a.t.length - b.t.length || a.t.localeCompare(b.t));
  const seen = new Set(), out = [];
  for (const h of hits) {
    if (seen.has(h.t)) continue;
    seen.add(h.t);
    out.push({ symbol: h.t, name: h.n, kind: h.kind });
    if (out.length >= limit) break;
  }
  return out;
}
