import assert from "node:assert/strict";
import { notableInvestorsFor } from "../lib/notable.js";
import { wikiIssue, wikiCompany } from "../lib/wiki.js";
import { lookupSymbol } from "../lib/analyzer.js";
import { SCREEN_KEYS } from "../lib/screens.js";
import { sameCompany } from "../../scripts/fetch-wiki.mjs";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("Learn more and notable investors");

test("Apple lists Berkshire Hathaway, largest stake first, with a filing link", () => {
  const n = notableInvestorsFor("AAPL");
  const b = n.find((x) => x.name === "Berkshire Hathaway");
  assert.ok(b && b.valueUsd > 1e9, "Berkshire's Apple stake is billions");
  assert.match(b.url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1067983\//);
  for (let i = 1; i < n.length; i++) assert.ok(n[i - 1].valueUsd >= n[i].valueUsd);
});

test("no stake is priced at under $1 a share (catches filings reported in thousands)", () => {
  for (const t of ["AAPL", "AMZN", "NVDA", "MSFT", "META"]) {
    for (const x of notableInvestorsFor(t)) if (x.shares > 1000) assert.ok(x.valueUsd / x.shares > 1, `${x.name} ${t}: $${x.valueUsd} for ${x.shares} shares`);
  }
});

test("a stock result carries its notable investors; an unknown symbol has none", () => {
  assert.ok(lookupSymbol("AAPL").notable.length > 0);
  assert.deepEqual(lookupSymbol("ZZZZQ").notable, []);
});

test("every category has a Wikipedia summary, and the adult category has no picture", () => {
  for (const k of SCREEN_KEYS) assert.ok(wikiIssue(k)?.extract, `no summary for ${k}`);
  assert.equal(wikiIssue("adult").image, null);
});

test("company summaries are matched by ticker and images come only from Wikimedia", () => {
  const c = wikiCompany("CVX");
  assert.ok(c && /Chevron/.test(c.title));
  for (const t of ["CVX", "AAPL", "XOM"]) { const w = wikiCompany(t); if (w?.image) assert.match(w.image, /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^?]+$/); }
  assert.ok(wikiIssue("fossil_fuels").image, "the fossil fuels summary has a picture");
});

test("a Wikipedia article is used only when its title matches the company's SEC name", () => {
  assert.equal(sameCompany("TEXTRON INC", "Text_(company)"), false);
  assert.equal(sameCompany("Valaris Ltd", "Valspar"), false);
  assert.equal(sameCompany("Alphabet Inc.", "Google"), false);
  assert.equal(sameCompany("Alphabet Inc.", "Alphabet_Inc."), true);
  assert.equal(sameCompany("EAGLE BANCORP INC", "EagleBank"), true);
  assert.equal(sameCompany("Chevron", "Chevron_Corporation"), true);
});

console.log(`\n${passed} learn-more tests passed ✓`);
