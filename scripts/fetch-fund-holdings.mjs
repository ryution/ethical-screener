// Live ETF/mutual-fund holdings — pulls each fund's latest official portfolio from SEC
// EDGAR's NPORT-P filing (the quarterly holdings disclosure every US registered fund
// must file — free, no API key, same infrastructure as scripts/enrich-edgar.mjs).
//
// Funds are identified by (registrant CIK, seriesId): a fund family like Vanguard Index
// Funds files ONE NPORT-P per series (fund) per period under a shared CIK, so the series
// disambiguates which fund's holdings we're reading. CIK/seriesId pairs below were
// resolved and cross-checked against SEC's official ticker->series map
// (https://www.sec.gov/files/company_tickers_mf.json) and EDGAR's series browse
// (browse-edgar?action=getcompany&CIK={cik}&scd=series). Single-fund trusts (SPY, QQQ)
// don't use series registration, so we read the CIK's latest NPORT-P directly.
//
// NPORT-P holdings carry a legal issuer name, not a ticker — matching against our
// screened tickers is done by comparing normalized name tokens (strip suffixes like
// INC/CORP, compare as sets), not substring/exact match, since "Exxon Mobil Corp" and
// our curated "ExxonMobil" don't share a literal substring.
//
// Usage:
//   node scripts/fetch-fund-holdings.mjs            # all funds
//   node scripts/fetch-fund-holdings.mjs --only VOO,QQQ

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCREENS } from "../server/lib/screens.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "generated", "fund-holdings.json");
const COMPANIES_FILE = join(HERE, "..", "server", "generated", "companies.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer research@plainstreet.app";

const args = process.argv.slice(2);
const onlyArg = args.indexOf("--only");
const ONLY = onlyArg >= 0 ? args[onlyArg + 1].split(",").map((t) => t.trim().toUpperCase()) : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}
async function getJson(url) {
  return JSON.parse(await getText(url));
}

// Registrant CIK + seriesId for each fund we surface. seriesId: null means the CIK is a
// single-fund trust (SPY, QQQ) — read its latest NPORT-P directly, no series filter needed.
const FILERS = {
  VOO:   { cik: 36405,   seriesId: "S000002839" },
  VFIAX: { cik: 36405,   seriesId: "S000002839" }, // same series as VOO — different share class, same holdings
  VTI:   { cik: 36405,   seriesId: "S000002848" },
  VTSAX: { cik: 36405,   seriesId: "S000002848" }, // same series as VTI
  IVV:   { cik: 1100663, seriesId: "S000004310" },
  ITOT:  { cik: 1100663, seriesId: "S000004317" },
  SPLG:  { cik: 1064642, seriesId: "S000006983" }, // ticker renamed SPYM by SEC in late 2025; series unchanged
  FXAIX: { cik: 819118,  seriesId: "S000006027" },
  SWPPX: { cik: 904333,  seriesId: "S000005911" },
  SPY:   { cik: 884394,  seriesId: null },
  QQQ:   { cik: 1067839, seriesId: null },
};

const pad10 = (cik) => String(cik).padStart(10, "0");

async function latestAccession({ cik, seriesId }) {
  if (seriesId) {
    const atom = await getText(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${seriesId}&type=NPORT-P&dateb=&owner=include&count=1&output=atom`
    );
    const m = atom.match(/accession-number=([\d-]+)/);
    if (!m) throw new Error(`no NPORT-P found for series ${seriesId}`);
    return m[1];
  }
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`);
  const recent = sub.filings.recent;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i].startsWith("NPORT-P")) return recent.accessionNumber[i];
  }
  throw new Error(`no NPORT-P found for CIK ${cik}`);
}

const xmlDecode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');

// Pull every <invstOrSec> block's name/pctVal/assetCat/issuerCat with regex — the NPORT
// schema is fixed and well-formed, so a full XML parser would be overkill here (same
// call enrich-edgar.mjs makes for its JSON, just one format over).
function parseHoldings(xml) {
  const out = [];
  for (const block of xml.matchAll(/<invstOrSec>([\s\S]*?)<\/invstOrSec>/g)) {
    const body = block[1];
    const name = body.match(/<name>([^<]*)<\/name>/)?.[1];
    const pctVal = body.match(/<pctVal>([^<]*)<\/pctVal>/)?.[1];
    const assetCat = body.match(/<assetCat[^>]*>([^<]*)<\/assetCat>/)?.[1] ?? body.match(/<assetCat value="([^"]*)"/)?.[1];
    if (!name) continue;
    out.push({ name: xmlDecode(name), pctVal: pctVal ? Number(pctVal) : 0, assetCat: assetCat || null });
  }
  return out;
}

// ── Name matching: token-set comparison against our screened-company universe ──────

