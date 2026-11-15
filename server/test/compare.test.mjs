import assert from "node:assert/strict";
import { compareFunds, fundColumn } from "../../src/compare.js";
import { lookupSymbol } from "../lib/analyzer.js";
import { SCREEN_KEYS } from "../lib/screens.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

const ALL = SCREEN_KEYS;
const look = (...syms) => syms.map((s) => lookupSymbol(s));
const cmp = (syms, keys = ALL) => compareFunds(look(...syms), keys);

console.log("compare: what it refuses to do");

test("a fund we don't analyze is excluded, never the loser by default", () => {
  const c = cmp(["VOO", "VEA"]);
  assert.deepEqual(c.analyzed, ["VOO"]);
  assert.equal(c.verdict.winner, null, "one column left means no winner");
  const vea = c.verdict.excluded.find((e) => e.symbol === "VEA");
  assert.ok(vea, "VEA should be named as excluded");
  assert.match(vea.reason, /international/i, "and told why, in the reader's words");
});

test("a company is not a fund, and says so rather than scoring zero", () => {
  const col = fundColumn(lookupSymbol("XOM"), ALL);
  assert.equal(col.analyzed, false);
  assert.match(col.reason, /company, not a fund/i);
  assert.equal(col.grade, null, "no grade is invented for it");
});

test("with no categories selected there is no verdict at all", () => {
  const c = cmp(["VOO", "QQQ"], []);
  assert.equal(c.verdict.kind, "none");
  assert.equal(c.verdict.winner, null);
  assert.match(c.verdict.headline, /No categories selected/i);
});

test("two funds tracking the same index are called identical, not ranked", () => {
  const c = cmp(["VOO", "SPY"]);
  assert.equal(c.verdict.kind, "same");
  assert.equal(c.verdict.winner, null, "there is no winner between two cuts of one index");
  assert.match(c.verdict.detail, /no difference between them/i);
});

test("ranking two different indexes always carries the different-index caveat", () => {
  const c = cmp(["VOO", "EFIV"]);
  assert.equal(c.verdict.kind, "ranked");
  assert.ok(c.verdict.caveats.some((x) => /different indexes/i.test(x)),
    "a lighter index is not a better conscience, and the verdict must say so");
});

test("funds with holdings from different dates say so", () => {
  const c = cmp(["VOO", "QQQ"]);
  assert.ok(c.verdict.caveats.some((x) => /different dates/.test(x) && /VOO on/.test(x) && /QQQ on/.test(x)));
  const same = cmp(["VOO", "EFIV"]);
  assert.ok(!same.verdict.caveats.some((x) => /different dates/.test(x)), "both SPDR files share a date");
});

test("a fund with no published total is shown but never ranked", () => {
  // QQQ now has a real total from its SEC filing, so remove it here to test the case of a
  // fund we can see inside but can't divide. Guessing the total is what this must not do.
  const qqq = { ...lookupSymbol("QQQ"), totalHoldings: null, totalCompanies: null };
  const c = compareFunds([lookupSymbol("VOO"), qqq], ALL);
  assert.deepEqual(c.analyzed, ["VOO", "QQQ"], "we can still see inside both");
  assert.deepEqual(c.rankable, ["VOO"]);
  assert.equal(c.verdict.kind, "listed");
  assert.equal(c.verdict.winner, null, "no winner without a denominator");
  assert.ok(c.verdict.unranked.some((u) => u.symbol === "QQQ"));
  assert.ok(c.categories.length, "the side-by-side table is still built");
});

