// A grade for one company, computed against the categories the visitor turned on.
//
// It is deliberately NOT a severity score. Ranking "is gambling worse than alcohol?" is
// the judgement call this product exists to hand back to the reader. What the letter
// describes is the KIND of fact on record, which is not an opinion:
//
//   selling a legal product  ≠  disclosing your own violation  ≠  a government finding
//
// Two earlier designs were rejected against the real data:
//   · "how many flags" — 388 of 392 flagged companies carry exactly one, so everybody
//     landed on the same letter;
//   · "how strong is our evidence" — that graded our own paperwork, not the company, and
//     put Chevron above an obscure driller for no reason the reader would accept.
//
// The letter moves with the reader's own filter selection. Walmart is an F to someone
// screening opioids and an A to someone screening only weapons; both are true statements
// about that reader's lines.

// A court, a regulator or a government list said so.
const FINDING = new Set(["opioids", "executive_enforcement", "forced_labor_supply_chain"]);
// The company said so about itself, or it is documented history.
const DISCLOSED = new Set(["supplier_audit_violations", "historical_forced_labor"]);

const LETTERS = {
  B: "One flagged line of business",
  C: "Several flagged lines of business",
  D: "Its own disclosure, or documented history",
  F: "A government action, court case or settlement",
};

/**
 * Grade a company against the visitor's selected categories.
 *
 * @param flags    the company's flags, already filtered to the selected categories
 * @param selected how many categories the visitor turned on (for "trips 2 of your 6")
 * @param known    false when we don't recognise the company at all
 *
 * Returns { letter, meaning, tripped, of }. `letter` is null whenever we cannot honestly
 * award one — and there is no top grade at all. A company we found nothing on is not a
 * good company; it is a company that is not on a list we keep. We have never recorded an
 * EXAMINATION, only findings, so an A would have been handed to 9,332 companies nobody
 * ever looked at. "No grade" is the honest version of that sentence, and it is the same
 * line the rest of the site draws between "no flags" and "not analyzed".
 */
export function gradeFor(flags = [], selected = 0, known = true) {
  const tripped = new Set(flags.map((f) => f.key)).size;
  if (!known) return { letter: null, meaning: "We can't see this company", tripped: 0, of: selected };
  // Grading against nothing would be grading for checking nothing.
  if (!selected) return { letter: null, meaning: "Pick some categories to grade against", tripped: 0, of: 0 };
  if (!tripped) {
    return { letter: null, meaning: "Nothing on the lists we keep — we haven't examined this company", tripped: 0, of: selected };
  }
  let letter;
  if (flags.some((f) => FINDING.has(f.key))) letter = "F";
  else if (flags.some((f) => DISCLOSED.has(f.key))) letter = "D";
  else letter = tripped >= 2 ? "C" : "B";
  return { letter, meaning: LETTERS[letter], tripped, of: selected };
}

export const GRADE_LETTERS = LETTERS;
