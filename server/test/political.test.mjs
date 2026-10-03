import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { politicalFor, politicalTickers, politicalMeta } from "../lib/political.js";
import { lookupSymbol } from "../lib/analyzer.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };
const here = dirname(fileURLToPath(import.meta.url));
// Comments explain the rule; the code has to obey it. Strip them before asserting, or a
// file that says "this module exports no rung" fails its own check.
const code = (p) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

console.log("political — shown, never graded:");

test("the module exports no rung, letter or grade", () => {
  // Structural rather than a policy anyone has to remember. Lobbying is lawful and every
  // large company does it; grading it would make the site partisan and would break the
  // promise that the lines belong to the reader.
  const src = code(join(here, "..", "lib", "political.js"));
  assert.doesNotMatch(src, /\brung\b/, "political.js must not assign a rung");
  assert.doesNotMatch(src, /\bletter\b/, "political.js must not assign a letter");
  for (const t of politicalTickers()) {
    const p = politicalFor(t);
    for (const l of p.lines) {
      assert.ok(!("rung" in l) && !("letter" in l), `${t} ${l.key}`);
    }
  }
});

test("neither grading module can see political data", () => {
  for (const f of ["grade.js", "conductGrade.js"]) {
    const src = code(join(here, "..", "..", "src", f));
    assert.doesNotMatch(src, /politic|lobby/i, `src/${f}`);
  }
  const src = code(join(here, "..", "lib", "conduct.js"));
  assert.doesNotMatch(src, /politic|lobby/i, "conduct.js must not consume it");
});

console.log("political — the figures:");

test("every published figure says who filed it", () => {
  for (const t of politicalTickers()) {
    for (const l of politicalFor(t).lines) {
      assert.ok(l.source, `${t} ${l.key} has no source`);
      assert.ok(l.value.startsWith("$"), `${t} ${l.key}`);
    }
  }
});

test("a lobbying total is read to the end of the year, or says it was not", () => {
  // LDA caps a page at 25 rows whatever page_size asks for. A single call summed the
  // first 25 of Walmart's 53 filings and reported $3.3M for a year that is $10.7M.
  for (const t of politicalTickers()) {
    for (const y of politicalFor(t).lobbying) {
      if (y.complete) { assert.ok(y.scanned >= (y.ofFilings || 0), `${t} ${y.year}`); continue; }
      const line = politicalFor(t).lines.find((l) => l.key === "lobbying");
      if (line) assert.match(line.detail, /could not read every filing/, `${t} ${y.year}`);
    }
  }
});

test("a company's figure excludes other companies with similar names", () => {
  // "TARGET CORP" strips to "Target", which accepts TARGET HOSPITALITY CORP — a different
  // listed company — plus MARATHON TARGETS and PIXELS ON TARGET. Matching on the full
  // filed name recovered about $800k of other companies' lobbying from Target's total.
  const tgt = politicalFor("TGT");
  if (!tgt?.lobbying?.length) return;
  for (const y of tgt.lobbying) assert.equal(y.filings, y.scanned, `${y.year}: every scanned filing should be Target's own`);
});

test("finding nothing is reported as a finding, not a failure", () => {
  const cost = politicalFor("COST");
  if (!cost) return;
  assert.equal(cost.lines.length, 0);
  assert.match(cost.note, /real answer/i);
  assert.doesNotMatch(cost.note, /could not complete/i);
});

test("an unknown company returns nothing at all", () => {
  assert.equal(politicalFor("NOSUCHTICKER"), null);
});

console.log("political — wiring:");

test("it rides on the result beside the grades", () => {
  const r = lookupSymbol("AMZN");
  assert.ok(r.political, "present on the result");
  assert.ok(r.political.lines.length, "with a figure");
  // And it is not part of either letter.
  assert.ok(!("political" in (r.conduct || {})));
});

test("the dataset carries its own provenance and stance", () => {
  const m = politicalMeta();
  if (!m.count) return;
  assert.match(m.source, /Lobbying Disclosure|Election Commission/);
});

console.log(`\n${passed} political tests passed ✓`);
