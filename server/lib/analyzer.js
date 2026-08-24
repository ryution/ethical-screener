// The analyzer — match a user's holdings against the ethical screens they turned on.
//
// Two kinds of match:
//   • a STOCK you hold directly is flagged if it's on a screen you enabled;
//   • a FUND you hold is looked into (for the funds we know — see funds.js) and we
//     surface the flagged companies inside it.
//
// Pure function of (positions, activeScreenKeys). No network, no state.

import { flagsFor, companyName, SCREEN_KEYS, SCREEN_TICKERS } from "./screens.js";
import { knownFund, unanalyzedFund } from "./funds.js";
import { enrichedFlagsFor, enrichedName, enrichedTickers, dataMeta } from "./enriched.js";
import { filingFlagsFor, filingName, filingTickers, filingMeta } from "./filings.js";

export { dataMeta };

/**
 * True coverage across ALL three layers, for the public "N companies" stat.
 * Counts the DISTINCT companies we flag (curated ∪ EDGAR-SIC ∪ filing-cited),
 * normalizing class-share punctuation so BRK.B and BRK-B aren't double-counted,
 * and reports the freshest of the underlying datasets. Understating this (as the
 * enriched-only count did) reads as thinner coverage than we actually have.
 */
export function coverageMeta() {
  const norm = (t) => String(t).toUpperCase().replace(/[.-]/g, "");
  const set = new Set();
  for (const t of SCREEN_TICKERS) set.add(norm(t));
  for (const t of enrichedTickers()) set.add(norm(t));
  for (const t of filingTickers()) set.add(norm(t));
  const dates = [dataMeta().lastUpdated, filingMeta().lastUpdated].filter(Boolean);
  const lastUpdated = dates.sort().at(-1) || null;
  return { count: set.size, lastUpdated };
}

// Flags for a ticker across all THREE layers, deduped by screen key so a company on more
// than one isn't flagged twice for the same screen. Precedence is by richness of the
// reason: filing-cited (a summary + verbatim 10-K quote + source) wins, then curated
// (precise hand-written reason), then EDGAR industry-classification (breadth).
function allFlagsFor(ticker, activeKeys) {
  const out = [];
  const seen = new Set();
  for (const f of filingFlagsFor(ticker, activeKeys)) { if (!seen.has(f.key)) { seen.add(f.key); out.push(f); } }
  for (const f of flagsFor(ticker, activeKeys)) { if (!seen.has(f.key)) { seen.add(f.key); out.push(f); } }
  for (const f of enrichedFlagsFor(ticker, activeKeys)) { if (!seen.has(f.key)) { seen.add(f.key); out.push(f); } }
  return out;
}
const nameFor = (ticker, fallback) =>
  (companyName(ticker) !== ticker ? companyName(ticker) : (filingName(ticker) || enrichedName(ticker) || fallback || ticker));

/**
 * Analyze a single ticker against ALL screens — for the public, no-login hero widget.
 * A visitor hasn't chosen screens, so we surface everything we'd flag.
 * Returns { type: "fund" | "stock" | "none", ... }.
 */
export function lookupSymbol(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return null;
  const fund = knownFund(sym);
  if (fund) {
    const contains = [];
    for (const t of fund.holds) {
      const fl = allFlagsFor(t, SCREEN_KEYS);
      if (fl.length) contains.push({ ticker: t, name: nameFor(t), flags: fl });
    }
    return { symbol: sym, type: "fund", name: fund.name, basis: fund.basis, contains };
  }
  const na = unanalyzedFund(sym);
  if (na) return { symbol: sym, type: "fund", name: na.name, analyzable: false, notAnalyzedReason: na.reason, contains: [] };
  const flags = allFlagsFor(sym, SCREEN_KEYS);
  if (flags.length) return { symbol: sym, type: "stock", name: nameFor(sym), flags };
  return { symbol: sym, type: "none" };
}

const distinctLabels = (contains) => {
  const seen = new Map();
  for (const c of contains) for (const f of c.flags) if (!seen.has(f.key)) seen.set(f.key, { key: f.key, label: f.label });
  return [...seen.values()];
};

export function analyze(positions, activeKeys) {
  const holdings = positions.map((p) => {
    // Direct stock holding.
    if (p.kind === "stock") {
      const flags = allFlagsFor(p.symbol, activeKeys);
      return { ...p, type: "stock", flags, analyzable: true, conflicted: flags.length > 0 };
    }
    // Fund: look inside if we know its constituents, otherwise leave it opaque.
    if (p.kind === "etf" || p.kind === "mutualfund") {
      const fund = knownFund(p.symbol);
      if (fund) {
        const contains = [];
        for (const t of fund.holds) {
          const fl = allFlagsFor(t, activeKeys);
          if (fl.length) contains.push({ ticker: t, name: nameFor(t), flags: fl });
        }
        return { ...p, type: "fund", fundBasis: fund.basis, contains,
          flags: distinctLabels(contains), analyzable: true, lookThrough: true, conflicted: contains.length > 0 };
      }
      const na = unanalyzedFund(p.symbol);
      return { ...p, type: "fund", analyzable: false, contains: [], flags: [], conflicted: false,
        notAnalyzedReason: na?.reason || null };
    }
    // Crypto, options, cash, anything else — not screened.
    return { ...p, type: p.kind, analyzable: false, flags: [], conflicted: false };
  });

  const stocks = holdings.filter((h) => h.type === "stock");
  const funds = holdings.filter((h) => h.type === "fund");
  const conflictedStocks = stocks.filter((h) => h.conflicted);
  const conflictedFunds = funds.filter((h) => h.conflicted);

  const totalValueCents = holdings.reduce((s, h) => s + h.valueCents, 0);
  // Dollar attribution is only honest for direct stocks — we don't have per-name
  // weights inside a fund, so we count fund conflicts by company, not by dollar.
  const directConflictValueCents = conflictedStocks.reduce((s, h) => s + h.valueCents, 0);

  // Per-flag rollup: dollars from direct stocks, plus a count of fund-held companies.
  const byFlag = {};
  const bump = (key, label) => (byFlag[key] ??= { key, label, valueCents: 0, directHoldings: 0, fundCompanies: 0 });
  for (const h of conflictedStocks) for (const f of h.flags) { const b = bump(f.key, f.label); b.valueCents += h.valueCents; b.directHoldings += 1; }
  for (const h of conflictedFunds) for (const c of h.contains) for (const f of c.flags) { const b = bump(f.key, f.label); b.fundCompanies += 1; }

  const analyzedFunds = funds.filter((h) => h.lookThrough).length;
  const opaqueFunds = funds.filter((h) => !h.analyzable).length;

  return {
    holdings,
    conflictedStocks,
    conflictedFunds,
    summary: {
      totalHoldings: holdings.length,
      analyzedStocks: stocks.length,
      analyzedFunds,        // funds we could see inside
      opaqueFunds,          // funds we couldn't (not analyzed)
      directConflictCount: conflictedStocks.length,
      fundConflictCount: conflictedFunds.length,
      totalValueCents,
      directConflictValueCents,
      directConflictPct: totalValueCents ? Math.round((directConflictValueCents / totalValueCents) * 100) : 0,
      byFlag: Object.values(byFlag).sort((a, b) => (b.valueCents - a.valueCents) || (b.fundCompanies - a.fundCompanies)),
    },
  };
}
