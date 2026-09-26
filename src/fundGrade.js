// A grade for a whole fund, from the grades of the companies inside it.
//
// The obvious rule — the fund inherits its worst holding — is useless. Measured against
// the real baskets it makes nine of ten funds an F, including the ESG one, because any
// broad index holds a few thousand companies and some of them have settled a case. A
// letter everyone shares tells you nothing.
//
// Averaging is worse, and it is the thing this product exists to refuse. Score A=0…F=4
// and a fund of ninety A's and ten F's averages to 0.4 — an A. It buries the exact fact
// the reader is looking for, behind arithmetic they have to take on trust.
//
// So the rule counts instead, and it counts one specific thing: the share of holdings
// whose own grade rests on something the company DID — a government finding (F) or its
// own disclosure (D) — rather than on what it sells (B, C). A fund holding oil companies
// and a fund holding companies that settled opioid cases are different statements, and
// collapsing them would hide the difference.
//
// Thresholds are stated per hundred holdings so a reader can check them by counting.
// They are a judgement, which is why `marketShare` travels with the letter: the whole
// market sits near 1 in 100, so anyone who disagrees with the cutoffs can still see how
// far from ordinary a fund is and draw their own line.

import { gradeFor } from "./grade.js";

// Share of holdings graded D or F → letter. Expressed as "per 100" because that is how
// the reader can verify it against the list we show them.
const LADDER = [
  { max: 0,        letter: "A", meaning: "No holding graded on a finding or disclosure" },
  { max: 1,        letter: "B", meaning: "Fewer than 1 in 100 holdings" },
  { max: 3,        letter: "C", meaning: "1 to 3 in 100 holdings" },
  { max: 10,       letter: "D", meaning: "3 to 10 in 100 holdings" },
  { max: Infinity, letter: "F", meaning: "More than 1 in 10 holdings" },
];

const CONDUCT = new Set(["D", "F"]);
const BUSINESS = new Set(["B", "C"]);

/**
 * Grade a fund from its flagged holdings.
 *
 * @param contains      flagged holdings, already filtered to the reader's categories:
 *                      [{ ticker, name, flags }]
 * @param totalHoldings how many companies the fund holds in total
 * @param selected      how many categories the reader turned on
 * @param marketShare   the same D/F share for a total-market fund, for context (optional)
 *
 * Returns { letter, meaning, conduct, business, totalHoldings, share, businessShare,
 *           vsMarket }. `letter` is null whenever we cannot honestly produce one.
 */
export function fundGradeFor(contains = [], totalHoldings = null, selected = 0, marketShare = null) {
  const base = { letter: null, conduct: 0, business: 0, totalHoldings, share: null, businessShare: null, vsMarket: null };

  if (!selected) return { ...base, meaning: "Pick some categories to grade against" };
  // Without the size of the whole basket there is no denominator. Grading on the flagged
  // names alone would divide by the wrong number and always look catastrophic, and
  // guessing the total is exactly the kind of invention the grade exists to avoid.
  if (!totalHoldings || totalHoldings <= 0) {
    return { ...base, meaning: "We don't have this fund's full holdings list" };
  }

  let conduct = 0, business = 0;
  for (const c of contains) {
    const g = gradeFor(c.flags || [], selected, true).letter;
    if (CONDUCT.has(g)) conduct++;
    else if (BUSINESS.has(g)) business++;
  }

  const share = (100 * conduct) / totalHoldings;
  const rung = LADDER.find((r) => share <= r.max) || LADDER[LADDER.length - 1];

  return {
    letter: rung.letter,
    meaning: rung.meaning,
    conduct,
    business,
    totalHoldings,
    share: Number(share.toFixed(2)),
    businessShare: Number(((100 * business) / totalHoldings).toFixed(1)),
    vsMarket: marketShare > 0 ? Number((share / marketShare).toFixed(1)) : null,
  };
}

export const FUND_LADDER = LADDER;
