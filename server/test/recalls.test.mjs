import assert from "node:assert/strict";
import { assessRecalls, recallProfile, recallTickers, recallMeta } from "../lib/recalls.js";
import { conductSignalsFor, CONDUCT_KEYS } from "../lib/conduct.js";
import { conductGradeFor, CONDUCT_CATEGORIES } from "../../src/conductGrade.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("recalls — severity, not volume:");

test("the measure is the share FDA classed life-threatening, not the count", () => {
  // Zimmer Biomet files MORE device recalls than Medtronic (1,605 vs 1,269) and almost
  // none are serious (0.3% vs 33.2%). Ranked by count Zimmer looks worse; ranked by what
  // can kill somebody it is the other way round by two orders of magnitude.
  const zbh = recallProfile("ZBH").find((p) => p.kind === "device");
  const mdt = recallProfile("MDT").find((p) => p.kind === "device");
  assert.ok(zbh.recalls > mdt.recalls, "Zimmer files more recalls");
  assert.ok(zbh.share < mdt.share / 10, "but a fraction of the serious ones");
  assert.equal(assessRecalls("ZBH").rung, null);
  assert.equal(assessRecalls("MDT").rung, "D");
});

test("a share well above its field is a pattern (D)", () => {
  for (const t of ["MDT", "BSX"]) {
    const a = assessRecalls(t);
    assert.equal(a.rung, "D", t);
    assert.ok(a.detail.includes("Class I"), t);
  }
});

test("a share modestly above its field is one measure (C)", () => {
  const a = assessRecalls("CAH");
  assert.equal(a.rung, "C");
  const dev = recallProfile("CAH").find((p) => p.kind === "device");
  assert.ok(dev.vsBaseline >= 1.15 && dev.vsBaseline < 2);
});

test("recalling often but not dangerously earns no rung", () => {
  // Teva files 294 drug recalls, 2.4% Class I against a 9.7% field average.
  const a = assessRecalls("TEVA");
  assert.equal(a.rung, null);
  assert.match(a.headline, /No adverse measure/);
  assert.match(a.detail, /scale with how much a company ships/);
});

console.log("recalls — refusing to speak:");

test("loose attribution is never graded", () => {
  // Kroger's food recalls are 60.6% Class I, which would flag — but only 11.5% of the
  // matched records are clearly Kroger, so the share describes a crowd.
  const food = recallProfile("KR").find((p) => p.kind === "food");
  assert.ok(food.vsBaseline > 1.15, "would otherwise flag");
  assert.equal(food.ratable, false);
  assert.equal(assessRecalls("KR").rung, null);
});

test("attribution is judged per category, not per company", () => {
  // Boston Scientific's food attribution is poor and its device attribution is perfect.
  // Throwing away the whole company for one bad category would lose a real finding.
  const prof = recallProfile("BSX");
  assert.ok(prof.some((p) => !p.ratable), "one category is unusable");
  assert.ok(prof.some((p) => p.ratable), "another is sound");
  assert.equal(assessRecalls("BSX").rung, "D");
});

test("too small a base is never graded", () => {
  const a = assessRecalls("ABBV");
  assert.equal(a.rung, null);
  assert.match(a.headline, /Too few recalls/);
});

test("an unknown company gets nothing rather than a pass", () => {
  const a = assessRecalls("NOSUCHTICKER");
  assert.equal(a.rung, null);
  assert.equal(a.headline, null);
  assert.deepEqual(a.profile, []);
});

console.log("recalls — wiring:");

test("product safety reaches the conduct grade", () => {
  const sigs = conductSignalsFor("MDT");
  const ps = sigs.find((s) => s.key === "product_safety");
  assert.ok(ps, "signal present");
  assert.equal(ps.rung, "D");
  assert.equal(conductGradeFor(sigs, CONDUCT_KEYS.length).letter, "D");
});

test("a reader who switches it off is not graded on it", () => {
  const sigs = conductSignalsFor("MDT", ["worker_injuries"]);
  assert.ok(!sigs.some((s) => s.key === "product_safety"));
  assert.equal(conductGradeFor(sigs, 1).letter, null);
});

test("the client's category list still matches the server's", () => {
  assert.deepEqual([...CONDUCT_CATEGORIES].sort(), [...CONDUCT_KEYS].sort());
});

test("every rated company clears both gates", () => {
  for (const t of recallTickers()) {
    const a = assessRecalls(t);
    if (!a.rung) continue;
    assert.ok(a.profile.some((p) => p.ratable), t);
  }
  assert.match(recallMeta().source, /FDA/);
});

console.log(`\n${passed} recall tests passed ✓`);
