// Political spending: federal lobbying (Senate LDA) and corporate PAC disbursements (FEC).
//
// SHOWN, NEVER GRADED — and the separation is structural, not a policy anyone has to
// remember. This module exports no rung and no letter, and nothing here is wired into
// gradeFor or conductGradeFor. Lobbying and PAC giving are lawful, every large company
// does both, and whether a given amount is objectionable is exactly the judgement this
// product hands back to the reader. Grading it would make the site partisan and would
// break the promise that the lines are theirs.
//
// It is published because it is a major factor in how people judge a company, and because
// the figures are filed and checkable. The reader draws the line; we supply the number and
// say who filed it.
//
// Deliberately absent: the party split. FEC returns recipient names on a PAC's
// disbursements with no party field and frequently no recipient committee id, so a split
// needs a per-recipient candidate lookup that is expensive and lossy. A half-accurate
// party breakdown is the most charged number this site could print, so it waits until it
// can be done properly.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "political.json");

let _data = { lastUpdated: null, source: null, companies: {} };
try {
  if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8"));
} catch { /* no political data yet — every other layer still works */ }

export function politicalMeta() {
  return { lastUpdated: _data.lastUpdated, source: _data.source, count: Object.keys(_data.companies || {}).length };
}
export const politicalTickers = () => Object.keys(_data.companies || {});

const usd = (n) => `$${Math.round(n).toLocaleString()}`;

/**
 * Filed political spending for a ticker, as disclosures rather than findings.
 *
 * Returns { lobbying: [...], pac: {...}, lines: [...] } where `lines` are ready-to-show
 * statements of fact. Never a rung, never a letter — by design.
 */
export function politicalFor(ticker) {
  const c = _data.companies?.[String(ticker || "").toUpperCase()];
  if (!c) return null;

  const years = (c.lobbying || []).filter((y) => y.total > 0).sort((a, b) => b.year - a.year);
  const cycles = (c.pac?.cycles || []).slice().sort((a, b) => b.cycle - a.cycle);
  const lines = [];

  if (years.length) {
    const latest = years[0];
    // A year we could not read to the end would understate the total, so say so rather
    // than publish a number that looks complete.
    const partial = latest.complete === false;
    lines.push({
      key: "lobbying",
      label: "Federal lobbying",
      value: usd(latest.total),
      detail: `${usd(latest.total)} reported in ${latest.year}, across ${latest.filings} filing${latest.filings === 1 ? "" : "s"}${partial ? " (we could not read every filing for this year, so the real figure is higher)" : ""}.`
        + (years.length > 1 ? ` Earlier years: ${years.slice(1).map((y) => `${y.year} ${usd(y.total)}`).join(", ")}.` : ""),
      source: "US Senate Lobbying Disclosure Act database",
    });
  }

  if (cycles.length) {
    const latest = cycles[0];
    lines.push({
      key: "pac",
      label: "Company PAC",
      value: usd(latest.disbursements),
      detail: `${latest.committee} disbursed ${usd(latest.disbursements)} in the ${latest.cycle} cycle`
        + (cycles.length > 1 ? `, against ${cycles.slice(1).map((x) => `${usd(x.disbursements)} in ${x.cycle}`).join(" and ")}` : "")
        + `. We do not publish a party split: the FEC data does not carry one, and a half-accurate breakdown is not worth printing.`,
      source: "Federal Election Commission",
    });
  }

  if (!lines.length) {
    // Nothing found is a real and interesting answer here — Costco has thirteen lobbying
    // filings in its entire history — but it is not a claim that a company spends nothing.
    return {
      lobbying: c.lobbying || [], pac: c.pac || null, lines: [],
      // A deliberately skipped source is not a failed lookup, and must not read like one.
      note: (c.lobbyingError || (c.pacError && !/^skipped/.test(c.pacError)))
        ? "We could not complete the lookup for this company."
        : "No federal lobbying found in the years we checked. That is a real answer \u2014 Costco has thirteen lobbying filings in its entire history \u2014 but it is not a claim that a company spends nothing.",
    };
  }

  return { lobbying: c.lobbying || [], pac: c.pac || null, lines, note: null };
}
