// Check an uploaded portfolio against the reader's categories.
//
// Each holding is looked up the same way the search box does it (lookupSymbol), then cut
// down to the categories picked. A stock reports its flags. A fund reports how many of its
// companies are flagged and, when we have weights, what share of the fund they are, so the
// page can say roughly how many of the reader's dollars sit in those companies. Nothing here
// is stored.

import { lookupSymbol } from "./analyzer.js";

const MAX = 500;

export function checkPortfolio(positions = [], keys = []) {
  const sel = new Set(keys);
  const rows = positions.slice(0, MAX).map((p) => {
    const base = { symbol: p.symbol, quantity: p.quantity ?? null, valueCents: p.valueCents ?? null };
    const r = lookupSymbol(p.symbol);
    if (!r || (r.type === "none" && !r.known)) return { ...base, kind: "unknown" };
    if (r.type === "fund" && r.analyzable === false) return { ...base, kind: "not_analyzed", name: r.name || null, reason: r.notAnalyzedReason };
    if (r.type === "fund") {
      // One entry per company (GOOGL and GOOG are one), with its weights added up.
      const byName = new Map();
      for (const c of r.contains || []) {
        const flags = c.flags.filter((f) => sel.has(f.key));
        if (!flags.length) continue;
        const prev = byName.get(c.name);
        if (!prev) { byName.set(c.name, { ticker: c.ticker, name: c.name, weight: c.weight ?? null, labels: [...new Set(flags.map((f) => f.label))] }); continue; }
        if (c.weight != null) prev.weight = (prev.weight ?? 0) + c.weight;
        for (const f of flags) if (!prev.labels.includes(f.label)) prev.labels.push(f.label);
      }
      const flagged = [...byName.values()];
      const weighted = flagged.length > 0 && flagged.every((c) => c.weight != null);
      const flaggedWeight = weighted ? Number(flagged.reduce((n, c) => n + c.weight, 0).toFixed(3)) : (flagged.length ? null : 0);
      flagged.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.name.localeCompare(b.name));
      return {
        ...base, kind: "fund", name: r.name, basis: r.basis, asOf: r.asOf || null,
        total: r.totalCompanies || r.totalHoldings || null,
        flaggedCount: flagged.length, flaggedWeight,
        // About how many of the reader's dollars are in the flagged companies.
        exposureCents: base.valueCents != null && flaggedWeight != null ? Math.round(base.valueCents * flaggedWeight / 100) : null,
        flagged: flagged.slice(0, 12).map((c) => ({ ...c, weight: c.weight != null ? Number(c.weight.toFixed(3)) : null })),
      };
    }
    const flags = (r.flags || []).filter((f) => sel.has(f.key)).map((f) => ({ key: f.key, label: f.label }));
    return { ...base, kind: "stock", name: r.name || null, flags };
  });

  const sum = (xs) => xs.reduce((n, x) => n + (x ?? 0), 0);
  const valued = rows.filter((r) => r.valueCents != null);
  const direct = rows.filter((r) => r.kind === "stock" && r.flags.length);
  return {
    rows,
    truncated: positions.length > MAX,
    summary: {
      holdings: rows.length,
      totalCents: valued.length ? sum(valued.map((r) => r.valueCents)) : null,
      directFlagged: direct.length,
      directCents: sum(direct.map((r) => r.valueCents)),
      fundsWithFlags: rows.filter((r) => r.kind === "fund" && r.flaggedCount).length,
      fundExposureCents: sum(rows.filter((r) => r.kind === "fund").map((r) => r.exposureCents)),
      notAnalyzed: rows.filter((r) => r.kind === "not_analyzed").length,
      unknown: rows.filter((r) => r.kind === "unknown").length,
    },
  };
}
