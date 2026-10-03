// Credits: verified facts in a company's favour.
//
// Until now a company could only lose. Nothing it did could earn a mark, which made the
// site purely punitive and left the top grade meaning "we found nothing" — an absent
// result dressed as a good one. Credits are the other half: you do not earn standing by
// having nothing against you, you earn it by having something FOR you.
//
// ── The rule that keeps this from becoming greenwashing ──────────────────────
//
//   A credit can lift a company out of "no grade". It can NEVER lower an F or a D.
//
// That is deliberately structural rather than a policy anyone has to remember: credits
// are a separate list and are not an input to gradeFor() or conductGradeFor(). Nothing
// here can net against a finding. Buying renewable power does not undo an opioid
// settlement, and a system that let it would be the exact machine this product exists to
// replace — buy a cheap certification, offset a settlement.
//
// ── The evidence bar ─────────────────────────────────────────────────────────
//
// Same as a flag: named, dated, checkable, and re-derivable on a schedule. A company's
// own claim about itself is not a credit. A measurement it files under legal mandate,
// compared against a published benchmark, is.
//
// Note the asymmetry on self-reported measures. Nobody over-reports their own injuries,
// so a good-looking number is weaker evidence than a bad one — which is why beating your
// industry earns a "measured" credit and not a "verified" one. A verified credit needs a
// third party who inspected the company and put their name to it.

import { injuryYears, tooThinToRate } from "./injury.js";

export const CREDIT_SCREENS = [
  {
    key: "safer_than_industry",
    label: "Safer than its industry",
    blurb: "Workplace injury rate meaningfully below its own industry, sustained across years, from the figures it files with OSHA.",
    strength: "measured",   // self-filed against a published benchmark
  },
];

export const CREDIT_KEYS = CREDIT_SCREENS.map((s) => s.key);
export const creditLabel = (k) => CREDIT_SCREENS.find((s) => s.key === k)?.label || k;
export const creditCatalogue = CREDIT_SCREENS.map(({ key, label, blurb, strength }) => ({ key, label, blurb, strength }));

// Beating the benchmark by a hair is noise, the same way exceeding it by a hair was. A
// credit has to clear a margin in the other direction, and hold it — one good year is a
// year, not a record.
const BETTER = 0.90;
const YEARS = 3;

/**
 * Verified facts in a ticker's favour, filtered to the credit categories in play.
 *
 * Returns [{ key, label, strength, headline, detail, source, measured }]. Empty is the
 * normal case and means nothing more than "nothing we can currently verify" — the
 * absence of a credit is never itself a mark against a company.
 */
export function creditsFor(ticker, activeKeys = CREDIT_KEYS) {
  const active = new Set(activeKeys);
  const out = [];

  if (active.has("safer_than_industry")) {
    // The same base-size guard the adverse side uses. A credit computed off a handful of
    // cases would be the identical bug pointed the other way — and the flattering
    // direction is the one that deserves the firmer hand.
    const ys = injuryYears(ticker).filter((y) => y.vsIndustry != null && !tooThinToRate(y));
    // A coverage shift means consecutive years describe different sets of establishments,
    // so a run across one is not a record we can stand behind — exactly as it cannot
    // extend an adverse streak.
    const clean = ys.length >= YEARS && ys.every((y) => y.vsIndustry <= BETTER) && !ys.some((y) => y.coverageShift);
    if (clean) {
      const latest = ys[ys.length - 1];
      const avg = ys.reduce((n, y) => n + y.vsIndustry, 0) / ys.length;
      out.push({
        key: "safer_than_industry",
        label: creditLabel("safer_than_industry"),
        strength: "measured",
        headline: `Injury rate below its industry ${ys.length} years running`,
        detail: `${latest.dart} days-away/restricted cases per 100 workers against an industry figure of ${latest.industryDart} — about ${Math.round(avg * 100)}% of the rate its peers report, across ${latest.sites.toLocaleString()} establishments. From its own OSHA Form 300A submissions, which employers file under legal mandate.`,
        source: "OSHA Form 300A, filed by the employer",
        measured: latest.year,
      });
    }
  }

  return out;
}
