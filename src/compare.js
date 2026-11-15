// Two funds, side by side, against the categories the reader turned on.
//
// People don't hold a fund in the abstract; they hold VOO *instead of* QQQ, and the
// question they actually ask is "which of these two is carrying the thing I said I
// didn't want?". A single fund page can't answer that: it has no second column.
//
// What this file refuses to do is as important as what it does:
//
//   · It does not score "ethicality" on one axis. There is no number here that says one
//     fund is a better human being than the other. The comparison is made of counts the
//     reader can verify against the lists we already show them.
//   · It does not average the two grades into a difference. The fund ladder (fundGrade.js)
//     counts the share of holdings graded on something the company DID; a comparison of
//     two such shares is still that same countable fact, and it travels with both raw
//     numerators and both denominators so the reader can redo the division.
//   · It does not rank funds that track different indexes without saying so. The S&P 500
//     and the Nasdaq-100 hold different industries; QQQ looks lighter than VOO partly
//     because it owns almost no oil companies, which is a fact about the index, not a
//     fact about anyone's conscience. That caveat is attached to the verdict itself, not
//     buried in a footnote, because the verdict is wrong without it.
//   · It never ranks a fund we can't see inside. A fund with no published holdings is
//     "not compared", never the winner by default, the same line the rest of the site
//     draws between "no flags" and "not analyzed".
//
// The reader's selected categories ARE their values. Everything below is computed against
// that selection and changes the moment it does, which is why this is a pure function of
// (lookup results, selected keys) and holds no state of its own.

import { displayName } from "./format.js";
import { fundGradeFor } from "./fundGrade.js";

const keySet = (selected) => (selected instanceof Set ? selected : new Set(selected || []));

// Dual share classes (GOOGL/GOOG) arrive as two rows with one company's name. Counting
// Alphabet twice would overstate every number on this page, so merge on display name and
// keep the union of flags, the same rule the single-fund view uses.
function dedupeByName(contains) {
  const m = new Map();
  for (const c of contains) {
    const key = displayName(c.name) || c.ticker;
    const prev = m.get(key);
    if (!prev) { m.set(key, { ...c, flags: [...(c.flags || [])] }); continue; }
    for (const f of c.flags || []) if (!prev.flags.some((p) => p.key === f.key)) prev.flags.push(f);
  }
  return [...m.values()];
}

/**
 * One column of the comparison: a lookup result reduced to what can be set beside another.
 *
 * Two different questions, kept apart on purpose:
 *
 *   `analyzed`: can we see inside this fund at all? False for a stock, a symbol we don't
 *                 know, and a fund we deliberately don't analyze. When it is false the
 *                 column shows `reason` and nothing else; it is never a zero.
 *   `rankable`: do we also know how many holdings the fund has in total? Without that
 *                 denominator there is no share to compare, and ranking on the flagged
 *                 count alone would hand the win to whichever fund is smaller, which is
 *                 arithmetic rather than ethics. QQQ is the live example: we know four of
 *                 its names are flagged, we do not have a published list to divide by.
 *
 * An analyzed-but-unrankable fund still earns its column. The categories and companies it
 * carries are facts we have. It just cannot win or lose a ranking.
 */
export function fundColumn(result, selected) {
  const sel = keySet(selected);
  const base = {
    symbol: String(result?.symbol || "").toUpperCase(),
    name: result?.name || null,
    basis: result?.basis || null,
    analyzed: false,
    rankable: false,
    reason: null,
    grade: null,
    contains: [],
    flagged: 0,
    totalCompanies: result?.totalCompanies ?? null,
    totalHoldings: result?.totalHoldings ?? null,
    asOf: result?.asOf || null,
    holdingsSource: result?.holdingsSource || null,
  };
  if (!result) return { ...base, reason: "We couldn't look that symbol up." };
  if (result.type === "stock") return { ...base, reason: "That's a company, not a fund." };
  if (result.type !== "fund") return { ...base, reason: "We don't have holdings data for that fund." };
  if (result.analyzable === false) return { ...base, reason: result.notAnalyzedReason || "We don't analyze this fund." };

  const contains = dedupeByName(
    (result.contains || [])
      .map((c) => ({ ...c, flags: (c.flags || []).filter((f) => sel.has(f.key)) }))
      .filter((c) => c.flags.length),
  );
  const grade = fundGradeFor(contains, result.totalHoldings ?? null, sel.size, result.marketConductShare ?? null);
  const col = { ...base, analyzed: true, contains, flagged: contains.length, grade };

  if (!sel.size) return { ...col, reason: "No categories selected." };
  if (!result.totalHoldings) {
    return { ...col, reason: `We don't know how many companies ${col.symbol} holds in total, so we can't rank it.` };
  }
  return { ...col, rankable: true };
}

