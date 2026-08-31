import assert from "node:assert/strict";
import { displayName, reasonParts } from "../../src/format.js";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("display name normalization:");
test("SHOUTING SEC names become title case", () => {
  assert.equal(displayName("CHEVRON CORP"), "Chevron Corp");
  assert.equal(displayName("ALTRIA GROUP, INC."), "Altria Group, Inc.");
});
test("real initialisms survive — the whole reason we don't blanket title-case", () => {
  for (const t of ["NRG", "AES", "EQT", "PPL", "RTX", "DTE", "CMS", "APA", "IBM"]) {
    assert.equal(displayName(`${t} ENERGY CORP`), `${t} Energy Corp`, t);
  }
});
test("state-of-incorporation markers are stripped, both forms", () => {
  assert.equal(displayName("OCCIDENTAL PETROLEUM CORP /DE/"), "Occidental Petroleum Corp");
  assert.equal(displayName("VALERO ENERGY CORP/TX"), "Valero Energy Corp");
  assert.equal(displayName("DEVON ENERGY CORP/DE"), "Devon Energy Corp");
  assert.equal(displayName("ONEOK Inc /NEW/"), "ONEOK Inc");
});
test("a stacked legal form is not a state marker — SA/NV must survive", () => {
  assert.equal(displayName("Anheuser-Busch InBev SA/NV"), "Anheuser-Busch InBev SA/NV");
});
test("shouting words are fixed even when the name is partly mixed-case", () => {
  assert.equal(displayName("CANADIAN NATURAL RESOURCES Ltd"), "Canadian Natural Resources Ltd");
  assert.equal(displayName("EXPAND ENERGY Corp"), "Expand Energy Corp");
});
test("hand-curated mixed-case names are left alone", () => {
  for (const n of ["Berkshire Hathaway Inc.", "Charles River Labs", "Johnson & Johnson"]) {
    assert.equal(displayName(n), n);
  }
});
test("camelCase brands come from the reviewed map", () => {
  assert.equal(displayName("CONOCOPHILLIPS"), "ConocoPhillips");
  assert.equal(displayName("NISOURCE INC."), "NiSource Inc.");
});
test("empty / junk input doesn't throw", () => {
  assert.equal(displayName(""), "");
  assert.equal(displayName(null), "");
});

console.log("reason formatting:");
test("duplicated company prefix is dropped and the clause re-capitalized", () => {
  const { lead } = reasonParts("Apple — its own report disclosed 10 violations. More detail here.", "Apple");
  assert.ok(lead.startsWith("Its own report"), lead);
});
test("a prefix that isn't the company is left intact", () => {
  const r = "Some Other Co — did a thing. And another.";
  assert.ok(reasonParts(r, "Apple").lead.startsWith("Some Other Co —"));
});
test("first sentence becomes the lead, remainder the detail", () => {
  const { lead, rest } = reasonParts("Tesla — CEO settled charges. Paid a fine. Stepped down.", "Tesla");
  assert.equal(lead, "CEO settled charges.");
  assert.equal(rest, "Paid a fine. Stepped down.");
});
test("decimals and abbreviations don't split the sentence", () => {
  const { lead } = reasonParts("Apple — suppliers repaid $34.5M to workers in the U.S. overall.", "Apple");
  assert.ok(lead.includes("$34.5M"), lead);
  assert.ok(lead.includes("U.S."), lead);
});
test("a single-sentence reason yields no detail block", () => {
  assert.equal(reasonParts("Acme — did one thing.", "Acme").rest, "");
});
test("empty reason doesn't throw", () => {
  assert.deepEqual(reasonParts("", "Acme"), { lead: "", rest: "" });
});

console.log(`\n${passed} format tests passed ✓`);