const STOPWORDS = new Set([
  "THE", "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED",
  "LLC", "LP", "PLC", "TRUST", "HOLDINGS", "HOLDING", "GROUP", "CLASS", "SA", "NV", "AG",
  "SE", "SPA", "AB", "AS", "COS",
]);
function tokens(name) {
  return new Set(
    String(name)
      .toUpperCase()
      .replace(/&/g, " AND ")
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
  );
}
function isSubset(small, big) {
  for (const t of small) if (!big.has(t)) return false;
  return true;
}
// One-word display names ("ExxonMobil") vs NPORT's spaced legal name ("Exxon Mobil
// Corp") share no token in common, so fall back to a squashed (no-space) substring
// check for these — "EXXONMOBIL" is a substring of "EXXONMOBILCORP".
const squash = (name) =>
  String(name).toUpperCase().replace(/&/g, "AND").replace(/[^A-Z0-9]/g, "");

// Companies that legally renamed themselves since the curated reason text was written,
// so their old display name shares no token with the current NPORT filing name. A
// generic "try the ticker itself" fallback was tested and rejected — it matched
// "HP Inc" (the printer company) against ticker HP (Helmerich & Payne, an oil driller)
// purely because the ticker string appears in HP Inc's own name. Explicit, reviewed
// aliases only.
const NAME_ALIASES = {
  SLB: "SLB Limited", // formerly Schlumberger, renamed 2022
};

function buildScreenedIndex() {
  const companies = existsSync(COMPANIES_FILE) ? JSON.parse(readFileSync(COMPANIES_FILE, "utf8")) : {};
  const byTicker = new Map(); // ticker -> name
  for (const s of SCREENS) for (const [t, reason] of Object.entries(s.tickers)) if (!byTicker.has(t)) byTicker.set(t, reason.split(" — ")[0]);
  for (const [t, c] of Object.entries(companies.companies || {})) if (!byTicker.has(t) && c.name) byTicker.set(t, c.name);

  return [...byTicker.entries()].map(([ticker, name]) => {
    const alias = NAME_ALIASES[ticker];
    return {
      ticker,
      name,
      tokens: tokens(name),
      aliasTokens: alias ? tokens(alias) : null,
      squashed: squash(name),
    };
  });
}

function matchTicker(holdingName, index) {
  const hTokens = tokens(holdingName);
  const hSquashed = squash(holdingName);
  if (!hTokens.size) return null;
  let best = null;
  for (const cand of index) {
    let overlap = 0;
    if (cand.tokens.size) {
      const smaller = cand.tokens.size <= hTokens.size ? cand.tokens : hTokens;
      const larger = smaller === cand.tokens ? hTokens : cand.tokens;
      if (isSubset(smaller, larger)) overlap = smaller.size;
    }
    // Require a reasonably long squashed name before trusting a bare substring match,
    // so a short name (e.g. "3M Co" -> "3MCO") can't collide inside an unrelated holding.
    if (!overlap && cand.squashed.length >= 5 && hSquashed.includes(cand.squashed)) overlap = 1;
    if (!overlap && cand.aliasTokens?.size && isSubset(cand.aliasTokens, hTokens)) overlap = cand.aliasTokens.size;
    if (overlap && (!best || overlap > best.overlap)) best = { ticker: cand.ticker, overlap };
  }
  return best?.ticker || null;
}

async function main() {
  const wanted = ONLY || Object.keys(FILERS);
  const index = buildScreenedIndex();
  console.log(`Matching against ${index.length} screened companies (curated + EDGAR-enriched).`);

  // Reuse anything we already have so a --only run doesn't wipe the other funds.
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).funds || {} : {};
  const funds = { ...prev };
  for (const ticker of wanted) {
    const filer = FILERS[ticker];
    if (!filer) { console.warn(`skip ${ticker}: no CIK/series mapping`); continue; }
    try {
      const acc = await latestAccession(filer);
      const nodash = acc.replace(/-/g, "");
      const xml = await getText(`https://www.sec.gov/Archives/edgar/data/${filer.cik}/${nodash}/primary_doc.xml`);
      const filingDateMatch = xml.match(/<repPdDate>([^<]*)<\/repPdDate>/);
      const holdings = parseHoldings(xml);
      const holds = new Set();
      for (const h of holdings) {
        const t = matchTicker(h.name, index);
        if (t) holds.add(t);
      }
      funds[ticker] = {
        source: "SEC NPORT-P",
        accessionNumber: acc,
        filingPeriodEnd: filingDateMatch?.[1] || null,
        totalPositions: holdings.length,
        holds: [...holds].sort(),
      };
      console.log(`  ${ticker}: ${holdings.length} positions -> ${holds.size} flagged matches`);
    } catch (e) {
      console.warn(`  skip ${ticker}: ${e.message}`);
    }
    await sleep(150);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({ lastUpdated: new Date().toISOString(), source: "SEC EDGAR NPORT-P filings", funds }, null, 0) + "\n"
  );
  console.log(`\nWrote ${Object.keys(funds).length} funds -> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
