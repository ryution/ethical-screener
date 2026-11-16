// Every U.S. registered fund ticker (mutual funds and ETFs), from the SEC's public list.
// The app only looks inside the funds in server/lib/funds.js. This list lets it tell a
// fund it doesn't cover ("a fund we don't look inside yet") from a symbol it has never
// heard of, instead of answering "we don't recognize" for something like PDBC.
//
// Usage:  node scripts/fetch-fund-tickers.mjs   (part of npm run refresh:data)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "server", "generated", "fund-tickers.json");
const UA = process.env.SEC_USER_AGENT || "PlainStreet Analyzer (ren@involego.com)";

const res = await fetch("https://www.sec.gov/files/company_tickers_mf.json", { headers: { "User-Agent": UA } });
if (!res.ok) { console.error(`SEC fund list: ${res.status}`); process.exit(1); }
const d = await res.json();
const col = d.fields.indexOf("symbol");
const symbols = [...new Set(d.data.map((r) => String(r[col] || "").toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(s)))].sort();
if (symbols.length < 1000) { console.error(`only ${symbols.length} symbols; leaving the file as it was`); process.exit(1); }
writeFileSync(OUT, JSON.stringify({ lastUpdated: new Date().toISOString(), source: "SEC company_tickers_mf.json", count: symbols.length, symbols }) + "\n");
console.log(`Wrote ${symbols.length} fund tickers → ${OUT}`);
