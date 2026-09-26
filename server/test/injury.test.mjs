import assert from "node:assert/strict";
import { assessInjury, injuryYears, latestInjury, injuryTickers, injuryMeta } from "../lib/injury.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("injury rates — the data:");

test("every company's rate is normalised by hours, not headcount", () => {
  for (const t of injuryTickers()) {
    for (const y of injuryYears(t)) {
      assert.ok(y.hours > 0, `${t} ${y.year} has no hours`);
      // DART = (dafw + djtr) × 200,000 / hours. A rate is a small number; a count is not.
      assert.ok(y.dart >= 0 && y.dart < 100, `${t} ${y.year} dart=${y.dart} is not a rate`);
    }
  }
});

test("implausible filings never reach the output", () => {
  // Filers mistype the hours box — one 2025 establishment reports 140 billion hours for
  // 137 people. A full-time year is ~2,000 hours, so anything outside a wide band around
  // that is a data-entry error, and one left in swamps every aggregate it touches.
  for (const t of injuryTickers()) {
    for (const y of injuryYears(t)) {
      assert.ok(y.hoursPerEmployee >= 100 && y.hoursPerEmployee <= 4000,
        `${t} ${y.year} hours/employee = ${y.hoursPerEmployee}`);
    }
  }
});

test("industry benchmarks are plausible rates, not artefacts", () => {
  // Before the plausibility filter, garbage hours drove the warehousing benchmark to a
  // DART of 0.1, which made every real warehouse look ~40× worse than its industry.
  for (const t of injuryTickers()) {
    const y = latestInjury(t);
    if (y.industryDart == null) continue;
    assert.ok(y.industryDart > 0.3 && y.industryDart < 30,
      `${t} industry benchmark ${y.industryDart} is not a believable rate`);
  }
});

console.log("injury rates — the ladder:");

test("a sustained above-industry rate is a pattern (D)", () => {
  const a = assessInjury("AMZN");
  assert.equal(a.rung, "D");
  assert.ok(a.streak >= 3);
  assert.match(a.headline, /years running/);
});

test("a single above-industry year is not a pattern (C)", () => {
  const a = assessInjury("COST");
  assert.equal(a.rung, "C", "Costco's 2025 establishment count doubled, so the streak cannot carry");
});

test("a coverage shift cannot extend a streak", () => {
  // Costco is above benchmark in all three years, but its filed establishment count went
  // 711 → 1,511. That is a different population, so the trend would measure our coverage
  // rather than their conduct.
  const years = injuryYears("COST");
  const latest = years[years.length - 1];
  assert.ok(latest.coverageShift, "expected the coverage shift to be recorded");
  assert.ok(years.every((y) => y.vsIndustry >= 1.15), "all three years are above benchmark");
  assert.equal(assessInjury("COST").rung, "C", "yet it must not be graded as a 3-year pattern");
});

test("at or below benchmark yields no rung at all", () => {
  for (const t of ["WMT", "UPS"]) {
    const a = assessInjury(t);
    assert.equal(a.rung, null, t);
    assert.ok(a.latest.vsIndustry < 1.15, t);
  }
});

test("a low rate is never described as safe", () => {
  const a = assessInjury("WMT");
  assert.match(a.headline, /No adverse measure/);
  // The asymmetry must be stated where a reader would otherwise hear a guarantee:
  // nobody over-reports injuries, so a low number is the weakest evidence we handle.
  assert.match(a.detail, /under-reporting is documented/i);
  // "safe workplace" may appear only where it is being denied.
  const text = `${a.headline} ${a.detail}`;
  for (const m of text.matchAll(/safe workplace/gi)) {
    assert.match(text.slice(Math.max(0, m.index - 6), m.index), /\bnot a $/i,
      `"safe workplace" must be negated, got: …${text.slice(Math.max(0, m.index - 30), m.index + 16)}`);
  }
});

test("an unknown company gets nothing rather than a pass", () => {
  const a = assessInjury("NOSUCHTICKER");
  assert.equal(a.rung, null);
  assert.equal(a.headline, null);
  assert.deepEqual(a.years, []);
});

test("F is never awarded from rate data alone", () => {
  // An F needs a regulator's own severity finding — willful, repeat, failure-to-abate or
  // General Duty — which lives in OSHA's enforcement data, not the 300A summaries.
  for (const t of injuryTickers()) {
    assert.notEqual(assessInjury(t).rung, "F", t);
  }
});

test("the dataset carries its own provenance", () => {
  const m = injuryMeta();
  assert.match(m.source, /OSHA/);
  assert.ok(m.years.length >= 1);
  assert.ok(m.count > 0);
});

console.log(`\n${passed} injury tests passed ✓`);
