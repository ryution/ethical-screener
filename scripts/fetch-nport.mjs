// Fund holdings from SEC Form N-PORT, for funds whose issuer has no file we can download.
//
// fetch-holdings.mjs covers SPDR funds from State Street's daily files. Vanguard, iShares,
// Schwab, Invesco and ARK either block scripted downloads or publish nothing we can read.
// Every registered fund files its full holdings with the SEC each quarter on Form N-PORT,
// and those filings are public. They lag: a filing shows holdings at a quarter end and
// arrives up to 60 days later. Every result carries that date.
//
// A filing lists each holding by name and CUSIP, almost never by ticker. A holding is
// turned into a ticker in this order, and only on an exact match:
//   1. a ticker in the filing itself, when the fund gave one
//   2. its CUSIP, looked up in the pairs saved from the SPDR files (cusip-tickers.json)
//   3. its company name, matched exactly (after dropping "Inc", "Corp" and the like)
//      against the SEC's own list of company names and tickers (tickers.json)
// A holding that matches nothing stays unmatched. It still counts toward the fund's
// total, so an unmatched holding can make a fund look cleaner, never dirtier. The share
// that matched is recorded per fund.
//
// Usage:  node scripts/fetch-nport.mjs [TICKER ...]   (no arguments: every fund below)

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { flagsFor, SCREEN_KEYS } from "../server/lib/screens.js";
import { enrichedFlagsFor } from "../server/lib/enriched.js";
import { filingFlagsFor } from "../server/lib/filings.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = join(HERE, "..", "server", "generated");
const OUT = join(GEN, "fund-holdings-nport.json");
// The SEC asks automated clients to identify themselves. Same default as the other scripts.
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";

// basisKey: the ticker whose filing we read. One filing covers every share class of a
// fund, so VTSAX reads the same filing as VTI and only needs a catalogue entry.
export const SOURCES = {
  // broad market
  nasdaq100: "QQQ", crsp_total: "VTI", sp_total: "ITOT", dj_broad: "SCHB",
  fid_total: "FSKAX", fzrox: "FZROX", swtsx: "SWTSX",
  russell1000: "IWB", russell2000: "IWM", russell3000: "IWV", russell_mid: "IWR",
  crsp_large: "VV", crsp_mid: "VO", crsp_small: "VB", crsp_ext: "VXF",
  dj_lc: "SCHX", dj_mc: "SCHM", dj_sc: "SCHA",
  // growth and value
  crsp_growth: "VUG", crsp_value: "VTV", crsp_mega_growth: "MGK",
  r1000_growth: "IWF", r1000_value: "IWD", dj_lc_growth: "SCHG", dj_lc_value: "SCHV",
  // dividends
  schd: "SCHD", vig: "VIG", vym: "VYM", dgro: "DGRO", dvy: "DVY", hdv: "HDV", nobl: "NOBL", dgrw: "DGRW",
  // Vanguard sectors
  vgt: "VGT", vht: "VHT", vnq: "VNQ", vfh: "VFH", vde: "VDE", vcr: "VCR", vdc: "VDC",
  vis: "VIS", vaw: "VAW", vpu: "VPU", vox: "VOX",
  // other sector and industry funds
  smh: "SMH", soxx: "SOXX", ibb: "IBB", iyw: "IYW", ihi: "IHI", ita: "ITA", itb: "ITB", ppa: "PPA", jets: "JETS",
  // factor, income and active
  usmv: "USMV", qual: "QUAL", mtum: "MTUM", splv: "SPLV",
  jepi: "JEPI", jepq: "JEPQ", cowz: "COWZ", moat: "MOAT",
  arkk: "ARKK", arkg: "ARKG", arkw: "ARKW", arkq: "ARKQ", arkf: "ARKF",
  // ESG
  esgu: "ESGU", esgv: "ESGV", susa: "SUSA", dsi: "DSI", vftax: "VFTAX",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The SEC allows 10 requests a second. Stay well under it.
// Each request gets 60 seconds (body included) and up to three tries. Without a limit, one
// SEC response that never finished left the whole run waiting forever.
async function get(url, json = false) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(attempt === 1 ? 150 : 2000 * attempt);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" }, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
      return await (json ? res.json() : res.text());
    } catch (e) {
      last = e.name === "TimeoutError" ? new Error(`timed out after 60s for ${url}`) : e;
      if (/^4\d\d /.test(last.message) && !/^429 /.test(last.message)) break;
    }
  }
  throw last;
}

