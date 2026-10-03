import assert from "node:assert/strict";
import { creditsFor, CREDIT_KEYS } from "../lib/credits.js";
import { injuryYears } from "../lib/injury.js";
import { lookupSymbol } from "../lib/analyzer.js";
import { gradeFor } from "../../src/grade.js";
import { SCREEN_KEYS } from "../lib/screens.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("credits — earning one:");

test("a sustained below-industry injury rate earns a credit", () => {
  const c = creditsFor("UPS");
  assert.equal(c.length, 1);
  assert.equal(c[0].key, "safer_than_industry");
  assert.match(c[0].headline, /below its industry/);
  // UPS runs at roughly 80% of its industry's rate across three years.
  const ys = injuryYears("UPS").filter((y) => y.vsIndustry != null);
  assert.ok(ys.every((y) => y.vsIndustry <= 0.90));
});

test("being barely below the benchmark is not a credit", () => {
  // Walmart is below its industry every year, but only clearly so in the last one.
  // Beating a benchmark by a hair is noise in the same way exceeding it by a hair was.
  const ys = injuryYears("WMT").filter((y) => y.vsIndustry != null);
  assert.ok(ys.every((y) => y.vsIndustry < 1), "Walmart is below industry throughout");
  assert.ok(ys.some((y) => y.vsIndustry > 0.90), "but not by a clear margin every year");
  assert.deepEqual(creditsFor("WMT"), []);
});

test("a company above its industry earns nothing", () => {
  for (const t of ["AMZN", "FDX", "COST"]) assert.deepEqual(creditsFor(t), [], t);
});

test("no data earns nothing, and that is not a mark against them", () => {
  assert.deepEqual(creditsFor("MSFT"), []);
  assert.deepEqual(creditsFor("NOSUCHTICKER"), []);
});

test("a switched-off category awards nothing", () => {
  assert.deepEqual(creditsFor("UPS", []), []);
});

console.log("credits — the anti-greenwashing rule:");

test("neither grading module can even see credits", () => {
  // Structural, not a policy anyone has to remember. If someone later wires credits into
  // a letter, nothing a company does well could still net against a finding — buying a
  // certification would offset a settlement, which is the greenwashing this replaces.
  const here = dirname(fileURLToPath(import.meta.url));
  for (const f of ["grade.js", "conductGrade.js"]) {
    const src = readFileSync(join(here, "..", "..", "src", f), "utf8");
    assert.doesNotMatch(src, /\bcredit/i, `src/${f} must not reference credits`);
  }
  const wmt = lookupSymbol("WMT");
  assert.equal(gradeFor(wmt.flags, SCREEN_KEYS.length).letter, "F");
});

test("a credit cannot rescue a company with a finding", () => {
  // Construct the laundering case directly: a company with an F and a credit must keep
  // the F. UPS holds the only credit we award, so give it Walmart's opioid flag.
  const credited = creditsFor("UPS");
  assert.ok(credited.length, "UPS holds a credit");
  const g = gradeFor([{ key: "opioids" }], SCREEN_KEYS.length);
  assert.equal(g.letter, "F", "the letter is computed without reference to credits");
});

test("credits ride on the result beside the grades", () => {
  for (const t of ["UPS", "WMT"]) {
    const r = lookupSymbol(t);
    assert.ok(Array.isArray(r.credits), t);
  }
  assert.equal(lookupSymbol("UPS").credits.length, 1);
  assert.equal(lookupSymbol("WMT").credits.length, 0);
});

console.log("credits — honesty of the claim:");

test("a measured credit says who measured it", () => {
  const c = creditsFor("UPS")[0];
  assert.match(c.source, /OSHA/);
  assert.equal(c.strength, "measured", "self-filed, not third-party verified");
  // The detail has to be recomputable from what we show: rate, benchmark, sites.
  assert.match(c.detail, /per 100 workers/);
  assert.match(c.detail, /industry figure/);
  assert.match(c.detail, /establishments/);
});

test("every credit key is one we publish", () => {
  for (const t of ["UPS"]) for (const c of creditsFor(t)) assert.ok(CREDIT_KEYS.includes(c.key), c.key);
});

console.log(`\n${passed} credit tests passed ✓`);
