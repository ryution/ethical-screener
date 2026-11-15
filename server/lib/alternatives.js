// Ranked fund lists for the Alternatives dialog: the funds in one group, ordered by how
// much of what the reader picked they hold. Built from the same per-fund numbers as the
// comparison (src/compare.js), in the same order, so a list and a head-to-head agree.

import { FUNDS, FUND_GROUPS } from "./funds.js";
import { lookupSymbol } from "./analyzer.js";
import { fundColumn, rankOrder } from "../../src/compare.js";

// Holdings data only changes when the server restarts, so a fund's lookup can be reused.
const cache = new Map();
const look = (t) => { if (!cache.has(t)) cache.set(t, lookupSymbol(t)); return cache.get(t); };

/**
 * @param keys    the screen keys the reader has turned on
 * @param group   a FUND_GROUPS key; defaults to the group of `symbol`, then "broad"
 * @param symbol  the fund on the page, if any, so its row can be marked
 *
 * Returns { groups, group, selectedCount, rows }. Funds that track the same index hold the
 * same companies, so they share one row (VOO, SPY, IVV, ...).
 */
export function alternatives({ keys = [], group = null, symbol = "" } = {}) {
  const sym = String(symbol || "").toUpperCase();
  const g = FUND_GROUPS.find((x) => x.key === group) || FUND_GROUPS.find((x) => x.key === FUNDS[sym]?.group) || FUND_GROUPS[0];
  const sel = new Set(keys);
  const out = { groups: FUND_GROUPS.map(({ key, label }) => ({ key, label })), group: g.key, selectedCount: sel.size, rows: [] };
  if (!sel.size) return out;

  // The flagged companies in the fund on the page. A row that still holds all of them
  // isn't a way to avoid them, whatever its share says, so each row reports the overlap.
  const names = (col) => new Set(col.contains.map((c) => c.name));
  const curCol = FUNDS[sym] ? fundColumn(look(sym), sel) : null;
  const cur = curCol?.rankable ? names(curCol) : null;

  const byBasis = new Map();
  for (const t of g.tickers) {
    const f = FUNDS[t];
    if (!f) continue;
    if (!byBasis.has(f.basisKey)) byBasis.set(f.basisKey, []);
    byBasis.get(f.basisKey).push(t);
  }
  for (const tickers of byBasis.values()) {
    const lead = tickers.includes(sym) ? sym : tickers[0];
    const col = fundColumn(look(lead), sel);
    // A fund without a total can't be put in order without guessing one.
    if (!col.rankable) continue;
    out.rows.push({
      symbols: [lead, ...tickers.filter((t) => t !== lead)],
      name: col.name, basis: col.basis,
      flagged: col.flagged, totalCompanies: col.totalCompanies || col.grade.totalHoldings,
      flaggedPer100: Number((col.grade.share + col.grade.businessShare).toFixed(1)),
      conduct: col.grade.conduct, conductPer100: col.grade.share,
      asOf: col.asOf, current: tickers.includes(sym),
      // How many of the page fund's flagged companies this fund also holds.
      overlap: cur && !tickers.includes(sym) ? { of: cur.size, held: [...names(col)].filter((n) => cur.has(n)).length, symbol: sym } : null,
      grade: { share: col.grade.share, businessShare: col.grade.businessShare },
    });
  }
  out.rows.sort(rankOrder);
  return out;
}