test("every verdict says fewer flags does not mean clean", () => {
  for (const pair of [["VOO", "QQQ"], ["VOO", "SPY"], ["VTI", "XLV"], ["VOO", "EFIV"]]) {
    const c = cmp(pair);
    assert.ok(c.verdict.caveats.some((x) => /doesn't mean a fund is clean/i.test(x)), pair.join(" vs "));
    assert.ok(c.verdict.caveats.some((x) => /fees, returns/i.test(x)), pair.join(" vs "));
  }
});

console.log("\ncompare: the numbers");

test("the winner is the smaller share of holdings graded on conduct", () => {
  const c = cmp(["VOO", "EFIV"]);
  const [voo, efiv] = c.funds;
  assert.ok(voo.rankable && efiv.rankable);
  const expected = voo.grade.share <= efiv.grade.share ? "VOO" : "EFIV";
  assert.equal(c.verdict.winner, expected);
  assert.equal(c.verdict.winner, "EFIV", "the ESG cut of the same index holds fewer settled names");
});

test("both numerators and both denominators are shown, so the division can be redone", () => {
  const c = cmp(["VTI", "XLV"]);
  for (const f of c.funds.filter((x) => x.rankable)) {
    assert.match(c.verdict.detail, new RegExp(`${f.symbol}: ${f.grade.conduct} of ${f.grade.totalHoldings} holdings`));
    assert.equal(f.grade.share, Number(((100 * f.grade.conduct) / f.grade.totalHoldings).toFixed(2)));
  }
});

test("a concentrated sector fund loses to the whole market on conduct", () => {
  const c = cmp(["VTI", "XLV"]);
  assert.equal(c.verdict.winner, "VTI", "XLV concentrates the opioid-settlement names");
});

test("a category in one fund and not the other is marked as exclusive", () => {
  const c = cmp(["VOO", "QQQ"]);
  const tobacco = c.categories.find((r) => r.key === "tobacco");
  assert.ok(tobacco, "the S&P 500 holds tobacco companies");
  assert.equal(tobacco.only, "VOO", "and the Nasdaq-100 does not");
  assert.equal(tobacco.counts.QQQ, 0);
  assert.ok(tobacco.counts.VOO > 0);
});

test("companies both funds hold are shared; the rest belong to exactly one", () => {
  const c = cmp(["VOO", "QQQ"]);
  const names = (list) => list.map((x) => x.name);
  assert.ok(names(c.companies.shared).length, "both hold the data/ad giants");
  assert.ok(names(c.companies.only.VOO).length, "VOO holds oil and defense besides");
  for (const n of names(c.companies.only.QQQ)) {
    assert.ok(!names(c.companies.shared).includes(n), `${n} cannot be both exclusive and shared`);
  }
});

test("one company with two share classes is counted once", () => {
  const c = cmp(["VOO", "QQQ"]);
  const qqq = c.funds.find((f) => f.symbol === "QQQ");
  const names = qqq.contains.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, "GOOGL and GOOG are one company");
});

test("narrowing the categories narrows every number on the page", () => {
  const wide = cmp(["VOO", "QQQ"]);
  const narrow = cmp(["VOO", "QQQ"], ["fossil_fuels"]);
  const vooWide = wide.funds[0].flagged;
  const vooNarrow = narrow.funds[0].flagged;
  assert.ok(vooNarrow < vooWide, "fewer categories, fewer flagged companies");
  assert.equal(narrow.categories.length, 1, "and only the category they kept");
  assert.equal(narrow.selectedCount, 1);
});

test("a values set with no court findings is never ranked on two zeroes", () => {
  // A halal or Catholic set is about what a company SELLS. Nothing in it is a court
  // finding, so both funds sit at 0 per 100 on conduct, and "the smaller share, 0
  // against 0" is the sentence that would make a reader stop believing the page.
  const halal = ["alcohol", "gambling", "tobacco", "adult", "pork", "interest_finance"];
  const c = cmp(["VOO", "EFIV"], halal);
  assert.equal(c.funds[0].grade.share, 0);
  assert.equal(c.funds[1].grade.share, 0);
  assert.equal(c.verdict.kind, "tie");
  assert.equal(c.verdict.winner, null);
  assert.doesNotMatch(c.verdict.detail, /0 per 100 against 0/);
  assert.match(c.verdict.detail, /Neither fund holds a company with a government finding/i);
});

test("a gap under one in a hundred is not called a difference", () => {
  const halal = ["alcohol", "gambling", "tobacco", "adult", "pork", "interest_finance"];
  const c = cmp(["VOO", "EFIV"], halal);
  const [a, b] = c.funds.map((f) => f.grade.businessShare).sort((x, y) => x - y);
  assert.ok(b - a < 1, "this pair really is that close");
  assert.match(c.verdict.detail, /too small to count/i);
});

test("a real gap on what they sell still names the lighter fund", () => {
  const c = cmp(["VOO", "XLV"], ["fossil_fuels"]);
  assert.equal(c.verdict.kind, "ranked");
  assert.equal(c.verdict.winner, "XLV", "a health-care fund holds no oil companies");
  assert.match(c.verdict.detail, /compared the share of flagged companies instead/i);
});

console.log(`\n${passed} compare tests passed ✓`);
