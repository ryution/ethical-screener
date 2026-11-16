import assert from "node:assert/strict";
import { parsePortfolioCsv, csvRows } from "../../src/portfolioCsv.js";
import { checkPortfolio } from "../lib/portfolio.js";
import { SCREEN_KEYS } from "../lib/screens.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("Portfolio CSV upload");

test("quoted fields with commas and escaped quotes", () => {
  assert.deepEqual(csvRows('a,"b, c","say ""hi"""\r\n1,2,3'), [["a", "b, c", 'say "hi"'], ["1", "2", "3"]]);
});

test("a Fidelity-style export: notes below, cash marked **, same symbol in two accounts", () => {
  const csv = [
    "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value",
    'X1,Brokerage,SPAXX**,HELD IN MONEY MARKET,,,"$1,200.00"',
    'X1,Brokerage,VOO,VANGUARD S&P 500 ETF,10,$500.00,"$5,000.00"',
    "X2,Roth IRA,VOO,VANGUARD S&P 500 ETF,2.5,$500.00,$1250.00",
    "X2,Roth IRA,XOM,EXXON MOBIL CORP,4,$110.00,$440.00",
    "",
    '"The data and information in this spreadsheet is provided to you solely for your use."',
  ].join("\n");
  const h = parsePortfolioCsv(csv);
  assert.deepEqual(h.find((x) => x.symbol === "VOO"), { symbol: "VOO", quantity: 12.5, valueCents: 625000 });
  assert.equal(h.find((x) => x.symbol === "SPAXX").valueCents, 120000);
  assert.equal(h.length, 3);
});

test("a title line above the header, and a Ticker column with no values", () => {
  const h = parsePortfolioCsv('"Positions for account Individual as of 11/16/2026"\n\nTicker,Shares\nAAPL,3\nBRK/B,1\n');
  assert.deepEqual(h, [{ symbol: "AAPL", quantity: 3, valueCents: null }, { symbol: "BRK.B", quantity: 1, valueCents: null }]);
});

test("a file with no Symbol column says so", () => {
  assert.throws(() => parsePortfolioCsv("Name,Amount\nApple,3"), /Symbol or Ticker/);
});

test("checking: flagged stock, fund with dollars, commodity fund not analyzed, unknown symbol", () => {
  const r = checkPortfolio([
    { symbol: "XOM", valueCents: 44000 },
    { symbol: "VOO", valueCents: 625000 },
    { symbol: "PDBC", valueCents: 10000 },
    { symbol: "ZZZZQ", valueCents: 100 },
  ], SCREEN_KEYS);
  const by = Object.fromEntries(r.rows.map((x) => [x.symbol, x]));
  assert.equal(by.XOM.kind, "stock");
  assert.ok(by.XOM.flags.length > 0);
  assert.equal(by.VOO.kind, "fund");
  assert.ok(by.VOO.flaggedCount > 0);
  if (by.VOO.exposureCents != null) assert.ok(by.VOO.exposureCents > 0 && by.VOO.exposureCents < 625000);
  assert.equal(by.PDBC.kind, "not_analyzed");
  assert.equal(by.ZZZZQ.kind, "unknown");
  assert.equal(r.summary.totalCents, 44000 + 625000 + 10000 + 100);
});

test("no categories selected means nothing is flagged", () => {
  const r = checkPortfolio([{ symbol: "XOM" }, { symbol: "VOO" }], []);
  assert.equal(r.summary.directFlagged, 0);
  assert.equal(r.summary.fundsWithFlags, 0);
});

console.log(`\n${passed} portfolio tests passed ✓`);
