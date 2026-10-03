// Political spending: federal lobbying (Senate LDA) and corporate PAC disbursements (FEC).
//
// This one is deliberately NOT graded, and the separation is structural rather than a
// policy. Lobbying and PAC giving are lawful, every large company does both, and whether
// a given amount is objectionable is exactly the judgement this product hands back to the
// reader. Grading it would make the site partisan, which is the fastest way to lose half
// an audience — and it would break the promise that the lines are the reader's.
//
// So we publish two filed dollar figures and let them draw their own line, the same
// treatment median pay gets.
//
// What is deliberately absent: the party split. FEC returns recipient names on a PAC's
// disbursements but no party field and often no recipient committee id, so a split needs a
// per-recipient candidate lookup that is both expensive and lossy. A half-accurate party
// breakdown is the most politically charged number this site could print, so it waits
// until it can be done properly.
//
// Usage: node scripts/fetch-political.mjs --seed WMT,COST,AMZN
// Output → server/generated/political.json

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "server", "generated", "political.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";
const FEC_KEY = process.env.FEC_API_KEY || "DEMO_KEY";

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEED = argOf("--seed")?.split(",").map((t) => t.trim().toUpperCase()) || null;
const YEARS = Number(argOf("--years")) || 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 900;   // DEMO_KEY is rate limited; a real FEC_API_KEY allows much more

async function j(url, label, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    const d = await r.json().catch(() => null);
    const limited = r.status === 429 || /rate limit/i.test(d?.error?.message || "");
    if (limited && i < tries - 1) {
      const wait = 30_000 * (i + 1);
      console.log(`    (rate limited on ${label}, waiting ${wait / 1000}s)`);
      await sleep(wait);
      continue;
    }
    if (d?.error) throw new Error(`${label}: ${d.error.message || d.error}`);
    if (!r.ok) throw new Error(`${label}: ${r.status}`);
    return d;
  }
  throw new Error(`${label}: rate limited`);
}

// Registries name the company, so strip the legal form and keep the rest. The first word
// alone is not enough: it turns United Parcel Service into "UNITED", which reaches United
// Airlines and UnitedHealth.
const SUFFIX = /\b(incorporated|corporation|company|holdings?|limited|inc|corp|co|llc|lp|ltd|plc|group)\b/gi;
const registryName = (raw, fallback) => {
  const t = String(raw || fallback || "").replace(/\/.*$/, "").replace(/[.,]/g, " ")
    .replace(SUFFIX, " ").replace(/\s+/g, " ").trim();
  return t.length >= 3 ? t : String(fallback || raw || "").trim();
};

