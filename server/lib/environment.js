// Environmental compliance from EPA's ECHO (built by scripts/fetch-epa-echo.mjs).
//
// Third conduct measure, and the third to key on a regulator's own severity word rather
// than ours. EPA designates a facility in "Significant Non-Compliance" against published
// criteria, and flags Clean Air Act "High Priority Violators" separately. We count how
// many of a company's facilities carry those designations and compare that share with the
// share across every facility in the same industry — the same endpoint, the same measure,
// so the comparison means something.
//
// Rate, not count, for the third time. Walmart operates roughly four thousand regulated
// facilities and Costco under a thousand; whoever has more buildings will always have more
// violations, and ranking on that ranks store estates.
//
// Two gates, both learned the hard way on this dataset. ECHO's name search is fuzzy enough
// to return K2 Sports for a query about UPS, so the importer keeps only facilities whose
// names anchor to something the company filed, and `attributionRate` records how much it
// threw away. And a company we matched a handful of facilities for tells us nothing about
// its estate — Walmart matched 3 of 4,902 before facility aliases existed, which would
// have read as a spotless environmental record.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "epa-environment.json");

let _data = { lastUpdated: null, source: null, companies: {}, benchmarks: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no EPA data yet — every other layer still works */ }

export function environmentMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, count: Object.keys(_data.companies || {}).length };
}
export const environmentTickers = () => Object.keys(_data.companies || {});

// A company whose matched estate is mostly facilities we could not verify is a company we
// cannot describe. Below this the numbers belong to a crowd.
const MIN_ATTRIBUTION = 0.80;
// Significant non-compliance runs well under 1% of facilities, so a small estate produces
// a share that swings wildly on one designation.
const MIN_FACILITIES = 100;
const ABOVE = 1.15;

// A ratio alone is not enough, because significant non-compliance is rare and the counts
// are tiny. Walmart shows 5 significant violators against 4,646 facilities — 1.35x its
// industry — but its industry rate predicts 3.7, and 5 against an expected 3.7 is noise.
// Costco shows 6 against an expected 0.8, which is not. Violator counts are roughly
// Poisson, so we require the observed count to clear its expectation by two standard
// deviations before any of it becomes a letter.
const significantlyAbove = (observed, expected) =>
  expected >= 0 && observed >= expected + 2 * Math.sqrt(Math.max(expected, 1));

/** The raw environmental picture for a ticker, with its benchmark attached. */
export function environmentProfile(ticker) {
  const c = _data.companies?.[String(ticker || "").toUpperCase()];
  if (!c) return null;
  const bench = c.naics ? _data.benchmarks?.[c.naics] : null;
  // The importer records what it kept and what ECHO returned; the ratio is the share of
  // the match we could actually stand behind.
  const attributionRate = c.returnedByEcho ? Number((c.facilities / c.returnedByEcho).toFixed(3)) : null;
  const share = c.facilities ? c.significantViolations / c.facilities : null;
  const benchShare = bench?.facilities ? bench.significantViolations / bench.facilities : null;
  const benchHpvShare = bench?.facilities ? bench.highPriorityViolators / bench.facilities : null;
  return {
    ...c,
    attributionRate,
    share: share == null ? null : Number(share.toFixed(5)),
    benchmarkShare: benchShare == null ? null : Number(benchShare.toFixed(5)),
    benchmarkHpvShare: benchHpvShare == null ? null : Number(benchHpvShare.toFixed(5)),
    vsIndustry: (benchShare && share != null && benchShare > 0) ? Number((share / benchShare).toFixed(2)) : null,
    ratable: (attributionRate ?? 0) >= MIN_ATTRIBUTION && (c.facilities ?? 0) >= MIN_FACILITIES,
  };
}

/**
 * Where a company's environmental record sits on the conduct ladder.
 *
 * Rungs: F for a Clean Air Act High Priority Violator, D for significant non-compliance
 * well above its industry, C for modestly above. Null where there is nothing adverse,
 * nothing matched, or nothing we can attribute tightly enough to say out loud.
 */
export function assessEnvironment(ticker) {
  const p = environmentProfile(ticker);
  if (!p) return { rung: null, headline: null, detail: null, profile: null };

  if (!p.ratable) {
    const loose = (p.attributionRate ?? 0) < MIN_ATTRIBUTION;
    return {
      rung: null,
      headline: loose ? "Facilities on file, attribution too loose to rate" : "Too few facilities matched to rate",
      detail: loose
        ? `EPA's facility search returned ${p.returnedByEcho?.toLocaleString?.() ?? "many"} sites for this company and only ${Math.round(100 * (p.attributionRate ?? 0))}% of them are clearly its own, so any rate would describe a crowd.`
        : `We matched ${(p.facilities ?? 0).toLocaleString()} regulated facilities, too small a base for a share anyone should rely on.`,
      profile: p,
    };
  }

  // High Priority Violator is EPA's most serious Clean Air Act designation, but one
  // flagged site out of a thousand is not a company-wide fact — Costco has exactly one,
  // and a rate built on a single event carries 100% error. It takes a handful, clearly
  // above what the industry's own rate predicts, before it becomes the worst letter here.
  const hpvExpected = p.benchmarkHpvShare != null ? p.facilities * p.benchmarkHpvShare : null;
  if (p.highPriorityViolators >= 3 && hpvExpected != null && significantlyAbove(p.highPriorityViolators, hpvExpected)) {
    return {
      rung: "F",
      headline: `Clean Air Act high priority violators`,
      detail: `${p.highPriorityViolators} of its ${p.facilities.toLocaleString()} regulated facilities carry EPA's High Priority Violator flag — its most serious Clean Air Act designation — where its industry's rate predicts about ${hpvExpected.toFixed(1)}.`,
      profile: p,
    };
  }

  if (p.vsIndustry == null) {
    return {
      rung: null,
      headline: "No usable industry benchmark",
      detail: `${p.significantViolations} of ${p.facilities.toLocaleString()} facilities are in significant non-compliance. Its industry sample records no significant violators at all, so there is no rate to divide by and nothing honest to say about whether that is unusual.`,
      profile: p,
    };
  }

  const expected = p.facilities * p.benchmarkShare;
  if (p.vsIndustry < ABOVE || !significantlyAbove(p.significantViolations, expected)) {
    return {
      rung: null,
      headline: "No adverse measure on file",
      detail: `${p.significantViolations} of its ${p.facilities.toLocaleString()} regulated facilities are in significant non-compliance, where its industry's rate predicts about ${expected.toFixed(1)} — ${(100 * p.share).toFixed(2)}% against ${(100 * p.benchmarkShare).toFixed(2)}%. Compliance status reflects what regulators have found, so this is the absence of an adverse measure rather than a clean record.`,
      profile: p,
    };
  }

  const pattern = p.vsIndustry >= 2;
  return {
    rung: pattern ? "D" : "C",
    headline: `Significant environmental non-compliance above its industry`,
    detail: `${p.significantViolations} of its ${p.facilities.toLocaleString()} regulated facilities are in significant non-compliance — ${(100 * p.share).toFixed(2)}% against ${(100 * p.benchmarkShare).toFixed(2)}% across its industry (${p.vsIndustry}×), where that industry rate predicts about ${expected.toFixed(1)}. Significant non-compliance is EPA's designation, against its published criteria; the industry figure is drawn from up to 5,000 facilities ECHO returns for that industry code, not every one of them.`,
    profile: p,
  };
}
