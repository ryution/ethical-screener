// The conduct catalogue: how a company behaves, as opposed to what it sells.
//
// Deliberately separate from SCREENS. Those 22 categories describe a line of business —
// a company sells tobacco, or coal, or runs private prisons — and 17 of the 20 original
// ones were of that kind, which is why 496 of 549 flagged companies land on the same
// letter. Conduct is a different question with different evidence, so it gets its own
// toggles and its own letter rather than being folded into a list it does not belong in.
//
// Every conduct category must be re-derivable on a schedule. A category that needs
// hand-curation to stay current goes stale silently, and a stale conduct claim about a
// named company is the worst failure this product has available to it. That rule is what
// keeps NLRB organising cases out of here for now: every route to them is bot-walled, so
// they cannot be kept honest automatically.

import { assessInjury, injuryMeta } from "./injury.js";
import { assessRecalls, recallMeta } from "./recalls.js";

export const CONDUCT_SCREENS = [
  {
    key: "worker_injuries",
    label: "Worker injuries",
    blurb: "Workplace injury rate against the company's own industry, from the injury figures it files with OSHA each year.",
  },
  {
    key: "product_safety",
    label: "Product safety",
    blurb: "Share of a company's FDA recalls that FDA itself classed as life-threatening, against the share for firms in the same field.",
  },
];

export const CONDUCT_KEYS = CONDUCT_SCREENS.map((s) => s.key);
export const isConductKey = (k) => CONDUCT_KEYS.includes(k);
export const conductLabel = (k) => CONDUCT_SCREENS.find((s) => s.key === k)?.label || k;

export const conductCatalogue = CONDUCT_SCREENS.map(({ key, label, blurb }) => ({ key, label, blurb }));

/**
 * Every conduct signal we hold for a ticker, filtered to the categories the reader
 * turned on. A signal with no adverse finding still comes back — the reader should see
 * that we looked and what we found, and "nothing adverse" is a weaker statement than it
 * sounds, so it has to carry its own wording rather than be silently dropped.
 *
 * Returns [{ key, label, rung, headline, detail, measured }]. `rung` is null where there
 * is nothing adverse to say, and the whole entry is absent where we have no data at all.
 */
export function conductSignalsFor(ticker, activeKeys = CONDUCT_KEYS) {
  const active = new Set(activeKeys);
  const out = [];

  if (active.has("worker_injuries")) {
    const a = assessInjury(ticker);
    if (a.years.length) {
      out.push({
        key: "worker_injuries",
        label: conductLabel("worker_injuries"),
        rung: a.rung,
        headline: a.headline,
        detail: a.detail,
        measured: a.latest?.year || null,
        source: "OSHA Form 300A, filed by the employer",
      });
    }
  }

  if (active.has("product_safety")) {
    const a = assessRecalls(ticker);
    if (a.profile.length) {
      out.push({
        key: "product_safety",
        label: conductLabel("product_safety"),
        rung: a.rung,
        headline: a.headline,
        detail: a.detail,
        measured: null,
        source: "openFDA — FDA drug, device and food enforcement reports",
      });
    }
  }

  return out;
}

/** Freshness for the UI, per conduct category. */
export function conductMeta() {
  return { worker_injuries: injuryMeta(), product_safety: recallMeta() };
}
