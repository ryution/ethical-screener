// Product safety from openFDA drug, device and food recalls (built by
// scripts/fetch-fda-recalls.mjs).
//
// The injury data is about the people a company employs. This is about the people who use
// what it makes. Both describe behaviour rather than a line of business, so they feed the
// same letter.
//
// FDA supplies the severity. A recall is Class I ("reasonable probability of serious
// adverse health consequences or death"), Class II or Class III, and each record says
// whether the firm acted voluntarily or FDA compelled it. We add no judgement of our own.
//
// The measure is the SHARE that FDA classed as life-threatening, against the share across
// every firm filing into the same dataset.
//
// COUNT EVENTS, NOT RECORDS. openFDA files one row per affected model or lot, so a single
// recall fans out into dozens: Medtronic's 2023 defibrillator recall is one issue and 123
// rows. Counting rows put Medtronic at 33.2% Class I against a true 11.7%, and understated
// Zimmer Biomet at 0.3% against a true 1.2% — the error runs in both directions, so it
// distorted the ranking between them as well as the levels. Zimmer files more ROWS than
// Medtronic (1,605 to 1,269) and fewer actual RECALLS (322 to 419).

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "fda-recalls.json");

let _data = { lastUpdated: null, source: null, baselines: {}, companies: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no recall data yet — every other layer still works */ }

export function recallMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, count: Object.keys(_data.companies || {}).length };
}
export const recallTickers = () => Object.keys(_data.companies || {});

const KINDS = ["drug", "device", "food"];
const LABEL = { drug: "drug", device: "medical device", food: "food" };

// A firm's class counts come from a name search, so they are only usable when that search
// barely reached outside the company. Below this, the numbers describe a crowd.
const MIN_ATTRIBUTION = 0.95;
// Shares off a handful of recalls are noise, the same way a rate off a handful of injury
// cases was. ~30 recalls with a 9% baseline expects about 3 Class I; fewer than that and a
// single reclassification swings the share by a third.
const MIN_RECALLS = 30;
const ABOVE = 1.15;

/** Per-category detail for a ticker, oldest concern first. */
export function recallProfile(ticker) {
  const c = _data.companies?.[String(ticker || "").toUpperCase()];
  if (!c) return [];
  const out = [];
  for (const kind of KINDS) {
    const d = c[kind];
    if (!d || d.error || !d.recalls) continue;
    const baseline = _data.baselines?.[kind]?.classIShare ?? null;
    const share = d.recalls ? d.classI / d.recalls : null;
    out.push({
      kind, label: LABEL[kind],
      // `recalls` is distinct recall EVENTS; `records` is openFDA's one-row-per-model
      // inventory. Keeping both visible is what stops the wrong one being used again.
      recalls: d.recalls, classI: d.classI, mandated: d.mandated || 0,
      records: d.records ?? null, classIRecords: d.classIRecords ?? null,
      share: share == null ? null : Number(share.toFixed(4)),
      baseline,
      vsBaseline: (baseline && share != null) ? Number((share / baseline).toFixed(2)) : null,
      attributionRate: d.attributionRate,
      ratable: d.attributionRate != null && d.attributionRate >= MIN_ATTRIBUTION && d.recalls >= MIN_RECALLS,
    });
  }
  return out;
}

/**
 * Where a company's recall record sits on the conduct ladder.
 *
 * Rungs: F for a recall FDA had to compel, D for a serious-recall share well above its
 * field or above it in more than one, C for a single field above. Null where there is
 * nothing adverse, nothing filed, or nothing we can attribute tightly enough to say.
 */
export function assessRecalls(ticker) {
  const prof = recallProfile(ticker);
  if (!prof.length) return { rung: null, headline: null, detail: null, profile: [] };

  const ratable = prof.filter((p) => p.ratable);
  if (!ratable.length) {
    const loose = prof.filter((p) => p.attributionRate != null && p.attributionRate < MIN_ATTRIBUTION);
    return {
      rung: null,
      headline: loose.length ? "Recalls on file, attribution too loose to rate" : "Too few recalls to rate",
      detail: loose.length
        ? `FDA records recalls under several firm names here and only ${Math.round(100 * Math.max(...loose.map((p) => p.attributionRate)))}% of the matches are clearly this company, so the share would describe a crowd rather than a company.`
        : `Fewer than ${MIN_RECALLS} recalls on file, which is too small a base for a share anyone should rely on.`,
      profile: prof,
    };
  }

  const mandated = ratable.filter((p) => p.mandated > 0);
  const above = ratable.filter((p) => p.vsBaseline != null && p.vsBaseline >= ABOVE);
  const worst = above.slice().sort((a, b) => b.vsBaseline - a.vsBaseline)[0];

  if (mandated.length) {
    const m = mandated[0];
    return {
      rung: "F",
      headline: `FDA compelled a ${m.label} recall`,
      detail: `${m.mandated} of its ${m.recalls.toLocaleString()} ${m.label} recalls were mandated by FDA rather than initiated by the company. A mandated recall means the firm did not act on its own.`,
      profile: prof,
    };
  }
  if (!worst) {
    return {
      rung: null,
      headline: "No adverse measure on file",
      detail: `Across ${ratable.reduce((n, p) => n + p.recalls, 0).toLocaleString()} recalls, the share FDA classed as life-threatening is at or below the rate for firms in the same field. Recall counts scale with how much a company ships, so this is the absence of an adverse measure rather than a safety guarantee.`,
      profile: prof,
    };
  }

  const pattern = above.length >= 2 || worst.vsBaseline >= 2;
  return {
    rung: pattern ? "D" : "C",
    headline: `Serious ${worst.label} recalls above its field${above.length >= 2 ? `, in ${above.length} categories` : ""}`,
    detail: `${worst.classI} of its ${worst.recalls.toLocaleString()} ${worst.label} recalls are Class I — FDA's label for a reasonable probability of serious injury or death — which is ${(100 * worst.share).toFixed(1)}% against ${(100 * worst.baseline).toFixed(1)}% across all firms filing ${worst.label} recalls (${worst.vsBaseline}×).`,
    profile: prof,
  };
}
