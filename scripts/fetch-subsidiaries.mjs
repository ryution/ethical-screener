// Builds the parent → subsidiary name map from Exhibit 21 of each company's latest 10-K.
//
// Why this exists: OSHA, EPA and most other regulators identify an employer by its
// operating legal entity, not by ticker. Amazon's warehouses file injury data as
// "Amazon.com Services LLC" under EIN 710933087 — the parent's own SEC EIN (911646860)
// appears nowhere in that dataset. Without an authoritative map, attributing a record to
// a ticker is guesswork, and a wrong guess puts real misconduct on an innocent company.
//
// Exhibit 21 is the company's own filed list of subsidiaries, which makes it the one
// source we can defend. Item 601(b)(21) only requires *significant* subsidiaries, so the
// list is deliberately incomplete — that is a reason to drop unmatched records, never to
// fill the gap by guessing.
//
// Usage:
//   node scripts/fetch-subsidiaries.mjs                    # every curated + flagged ticker
//   node scripts/fetch-subsidiaries.mjs --seed AMZN,WMT     # a targeted run
//   node scripts/fetch-subsidiaries.mjs --limit 50
//
// Output → server/generated/subsidiaries.json

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "generated", "subsidiaries.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";

const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const SEED = argOf("--seed")?.split(",").map((t) => t.trim().toUpperCase()) || null;
const LIMIT = Number(argOf("--limit")) || Infinity;
const FRESH = args.includes("--fresh");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad10 = (cik) => String(cik).padStart(10, "0");

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

