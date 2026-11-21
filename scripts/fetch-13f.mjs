// Notable investors: what well-known investors hold, from the 13F filings they must send
// the SEC every quarter (any manager with over $100M in U.S. stocks files one). A stock's
// page can then say "Warren Buffett's Berkshire Hathaway owns $X of this, as of 30 Sep".
//
// 13F covers U.S.-listed stocks and options held at quarter end, reported 45 days later.
// It doesn't show short positions, bonds, private holdings or anything bought since.
//
// Usage:  node scripts/fetch-13f.mjs   (part of npm run refresh:data)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLookups, tickerFor } from "./fetch-nport.mjs";

const GEN = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "generated");
const OUT = join(GEN, "notable-investors.json");
const UA = process.env.SEC_USER_AGENT || readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fetch-nport.mjs"), "utf8").match(/SEC_USER_AGENT \|\| "([^"]+)"/)[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SEC registration number (CIK) -> how we name them. Checked against the SEC's own name for
// each number; a filing whose registrant name doesn't contain `check` is skipped.
const INVESTORS = [
  { cik: 1067983, name: "Berkshire Hathaway", person: "Warren Buffett", check: "BERKSHIRE HATHAWAY" },
  { cik: 1336528, name: "Pershing Square", person: "Bill Ackman", check: "PERSHING SQUARE" },
  { cik: 1350694, name: "Bridgewater Associates", person: "founded by Ray Dalio", check: "BRIDGEWATER" },
  { cik: 1697748, name: "ARK Invest", person: "Cathie Wood", check: "ARK INVESTMENT" },
  { cik: 1536411, name: "Duquesne Family Office", person: "Stanley Druckenmiller", check: "DUQUESNE" },
  { cik: 1029160, name: "Soros Fund Management", person: "George Soros", check: "SOROS FUND" },
  { cik: 1656456, name: "Appaloosa", person: "David Tepper", check: "APPALOOSA" },
  { cik: 1167483, name: "Tiger Global", person: "Chase Coleman", check: "TIGER GLOBAL" },
  { cik: 1061768, name: "Baupost Group", person: "Seth Klarman", check: "BAUPOST" },
  { cik: 1040273, name: "Third Point", person: "Dan Loeb", check: "THIRD POINT" },
  { cik: 1166559, name: "Gates Foundation Trust", person: "the Gates Foundation's endowment", check: "GATES FOUNDATION" },
  { cik: 921669, name: "Icahn Capital", person: "Carl Icahn", check: "ICAHN" },
  { cik: 1135730, name: "Coatue", person: "Philippe Laffont", check: "COATUE" },
  { cik: 1103804, name: "Viking Global", person: "Andreas Halvorsen", check: "VIKING GLOBAL" },
  { cik: 1037389, name: "Renaissance Technologies", person: "founded by Jim Simons", check: "RENAISSANCE" },
];
// A filing older than this is left out rather than shown as current.
const MAX_AGE_DAYS = 400;

async function get(url, json = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(attempt === 1 ? 150 : 2000 * attempt);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      return await (json ? res.json() : res.text());
    } catch (e) { if (attempt === 3) throw e; }
  }
}

