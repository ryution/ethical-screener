import assert from "node:assert/strict";
import { alternatives } from "../lib/alternatives.js";
import { FUND_GROUPS, catalogueTickers, FUNDS } from "../lib/funds.js";
import { compareFunds } from "../../src/compare.js";
import { lookupSymbol } from "../lib/analyzer.js";
import { SCREEN_KEYS } from "../lib/screens.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };
const HALAL = ["alcohol", "gambling", "tobacco", "adult", "pork", "interest_finance"];

console.log("alternatives: groups");

test("every fund in the catalogue is in exactly one group", () => {
  const seen = new Map();
  for (const g of FUND_GROUPS) for (const t of g.tickers) seen.set(t, (seen.get(t) || 0) + 1);
  const missing = catalogueTickers().filter((t) => !seen.has(t));
  const twice = [...seen].filter(([, n]) => n > 1).map(([t]) => t);
  const unknown = [...seen.keys()].filter((t) => !catalogueTickers().includes(t));
  assert.deepEqual(missing, [], `not in any group: ${missing.join(", ")}`);
  assert.deepEqual(twice, [], `in more than one group: ${twice.join(", ")}`);
  assert.deepEqual(unknown, [], `in a group but not the catalogue: ${unknown.join(", ")}`);
});

test("a fund's alternatives come from its own group", () => {
  assert.equal(alternatives({ keys: SCREEN_KEYS, symbol: "VOO" }).group, "broad");
  assert.equal(alternatives({ keys: SCREEN_KEYS, symbol: "XBI" }).group, "health");
  assert.equal(alternatives({ keys: SCREEN_KEYS, symbol: "AAPL" }).group, "broad", "a stock gets the broad market");
});

console.log("alternatives: ranking");

test("no categories means no ranking", () => {
  const a = alternatives({ keys: [], symbol: "VOO" });
  assert.equal(a.selectedCount, 0);
  assert.deepEqual(a.rows, []);
});

test("funds on the same index share one row, led by the fund on the page", () => {
  const a = alternatives({ keys: SCREEN_KEYS, symbol: "SPY" });
  const sp = a.rows.filter((r) => r.symbols.includes("VOO"));
  assert.equal(sp.length, 1);
  assert.equal(sp[0].symbols[0], "SPY");
  assert.ok(sp[0].current);
});

test("the list order agrees with the head-to-head comparison", () => {
  for (const [keys, sym] of [[SCREEN_KEYS, "VOO"], [HALAL, "VOO"], [SCREEN_KEYS, "QQQ"], [["fossil_fuels"], "SCHD"]]) {
    const rows = alternatives({ keys, symbol: sym }).rows;
    for (let i = 0; i + 1 < rows.length; i++) {
      const [a, b] = [rows[i].symbols[0], rows[i + 1].symbols[0]];
      const v = compareFunds([lookupSymbol(a), lookupSymbol(b)], keys).verdict;
      if (v.kind === "ranked") assert.notEqual(v.winner, b, `${b} is listed after ${a} but Compare picks ${b}`);
    }
  }
});

test("each row says how many of the page fund's flagged companies it also holds", () => {
  const a = alternatives({ keys: SCREEN_KEYS, symbol: "VOO" });
  const vti = a.rows.find((r) => r.symbols.includes("VTI"));
  assert.ok(vti.overlap.held >= vti.overlap.of - 3, "VTI holds the whole S&P 500, so nearly all of VOO's flagged companies");
  assert.equal(a.rows.find((r) => r.current).overlap, null, "no overlap line for the fund itself");
});

test("every row carries its numbers and date", () => {
  for (const g of FUND_GROUPS) {
    for (const r of alternatives({ keys: SCREEN_KEYS, group: g.key }).rows) {
      assert.ok(r.totalCompanies > 0, `${r.symbols[0]} has no total`);
      assert.ok(r.asOf, `${r.symbols[0]} has no date`);
      assert.ok(FUNDS[r.symbols[0]], r.symbols[0]);
    }
  }
});

console.log(`\n${passed} alternatives tests passed ✓`);
