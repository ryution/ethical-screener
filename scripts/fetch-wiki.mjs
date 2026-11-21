// Short Wikipedia summaries (with their lead image) for the "Learn more" pop-up: one per
// category, explaining the issue, and one per company we flag or that sits among a fund's
// largest holdings.
//
// Companies are matched by stock ticker through Wikidata (the "ticker symbol" on the
// company's stock exchange listing), not by name, so "Meta" can't land on the wrong
// article. A ticker Wikidata doesn't list is simply left out.
//
// Summaries are Wikipedia's own text (CC BY-SA 4.0); the page shows them with a link to
// the article and the license. Only the first two sentences are kept.
//
// Usage:  node scripts/fetch-wiki.mjs   (part of npm run refresh:data)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lookupSymbol } from "../server/lib/analyzer.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN = join(ROOT, "server", "generated");
const OUT = join(GEN, "wiki.json");
const UA = "PlainStreet/1.0 (https://www.plainstreet.org; ethical stock screener)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One article per category. These explain the issue in general; they say nothing about
// any one company. "adult" is left without an image on purpose.
export const ISSUE_ARTICLES = {
  fossil_fuels: "Fossil_fuel",
  weapons: "Arms_industry",
  firearms: "Small_arms_trade",
  tobacco: "Tobacco_industry",
  gambling: "Gambling",
  alcohol: "Alcoholic_beverage",
  adult: "Pornography",
  big_tech_surveillance: "Surveillance_capitalism",
  factory_farming: "Intensive_animal_farming",
  animal_testing: "Animal_testing",
  private_prisons: "Private_prison",
  payday_lending: "Payday_loan",
  opioids: "Opioid_epidemic_in_the_United_States",
  thermal_coal: "Coal-fired_power_station",
  cannabis: "Cannabis_industry",
  fur: "Fur_clothing",
  executive_enforcement: "Corporate_crime",
  historical_forced_labor: "Forced_labour_under_German_rule_during_World_War_II",
  forced_labor_supply_chain: "Forced_labour",
  supplier_audit_violations: "Social_audit",
  pork: "Pig_farming",
  interest_finance: "Riba",
};
const NO_IMAGE = new Set(["adult"]);

async function get(url, { json = true, headers = {} } = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(30_000) });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`${res.status}`);
      if (!res.ok) return null;
      return json ? await res.json() : await res.text();
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1500 * attempt);
    }
  }
}

// The first two sentences, so the pop-up stays short and the rest is a click away.
const twoSentences = (s) => {
  const parts = String(s || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)/g) || [String(s || "")];
  return parts.slice(0, 2).join("").trim();
};

async function summary(title, { image = true } = {}) {
  const d = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  await sleep(120);
  if (!d || d.type !== "standard" || !d.extract) return null;
  return {
    title: d.title,
    extract: twoSentences(d.extract),
    // Wikimedia serves thumbnails from upload.wikimedia.org or thumb.wikimedia.org; the
    // tracking query string it adds is dropped. Anything else is not used.
    image: image && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(d.thumbnail?.source || "") ? d.thumbnail.source.split("?")[0] : null,
    url: d.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

// ticker -> English Wikipedia title, through Wikidata's ticker-symbol qualifier.
async function titlesFor(tickers) {
  const candidates = {};
  for (let i = 0; i < tickers.length; i += 150) {
    const batch = tickers.slice(i, i + 150);
    const values = batch.map((t) => `"${t}"`).join(" ");
    const q = `SELECT ?t ?article WHERE { VALUES ?t { ${values} } ?item p:P414 ?s . ?s pq:P249 ?t .
      ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }`;
    const d = await get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`, { headers: { Accept: "application/sparql-results+json" } });
    for (const b of d?.results?.bindings || []) {
      (candidates[b.t.value] ||= []).push(decodeURIComponent(b.article.value.split("/wiki/")[1]));
    }
    process.stdout.write(`.`);
    await sleep(1000);
  }
  return candidates;
}

// Wikidata keeps old listings, so a ticker can point at a company that used it years ago
// (TXT at "Text", VAL at Valspar). An article is kept only when its title starts with the
// first word of the company's SEC-registered name; otherwise the company gets no summary.
const LEGAL = new Set(["INC", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "PLC", "LLC", "LP", "NV", "SA", "AG", "SE", "THE", "GROUP", "HOLDINGS"]);
const words = (s) => String(s || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/['’.]/g, "").replace(/[^A-Z0-9& ]+/g, " ").split(/\s+/).filter(Boolean);
export function sameCompany(secName, title) {
  const a = words(secName).filter((w) => !LEGAL.has(w));
  const b = words(title.replace(/_/g, " "));
  if (!a.length || !b.length) return false;
  if (a[0] === b[0]) return true;
  // "Eagle Bancorp" / "EagleBank": the title runs the name's first word into the next.
  return a[0].length >= 5 && b[0].startsWith(a[0]);
}
function pickTitles(candidates, secNames) {
  const out = {};
  for (const [t, titles] of Object.entries(candidates)) {
    const hit = titles.find((title) => sameCompany(secNames[t], title));
    if (hit) out[t] = hit;
  }
  return out;
}

async function main() {
  // Which companies: every one we flag, plus every stock among a fund's largest holdings.
  const all = JSON.parse(readFileSync(join(GEN, "tickers.json"), "utf8")).tickers.map(([t]) => t);
  const want = new Set();
  for (const t of all) if (lookupSymbol(t)?.type === "stock") want.add(t);
  for (const f of ["fund-holdings.json", "fund-holdings-nport.json"]) {
    const d = existsSync(join(GEN, f)) ? JSON.parse(readFileSync(join(GEN, f), "utf8")) : {};
    for (const list of Object.values(d.top || {})) for (const [t] of list) want.add(t);
  }
  const tickers = [...want].filter((t) => /^[A-Z][A-Z0-9.]{0,9}$/.test(t)).sort();
  console.log(`${tickers.length} companies to look up`);

  const issues = {};
  for (const [key, title] of Object.entries(ISSUE_ARTICLES)) {
    const s = await summary(title, { image: !NO_IMAGE.has(key) });
    if (s) issues[key] = s; else console.log(`  no summary for ${key} (${title})`);
  }
  console.log(`${Object.keys(issues).length} of ${Object.keys(ISSUE_ARTICLES).length} category summaries`);

  const secNames = Object.fromEntries(JSON.parse(readFileSync(join(GEN, "tickers.json"), "utf8")).tickers);
  // Class shares (BRK.B) are spelled differently in the SEC list; use our own name for them.
  for (const t of tickers) if (!secNames[t]) secNames[t] = lookupSymbol(t)?.name || "";
  const candidates = await titlesFor(tickers);
  const titles = pickTitles(candidates, secNames);
  console.log(`\n${Object.keys(candidates).length} tickers found on Wikidata, ${Object.keys(titles).length} with a matching name`);

  const companies = {};
  let n = 0;
  for (const [t, title] of Object.entries(titles)) {
    try { const s = await summary(title); if (s) companies[t] = s; } catch { /* skip one, keep going */ }
    if (++n % 100 === 0) process.stdout.write(`${n} `);
  }
  if (Object.keys(companies).length < 100) { console.error(`\nonly ${Object.keys(companies).length} company summaries; leaving the file as it was`); process.exit(1); }
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "Wikipedia (CC BY-SA 4.0), matched by ticker through Wikidata",
    license: "https://creativecommons.org/licenses/by-sa/4.0/",
    issues, companies,
  }) + "\n");
  console.log(`\nWrote ${Object.keys(issues).length} category and ${Object.keys(companies).length} company summaries → ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