const money = (x) => { const n = Number(String(x ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? n : 0; };

// Same anchoring rule as the other importers, with one documented exception: a lobbying
// firm files on behalf of a client and names it that way — "MVP STRATEGIES (OBO WALMART)"
// is Walmart's lobbying, done by someone else, so an on-behalf-of marker counts too.
function matcher(names) {
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s.,-]+");
  const anchored = names.map((n) => new RegExp("^\\s*" + esc(n) + "\\b", "i"));
  const onBehalf = names.map((n) => new RegExp("\\b(?:obo|on behalf of)\\s+" + esc(n) + "\\b", "i"));
  return (s) => anchored.some((re) => re.test(String(s || ""))) || onBehalf.some((re) => re.test(String(s || "")));
}

// LDA caps a page at 25 rows whatever page_size asks for, so a single call summed the
// first 25 of Walmart's 53 filings and reported it as the year's total. Walk every page.
async function lobbying(query, names, year) {
  const belongs = matcher(names);
  let total = 0, kept = 0, seen = 0, page = 1, count = null;
  for (;;) {
    const url = `https://lda.senate.gov/api/v1/filings/?client_name=${encodeURIComponent(query)}&filing_year=${year}&page=${page}&page_size=25`;
    const d = await j(url, "LDA");
    count ??= d.count || 0;
    const rows = d.results || [];
    for (const f of rows) {
      seen++;
      if (!belongs((f.client || {}).name || "")) continue;
      kept++;
      // A filing reports income (what a lobbying firm was paid) or expenses (what an
      // in-house department spent). They are alternatives, never both.
      total += money(f.income) || money(f.expenses);
    }
    if (!d.next || !rows.length || page >= 24) break;
    page++;
    await sleep(GAP);
  }
  return { year, total, filings: kept, scanned: seen, ofFilings: count, complete: seen >= (count || 0) };
}

async function pac(query, names) {
  const d = await j(`https://api.open.fec.gov/v1/committees/?q=${encodeURIComponent(query)}&per_page=20&api_key=${FEC_KEY}`, "FEC committees");
  const belongs = matcher(names);
  // Only connected committees — a corporate PAC. A name search also returns candidate
  // committees and unrelated groups that merely mention the company.
  const mine = (d.results || []).filter((c) => belongs(c.name) && /PAC|SEPARATE SEGREGATED/i.test(c.committee_type_full || ""));
  if (!mine.length) return { committees: [], cycles: [] };
  await sleep(GAP);
  const cycles = [];
  for (const c of mine.slice(0, 3)) {
    const t = await j(`https://api.open.fec.gov/v1/committee/${c.committee_id}/totals/?per_page=${YEARS}&sort=-cycle&api_key=${FEC_KEY}`, "FEC totals");
    for (const r of t.results || []) {
      cycles.push({ committee: c.name, committeeId: c.committee_id, cycle: r.cycle, disbursements: money(r.disbursements), receipts: money(r.receipts) });
    }
    await sleep(GAP);
  }
  return { committees: mine.map((c) => ({ id: c.committee_id, name: c.name })), cycles };
}

async function main() {
  const subsFile = join(ROOT, "server", "generated", "subsidiaries.json");
  const subs = existsSync(subsFile) ? JSON.parse(readFileSync(subsFile, "utf8")).companies || {} : {};
  const { EMPLOYER_ALIASES, REGISTRY_ALIASES } = await import("../server/lib/employer-aliases.js");

  const tickers = (SEED || Object.keys(subs)).filter((t) => subs[t] || EMPLOYER_ALIASES[t]);
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: YEARS }, (_, i) => thisYear - 1 - i);

  console.log(`Political spending for ${tickers.length} companies, ${years.join(", ")}…\n`);
  const companies = {};
  for (const t of tickers) {
    // Registries name the COMPANY, so EPA facility prefixes are wrong here ("Target
    // Store" matches no lobbying client) and so is the bare query stem: "TARGET" would
    // accept TARGET HOSPITALITY CORP, a different listed company, along with MARATHON
    // TARGETS and PIXELS ON TARGET. Match on filed names only.
    const derived = registryName(subs[t]?.name, t);
    const names = [...new Set([...(REGISTRY_ALIASES[t] || []), subs[t]?.name, derived,
      ...(EMPLOYER_ALIASES[t] || [])].filter(Boolean))];
    const query = (REGISTRY_ALIASES[t]?.[0]) || derived;
    const rec = { queriedAs: query, lobbying: [], pac: null };
    try {
      for (const y of years) { rec.lobbying.push(await lobbying(query, names, y)); await sleep(GAP); }
    } catch (e) { rec.lobbyingError = e.message; }
    // DEMO_KEY allows a handful of calls an hour, so retrying it just burns three minutes
    // per company for a limit that only clears on the hour. Skip it outright and say why;
    // a free key from api.data.gov lifts this to 1,000/hour.
    if (FEC_KEY === "DEMO_KEY") {
      rec.pacError = "skipped: set FEC_API_KEY (free from api.data.gov) to collect PAC data";
    } else {
      try { rec.pac = await pac(query, names); }
      catch (e) { rec.pacError = e.message; }
    }
    companies[t] = rec;
    const lob = rec.lobbying.find((l) => l.total > 0);
    const cyc = rec.pac?.cycles?.[0];
    console.log(`  ${t.padEnd(6)} lobbying ${lob ? `$${lob.total.toLocaleString()} (${lob.year})` : "—"} · PAC ${cyc ? `$${cyc.disbursements.toLocaleString()} (${cyc.cycle} cycle)` : "—"}`);
    await sleep(GAP);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "US Senate Lobbying Disclosure Act database, and the Federal Election Commission",
    method: "Federal lobbying reported for the company by year, and disbursements by its connected PAC per election cycle. Both are figures the company or its agents filed.",
    stance: "Shown, never graded. Lobbying and PAC giving are lawful and every large company does both; whether an amount is objectionable is the reader's judgement, not ours.",
    caveat: "Lobbying totals walk every page of a year of filings, and `complete` records whether we saw all of them. No party split: FEC returns recipient names without a party field, and a half-accurate breakdown is the most charged number this site could print.",
    count: Object.keys(companies).length, companies,
  }, null, 2) + "\n");
  console.log(`\nWrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