const tag = (b, t) => { const m = b.match(new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`)); return m ? m[1].trim() : null; };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => { const [y, m, d] = String(iso).split("-"); return y && m && d ? `${+d}-${MONTHS[+m - 1]}-${y}` : iso; };

async function latest13F(inv, lookups) {
  const sub = await get(`https://data.sec.gov/submissions/CIK${String(inv.cik).padStart(10, "0")}.json`, true);
  if (!String(sub.name).toUpperCase().includes(inv.check)) throw new Error(`CIK ${inv.cik} is "${sub.name}", not ${inv.check}`);
  const r = sub.filings.recent;
  const i = r.form.findIndex((f) => f === "13F-HR");
  if (i < 0) throw new Error("no 13F-HR filing");
  const ageDays = (Date.now() - Date.parse(r.filingDate[i])) / 86_400_000;
  if (ageDays > MAX_AGE_DAYS) throw new Error(`latest 13F is from ${r.filingDate[i]}`);
  const acc = r.accessionNumber[i];
  const dir = `https://www.sec.gov/Archives/edgar/data/${inv.cik}/${acc.replace(/-/g, "")}`;
  const index = await get(`${dir}/index.json`, true);
  const xmlFile = index.directory.item.map((x) => x.name).find((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  if (!xmlFile) throw new Error("no information table in the filing");
  const xml = await get(`${dir}/${xmlFile}`);
  const rows = [...xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)].map(([, b]) => ({
    name: tag(b, "nameOfIssuer"), title: tag(b, "titleOfClass"), cusip: (tag(b, "cusip") || "").toUpperCase(),
    value: Number(tag(b, "value")) || 0, shares: Number(tag(b, "sshPrnamt")) || 0, putCall: tag(b, "putCall"),
  }));
  // Options are bets, not ownership; leave them out of "owns".
  const owned = rows.filter((x) => !x.putCall && x.value > 0);
  // Since 2023 the value is in dollars, but some filers still report thousands. A median
  // implied price under $2 a share gives that away (Duquesne listed 3.2M NTRA shares at
  // "1,306,335"), so those filings are scaled up.
  const prices = owned.filter((x) => x.shares > 0).map((x) => x.value / x.shares).sort((a, b) => a - b);
  const inThousands = prices.length > 0 && prices[Math.floor(prices.length / 2)] < 2;
  if (inThousands) for (const x of owned) x.value *= 1000;
  const total = owned.reduce((n, x) => n + x.value, 0);
  const byTicker = new Map();
  let matched = 0;
  for (const h of owned) {
    const hit = tickerFor(h, lookups);
    if (!hit) continue;
    matched += h.value;
    const t = String(hit.t).toUpperCase().replace(/-/g, ".");
    const prev = byTicker.get(t) || { value: 0, shares: 0 };
    byTicker.set(t, { value: prev.value + h.value, shares: prev.shares + h.shares });
  }
  return {
    investor: { name: inv.name, person: inv.person, cik: inv.cik, asOf: fmtDate(r.reportDate[i]), filed: r.filingDate[i],
      url: `${dir}/`, reportedInThousands: inThousands, totalUsd: Math.round(total), positions: owned.length, matchedShare: total ? Number((matched / total).toFixed(3)) : 0 },
    holdings: [...byTicker].map(([t, v]) => [t, Math.round(v.value), v.shares, total ? Number((v.value / total * 100).toFixed(2)) : null]),
  };
}

async function main() {
  const lookups = loadLookups();
  const investors = [], byTicker = {};
  for (const inv of INVESTORS) {
    process.stdout.write(`${inv.name.padEnd(26)} `);
    try {
      const { investor, holdings } = await latest13F(inv, lookups);
      const id = investors.push(investor) - 1;
      for (const [t, usd, shares, pct] of holdings) (byTicker[t] ||= []).push([id, usd, shares, pct]);
      console.log(`${holdings.length} stocks, $${(investor.totalUsd / 1e9).toFixed(1)}B, ${Math.round(investor.matchedShare * 100)}% matched (as of ${investor.asOf})`);
    } catch (e) {
      console.log(`skipped: ${e.message}`);
    }
  }
  if (investors.length < 5) { console.error("Fewer than 5 investors fetched. Leaving the file as it was."); process.exit(1); }
  for (const list of Object.values(byTicker)) list.sort((a, b) => b[1] - a[1]);
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "SEC Form 13F-HR filings",
    investors,
    // ticker -> [[investor index, value in USD, shares, percent of that investor's 13F portfolio], ...]
    holdings: byTicker,
  }) + "\n");
  console.log(`\nWrote ${investors.length} investors, ${Object.keys(byTicker).length} stocks → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
