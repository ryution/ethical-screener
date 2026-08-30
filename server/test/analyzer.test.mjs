import assert from "node:assert/strict";
import { analyze } from "../lib/analyzer.js";
import { flagsFor, isScreenKey, screenCatalogue, companyName } from "../lib/screens.js";
import { knownFund } from "../lib/funds.js";
import { screensForSic } from "../lib/sic.js";
import { normalizeTicker } from "../lib/symbols.js";
import { suggest } from "../lib/suggest.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

// Mirrors the real SnapTrade sandbox portfolio shape.
const positions = [
  { account: "Ind", symbol: "AAPL",  description: "Apple Inc.",      kind: "stock",      units: 5,   price: 180.5, valueCents: 90250 },
  { account: "Ind", symbol: "XOM",   description: "ExxonMobil",      kind: "stock",      units: 10,  price: 110,   valueCents: 110000 },
  { account: "Ind", symbol: "LMT",   description: "Lockheed Martin", kind: "stock",      units: 2,   price: 450,   valueCents: 90000 },
  { account: "Ind", symbol: "VOO",   description: "Vanguard S&P 500",kind: "etf",        units: 15,  price: 500,   valueCents: 750000 },
  { account: "IRA", symbol: "ARKK",  description: "ARK Innovation",  kind: "etf",        units: 10,  price: 50,    valueCents: 50000 },
  { account: "Ind", symbol: "BTC",   description: "Bitcoin",         kind: "crypto",     units: 0.25,price: 59000, valueCents: 1475000 },
];

console.log("screens:");
test("keys are recognized", () => assert.ok(isScreenKey("fossil_fuels") && isScreenKey("weapons")));
test("unknown key rejected", () => assert.equal(isScreenKey("nonsense"), false));
test("XOM flags fossil fuels when active", () => assert.equal(flagsFor("XOM", ["fossil_fuels"]).length, 1));
test("DRS and AERG are curated as weapons (moved off the too-broad SIC 3812 rule)", () => {
  assert.equal(flagsFor("DRS", ["weapons"]).length, 1);
  assert.equal(flagsFor("AERG", ["weapons"]).length, 1);
});
test("XOM does not flag if screen is off", () => assert.equal(flagsFor("XOM", ["weapons"]).length, 0));
test("case-insensitive ticker match", () => assert.equal(flagsFor("xom", ["fossil_fuels"]).length, 1));
test("companyName resolves from reason", () => assert.equal(companyName("XOM"), "ExxonMobil"));
test("catalogue exposes counts, not reasons", () => assert.ok(screenCatalogue.every((s) => typeof s.count === "number" && s.tickers === undefined)));
test("executive_enforcement is a recognized screen key", () => assert.ok(isScreenKey("executive_enforcement")));
test("TSLA/IEP/MSTR flag executive_enforcement", () => {
  assert.equal(flagsFor("TSLA", ["executive_enforcement"]).length, 1);
  assert.equal(flagsFor("IEP", ["executive_enforcement"]).length, 1);
  assert.equal(flagsFor("MSTR", ["executive_enforcement"]).length, 1);
});
test("companyName resolves to the COMPANY, not the executive, for executive_enforcement tickers", () => {
  // Reason format is "Company — Exec did X"; a bug here would leak the exec's name into
  // the company-name slot used elsewhere in the UI (e.g. inside fund look-through).
  assert.equal(companyName("TSLA"), "Tesla");
  assert.equal(companyName("IEP"), "Icahn Enterprises");
});
test("historical_forced_labor is a recognized screen key", () => assert.ok(isScreenKey("historical_forced_labor")));
test("WWII-era forced labor entries flag correctly, each with its own company name", () => {
  for (const [ticker, name] of [["VWAGY", "Volkswagen"], ["F", "Ford"], ["IBM", "IBM"], ["BAYRY", "Bayer"], ["BASFY", "BASF"]]) {
    assert.equal(flagsFor(ticker, ["historical_forced_labor"]).length, 1);
    assert.equal(companyName(ticker), name);
  }
});
test("WWII-era forced labor reasons state restitution status either way, not one-sided", () => {
  const reasonFor = (t) => flagsFor(t, ["historical_forced_labor"])[0].reason;
  assert.ok(/restitution|compensation/i.test(reasonFor("VWAGY")));
  assert.ok(/not made a public apology|restitution/i.test(reasonFor("IBM")));
});
test("forced_labor_supply_chain is a recognized screen key", () => assert.ok(isScreenKey("forced_labor_supply_chain")));
test("Zijin Mining (both ADR tickers) flags forced_labor_supply_chain, citing UFLPA and CBP by name", () => {
  for (const t of ["ZIJMY", "ZIJMF"]) {
    const f = flagsFor(t, ["forced_labor_supply_chain"]);
    assert.equal(f.length, 1);
    assert.match(f[0].reason, /UFLPA/);
    assert.match(f[0].reason, /Withhold Release Order/);
    assert.equal(companyName(t), "Zijin Mining Group");
  }
});
test("supplier_audit_violations is a recognized screen key", () => assert.ok(isScreenKey("supplier_audit_violations")));
test("AAPL flags supplier_audit_violations, citing Apple's own disclosed figures", () => {
  const f = flagsFor("AAPL", ["supplier_audit_violations"]);
  assert.equal(f.length, 1);
  assert.match(f[0].reason, /Core Violations/);
  assert.match(f[0].reason, /\$34\.5M/);
  assert.equal(companyName("AAPL"), "Apple");
});
test("supplier_audit_violations reason states remediation, not just the violation count", () => {
  const reason = flagsFor("AAPL", ["supplier_audit_violations"])[0].reason;
  assert.match(reason, /repay/i);
  assert.match(reason, /no instances of forced labor/i);
});

