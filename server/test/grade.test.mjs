import assert from "node:assert/strict";
import { gradeFor } from "../../src/grade.js";
import { flagsFor, SCREEN_KEYS } from "../lib/screens.js";
import { enrichedFlagsFor } from "../lib/enriched.js";
import { filingFlagsFor } from "../lib/filings.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

// Mirrors analyzer.allFlagsFor: filing-cited wins, then curated, then industry code.
const flagsOf = (t, keys) => {
  const m = new Map();
  for (const f of enrichedFlagsFor(t, keys) || []) m.set(f.key, f);
  for (const f of flagsFor(t, keys) || []) m.set(f.key, f);
  for (const f of filingFlagsFor(t, keys) || []) m.set(f.key, f);
  return [...m.values()];
};
const grade = (t, keys = SCREEN_KEYS) => gradeFor(flagsOf(t, keys), keys.length).letter;

console.log("stock grade — the ladder:");
test("A when nothing is flagged in the chosen categories", () => {
  assert.equal(grade("MSFT"), "A");
  assert.equal(grade("NVDA"), "A");
});
test("B for one flagged line of business", () => {
  for (const t of ["CVX", "XOM", "LMT", "MO"]) assert.equal(grade(t), "B", t);
});
test("C for several flagged lines of business", () => {
  assert.equal(grade("BTU"), "C");   // fossil fuels + coal
});
test("D for a company's own disclosure or documented history", () => {
  assert.equal(grade("AAPL"), "D");  // its own supplier-violation report
  assert.equal(grade("IBM"), "D");   // WWII-era
});
test("F for a government action, court case or settlement", () => {
  for (const t of ["WMT", "JNJ", "CVS", "TEVA", "TSLA"]) assert.equal(grade(t), "F", t);
});
test("the worst applicable rung wins", () => {
  // Icahn Enterprises carries both an enforcement action and a business line.
  assert.equal(grade("IEP"), "F");
});

console.log("stock grade — it follows the reader's filters:");
test("Walmart is an F on opioids and an A on weapons", () => {
  assert.equal(grade("WMT", ["opioids"]), "F");
  assert.equal(grade("WMT", ["weapons"]), "A");
});
test("Lockheed is the mirror image", () => {
  assert.equal(grade("LMT", ["weapons"]), "B");
  assert.equal(grade("LMT", ["opioids"]), "A");
});
test("no categories selected yields no grade at all, not an A", () => {
  assert.equal(grade("WMT", []), null);
});

console.log("stock grade — honesty rules:");
test("an unknown company is never an A", () => {
  const g = gradeFor([], 5, false);
  assert.equal(g.letter, null);
  assert.match(g.meaning, /can't see/);
});
test("reports how many of the reader's lines were tripped", () => {
  const g = gradeFor(flagsOf("BTU", SCREEN_KEYS), SCREEN_KEYS.length);
  assert.equal(g.tripped, 2);
  assert.equal(g.of, SCREEN_KEYS.length);
});
test("duplicate flags of the same category count once", () => {
  const dup = [{ key: "fossil_fuels" }, { key: "fossil_fuels" }];
  assert.equal(gradeFor(dup, 3).letter, "B");
});

console.log(`\n${passed} grade tests passed ✓`);

// Regressions found while wiring the badge into the page.
{
  let extra = 0;
  const t2 = (name, fn) => { fn(); console.log(`  ✓ ${name}`); extra++; };
  console.log("stock grade — regressions:");
  t2("grading against zero categories is not an A", () => {
    const g = gradeFor([], 0, true);
    assert.equal(g.letter, null);
    assert.match(g.meaning, /Pick some categories/);
  });
  t2("one selected category still grades normally", () => {
    assert.equal(gradeFor([{ key: "opioids" }], 1).letter, "F");
    assert.equal(gradeFor([], 1).letter, "A");
  });
  console.log(`${extra} regression tests passed ✓`);
}
