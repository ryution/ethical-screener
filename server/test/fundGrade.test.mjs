import assert from "node:assert/strict";
import { fundGradeFor } from "../../src/fundGrade.js";
import { lookupSymbol, marketConductShare } from "../lib/analyzer.js";
import { SCREEN_KEYS } from "../lib/screens.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

const N = SCREEN_KEYS.length;
// Holdings shaped the way the analyzer emits them.
const F = (n) => Array.from({ length: n }, (_, i) => ({ ticker: `F${i}`, flags: [{ key: "opioids" }] }));
const D = (n) => Array.from({ length: n }, (_, i) => ({ ticker: `D${i}`, flags: [{ key: "supplier_audit_violations" }] }));
const B = (n) => Array.from({ length: n }, (_, i) => ({ ticker: `B${i}`, flags: [{ key: "fossil_fuels" }] }));

console.log("fund grade — the ladder:");

test("10 of 100 holdings graded F is a D, and 11 is an F", () => {
  // The rung is "more than 1 in 10", so the boundary itself stays in D.
  assert.equal(fundGradeFor(F(10), 100, N).letter, "D");
  assert.equal(fundGradeFor(F(11), 100, N).letter, "F");
});

test("ladder boundaries are per hundred holdings", () => {
  assert.equal(fundGradeFor([], 100, N).letter, "A");          // none
  assert.equal(fundGradeFor(F(1), 200, N).letter, "B");         // 0.5 in 100
  assert.equal(fundGradeFor(F(2), 100, N).letter, "C");         // 2 in 100
  assert.equal(fundGradeFor(F(5), 100, N).letter, "D");         // 5 in 100
  assert.equal(fundGradeFor(F(20), 100, N).letter, "F");        // 20 in 100
});

test("D holdings count toward the letter exactly as F holdings do", () => {
  // Both rest on something the company did or disclosed, rather than what it sells.
  assert.equal(fundGradeFor(D(5), 100, N).letter, fundGradeFor(F(5), 100, N).letter);
});

test("holdings flagged for what they sell do not drive the letter", () => {
  const g = fundGradeFor(B(40), 100, N);
  assert.equal(g.letter, "A", "40 oil companies is not a conduct finding");
  assert.equal(g.business, 40);
  assert.equal(g.businessShare, 40);
});

console.log("fund grade — what it refuses to do:");

test("it does not inherit the worst holding", () => {
  // Worst-holding-wins makes nine of the ten real baskets an F, including the ESG fund,
  // so the letter carries no information at all.
  assert.notEqual(fundGradeFor(F(1), 1000, N).letter, "F");
});

test("it does not average the holdings away", () => {
  // Scoring A=0…F=4 and averaging, ninety A's and ten F's comes to 0.4 — an A. The
  // arithmetic buries the exact fact the reader came for.
  assert.notEqual(fundGradeFor(F(10), 100, N).letter, "A");
});

test("no holdings list means no letter, never a good one", () => {
  for (const total of [null, 0, undefined]) {
    const g = fundGradeFor(F(3), total, N);
    assert.equal(g.letter, null, String(total));
    assert.match(g.meaning, /don't have/i);
  }
});

test("grading against no categories yields no letter", () => {
  const g = fundGradeFor(F(10), 100, 0);
  assert.equal(g.letter, null);
  assert.match(g.meaning, /Pick some categories/);
});

console.log("fund grade — against the real baskets:");

test("the market baseline is a believable share", () => {
  const m = marketConductShare();
  assert.ok(m > 0 && m < 5, `market conduct share ${m}% is not believable`);
});

test("every analysable fund produces a letter and a checkable count", () => {
  for (const t of ["VOO", "VTI", "XLV", "SPMD"]) {
    const r = lookupSymbol(t);
    const g = fundGradeFor(r.contains, r.totalHoldings, N, r.marketConductShare);
    assert.ok(g.letter, `${t} produced no letter`);
    // The reader must be able to recompute the share from what we show them.
    assert.equal(g.share, Number(((100 * g.conduct) / g.totalHoldings).toFixed(2)), t);
    assert.ok(g.conduct <= r.contains.length, t);
  }
});

test("a concentrated sector fund is separated from a broad one", () => {
  const xlv = lookupSymbol("XLV");
  const vti = lookupSymbol("VTI");
  const gx = fundGradeFor(xlv.contains, xlv.totalHoldings, N, xlv.marketConductShare);
  const gv = fundGradeFor(vti.contains, vti.totalHoldings, N, vti.marketConductShare);
  assert.equal(gx.letter, "F", "healthcare concentrates the opioid-settlement names");
  assert.equal(gv.letter, "B");
  assert.ok(gx.vsMarket > 5, `XLV should be far above market, got ${gx.vsMarket}x`);
});

console.log(`\n${passed} fund grade tests passed ✓`);
