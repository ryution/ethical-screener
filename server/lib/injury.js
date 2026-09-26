// Workplace injury rates from OSHA's Injury Tracking Application (built by
// scripts/fetch-osha-ita.mjs), and the one conduct rung they can support on their own.
//
// This is the first CONDUCT measure on the site: every existing layer describes what a
// company sells, this describes how it operates. It is employer-filed under legal mandate,
// normalised by hours worked rather than headcount, and benchmarked against the other
// filers in the same 4-digit NAICS — so the comparison is warehouses to warehouses, and a
// company's size cannot flatter or damn it.
//
// The asymmetry in `assessInjury` is the important part. Under-reporting is documented and
// one-directional: nobody over-reports injuries, so a high rate is hard to fake and a low
// one is not. A rate at or below benchmark therefore earns "no adverse measure on file",
// never "safe" — the same line the site already draws between "no flags" and "clean".

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "osha-injury.json");

let _data = { lastUpdated: null, source: null, years: [], companies: {}, benchmarks: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no injury data yet — every other layer still works */ }

/** Freshness metadata for the UI. */
export function injuryMeta() {
  return {
    lastUpdated: _data.lastUpdated, source: _data.source,
    years: _data.years || [], count: Object.keys(_data.companies || {}).length,
  };
}

/** Every ticker with injury data — for coverage reporting. */
export const injuryTickers = () => Object.keys(_data.companies || {});

/** Raw per-year records for a ticker, oldest first. */
export function injuryYears(ticker) {
  const c = _data.companies?.[String(ticker || "").toUpperCase()];
  if (!c) return [];
  return Object.keys(c).sort().map((year) => ({ year, ...c[year] }));
}

/** The most recent year we have for a ticker. */
export function latestInjury(ticker) {
  const years = injuryYears(ticker);
  return years.length ? years[years.length - 1] : null;
}

// A rate has to clear its benchmark by a margin before it means anything. Establishment
// mix, a single bad year at one site and ordinary noise all move the ratio a few points;
// 1.15 is the point where "above average" stops being an artefact of rounding.
const ABOVE = 1.15;

/**
 * Where this company's injury record sits on the conduct ladder, on this measure alone.
 *
 * Returns { rung, headline, detail, years, latest } — `rung` is null when there is
 * nothing adverse to say, which is NOT the same as a clean workplace.
 *
 * Rungs available here: C (above benchmark once) and D (a sustained pattern). F needs a
 * regulator's own severity finding — a willful, repeat, failure-to-abate or General Duty
 * citation — which lives in OSHA's enforcement data, not this file.
 */
export function assessInjury(ticker) {
  const years = injuryYears(ticker);
  if (!years.length) return { rung: null, headline: null, detail: null, years: [], latest: null };

  const latest = years[years.length - 1];
  const rated = years.filter((y) => y.vsIndustry != null);
  const above = rated.filter((y) => y.vsIndustry >= ABOVE);

  if (!rated.length) {
    return { rung: null, headline: "Injury rate on file, no industry benchmark", detail: null, years, latest };
  }

  if (latest.vsIndustry == null || latest.vsIndustry < ABOVE) {
    return {
      rung: null,
      headline: "No adverse measure on file",
      // Said explicitly, because a number below average is the exact place a reader is
      // most likely to hear a guarantee we cannot give.
      detail: `Its reported injury rate is ${latest.vsIndustry == null ? "unbenchmarked" : `${latest.vsIndustry}× its industry's`} in ${latest.year}. Employers file these figures themselves and under-reporting is documented, so this is the absence of an adverse measure, not a safe workplace.`,
      years, latest,
    };
  }

  // A pattern needs consecutive above-benchmark years that describe the same population.
  // A year whose establishment count jumped is a different set of sites, so it cannot
  // extend a streak — the trend would be measuring our coverage, not their conduct.
  let streak = 0;
  for (let i = rated.length - 1; i >= 0; i--) {
    if (rated[i].vsIndustry < ABOVE) break;
    streak++;
    if (rated[i].coverageShift) break;
  }

  const pattern = streak >= 3;
  return {
    rung: pattern ? "D" : "C",
    headline: pattern
      ? `Injury rate above its industry ${streak} years running`
      : `Injury rate above its industry in ${latest.year}`,
    detail: `${latest.dart} days-away/restricted cases per 100 workers against an industry figure of ${latest.industryDart} (${latest.vsIndustry}×), across ${latest.sites.toLocaleString()} establishments it filed for. From its own OSHA Form 300A submissions.`,
    years, latest, streak, above: above.length,
  };
}
