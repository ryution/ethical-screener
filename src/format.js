// Display formatting for company names and flag reasons.
//
// Pure functions, kept out of Analyzer.jsx so they can be tested and audited against the
// real dataset (see scripts/audit-display.mjs). They change how text is PRESENTED only —
// the underlying records are never rewritten.

const NAME_SMALL = new Set(["OF", "AND", "THE", "FOR", "DE", "DA", "EL", "LA"]);
// Legal-form suffixes are words, not initialisms — without this they'd be caught by the
// short-token rule below and left shouting as "Labcorp Holdings INC."
const NAME_SUFFIX = new Set(["INC", "CO", "CORP", "LTD", "PLC", "LLC", "LP", "LLP", "NV", "SA", "AG", "COS", "HLDGS", "LIMITED", "HOLDINGS", "COMPANY", "GROUP"]);
// Anglo legal forms that a state-of-incorporation marker can follow.
const STATE_AFTER = new Set(["CORP", "INC", "CO", "LTD", "LIMITED", "LLC", "PLC", "HOLDINGS", "GROUP"]);
// Brands whose internal capitals no per-token transform can recover. Hand-reviewed; the
// alternative is silently shipping "Conocophillips".
export const CANONICAL = new Map(Object.entries({
  CONOCOPHILLIPS: "ConocoPhillips", NISOURCE: "NiSource", FIRSTENERGY: "FirstEnergy",
  CENTERPOINT: "CenterPoint", EXXONMOBIL: "ExxonMobil", MCKESSON: "McKesson",
  BLACKROCK: "BlackRock", JPMORGAN: "JPMorgan", POWERSHARES: "PowerShares",
  LABCORP: "Labcorp", ONEOK: "ONEOK", PACCAR: "PACCAR", ROBINHOOD: "Robinhood",
  ANHEUSER: "Anheuser", AMERISOURCEBERGEN: "AmerisourceBergen", HEALTHPEAK: "Healthpeak",
}));

// "OCCIDENTAL PETROLEUM CORP /DE/" and "VALERO ENERGY CORP/TX" both carry a state of
// incorporation. Strip it only when it follows an Anglo legal form, so the Belgian
// "SA/NV" in "Anheuser-Busch InBev SA/NV" — genuinely part of the name — survives.
function stripStateSuffix(s) {
  // 2–3 letters covers state codes and EDGAR's "/NEW/" re-registration marker.
  return s.replace(/\s*\/([A-Z]{2,3})\/?\s*$/, (m, _st, off, full) => {
    const prev = (full.slice(0, off).trim().split(/\s+/).pop() || "").replace(/[^A-Z]/gi, "").toUpperCase();
    return STATE_AFTER.has(prev) ? "" : m;
  }).trim();
}

/**
 * SEC company names arrive SHOUTING and carry registry artifacts ("ENTERGY CORP /DE/");
 * curated names are Title Case. Side by side in one list the mix reads as a bug.
 *
 * Normalizes conservatively:
 *   · drops the trailing state-of-incorporation marker
 *   · leaves anything already mixed-case alone (it was hand-checked)
 *   · title-cases only tokens that are clearly words — a token of ≤3 letters, or one with
 *     no vowel, stays uppercase so real initialisms (NRG, AES, EQT, PPL, RTX) survive
 *
 * Known limit: internal camel-casing is lost — "NISOURCE" → "Nisource", not "NiSource".
 * Getting those exactly right needs a reviewed name map, not a string transform.
 */
function normToken(tok) {
  // A slash group of only short segments is a stacked legal form — Belgian "SA/NV",
  // "AB/OY" — and stays as written. Title-casing it produces "Sa/Nv".
  if (tok.includes("/")) {
    const parts = tok.split("/");
    if (parts.every((p) => p.replace(/[^A-Za-z]/g, "").length <= 3)) return tok;
    return parts.map(normToken).join("/");
  }
  const bare = tok.replace(/[^A-Za-z]/g, "");
  if (!bare) return tok;
  // Judged per token, not per string: "CANADIAN NATURAL RESOURCES Ltd" is mixed-case
  // overall, but the shouting words in it still need fixing.
  if (bare !== bare.toUpperCase()) return tok;
  const up = bare.toUpperCase();
  if (CANONICAL.has(up)) return tok.replace(bare, CANONICAL.get(up));
  const title = tok.charAt(0) + tok.slice(1).toLowerCase();
  if (NAME_SUFFIX.has(up)) return title;
  if (NAME_SMALL.has(up)) return tok.toLowerCase();
  if (up.length <= 3 || !/[AEIOU]/.test(up)) return tok; // IBM, NRG, AES, EQT, PPL, RTX
  return title;
}

export function displayName(raw) {
  const s = stripStateSuffix(String(raw || "").trim());
  if (!s) return s;
  return s.split(/(\s+)/).map((tok) => (tok.trim() ? normToken(tok) : tok)).join("");
}

/**
 * Reasons are authored as "Company — the finding. Supporting detail. Company's response."
 *
 * Two purely typographic moves, adding and removing nothing but the duplicated company
 * prefix: drop that prefix (the card header already names the company), then lift the
 * first sentence out as a lead so the eye has somewhere to land.
 *
 * Returns { lead, rest }. `rest` is "" when the reason is a single sentence.
 */
export function reasonParts(reason, company) {
  let text = String(reason || "").trim();
  const dash = text.indexOf(" — ");
  if (dash > 0 && dash < 60) {
    const head = text.slice(0, dash).trim().toLowerCase();
    const name = String(company || "").trim().toLowerCase();
    if (name && (name === head || name.startsWith(head) || head.startsWith(name))) {
      text = text.slice(dash + 3).trim();
      // The clause was written to follow "Apple — ", so it starts lowercase. Now that it
      // leads the card, it needs a capital.
      text = text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  // Split on sentence end + space + capital. "$34.5M" and "U.S." survive because neither
  // is followed by space-then-capital.
  const m = text.match(/^(.+?[.!?])\s+(?=[A-Z“"])/);
  return m ? { lead: m[1].trim(), rest: text.slice(m[0].length).trim() } : { lead: text, rest: "" };
}