console.log("funds:");
test("VOO is a known fund", () => assert.ok(knownFund("VOO")));
test("VOO holds Exxon and Lockheed", () => { const f = knownFund("VOO"); assert.ok(f.holds.includes("XOM") && f.holds.includes("LMT")); });
test("ARKK is not a known fund", () => assert.equal(knownFund("ARKK"), null));

console.log("analyzer — direct stocks:");
test("flags exactly the conflicted stocks", () => {
  const a = analyze(positions, ["fossil_fuels", "weapons"]);
  assert.deepEqual(a.conflictedStocks.map((h) => h.symbol).sort(), ["LMT", "XOM"]);
});
test("direct dollar attribution", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  assert.equal(a.summary.directConflictValueCents, 110000); // XOM only
});
test("crypto is not analyzed", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  assert.equal(a.holdings.find((h) => h.symbol === "BTC").analyzable, false);
});

console.log("analyzer — fund look-through:");
test("VOO is looked into and flagged", () => {
  const a = analyze(positions, ["fossil_fuels", "weapons"]);
  const voo = a.holdings.find((h) => h.symbol === "VOO");
  assert.equal(voo.lookThrough, true);
  assert.equal(voo.conflicted, true);
});
test("VOO surfaces the flagged companies it holds", () => {
  const a = analyze(positions, ["tobacco"]);
  const voo = a.holdings.find((h) => h.symbol === "VOO");
  const names = voo.contains.map((c) => c.ticker);
  assert.ok(names.includes("MO") && names.includes("PM"));
});
test("VOO respects the active screens", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  const voo = a.holdings.find((h) => h.symbol === "VOO");
  assert.ok(voo.contains.every((c) => c.flags.every((f) => f.key === "fossil_fuels")));
});
test("unknown fund ARKK stays not-analyzed, never called clean", () => {
  const a = analyze(positions, ["fossil_fuels", "weapons"]);
  const arkk = a.holdings.find((h) => h.symbol === "ARKK");
  assert.equal(arkk.analyzable, false);
  assert.equal(arkk.conflicted, false);
});
test("funds are counted by company, not dollars", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  // VOO conflict must NOT add to the direct dollar figure.
  assert.equal(a.summary.directConflictValueCents, 110000);
  assert.equal(a.summary.fundConflictCount, 1);
});
test("byFlag rolls up stock dollars and fund companies", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  const fossil = a.summary.byFlag.find((f) => f.key === "fossil_fuels");
  assert.equal(fossil.valueCents, 110000);   // XOM
  assert.equal(fossil.directHoldings, 1);
  assert.ok(fossil.fundCompanies > 1);        // VOO holds many fossil names
});
test("summary counts analyzed vs opaque funds", () => {
  const a = analyze(positions, ["fossil_fuels"]);
  assert.equal(a.summary.analyzedFunds, 1);   // VOO
  assert.equal(a.summary.opaqueFunds, 1);     // ARKK
});
test("no active screens -> nothing conflicted", () => {
  const a = analyze(positions, []);
  assert.equal(a.conflictedStocks.length, 0);
  assert.equal(a.conflictedFunds.length, 0);
});

