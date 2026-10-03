// The conduct grade: a letter for how a company behaves, beside the one for what it sells.
//
// Two letters rather than one, because folding them together destroys both. Almost every
// conduct record is a government finding, which is F-tier on the business ladder — so a
// single letter would make Amazon, Apple, Walmart and Google all F, which is as useless
// as the "everything is a B" problem it was meant to fix. Kept apart, they say different
// true things: Lockheed sells weapons and may run a safe shop; FedEx sells nothing we
// flag and is above its industry's injury rate three years running.
//
// Like the business grade, this follows the reader's own selections — a conduct category
// they have turned off does not count against a company.
//
// There is no A. Finding nothing adverse is not a clean record, it is an absent one, and
// the measures underneath are asymmetric in a way that makes a top grade indefensible:
// nobody over-reports their own injuries, so a good-looking number is the weakest
// evidence we handle.

// The conduct categories a reader can switch on. server/lib/conduct.js is the source of
// truth; this list exists because the client renders the toggles, and a test pins the two
// together so they cannot drift apart silently.
export const CONDUCT_CATEGORIES = ["worker_injuries", "product_safety", "environmental_compliance"];

const LETTERS = {
  B: "Historical matters only",
  C: "One current adverse measure",
  D: "A sustained pattern",
  F: "A regulator's own severity finding",
};

// Worst rung wins, same as the business ladder.
const ORDER = ["B", "C", "D", "F"];

/**
 * Grade a company's conduct from its signals.
 *
 * @param signals  [{ key, label, rung, headline, detail }] — already filtered to the
 *                 conduct categories the reader turned on
 * @param selected how many conduct categories the reader turned on
 *
 * Returns { letter, meaning, tripped, of, measured, worst }. `letter` is null whenever
 * no honest letter is available: nothing selected, nothing measured, or measured and
 * nothing adverse found.
 */
export function conductGradeFor(signals = [], selected = 0) {
  if (!selected) {
    return { letter: null, meaning: "Pick some conduct categories to grade against", tripped: 0, of: 0, measured: 0 };
  }
  if (!signals.length) {
    return { letter: null, meaning: "We have no conduct measures for this company", tripped: 0, of: selected, measured: 0 };
  }

  const adverse = signals.filter((s) => s.rung);
  if (!adverse.length) {
    return {
      letter: null,
      // Stated here because this is the exact place a reader would otherwise hear a
      // guarantee. We measured, and measuring found nothing — which is not the same as
      // there being nothing.
      meaning: `Measured on ${signals.length === 1 ? "1 category" : `${signals.length} categories`}, nothing adverse on file`,
      tripped: 0, of: selected, measured: signals.length,
    };
  }

  let worst = adverse[0];
  for (const s of adverse) if (ORDER.indexOf(s.rung) > ORDER.indexOf(worst.rung)) worst = s;

  return {
    letter: worst.rung,
    meaning: LETTERS[worst.rung],
    tripped: adverse.length,
    of: selected,
    measured: signals.length,
    worst,
  };
}

export const CONDUCT_LETTERS = LETTERS;
