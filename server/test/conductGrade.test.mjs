import assert from "node:assert/strict";
import { conductGradeFor, CONDUCT_CATEGORIES } from "../../src/conductGrade.js";
import { CONDUCT_KEYS, conductSignalsFor } from "../lib/conduct.js";
import { lookupSymbol } from "../lib/analyzer.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };
const N = CONDUCT_KEYS.length;
const sig = (rung, key = "worker_injuries") => ({ key, label: key, rung, headline: `h-${rung}` });

console.log("conduct grade — the ladder:");

test("the worst rung wins", () => {
  assert.equal(conductGradeFor([sig("C"), sig("D", "x"), sig(null, "y")], 3).letter, "D");
  assert.equal(conductGradeFor([sig("B"), sig("F", "x")], 2).letter, "F");
});

test("there is no A — nothing adverse is an absent result, not a good one", () => {
  const g = conductGradeFor([sig(null)], N);
  assert.equal(g.letter, null);
  assert.equal(g.measured, 1);
  assert.match(g.meaning, /nothing adverse on file/i);
});

test("measured-and-clear is distinguished from never-measured", () => {
  const measured = conductGradeFor([sig(null)], N);
  const never = conductGradeFor([], N);
  assert.equal(measured.letter, null);
  assert.equal(never.letter, null);
  // Both are ungraded, but they are not the same sentence and must not read alike.
  assert.notEqual(measured.meaning, never.meaning);
  assert.equal(measured.measured, 1);
  assert.equal(never.measured, 0);
  assert.match(never.meaning, /no conduct measures/i);
});

test("no conduct categories selected yields no letter", () => {
  const g = conductGradeFor([sig("F")], 0);
  assert.equal(g.letter, null);
  assert.match(g.meaning, /Pick some conduct categories/);
});

test("a category the reader switched off cannot grade them", () => {
  // conductSignalsFor filters by the active keys, so an empty selection yields no signals
  // and therefore no letter, however bad the underlying record is.
  assert.equal(conductSignalsFor("AMZN", []).length, 0);
  assert.equal(conductGradeFor(conductSignalsFor("AMZN", []), 0).letter, null);
});

console.log("conduct grade — against the real data:");

test("a sustained above-industry injury rate grades D", () => {
  for (const t of ["AMZN", "FDX"]) {
    assert.equal(conductGradeFor(conductSignalsFor(t), N).letter, "D", t);
  }
});

test("a single adverse year grades C on that measure", () => {
  // Checked on the injury signal itself: Costco also carries an environmental D now, and
  // the combined letter correctly takes the worst rung across every category.
  const injury = conductSignalsFor("COST", ["worker_injuries"]);
  assert.equal(conductGradeFor(injury, 1).letter, "C");
  assert.equal(conductGradeFor(conductSignalsFor("COST"), N).letter, "D", "worst rung wins overall");
});

test("it is independent of what the company sells", () => {
  // Walmart is an F on the sell-side ladder (opioid settlement) and below its industry on
  // injuries; FedEx sells nothing we flag and is above its industry three years running.
  // One letter covering both would have hidden each of these facts behind the other.
  const wmt = lookupSymbol("WMT");
  const fdx = lookupSymbol("FDX");
  assert.equal(wmt.type, "stock", "Walmart carries sell-side flags");
  assert.equal(conductGradeFor(wmt.conduct, N).letter, null, "but nothing adverse on conduct");
  assert.equal(fdx.type, "none", "FedEx carries no sell-side flags");
  assert.equal(conductGradeFor(fdx.conduct, N).letter, "D", "yet a conduct pattern");
});

test("the result carries conduct whether or not it carries flags", () => {
  for (const t of ["WMT", "AMZN"]) assert.ok(Array.isArray(lookupSymbol(t).conduct), t);
});

console.log("conduct grade — wiring:");

test("the client's category list matches the server's", () => {
  // The client renders the toggles from its own copy; if these drift, a reader could
  // switch off a category that still counts against a company.
  assert.deepEqual([...CONDUCT_CATEGORIES].sort(), [...CONDUCT_KEYS].sort());
});

console.log(`\n${passed} conduct grade tests passed ✓`);
