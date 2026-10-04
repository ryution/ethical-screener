// Product safety from openFDA: drug and medical-device recalls.
//
// A different kind of conduct from the injury data — that one is about the people a
// company employs, this one is about the people who use what it makes. Both are the
// company's behaviour rather than its line of business, which is why they share a letter.
//
// FDA supplies the severity, as OSHA and EPA do. A recall is Class I ("reasonable
// probability of serious adverse health consequences or death"), Class II (temporary or
// reversible) or Class III (unlikely to cause harm), and each record says whether the firm
// recalled voluntarily or FDA made it. We never decide how bad a recall is.
//
// Count is again the wrong measure. Boston Scientific has 1,107 device recalls because it
// ships an enormous number of devices; Teva has 294 drug recalls of which 7 are Class I —
// a 2.4% serious rate against an industry average of 9.7%. By count Teva looks alarming;
// by the measure that matters it recalls more often but less dangerously than its peers.
// So the signal is the SHARE that FDA classed as life-threatening, against the share
// across every firm in the same dataset.
//
// COUNT EVENTS, NOT RECORDS. openFDA files one record per affected model or lot, so a
// single recall fans out into dozens. Medtronic's 2023 defibrillator recall — one issue,
// one letter to hospitals — is 123 records. Counting records put Medtronic at 33% Class I
// when the true figure is 11.7%, and understated Zimmer Biomet at 0.3% when it is 1.2%.
// The error runs in both directions, so it distorts comparisons as well as levels.
// `event_id` is the recall; everything else is an inventory line.
//
// Usage:
//   node scripts/fetch-fda-recalls.mjs --seed TEVA,JNJ,ABBV
//
// Output → server/generated/fda-recalls.json

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "server", "generated", "fda-recalls.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEED = argOf("--seed")?.split(",").map((t) => t.trim().toUpperCase()) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 400;   // openFDA allows 240/min unauthenticated; this stays well inside it

// All three are the ENFORCEMENT endpoints. device/recall.json looks like the obvious
// choice and is the wrong one: it carries no severity field at all, so every company came
// back with zero Class I recalls, which would have read as a clean safety record.
const ENDPOINTS = {
  drug: "https://api.fda.gov/drug/enforcement.json",
  device: "https://api.fda.gov/device/enforcement.json",
  food: "https://api.fda.gov/food/enforcement.json",
};

