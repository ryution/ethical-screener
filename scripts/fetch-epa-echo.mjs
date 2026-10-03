// Environmental compliance from EPA's ECHO (Enforcement and Compliance History Online).
//
// The second conduct source, and it follows the same discipline as the first. ECHO's
// summary response gives, for any query, how many facilities matched and how many of them
// EPA currently classes as significant violators — so a company's rate and its industry's
// rate come from the same endpoint, computed the same way, which is what makes the
// comparison worth anything.
//
// Rate, never count. Costco has 776 facilities with 5 significant violations; Amazon has
// 2,071 with 23. Ranked by count Amazon looks five times worse, when per facility the two
// are within a whisker of each other. This is the same trap the injury data had, and the
// same fix: divide by the thing that scales.
//
// ECHO's own summary totals are NOT usable. Its name search is fuzzy: a query for "UPS"
// returns 1,273 facilities of which 58 are not UPS at all — K2 Sports, a Costco warehouse,
// "UP AND UP, LLC" — and the summary attributed $1.79 BILLION in penalties to UPS on that
// basis. So we pull the facility rows and decide for ourselves which ones belong, with the
// same anchored matching the OSHA import uses. A number that large, attached to the wrong
// company, is the worst thing this pipeline could publish.
//
// Severity comes from EPA's own words. "Significant Non-Compliance" and "High Priority
// Violator" are EPA designations with published criteria — we never invent a threshold of
// our own for how bad a violation is.
//
// Usage:
//   node scripts/fetch-epa-echo.mjs                 # every company in subsidiaries.json
//   node scripts/fetch-epa-echo.mjs --seed COST,AMZN
//
// Output → server/generated/epa-environment.json

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "server", "generated", "epa-environment.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEED = argOf("--seed")?.split(",").map((t) => t.trim().toUpperCase()) || null;

// ECHO throttles at 300 requests/hour. 13s between calls keeps us comfortably inside it
// and is the reason this script is slow by design rather than parallel.
const GAP = 13_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ECHO answers a 429 with a 200 and an error body, so a throttle looks like a result
// unless you check. Back off and retry rather than silently recording a company as having
// no facilities, which would read as a clean environmental record.
async function withRetry(fn, label, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      const throttled = /429|throttle/i.test(e.message);
      if (!throttled || i === tries - 1) throw e;
      const wait = 60_000 * (i + 1);
      console.log(`    (throttled on ${label}, waiting ${wait / 1000}s)`);
      await sleep(wait);
    }
  }
}

const BASE = "https://echodata.epa.gov/echo/echo_rest_services.get_facilities";