// Exhibit 21 is a table or a plain list, and filers use both. Splitting on row and line
// boundaries before stripping tags keeps one subsidiary per line either way.
function parseExhibit21(html, filerName) {
  const rows = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .split(/<\/tr>|<br\s*\/?>|<\/p>|<\/div>/i);

  const names = [];
  for (const row of rows) {
    // Cell boundaries become tabs so we can keep column 1 (the legal name) and drop the
    // jurisdiction and ownership columns that sit beside it.
    const cells = row
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
      .split("\t");

    let name = (cells[0] || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    // A one-cell row is an untabulated list line, with the jurisdiction trailing in
    // brackets or parens: "Acme Holdings LLC (Delaware)", "84.51 LLC [Ohio]".
    if (cells.length === 1) name = name.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();
    if (!isSubsidiaryName(name)) continue;
    if (bareKey(name) === bareKey(filerName)) continue;   // the parent heading its own list
    names.push(name);
  }
  return [...new Set(names)];
}

// Header rows, jurisdictions and page furniture all land in column 1 too. Require
// something that looks like a company name and reject the known non-names.
const NOT_A_NAME = /^(legal\s*name|name of|name\b|subsidiar|jurisdiction|state or|state of|country|percent|ownership|owned|entity|exhibit|list of|document|table of contents|organized under|place of|incorporation|organization)/i;
const JURISDICTION_ONLY = /^(delaware|nevada|california|new york|texas|washington|england|wales|ireland|luxembourg|netherlands|singapore|japan|germany|france|canada|india|china|brazil|mexico|australia|spain|italy|united states|u\.s\.a?\.?)\s*$/i;
// SEC prepends a document-header row ("EX-21.1 2 amzn-…htm EX-21.1 Document") to the
// exhibit, and filers open with their own name and a title line. None are subsidiaries.
const FILING_FURNITURE = /\.htm|^ex-?\s?\d|section \d{3,}|sarbanes|certification|pursuant to|subsidiaries of|^as of |^also doing business as|^d\/b\/a/i;

// Corporate form carries no identity: "Target Corporation" and "Target Corp" are one
// company. Stripping it lets an exact compare separate a parent from its namesakes —
// "Target Brands, Inc." survives, the filer's own heading does not.
// Longest form first — alternation is ordered, so "corporation" must precede "corp".
const SUFFIX = /\b(incorporated|corporation|company|holdings?|limited|inc|corp|co|llc|llp|lp|ltd|plc|nv|sa|ag|gmbh|pte|pty|srl|bv)\b/gi;
const bareKey = (s) => String(s || "").toUpperCase().replace(/\[.*?\]|\(.*?\)/g, " ")
  .replace(/[^A-Z0-9 ]/g, " ").replace(SUFFIX, " ").replace(/[^A-Z0-9]/g, "");

function isSubsidiaryName(s) {
  if (s.length < 3 || s.length > 120) return false;
  if (NOT_A_NAME.test(s)) return false;
  if (JURISDICTION_ONLY.test(s)) return false;
  if (FILING_FURNITURE.test(s)) return false;
  if (/^[\d\s.%,()-]+$/.test(s)) return false;   // pure numbers / percentages
  if (!/[A-Za-z]{2}/.test(s)) return false;
  return true;
}





async function exhibit21For(cik) {
  const sub = await getJson(`https://data.sec.gov/submissions/CIK${pad10(cik)}.json`);
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== "10-K") continue;
    const accession = r.accessionNumber[i];
    const accn = accession.replace(/-/g, "");
    const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accn}`;
    let idx;
    try { idx = await getJson(`${base}/index.json`); } catch { return null; }
    const items = idx?.directory?.item || [];
    // Filenames vary a lot: amzn-…xex211.htm, wmtexhibit21fy26.htm, ex-21.htm, ex21.txt.
    // The separator must be optional-but-tight: a loose `ex.?21` matches UPS's
    // "ups-ex321live.htm" (an EX-32.1 certification) and silently parses the wrong file.
    // "ex" (or "exhibit"), at most one separator, then literally "21". The separator class
    // must NOT be a wildcard: `ex.?21` matches "ex321", i.e. an EX-32.1 certification, and
    // we would silently parse the wrong document. Filers write the separator as -, _, .,
    // a space, or the letter x (amzn-…xex211.htm, fdx-exx21fy2026q4.htm), and exhibit 21.1
    // often appears with no separator at all (costex21110k83125.htm), so trailing digits
    // are allowed.
    const EX21 = /ex(?:hibit)?[-_.x ]?21/i;
    const cands = items.filter((it) => /\.(htm|html|txt)$/i.test(it.name) && EX21.test(it.name));
    // Prefer the shortest name: "ex-21.htm" over "ex-21-subsidiaries-of-registrant.htm"
    // is a wash, but it reliably beats an unrelated longer file that happens to match.
    const hit = cands.sort((a, b) => a.name.length - b.name.length)[0];
    if (!hit) return { accession, filed: r.filingDate[i], name: sub.name, ein: sub.ein || null, subsidiaries: [] };
    await sleep(120);
    const html = await getText(`${base}/${hit.name}`);
    return {
      accession, filed: r.filingDate[i], name: sub.name, ein: sub.ein || null,
      exhibit: `${base}/${hit.name}`,
      subsidiaries: parseExhibit21(html, sub.name),
    };
  }
  return null;
}

async function main() {
  console.log("Fetching the SEC ticker universe…");
  const universe = await getJson("https://www.sec.gov/files/company_tickers.json");
  const cikFor = new Map();
  for (const row of Object.values(universe)) {
    const t = String(row.ticker || "").toUpperCase();
    if (t && !cikFor.has(t)) cikFor.set(t, row.cik_str);
  }

  // Default universe: everything we already flag, since those are the companies whose
  // conduct records we would actually attach.
  let tickers = SEED;
  if (!tickers) {
    const { SCREEN_TICKERS } = await import("../server/lib/screens.js");
    const { enrichedTickers } = await import("../server/lib/enriched.js");
    const { filingTickers } = await import("../server/lib/filings.js");
    tickers = [...new Set([...SCREEN_TICKERS, ...enrichedTickers(), ...filingTickers()].map((t) => t.toUpperCase()))];
  }
  tickers = tickers.filter((t) => cikFor.has(t));
  if (Number.isFinite(LIMIT)) tickers = tickers.slice(0, LIMIT);

  const prev = (!FRESH && existsSync(OUT)) ? JSON.parse(readFileSync(OUT, "utf8")).companies || {} : {};
  const out = { ...prev };

  console.log(`Fetching Exhibit 21 for ${tickers.length} companies…\n`);
  let done = 0, withSubs = 0, noExhibit = 0, failed = 0;
  for (const ticker of tickers) {
    if (out[ticker] && !FRESH) { done++; continue; }
    try {
      const rec = await exhibit21For(cikFor.get(ticker));
      if (rec) {
        out[ticker] = { cik: cikFor.get(ticker), ...rec };
        if (rec.subsidiaries.length) withSubs++; else noExhibit++;
      } else { noExhibit++; }
    } catch (e) {
      failed++;
      if (failed <= 5) console.log(`  ! ${ticker}: ${e.message}`);
    }
    done++;
    if (done % 25 === 0) console.log(`  ${done}/${tickers.length}…`);
    await sleep(130); // SEC asks for <10 req/s; each company costs 2–3 requests
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const total = Object.values(out).reduce((n, c) => n + (c.subsidiaries?.length || 0), 0);
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "SEC 10-K Exhibit 21 (List of Significant Subsidiaries)",
    note: "Item 601(b)(21) requires only SIGNIFICANT subsidiaries, so this map is deliberately incomplete. Unmatched regulator records must be dropped, never guessed.",
    count: Object.keys(out).length,
    subsidiaryCount: total,
    companies: out,
  }, null, 2) + "\n");

  console.log(`\nWrote ${OUT}`);
  console.log(`  companies        : ${Object.keys(out).length}`);
  console.log(`  with subsidiaries: ${withSubs}`);
  console.log(`  no EX-21 found   : ${noExhibit}`);
  console.log(`  failed           : ${failed}`);
  console.log(`  subsidiary names : ${total}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