// One row per category that shows up in any compared fund, with a count per fund.
// A category present in one fund and absent from the other is the single most useful
// line on the page, so it is marked rather than left for the reader to spot.
function categoryRows(columns) {
  const rows = new Map();
  for (const col of columns) {
    for (const c of col.contains) {
      for (const key of new Set(c.flags.map((f) => f.key))) {
        const label = c.flags.find((f) => f.key === key)?.label || key;
        if (!rows.has(key)) rows.set(key, { key, label, counts: {} });
        const row = rows.get(key);
        row.counts[col.symbol] = (row.counts[col.symbol] || 0) + 1;
      }
    }
  }
  for (const row of rows.values()) {
    for (const col of columns) row.counts[col.symbol] ??= 0;
    const present = columns.filter((col) => row.counts[col.symbol] > 0);
    row.only = columns.length > 1 && present.length === 1 ? present[0].symbol : null;
    row.total = columns.reduce((s, col) => s + row.counts[col.symbol], 0);
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label));
}

// Which companies both funds carry, and which belong to exactly one of them.
// `only[SYM]` is strict: a company no other compared fund holds. With two funds that is
// simply "in this one and not the other"; with three or more, a name held by two of the
// three is in neither bucket, because calling it "only VOO's" would be false.
function companySplit(columns) {
  const byFund = new Map();
  const seenIn = new Map();
  for (const col of columns) {
    const names = new Map();
    for (const c of col.contains) {
      const name = displayName(c.name) || c.ticker;
      names.set(name, { name, ticker: c.ticker, labels: [...new Set(c.flags.map((f) => f.label))].sort() });
    }
    byFund.set(col.symbol, names);
    for (const n of names.keys()) seenIn.set(n, (seenIn.get(n) || 0) + 1);
  }
  const shared = [];
  const only = Object.fromEntries(columns.map((col) => [col.symbol, []]));
  for (const [name, count] of seenIn) {
    const entry = columns.map((col) => byFund.get(col.symbol).get(name)).find(Boolean);
    if (columns.length > 1 && count === columns.length) { shared.push(entry); continue; }
    if (count === 1) {
      const owner = columns.find((col) => byFund.get(col.symbol).has(name));
      if (owner) only[owner.symbol].push(byFund.get(owner.symbol).get(name));
    }
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  shared.sort(byName);
  for (const k of Object.keys(only)) only[k].sort(byName);
  return { shared, only };
}

// The verdict: one headline and the numbers behind it. `winner` is the fund with the
// smaller share of holdings graded on a government finding or a self-reported violation,
// which is something a reader can count for themselves.
function verdictFor(analyzed, rankable, all, sel) {
  const excluded = all.filter((f) => !f.analyzed).map((f) => ({ symbol: f.symbol, reason: f.reason }));
  const unranked = analyzed.filter((f) => !f.rankable).map((f) => ({ symbol: f.symbol, reason: f.reason }));
  const base = { kind: "none", headline: "", detail: "", winner: null, excluded, unranked, caveats: [] };
  const cats = `${sel.size} ${sel.size === 1 ? "category" : "categories"}`;

  if (!sel.size) {
    return { ...base, headline: "No categories selected.",
      detail: "Turn on at least one category above to compare these funds." };
  }
  if (analyzed.length < 2) {
    return { ...base,
      headline: analyzed.length === 1 ? `Only ${analyzed[0].symbol} can be compared.` : "There's nothing to compare.",
      detail: excluded.length
        ? "We can't see inside the other fund, so it isn't included."
        : "Choose two funds we have holdings data for." };
  }

  const caveats = [];
  const bases = [...new Set(analyzed.map((f) => f.basis).filter(Boolean))];
  const sameIndex = bases.length === 1;
  if (!sameIndex) {
    caveats.push(`These funds track different indexes (${bases.join(" and ")}), so they hold different industries, and some of the difference comes from that. For example, a tech index holds few oil companies.`);
  }
  for (const e of excluded) caveats.push(`${e.symbol} isn't included: ${e.reason}`);
  // SPDR files are daily, SEC filings are quarterly, so two funds can be months apart.
  const dates = analyzed.filter((f) => f.asOf);
  if (new Set(dates.map((f) => f.asOf)).size > 1) {
    caveats.push(`These holdings are from different dates (${dates.map((f) => `${f.symbol} on ${f.asOf}`).join(", ")}). A fund can change what it holds in between.`);
  }
  caveats.push("Fewer flagged companies doesn't mean a fund is clean. It only means fewer of its companies are on the lists you turned on. Companies we have no data on aren't counted.");
  caveats.push("This only compares holdings. It doesn't cover fees, returns, or whether either fund is right for you.");

  const names = analyzed.map((f) => new Set(f.contains.map((c) => displayName(c.name) || c.ticker)));
  const identical = sameIndex && names.every((s2) => s2.size === names[0].size && [...s2].every((n) => names[0].has(n)));
  if (identical) {
    return { ...base, kind: "same", caveats,
      headline: `${analyzed.map((f) => f.symbol).join(" and ")} hold the same flagged companies.`,
      detail: `Both track ${bases[0]}. On your ${cats} they hold the same ${analyzed[0].flagged} flagged ${analyzed[0].flagged === 1 ? "company" : "companies"}, so there's no difference between them here. Choose based on fees.` };
  }

  // Everything below divides by a fund's total holdings. A fund without a published total
  // can still be listed, but ranking it would mean guessing that number.
  if (rankable.length < 2) {
    const who = unranked.map((u) => u.symbol).join(" and ");
    return { ...base, kind: "listed", caveats,
      headline: "We can't rank these two.",
      detail: `We don't know how many companies ${who} holds in total, so we can't work out what share of it is flagged. The flagged companies in each fund are listed below.` };
  }

  // First rank on the share of holdings graded on a government finding or a self-reported
  // violation, the same number the fund grade uses.
  const byConduct = [...rankable].sort((a, b) => a.grade.share - b.grade.share);
  const conductLine = (f) => `${f.symbol}: ${f.grade.conduct} of ${f.grade.totalHoldings} holdings have a government finding or self-reported violation (${f.grade.share} per 100), and ${f.flagged} are flagged in total`;
  if (byConduct[0].grade.share !== byConduct[1].grade.share) {
    const [best] = byConduct;
    return {
      ...base, kind: "ranked", winner: best.symbol, caveats,
      headline: `${best.symbol} is the better match for your ${cats}.`,
      detail: `${byConduct.map(conductLine).join(". ")}.`,
    };
  }

  // If that share is equal (usually zero each way on a halal or Catholic set, whose
  // categories are about products rather than legal cases), compare the share of flagged
  // companies instead, and say so. Ranking two zeroes would be meaningless.
  const byBusiness = [...rankable].sort((a, b) => a.grade.businessShare - b.grade.businessShare);
  const [lighter, heavier] = byBusiness;
  const businessLine = (f) => `${f.symbol}: ${f.flagged} of ${f.totalCompanies || f.grade.totalHoldings} (${f.grade.businessShare} per 100)`;
  const switched = byConduct[0].grade.share === 0
    ? "Neither fund holds a company with a government finding or self-reported violation in these categories, so we compared the share of flagged companies instead."
    : `Both funds have the same share of companies with a government finding or self-reported violation (${byConduct[0].grade.share} per 100), so we compared the share of flagged companies instead.`;
  // Under 1 in 100 is too small to count as a difference.
  const gap = Number((heavier.grade.businessShare - lighter.grade.businessShare).toFixed(2));
  if (gap < 1) {
    return { ...base, kind: "tie", caveats,
      headline: `No clear difference on your ${cats}.`,
      detail: `${switched} ${byBusiness.map(businessLine).join(". ")}. The gap is under 1 in 100 holdings, too small to count as a difference.` };
  }
  return {
    ...base, kind: "ranked", winner: lighter.symbol, caveats,
    headline: `${lighter.symbol} is the better match for your ${cats}.`,
    detail: `${switched} ${byBusiness.map(businessLine).join(". ")}. ${lighter.symbol} has ${gap} fewer flagged companies per 100 holdings.`,
  };
}

/**
 * Compare lookup results for two or more funds against the reader's selected categories.
 *
 * @param results  /api/lookup results, in the order the reader asked for them
 * @param selected the screen keys they have turned on (Set or array)
 *
 * Returns { funds, analyzed, rankable, categories, companies, verdict, selectedCount }.
 */
export function compareFunds(results = [], selected = []) {
  const sel = keySet(selected);
  const funds = results.map((r) => fundColumn(r, sel));
  // The table and the lists are built from every fund we can see inside, including the
  // ones we can't rank: their holdings are known even where their totals aren't.
  const analyzed = funds.filter((f) => f.analyzed);
  const rankable = analyzed.filter((f) => f.rankable);
  return {
    funds,
    analyzed: analyzed.map((f) => f.symbol),
    rankable: rankable.map((f) => f.symbol),
    categories: categoryRows(analyzed),
    companies: companySplit(analyzed),
    verdict: verdictFor(analyzed, rankable, funds, sel),
    selectedCount: sel.size,
  };
}