async function echo(params) {
  const qs = new URLSearchParams({ output: "JSON", p_act: "Y", ...params });
  const r = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status}`);
  const j = await r.json();
  const res = j?.Results;
  if (!res || res.Error) throw new Error(res?.Error?.ErrorMessage?.slice(0, 80) || "no results");
  return { rows: Number(res.QueryRows) || 0, qid: res.QueryID };
}

async function rowsFor(qid, page = 1) {
  const url = `https://echodata.epa.gov/echo/echo_rest_services.get_qid?output=JSON&qid=${qid}&pageno=${page}&responseset=5`;
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status}`);
  const j = await r.json();
  if (j?.Results?.Error) throw new Error(j.Results.Error.ErrorMessage.slice(0, 70));
  return j?.Results?.Facilities || [];
}

// A facility belongs to a company when its name STARTS with one of that company's own
// filed names, on a word boundary. Anchoring is what keeps "UP AND UP, LLC" away from UPS;
// a contains-match is how ECHO produced the $1.79bn error.
function matcher(names) {
  const pats = names
    .filter((n) => n && n.replace(/[^A-Za-z0-9]/g, "").length >= 3)
    .map((n) => new RegExp("^\\s*" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s.,-]+") + "\\b", "i"));
  return (facName) => pats.some((re) => re.test(String(facName || "")));
}

const isYes = (v) => /^y/i.test(String(v || ""));
const toNum = (v) => Number(String(v ?? "0").replace(/[^0-9.]/g, "")) || 0;

// Aggregate the rows WE accepted, rather than trusting the query's totals.
function summarise(rows) {
  let sig = 0, viol = 0, pen = 0, formal = 0, insp = 0, hpv = 0, ncq = 0;
  for (const f of rows) {
    const status = String(f.FacComplianceStatus || "");
    if (isYes(f.FacSNCFlg) || /significant violation/i.test(status)) sig++;
    else if (/violation/i.test(status)) viol++;
    if (isYes(f.CAAHpvFlag)) hpv++;
    if (toNum(f.FacPenaltyCount) > 0) pen++;
    formal += toNum(f.CAAFormalActionCount) + toNum(f.SDWAFormalActionCount);
    insp += toNum(f.FacInspectionCount);
    if (toNum(f.FacQtrsWithNC) > 0) ncq++;
  }
  return {
    facilities: rows.length, significantViolations: sig, otherViolations: viol,
    highPriorityViolators: hpv, facilitiesPenalised: pen,
    formalActions: formal, inspections: insp, facilitiesWithNonComplianceQuarters: ncq,
  };
}

async function profile(names, params) {
  const { rows, qid } = await echo(params);
  if (!rows || !qid) return null;
  await sleep(GAP);
  const all = await rowsFor(qid);
  const belongs = matcher(names);
  const mine = names.length ? all.filter((f) => belongs(f.FacName)) : all;
  return { ...summarise(mine), returnedByEcho: all.length, rejected: all.length - mine.length };
}

async function main() {
  const subsFile = join(ROOT, "server", "generated", "subsidiaries.json");
  if (!existsSync(subsFile)) {
    console.error("Missing server/generated/subsidiaries.json — run scripts/fetch-subsidiaries.mjs first.");
    process.exit(1);
  }
  const subs = JSON.parse(readFileSync(subsFile, "utf8")).companies || {};
  const { EMPLOYER_ALIASES, FACILITY_ALIASES } = await import("../server/lib/employer-aliases.js");

  // The NAICS a company actually operates under, borrowed from the OSHA dataset, which
  // derives it from where the company's hours are worked rather than from its HQ filing.
  let naicsOf = {};
  const injFile = join(ROOT, "server", "generated", "osha-injury.json");
  if (existsSync(injFile)) {
    const inj = JSON.parse(readFileSync(injFile, "utf8")).companies || {};
    for (const [t, years] of Object.entries(inj)) {
      const last = Object.keys(years).sort().pop();
      if (years[last]?.naics) naicsOf[t] = years[last].naics;
    }
  }

  let tickers = SEED || Object.keys(subs);
  tickers = tickers.filter((t) => subs[t]);

  // ECHO matches on facility name, which is the operating brand far more often than the
  // legal entity — the same thing the OSHA import found. Use the curated alias first.
  const queryName = (t) => (FACILITY_ALIASES[t]?.[0]) || (EMPLOYER_ALIASES[t]?.[0]) || subs[t]?.name || t;

  console.log(`Querying ECHO for ${tickers.length} companies (${GAP / 1000}s apart for the rate limit)…\n`);
  const companies = {};
  for (const t of tickers) {
    const name = queryName(t);
    // Facility prefixes first — EPA names buildings, not legal entities.
    const names = [...new Set([...(FACILITY_ALIASES[t] || []), ...(EMPLOYER_ALIASES[t] || []), subs[t]?.name, ...(subs[t]?.subsidiaries || [])].filter(Boolean))];
    try {
      const d = await withRetry(() => profile(names, { p_fn: name }), t);
      if (!d) { console.log(`  ${t.padEnd(6)} no facilities`); await sleep(GAP); continue; }
      companies[t] = { queriedAs: name, naics: naicsOf[t] || null, ...d };
      const rate = d.facilities ? (100 * d.significantViolations / d.facilities).toFixed(2) : "—";
      console.log(`  ${t.padEnd(6)} kept ${String(d.facilities).padStart(5)} of ${String(d.returnedByEcho).padStart(5)} · ${String(d.significantViolations).padStart(3)} significant (${rate}%)`);
    } catch (e) {
      console.log(`  ${t.padEnd(6)} ! ${e.message}`);
    }
    await sleep(GAP);
  }

  // One benchmark query per distinct industry, so a company's rate is compared with the
  // same measure over the same endpoint for its peers.
  const codes = [...new Set(Object.values(companies).map((c) => c.naics).filter(Boolean))];
  console.log(`\nBenchmarking ${codes.length} industries…`);
  const benchmarks = {};
  for (const code of codes) {
    try {
      // No name filter for a benchmark — every facility in the industry is the point.
      const d = await withRetry(() => profile([], { p_ncs: code }), `NAICS ${code}`);
      if (d) {
        benchmarks[code] = d;
        const rate = d.facilities ? (100 * d.significantViolations / d.facilities).toFixed(2) : "—";
        console.log(`  NAICS ${code}  ${String(d.facilities).padStart(6)} facilities · ${rate}% significant`);
      }
    } catch (e) {
      console.log(`  NAICS ${code}  ! ${e.message}`);
    }
    await sleep(GAP);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "US EPA, Enforcement and Compliance History Online (ECHO)",
    method: "Share of a company's EPA-regulated facilities that EPA currently classes as significant violators, against the same share across all facilities in its industry. Severity is EPA's own designation, not ours.",
    caveat: "ECHO name search is fuzzy, so its own totals are unusable - a query for UPS returns K2 Sports and a Costco warehouse. We keep only facilities whose name starts with a name the company itself filed, and record how many we rejected. A low facility count means we matched few, not that few exist.",
    count: Object.keys(companies).length,
    companies, benchmarks,
  }, null, 2) + "\n");
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
