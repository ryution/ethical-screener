import assert from "node:assert/strict";
import { normName, tickerFor, parseNport } from "../../scripts/fetch-nport.mjs";
import { catalogueTickers, knownFund } from "../lib/funds.js";
import { lookupSymbol } from "../lib/analyzer.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("N-PORT: matching holdings to tickers");

test("legal-form words and punctuation don't stop a name match", () => {
  assert.equal(normName("Exxon Mobil Corp"), normName("EXXON MOBIL CORP"));
  assert.equal(normName("Meta Platforms Inc"), normName("Meta Platforms, Inc."));
  assert.equal(normName("First Community Corp/SC"), normName("FIRST COMMUNITY CORP /SC/"));
  assert.equal(normName("C&amp;F Financial Corp"), normName("C&F FINANCIAL CORP"));
});

test("words that tell companies apart are kept", () => {
  assert.notEqual(normName("Coca-Cola Co"), normName("Coca-Cola Europacific Partners PLC"));
  assert.notEqual(normName("First Capital Inc"), normName("First Citizens BancShares Inc"));
});

test("a ticker in the filing wins, then the CUSIP, then the name", () => {
  const look = { cusip: { "30231G102": "XOM" }, names: new Map([["EXXON MOBIL", "XOM"], ["APPLE", "AAPL"]]) };
  assert.deepEqual(tickerFor({ ticker: "CVX", cusip: "30231G102" }, look), { t: "CVX", how: "ticker" });
  assert.deepEqual(tickerFor({ cusip: "30231G102", name: "Apple Inc" }, look), { t: "XOM", how: "cusip" });
  assert.deepEqual(tickerFor({ isin: "US30231G1022", name: "x" }, look), { t: "XOM", how: "cusip" });
  assert.deepEqual(tickerFor({ cusip: "000000000", name: "Apple Inc." }, look), { t: "AAPL", how: "name" });
});

test("a holding that matches nothing stays unmatched instead of guessed", () => {
  const look = { cusip: {}, names: new Map([["APPLE", "AAPL"]]) };
  assert.equal(tickerFor({ cusip: "123456789", name: "Apple Hospitality REIT Inc" }, look), null);
});

test("only stock held long counts toward the total", () => {
  const h = (cat, payoff, val, name) => `<invstOrSec><name>${name}</name><cusip>000000000</cusip><valUSD>${val}</valUSD><payoffProfile>${payoff}</payoffProfile><assetCat>${cat}</assetCat></invstOrSec>`;
  const xml = `<seriesId>S1</seriesId><seriesName>Fund</seriesName><repPdDate>2026-06-30</repPdDate>` +
    h("EC", "Long", 100, "A Corp") + h("EC", "Short", 50, "B Corp") + h("STIV", "Long", 10, "Cash fund") + h("DE", "Long", 5, "Future") + h("EC", "Long", 0, "Zero Corp");
  const d = parseNport(xml);
  assert.equal(d.asOf, "2026-06-30");
  assert.deepEqual(d.equities.map((e) => e.name), ["A Corp"]);
});

console.log("the fund catalogue");

test("every fund in the catalogue loads, so none shows up as an unknown symbol", () => {
  const missing = catalogueTickers().filter((t) => !knownFund(t));
  assert.deepEqual(missing, [], `these funds have no holdings and would read as unknown: ${missing.join(", ")}`);
});

test("every fund with holdings has a total and a date", () => {
  for (const t of catalogueTickers()) {
    const r = lookupSymbol(t);
    if (r.holdingsSource === "curated constituent list") continue;
    assert.ok(r.totalHoldings > 0, `${t} has no total`);
    assert.ok(r.asOf, `${t} has no date`);
  }
});

test("XBI is a fund with its own daily holdings", () => {
  const r = lookupSymbol("XBI");
  assert.equal(r.type, "fund");
  assert.match(r.holdingsSource, /XBI/);
});

test("QQQ is read from its own filing, not the old four-name list", () => {
  const r = lookupSymbol("QQQ");
  assert.ok(r.totalHoldings > 90, "the Nasdaq-100 holds about 100 companies");
  assert.match(r.holdingsSource, /N-PORT/);
});

test("VTI is read from its own filing, not the S&P 1500", () => {
  const r = lookupSymbol("VTI");
  assert.ok(r.totalHoldings > 3000, `VTI holds about 3,500 stocks, got ${r.totalHoldings}`);
});

console.log(`\n${passed} N-PORT and catalogue tests passed ✓`);