async function fda(base, params) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${base}?${qs}`, { headers: { "User-Agent": UA } });
  const j = await r.json().catch(() => null);
  // openFDA answers "nothing matched" with a 404 and an error body. That is an empty
  // result, not a failure, and must not be recorded as anything worse.
  if (j?.error) {
    if (/NOT_FOUND/i.test(j.error.code || "")) return { results: [], empty: true };
    throw new Error(j.error.code || "openFDA error");
  }
  if (!r.ok) throw new Error(String(r.status));
  return j || { results: [] };
}

const terms = (res) => Object.fromEntries((res.results || []).map((x) => [x.term, x.count]));

// Distinct recall events for a query. openFDA's count returns at most 1,000 terms, so a
// result at the cap is flagged rather than quietly understated.
async function events(base, search) {
  const d = await fda(base, { search, count: "event_id", limit: "1000" });
  const n = (d.results || []).length;
  return { events: n, capped: n >= 1000 };
}

// The baseline has to be counted the same way as a company, and the whole dataset has far
// more than 1,000 events — so walk it a quarter at a time, where the count stays well
// under the cap (a busy quarter runs ~300). An event whose records straddle a quarter
// boundary is counted twice; that is a fraction of a percent and it inflates the
// baseline, which is the forgiving direction.
async function baselineEvents(base, fromYear, toYear) {
  let all = 0, classI = 0, capped = false;
  for (let y = fromYear; y <= toYear; y++) {
    for (const [a, b] of [["0101", "0331"], ["0401", "0630"], ["0701", "0930"], ["1001", "1231"]]) {
      const range = `report_date:[${y}${a} TO ${y}${b}]`;
      const t = await events(base, range);
      await sleep(GAP);
      const i = await events(base, `${range} AND classification:"Class I"`);
      await sleep(GAP);
      all += t.events; classI += i.events;
      capped = capped || t.capped || i.capped;
    }
    process.stdout.write(".");
  }
  return { total: all, classI, classIShare: all ? Number((classI / all).toFixed(4)) : null, capped };
}

// Same anchoring rule as the other importers: a firm belongs to a company when its name
// STARTS with a name that company filed. openFDA spells one company many ways — "Teva
// Pharmaceuticals USA", "Teva North America" — and anchoring collects those without
// reaching across to an unrelated firm that merely contains the word.
function matcher(names) {
  const pats = names
    .filter((n) => n && n.replace(/[^A-Za-z0-9]/g, "").length >= 3)
    .map((n) => new RegExp("^\\s*" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s.,-]+") + "\\b", "i"));
  return (firm) => pats.some((re) => re.test(String(firm || "")));
}

async function profile(base, query, names) {
  const search = `recalling_firm:"${query}"`;
  const [cls, mand, firms] = await Promise.all([
    fda(base, { search, count: "classification.exact" }),
    fda(base, { search, count: "voluntary_mandated.exact" }),
    fda(base, { search, count: "recalling_firm.exact", limit: "100" }),
  ]);
  // Distinct recall EVENTS, which is what a person means by "a recall".
  const [evAll, evI] = await Promise.all([
    events(base, search),
    events(base, `${search} AND classification:"Class I"`),
  ]);

  const byFirm = terms(firms);
  const belongs = matcher(names);
  const kept = Object.entries(byFirm).filter(([f]) => belongs(f));
  const total = Object.values(byFirm).reduce((a, b) => a + b, 0);
  const keptTotal = kept.reduce((a, [, c]) => a + c, 0);

  const c = terms(cls);
  const m = terms(mand);
  const records = (c["Class I"] || 0) + (c["Class II"] || 0) + (c["Class III"] || 0);
  const mandated = Object.entries(m).filter(([k]) => /mandat/i.test(k)).reduce((a, [, v]) => a + v, 0);

  return {
    recalls: evAll.events, classI: evI.events,
    records, classIRecords: c["Class I"] || 0,
    mandated,
    truncated: evAll.capped || evI.capped,
    firmsMatched: kept.length,
    attributionRate: total ? Number((keptTotal / total).toFixed(3)) : null,
    firmsRejected: Object.keys(byFirm).length - kept.length,
  };
}

async function main() {
  const subsFile = join(ROOT, "server", "generated", "subsidiaries.json");
  const subs = existsSync(subsFile) ? JSON.parse(readFileSync(subsFile, "utf8")).companies || {} : {};
  const { EMPLOYER_ALIASES } = await import("../server/lib/employer-aliases.js");

  const tickers = (SEED || Object.keys(subs)).filter((t) => subs[t] || EMPLOYER_ALIASES[t]);
  if (!tickers.length) { console.error("No companies to query — run fetch-subsidiaries.mjs first."); process.exit(1); }

  // The industry baseline, from the same datasets and the same field. A company's serious
  // share means nothing without the share across every firm filing into the same system.
  console.log("Baselines (counted by recall event, a quarter at a time):");
  const baselines = {};
  const thisYear = new Date().getFullYear();
  for (const [kind, base] of Object.entries(ENDPOINTS)) {
    process.stdout.write(`  ${kind.padEnd(7)} `);
    const b = await baselineEvents(base, 2012, thisYear);
    baselines[kind] = b;
    console.log(` ${b.total.toLocaleString()} events · ${(100 * b.classIShare).toFixed(1)}% Class I${b.capped ? " (A QUARTER HIT THE CAP)" : ""}`);
  }

  console.log(`\nQuerying ${tickers.length} companies…`);
  const companies = {};
  for (const t of tickers) {
    const names = [...new Set([...(EMPLOYER_ALIASES[t] || []), subs[t]?.name, ...(subs[t]?.subsidiaries || [])].filter(Boolean))];
    // Query on the shortest distinctive name we hold, since openFDA matches loosely and a
    // long legal name would miss the half-dozen spellings a company files under.
    const query = (EMPLOYER_ALIASES[t]?.[0]) || String(subs[t]?.name || t).split(/[ ,]/)[0];
    const rec = { queriedAs: query };
    for (const [kind, base] of Object.entries(ENDPOINTS)) {
      try {
        // The query term is itself a name the company filed, shortened to the
        // distinctive part, so it belongs in the match set — without it "Teva" matches
        // nothing, because no filing is literally called "Teva".
        rec[kind] = await profile(base, query, [query, ...names]);
      } catch (e) {
        rec[kind] = { error: e.message };
      }
      await sleep(GAP);
    }
    companies[t] = rec;
    const line = Object.keys(ENDPOINTS).map((k) => {
      const d = rec[k] || {};
      const sh = d.recalls ? `${(100 * d.classI / d.recalls).toFixed(1)}%I` : "—";
      return `${k} ${String(d.recalls ?? 0).padStart(4)} (${sh})`;
    }).join(" · ");
    const attr = Object.keys(ENDPOINTS).map((k) => rec[k]?.attributionRate).filter((x) => x != null);
    console.log(`  ${t.padEnd(6)} ${line} · attribution ${attr.length ? Math.min(...attr) : "—"}`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "openFDA — drug enforcement reports and device recalls (US Food and Drug Administration)",
    method: "Share of a firm's recalls that FDA classed as Class I (reasonable probability of serious adverse health consequences or death), against the same share across every firm in the dataset. Severity and the voluntary/mandated distinction are FDA's, not ours.",
    caveat: "Counted by distinct recall EVENT, never by record: openFDA files one record per affected model or lot, so one recall fans out into dozens and counting records put Medtronic at 33% Class I against a true 11.7%. attributionRate is the fraction of matched records belonging to firms whose names the company itself filed; below ~0.95 the class counts reach outside the company and should not be graded.",
    baselines, count: Object.keys(companies).length, companies,
  }, null, 2) + "\n");
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
