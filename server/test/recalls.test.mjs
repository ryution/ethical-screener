import assert from "node:assert/strict";
import { assessRecalls, recallProfile, recallTickers, recallMeta } from "../lib/recalls.js";
import { conductSignalsFor, CONDUCT_KEYS } from "../lib/conduct.js";
import { conductGradeFor, CONDUCT_CATEGORIES } from "../../src/conductGrade.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("recalls — severity, not volume:");

test("a recall is an event, never a record", () => {
  // openFDA files one record per affected model or lot, so one recall fans out into
  // dozens. Medtronic's 2023 defibrillator recall — one issue, one letter to hospitals —
  // is 123 records. Counting records put Medtronic at 33.2% Class I when the true figure
  // is 11.7%, and understated Zimmer at 0.3% when it is 1.2%: the error runs in both
  // directions, so it distorted the comparison between them as well as the levels.
  const zbh = recallProfile("ZBH").find((p) => p.kind === "device");
  const mdt = recallProfile("MDT").find((p) => p.kind === "device");
  assert.ok(zbh.records > mdt.records, "Zimmer files more RECORDS");
  assert.ok(zbh.recalls < mdt.recalls, "and yet fewer actual recalls");
  // Which is the whole point: counting the wrong unit reverses the ranking.
  assert.ok(zbh.share < mdt.share / 5, "Zimmer's are far less often serious");
  assert.equal(assessRecalls("ZBH").rung, null);
});

test("severity still beats volume once the unit is right", () => {
  const zbh = recallProfile("ZBH").find((p) => p.kind === "device");
  const mdt = recallProfile("MDT").find((p) => p.kind === "device");
  assert.ok(zbh.recalls > 300 && mdt.recalls > 300, "both recall a lot");
  assert.ok(zbh.vsBaseline < 1 && mdt.vsBaseline > 1.5, "only one is above its field");
});

test("a share above its field is graded, at the rung the ratio earns", () => {
  // Both sat on D while recalls were counted as records. Deduplicated to events they are
  // 1.78x and 1.95x their field — above it, but short of the 2x a pattern needs.
  for (const t of ["MDT", "BSX"]) {
    const a = assessRecalls(t);
    assert.equal(a.rung, "C", t);
    assert.ok(a.detail.includes("Class I"), t);
  }
});

test("a share modestly above its field is one measure (C)", () => {
  const a = assessRecalls("CAH");
  assert.equal(a.rung, "C");
  const dev = recallProfile("CAH").find((p) => p.kind === "device");
  assert.ok(dev.vsBaseline >= 1.15 && dev.vsBaseline < 2);
});

test("the baseline is counted the same way as a company", () => {
  // A record-counted company against an event-counted field would be nonsense. Both
  // sides come from distinct event_ids over the same window.
  for (const t of recallTickers()) {
    for (const p of recallProfile(t)) {
      if (!p.ratable) continue;
      assert.ok(p.recalls <= p.records, `${t} ${p.kind}: events cannot exceed records`);
      assert.ok(p.baseline > 0 && p.baseline < 0.6, `${t} ${p.kind} baseline ${p.baseline}`);
    }
  }
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
  assert.equal(assessRecalls("BSX").rung, "C");
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
  assert.equal(ps.rung, "C");
  assert.equal(conductGradeFor(sigs, CONDUCT_KEYS.length).letter, "C");
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