const decode = (s) => String(s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

// "Exxon Mobil Corp", "EXXON MOBIL CORP" and "Exxon Mobil Corporation" all become
// "EXXON MOBIL". Only legal-form words go; anything that tells two companies apart stays.
const LEGAL = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COS|COMPANY|LTD|LIMITED|PLC|LLC|LP|L P|NV|N V|SA|S A|AG|SE|THE|CLASS [A-Z]|CL [A-Z]|COM|NEW)\b/g;
export const normName = (s) => decode(s).toUpperCase()
  .replace(/\/[A-Z0-9 .]*\/?\s*$/, " ")   // SEC suffixes like "/DE/" or "/NEW/"
  .replace(/[^A-Z0-9& ]+/g, " ")
  .replace(LEGAL, " ")
  .replace(/\s+/g, " ")
  .trim();

// Same rule fetch-holdings.mjs uses: a holding counts if any of the three layers flags it,
// trying both class-share separators (BF.B / BF-B).
function screenedForm(rawTicker) {
  const t = String(rawTicker || "").trim().toUpperCase();
  if (!t) return null;
  for (const v of [t, t.replace(/\./g, "-"), t.replace(/-/g, ".")]) {
    if (flagsFor(v, SCREEN_KEYS).length || enrichedFlagsFor(v, SCREEN_KEYS).length || filingFlagsFor(v, SCREEN_KEYS).length) return v;
  }
  return null;
}

function loadLookups() {
  const cusip = existsSync(join(GEN, "cusip-tickers.json")) ? JSON.parse(readFileSync(join(GEN, "cusip-tickers.json"), "utf8")).map : {};
  const names = new Map();
  // tickers.json is the SEC's ticker list, largest companies first, so the first ticker
  // seen for a name is the main share class (GOOGL before GOOG).
  for (const [t, n] of JSON.parse(readFileSync(join(GEN, "tickers.json"), "utf8")).tickers) {
    const k = normName(n);
    if (k && !names.has(k)) names.set(k, t);
  }
  return { cusip, names };
}

export function tickerFor(h, { cusip, names }) {
  if (h.ticker && /^[A-Z][A-Z.-]{0,5}$/.test(h.ticker)) return { t: h.ticker, how: "ticker" };
  if (h.cusip && cusip[h.cusip]) return { t: cusip[h.cusip], how: "cusip" };
  if (h.isin?.startsWith("US") && cusip[h.isin.slice(2, 11)]) return { t: cusip[h.isin.slice(2, 11)], how: "cusip" };
  for (const n of [h.name, h.title]) {
    const k = normName(n);
    if (k && names.has(k)) return { t: names.get(k), how: "name" };
  }
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-09-30" → "30-Sep-2026", the format the SPDR files use, so the UI reads one way.
const fmtDate = (iso) => { const [y, m, d] = String(iso).split("-"); return y && m && d ? `${+d}-${MONTHS[+m - 1]}-${y}` : iso; };

export function parseNport(xml) {
  const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : null; };
  const val = (b, t) => { const m = b.match(new RegExp(`<${t}\\b[^>]*\\bvalue="([^"]*)"`)); return m ? m[1].trim() : null; };
  const holdings = [...xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)].map(([, b]) => ({
    name: decode(tag(b, "name")), title: decode(tag(b, "title")),
    cusip: (tag(b, "cusip") || "").toUpperCase(), isin: val(b, "isin"), ticker: val(b, "ticker"),
    cat: tag(b, "assetCat"), payoff: tag(b, "payoffProfile"), value: Number(tag(b, "valUSD")) || 0, pct: Number(tag(b, "pctVal")) || 0,
  }));
  return {
    seriesId: tag(xml, "seriesId"), seriesName: decode(tag(xml, "seriesName")), asOf: tag(xml, "repPdDate"),
    // Common stock held long. Cash, futures, swaps, notes and lent-securities collateral
    // are not companies the fund owns, so they are not part of the total.
    equities: holdings.filter((h) => h.cat === "EC" && h.payoff !== "Short" && h.value > 0),
  };
}

async function seriesByTicker() {
  const d = await get("https://www.sec.gov/files/company_tickers_mf.json", true);
  const map = new Map();
  for (const r of d.data) { const o = Object.fromEntries(d.fields.map((k, i) => [k, r[i]])); map.set(o.symbol, o); }
  return map;
}

