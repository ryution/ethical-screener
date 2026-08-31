// Audits how every company name and flag reason RENDERS, across the whole dataset —
// curated screens, the EDGAR-enriched layer, and every fund's real holdings.
//
// The display rework (cards, name normalization, lead/detail split) was verified by eye on
// a handful of tickers. This checks all of them, because the failure modes are the kind a
// spot-check misses: a reason with no sentence break, a name the normalizer mangles, a
// company prefix that doesn't match and so never gets stripped.
//
// Run: node scripts/audit-display.mjs

import { screenCatalogue, flagsFor, companyName } from "../server/lib/screens.js";
import { enrichedTickers, enrichedFlagsFor, enrichedName } from "../server/lib/enriched.js";
import { displayName, reasonParts, CANONICAL } from "../src/format.js";

const issues = { blankLead: [], lowercaseLead: [], prefixLeft: [], nameChanged: [], nameSuspect: [], longChip: [], runOn: [] };
const seenTicker = new Set();

function checkReason(ticker, label, reason, company) {
  const { lead, rest } = reasonParts(reason, company || "");
  const where = `${ticker} · ${label}`;
  if (!lead.trim()) { issues.blankLead.push({ where, reason }); return; }
  if (/^[a-z]/.test(lead)) issues.lowercaseLead.push({ where, lead: lead.slice(0, 70) });
  // Prefix should have been stripped; if the lead still opens with "Company —" it wasn't.
  if (/^[^—]{1,60} — /.test(lead)) issues.prefixLeft.push({ where, lead: lead.slice(0, 70) });
  // A single sentence longer than ~260 chars renders as an undifferentiated block: the
  // lead/detail split can't help it because there's no sentence boundary to split on.
  if (!rest && lead.length > 260) issues.runOn.push({ where, len: lead.length, lead: lead.slice(0, 90) + "…" });
}

function checkName(raw) {
  const out = displayName(raw);
  if (out !== raw) issues.nameChanged.push({ from: raw, to: out });
  // A word-looking token left fully uppercase, or a known initialism that got title-cased,
  // is what a bad transform looks like.
  for (const tok of out.split(/\s+/)) {
    // A slash group of short segments is a stacked legal form (SA/NV) — legitimately caps.
    if (tok.includes("/") && tok.split("/").every((s) => s.replace(/[^A-Za-z]/g, "").length <= 3)) continue;
    const bare = tok.replace(/[^A-Za-z]/g, "");
    if (bare.length >= 4 && bare === bare.toUpperCase() && /[AEIOU]/.test(bare)
        && !CANONICAL.has(bare.toUpperCase())) {  // ONEOK etc. are genuinely all-caps
      issues.nameSuspect.push({ name: out, token: tok, why: "word left uppercase" });
    }
  }
  if (out.length > 42) issues.longChip.push({ name: out, len: out.length });
}

// ---- curated screens ----
for (const s of screenCatalogue) {
  for (const t of s.tickers || []) {
    if (seenTicker.has(t)) continue;
    const name = companyName(t);
    for (const f of flagsFor(t) || []) checkReason(t, f.label, f.reason, name);
    if (name) checkName(name);
    seenTicker.add(t);
  }
}

// ---- EDGAR-enriched layer ----
let enrichedCount = 0;
for (const t of enrichedTickers()) {
  const name = enrichedName(t) || t;
  for (const f of enrichedFlagsFor(t) || []) checkReason(t, f.label, f.reason, name);
  checkName(name);
  enrichedCount++;
  seenTicker.add(t);
}

// ---- report ----
const pad = (n) => String(n).padStart(5);
console.log(`\nAudited ${seenTicker.size} tickers (${enrichedCount} from the enriched layer)\n`);

const report = (key, title, fmt, { sample = 8, fatal = false } = {}) => {
  const list = issues[key];
  const uniq = key === "nameChanged" ? list : list;
  console.log(`${fatal && uniq.length ? "✗" : uniq.length ? "!" : "✓"} ${pad(uniq.length)}  ${title}`);
  for (const item of uniq.slice(0, sample)) console.log(`         ${fmt(item)}`);
  if (uniq.length > sample) console.log(`         … and ${uniq.length - sample} more`);
  return uniq.length;
};

const blank = report("blankLead", "reasons that render blank", (i) => `${i.where}`, { fatal: true });
const lower = report("lowercaseLead", "leads starting lowercase", (i) => `${i.where}: "${i.lead}"`, { fatal: true });
const prefix = report("prefixLeft", "company prefix not stripped (duplicated in card)", (i) => `${i.where}: "${i.lead}"`);
report("runOn", "single sentences >260 chars (no split possible)", (i) => `${i.where} (${i.len}): ${i.lead}`);
report("nameSuspect", "names with a word left uppercase", (i) => `${i.name}  ← ${i.token}`);
report("longChip", "names >42 chars (chip will wrap)", (i) => `${i.name} (${i.len})`);
report("nameChanged", "names normalized (expected — sample)", (i) => `${i.from}  →  ${i.to}`, { sample: 12 });

const fatalCount = blank + lower;
console.log(`\n${fatalCount === 0 ? "PASS" : "FAIL"} — ${fatalCount} rendering defect(s); ${prefix} cosmetic prefix leftover(s)\n`);
process.exit(fatalCount === 0 ? 0 : 1);
