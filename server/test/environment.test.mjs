import assert from "node:assert/strict";
import { assessEnvironment, environmentProfile, environmentTickers, environmentMeta } from "../lib/environment.js";
import { conductSignalsFor, CONDUCT_KEYS } from "../lib/conduct.js";
import { conductGradeFor, CONDUCT_CATEGORIES } from "../../src/conductGrade.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("environment — attribution:");

test("facility aliases are what make the estate visible at all", () => {
  // EPA names buildings, not employers. Walmart's sites are "WALMART SUPERCENTER 1234"
  // and none of them starts with a name Walmart filed with the SEC, so it matched 3 of
  // 4,902 facilities until FACILITY_ALIASES existed. A 3-facility Walmart would have read
  // as a spotless environmental record.
  const p = environmentProfile("WMT");
  if (!p) return;                       // data not fetched in this checkout
  assert.ok(p.facilities > 1000, `expected a real estate, got ${p.facilities}`);
  assert.ok(p.attributionRate >= 0.8, `attribution ${p.attributionRate}`);
});

test("every rated company clears both gates", () => {
  for (const t of environmentTickers()) {
    const a = assessEnvironment(t);
    if (!a.rung) continue;
    assert.ok(a.profile.attributionRate >= 0.8, `${t} attribution`);
    assert.ok(a.profile.facilities >= 100, `${t} base`);
  }
});

test("a loosely matched company is described, not graded", () => {
  for (const t of environmentTickers()) {
    const p = environmentProfile(t);
    if (p.ratable) continue;
    const a = assessEnvironment(t);
    assert.equal(a.rung, null, t);
    assert.ok(a.headline, `${t} should still say why`);
    assert.match(a.headline, /too loose|Too few/i, t);
  }
});

console.log("environment — the measure:");

test("it is a share of facilities, never a count of them", () => {
  // Walmart runs roughly four thousand regulated facilities and Costco under a thousand.
  // Whoever has more buildings will always have more violations; ranking on that ranks
  // store estates rather than conduct.
  for (const t of environmentTickers()) {
    const p = environmentProfile(t);
    if (p.share == null) continue;
    assert.ok(p.share >= 0 && p.share <= 1, `${t} share ${p.share} is not a proportion`);
  }
});

test("severity is EPA's own designation", () => {
  for (const t of environmentTickers()) {
    const a = assessEnvironment(t);
    if (!a.detail) continue;
    if (a.rung === "F") assert.match(a.detail, /High Priority Violator/);
    if (a.rung === "D" || a.rung === "C") assert.match(a.detail, /significant non-compliance/i);
  }
});

test("no benchmark means no letter", () => {
  for (const t of environmentTickers()) {
    const p = environmentProfile(t);
    if (!p.ratable || p.vsIndustry != null || p.highPriorityViolators > 0) continue;
    assert.equal(assessEnvironment(t).rung, null, t);
  }
});

test("an unknown company gets nothing rather than a pass", () => {
  const a = assessEnvironment("NOSUCHTICKER");
  assert.equal(a.rung, null);
  assert.equal(a.headline, null);
  assert.equal(a.profile, null);
});

console.log("environment — wiring:");

test("it reaches the conduct grade, and switches off with the reader", () => {
  const withIt = conductSignalsFor("WMT");
  const without = conductSignalsFor("WMT", ["worker_injuries"]);
  assert.ok(!without.some((s) => s.key === "environmental_compliance"));
  if (withIt.some((s) => s.key === "environmental_compliance")) {
    assert.ok(conductGradeFor(withIt, CONDUCT_KEYS.length));
  }
});

test("the client's category list still matches the server's", () => {
  assert.deepEqual([...CONDUCT_CATEGORIES].sort(), [...CONDUCT_KEYS].sort());
});

test("the dataset carries its own provenance", () => {
  const m = environmentMeta();
  if (!m.count) return;
  assert.match(m.source, /EPA/);
});

console.log(`\n${passed} environment tests passed ✓`);