// The newest original N-PORT filing for a series (amendments are skipped).
//
// A fund family files one N-PORT per fund under a single registrant (Vanguard Index Funds
// files about a hundred each quarter). data.sec.gov lists the registrant's filings; the
// small header file of each one names the fund (series) it covers. We walk them newest
// first and remember every series we pass, so the next fund from the same family is
// usually already found. (EDGAR's older company-search page stopped answering scripted
// requests, which is what this replaced.)
const byRegistrant = new Map();   // cik -> { filings: [...], next: 0, found: Map(seriesId -> filing) }
async function latestFiling(seriesId, cik) {
  const key = String(cik);
  let reg = byRegistrant.get(key);
  if (!reg) {
    const d = await get(`https://data.sec.gov/submissions/CIK${key.padStart(10, "0")}.json`, true);
    const r = d.filings.recent;
    const filings = [];
    for (let i = 0; i < r.form.length; i++) {
      if (r.form[i] === "NPORT-P") filings.push({ acc: r.accessionNumber[i], filed: r.filingDate[i] });
    }
    reg = { filings, next: 0, found: new Map() };
    byRegistrant.set(key, reg);
  }
  while (!reg.found.has(seriesId) && reg.next < reg.filings.length) {
    const f = reg.filings[reg.next++];
    const dir = `https://www.sec.gov/Archives/edgar/data/${key}/${f.acc.replace(/-/g, "")}`;
    const head = await get(`${dir}/${f.acc}-index-headers.html`);
    const series = (head.match(/<SERIES-ID>\s*(S\d+)/) || [])[1];
    if (series && !reg.found.has(series)) reg.found.set(series, { url: `${dir}/primary_doc.xml`, filed: f.filed });
  }
  const hit = reg.found.get(seriesId);
  if (!hit) throw new Error(`no NPORT-P filing found for series ${seriesId}`);
  return hit;
}

export async function fundFromNport(ticker, series, lookups) {
  const s = series.get(ticker);
  if (!s) throw new Error(`${ticker} is not in the SEC's fund ticker list`);
  const filing = await latestFiling(s.seriesId, s.cik);
  const doc = parseNport(await get(filing.url));
  if (doc.seriesId !== s.seriesId) throw new Error(`filing is for series ${doc.seriesId}, expected ${s.seriesId}`);
  if (!doc.equities.length) throw new Error("the filing lists no common stock");
  const byValue = [...doc.equities].sort((a, b) => b.value - a.value);
  const seen = new Set(), screened = [], how = { ticker: 0, cusip: 0, name: 0 };
  const weights = {};   // flagged ticker -> percent of the fund (the filing's pctVal)
  const topBy = new Map(); // every matched ticker -> percent, for the fund's largest holdings
  let mapped = 0, mappedValue = 0, totalValue = 0;
  for (const h of byValue) {
    totalValue += h.value;
    const hit = tickerFor(h, lookups);
    if (!hit) continue;
    mapped++; mappedValue += h.value; how[hit.how]++;
    const plain = String(hit.t).toUpperCase().replace(/-/g, ".");
    topBy.set(plain, (topBy.get(plain) || 0) + h.pct);
    const form = screenedForm(hit.t);
    if (form && !seen.has(form)) { seen.add(form); screened.push(form); }
    if (form) weights[form] = Number(((weights[form] || 0) + h.pct).toFixed(4));
  }
  const companies = new Set(doc.equities.map((h) => normName(h.name) || h.cusip)).size;
  const top = [...topBy].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t, p]) => [t, Number(p.toFixed(3))]);
  return {
    basket: screened, weights, top,
    source: {
      fund: ticker, label: doc.seriesName, via: "nport", asOf: fmtDate(doc.asOf), filed: filing.filed, url: filing.url,
      totalHoldings: doc.equities.length, totalCompanies: companies, screened: screened.length,
      matched: mapped, matchedShare: Number((mappedValue / totalValue).toFixed(3)), matchedBy: how,
    },
  };
}

async function main() {
  const only = process.argv.slice(2).map((t) => t.toUpperCase());
  const wanted = Object.entries(SOURCES).filter(([, t]) => !only.length || only.includes(t));
  // Start from what we already have, so a fund whose fetch fails keeps its last good data.
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { baskets: {}, sources: {} };
  const baskets = { ...prev.baskets }, sources = { ...prev.sources }, weights = { ...(prev.weights || {}) }, top = { ...(prev.top || {}) };
  const lookups = loadLookups();
  const series = await seriesByTicker();
  let ok = 0;
  for (const [basisKey, ticker] of wanted) {
    process.stdout.write(`${ticker.padEnd(6)}(${basisKey}) `);
    try {
      const { basket, source, weights: w, top: tp } = await fundFromNport(ticker, series, lookups);
      baskets[basisKey] = basket; sources[basisKey] = source; weights[basisKey] = w; top[basisKey] = tp; ok++;
      console.log(`${source.totalHoldings} stocks, ${source.screened} flagged, ${Math.round(source.matchedShare * 100)}% of value matched (as of ${source.asOf})`);
    } catch (e) {
      console.log(`FAILED: ${e.message}${baskets[basisKey] ? " (keeping the last good data)" : ""}`);
      if (!baskets[basisKey]) sources[basisKey] = { fund: ticker, via: "nport", error: e.message };
    }
  }
  if (!ok) { console.error("\nNothing fetched. Leaving the file as it was."); process.exit(1); }
  writeFileSync(OUT, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "SEC Form N-PORT filings", sources, baskets, weights, top }) + "\n");
  console.log(`\nWrote ${ok} of ${wanted.length} funds → ${OUT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1); });
