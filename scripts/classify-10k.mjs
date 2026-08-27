// Filing-cited classification — Stage 1 (free prefilter + passage extraction).
//
// Given a ticker, find its latest 10-K on EDGAR, strip it to text, and extract the
// passages around any flag-defining phrase. These candidate passages are what a cheap
// model reads in Stage 2 (it never sees the whole filing). Output → a JSON the classifier
// consumes. See METHODOLOGY.md §6.
//
// Usage: node scripts/classify-10k.mjs BRK.B [TICKER2 ...]  > candidates.json

import { writeFileSync, readFileSync } from "node:fs";

const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad10 = (c) => String(c).padStart(10, "0");

// Flag → defining phrases (Stage-1 net; deliberately wide, materiality is judged in Stage 2).
const PHRASES = {
  fossil_fuels: ["oil and gas", "natural gas pipeline", "crude oil", "petroleum refining", "oil & gas"],
  thermal_coal: ["coal-fired", "coal fired", "thermal coal", "coal generation", "coal-fueled"],
  weapons: ["aerospace and defense", "defense contractor", "military aircraft", "munitions", "missile", "defense department"],
  firearms: ["firearm", "ammunition"],
  tobacco: ["cigarette", "tobacco product", "nicotine"],
  gambling: ["casino", "sportsbook", "gaming operations", "wagering"],
  alcohol: ["brewery", "distillery", "wine and spirits", "malt beverage"],
  deforestation: ["palm oil", "timberland"],
  factory_farming: ["meat processing", "poultry processing", "beef processing", "pork processing"],
  animal_testing: ["animal testing", "preclinical", "laboratory animals"],
  private_prisons: ["correctional facilities", "immigration detention", "detention centers"],
  big_tech_surveillance: ["personalized advertising", "data broker", "sale of consumer data"],
  payday_lending: ["payday loan", "title loan", "subprime consumer"],
  opioids: ["opioid"],
  cannabis: ["cannabis", "marijuana"],
  adult: ["adult entertainment", "pornograph"],
  fur: ["fur products", "exotic leather"],
  nuclear_weapons: ["nuclear weapon"],
  forced_labor: ["forced labor", "uflpa", "uyghur", "withhold release order"],
  abortion_contraceptives: ["abortifacient", "contraceptive"],
};

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();
}

async function latest10K(cik) {
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`);
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === "10-K") {
      const acc = r.accessionNumber[i].replace(/-/g, "");
      return {
        url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${r.primaryDocument[i]}`,
        accession: r.accessionNumber[i], filingDate: r.filingDate[i], name: sub.name,
      };
    }
  }
  throw new Error("no 10-K found");
}

// Pull the ±window text around each phrase hit; merge overlapping windows per flag.
function extract(text, window = 320) {
  const low = text.toLowerCase();
  const out = {};
  for (const [flag, phrases] of Object.entries(PHRASES)) {
    const spans = [];
    for (const p of phrases) {
      let idx = 0;
      const needle = p.toLowerCase();
      while ((idx = low.indexOf(needle, idx)) !== -1) {
        spans.push([Math.max(0, idx - window), Math.min(text.length, idx + needle.length + window), p]);
        idx += needle.length;
        if (spans.length > 40) break; // cap per flag
      }
    }
    if (!spans.length) continue;
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) { last[1] = Math.max(last[1], s[1]); last[2].add(s[2]); }
      else merged.push([s[0], s[1], new Set([s[2]])]);
    }
    out[flag] = merged.slice(0, 6).map((m) => ({ phrases: [...m[2]], passage: text.slice(m[0], m[1]).trim() }));
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const outFile = opt("--out") || "/dev/stdout";
  const fileArg = opt("--file");
  const consumed = new Set(["--out", opt("--out"), "--file", fileArg]);
  let tickers = argv.filter((a) => !consumed.has(a));
  if (fileArg) tickers = readFileSync(fileArg, "utf8").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const universe = await getJson("https://www.sec.gov/files/company_tickers.json");
  const rows = Object.values(universe);
  const results = [];
  for (const t of tickers) {
    const key = t.toUpperCase().replace(/[.-]/g, "");
    const row = rows.find((r) => String(r.ticker).toUpperCase().replace(/[.-]/g, "") === key);
    if (!row) { console.error(`  ${t}: not found in EDGAR universe`); continue; }
    try {
      const f = await latest10K(row.cik_str);
      const text = stripHtml(await getText(f.url));
      const candidates = extract(text);
      console.error(`  ${t}: ${f.name} — 10-K ${f.filingDate} · ${text.length.toLocaleString()} chars · ${Object.keys(candidates).join(", ") || "none"}`);
      results.push({ ticker: t.toUpperCase(), name: f.name, filingDate: f.filingDate, source: f.url, textLength: text.length, candidates });
    } catch (e) {
      // Foreign filers (20-F, not 10-K), fetch hiccups — skip and keep going.
      console.error(`  ${t}: skipped (${e.message})`);
    }
    await sleep(300);
  }
  writeFileSync(outFile, JSON.stringify(results, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