console.log("SIC classification (EDGAR enrichment):");
test("crude petroleum → fossil fuels", () => assert.deepEqual(screensForSic(1311), ["fossil_fuels"]));
test("petroleum refining → fossil fuels", () => assert.deepEqual(screensForSic(2911), ["fossil_fuels"]));
test("cigarettes → tobacco", () => assert.deepEqual(screensForSic(2111), ["tobacco"]));
test("malt beverages → alcohol", () => assert.deepEqual(screensForSic(2082), ["alcohol"]));
test("generic 'Beverages' (2080) does NOT flag alcohol — Coca-Cola false positive", () => assert.deepEqual(screensForSic(2080), []));
test("small arms → firearms (narrow, clean code)", () => assert.deepEqual(screensForSic(3484), ["firearms"]));
test("guided missiles (3760) NOT auto-flagged — coarse code, curated only (Garmin/space false positives)", () => assert.deepEqual(screensForSic(3760), []));
test("nav/detection/aero (3812) NOT auto-flagged — sweeps in Garmin, curated only", () => assert.deepEqual(screensForSic(3812), []));
test("poultry processing → factory farming", () => assert.deepEqual(screensForSic(2015), ["factory_farming"]));
test("personal credit (6141) NOT auto-flagged — sweeps in student/BNPL/cards, curated only", () => assert.deepEqual(screensForSic(6141), []));
test("misc petroleum & coal (2990) NOT auto-flagged — sweeps in lubricants/chemicals", () => assert.deepEqual(screensForSic(2990), []));
test("electronic computers (Apple) → nothing", () => assert.deepEqual(screensForSic(3571), []));
test("empty/zero SIC → nothing", () => { assert.deepEqual(screensForSic(0), []); assert.deepEqual(screensForSic(null), []); });

console.log("symbol normalization:");
test("dash class share -> dot (BF-B -> BF.B)", () => assert.equal(normalizeTicker("BF-B"), "BF.B"));
test("squashed class share -> dot (BFB -> BF.B)", () => assert.equal(normalizeTicker("BFB"), "BF.B"));
test("spaced class share -> dot (BF B -> BF.B)", () => assert.equal(normalizeTicker("BF B"), "BF.B"));
test("already-canonical ticker passes through", () => assert.equal(normalizeTicker("BF.B"), "BF.B"));
test("lowercase input normalized", () => assert.equal(normalizeTicker("bf-b"), "BF.B"));
test("unrelated ticker is untouched, not guessed at", () => assert.equal(normalizeTicker("BRKB"), "BRKB"));
test("empty/null input", () => { assert.equal(normalizeTicker(""), ""); assert.equal(normalizeTicker(null), ""); });

console.log("search autocomplete:");
test("'tes' surfaces Tesla, not mid-word noise like AMERICAN STATES WATER", () => {
  const symbols = suggest("tes").map((r) => r.symbol);
  assert.ok(symbols.includes("TSLA"));
  assert.ok(!symbols.includes("AWR")); // "STATES" contains "tes" mid-word, not a real match
});
test("exact ticker match ranks first", () => assert.equal(suggest("VOO")[0]?.symbol, "VOO"));
test("a query with no matches returns empty, not an error", () => assert.deepEqual(suggest("zzzzzzznotarealquery"), []));

console.log(`\n${passed} analyzer tests passed ✓`);
