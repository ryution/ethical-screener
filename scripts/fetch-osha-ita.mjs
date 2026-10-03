// Builds per-company workplace injury rates from OSHA's Injury Tracking Application.
//
// Employers above a size threshold must file OSHA Form 300A every year. The file carries
// total hours worked alongside the case counts, so the rate is normalised by LABOUR HOURS,
// not headcount — which is the whole reason this measure is usable. A raw violation count
// ranks companies by how many people they employ; a rate does not.
//
// Two benchmarks come out of the same dataset, which is deliberate. Comparing a company to
// BLS would mix populations and reporting rules; comparing it to the other ITA filers in
// its own NAICS is exactly like-for-like. And because the data is per ESTABLISHMENT, a
// company's own sites act as a control on each other: same work, same equipment, same
// policies, so a wide spread is management rather than the nature of the job.
//
// Matching is deliberately strict. A record is attributed to a ticker only when its
// employer name matches the parent or a subsidiary named in that company's own Exhibit 21
// (see scripts/fetch-subsidiaries.mjs). Everything else is dropped and counted. Putting a
// real injury record on the wrong company is the worst thing this pipeline could do.
//
// Usage:
//   node scripts/fetch-osha-ita.mjs                 # the default year set
//   node scripts/fetch-osha-ita.mjs --years 2024,2025
//   node scripts/fetch-osha-ita.mjs --unmatched 40  # show the biggest employers we missed
//
// Output → server/generated/osha-injury.json

import { createWriteStream, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "server", "generated", "osha-injury.json");
const CACHE = join(ROOT, ".cache", "osha");

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const YEARS = (argOf("--years") || "2023,2024,2025").split(",").map((y) => y.trim());
const SHOW_UNMATCHED = Number(argOf("--unmatched")) || 0;

// OSHA publishes one file per year; the names encode the extract date, so they are listed
// rather than derived. Summary (300A) only — the case-detail files are a later step.
const SOURCES = {
  2025: "https://www.osha.gov/sites/default/files/ITA_300A_Summary_Data_2025_through_03-15-2026_v2.csv",
  2024: "https://www.osha.gov/sites/default/files/ITA_300A_Summary_Data_2024_through_12-31-2025.zip",
  2023: "https://www.osha.gov/sites/default/files/ITA_300A_Summary_Data_2023_through_12-31-2024.zip",
  2022: "https://www.osha.gov/sites/default/files/ITA-data-cy2022.zip",
  2021: "https://www.osha.gov/sites/default/files/ITA-data-cy2021.zip",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ── matching keys ────────────────────────────────────────────────────────────
// Strip every non-alphanumeric so "Wal-Mart Stores East, LP" and "Walmart Stores East LP"
// land on the same key, and canonicalise the corporate form so the SEC's "TARGET CORP"
// meets OSHA's "Target Corporation". The form is normalised, never dropped: "Target
// Brands, Inc." must stay distinct from "Target Corp", so only the legal-form word is
// folded, not the name in front of it.
const FORM = [
  [/\bINCORPORATED\b/g, "INC"], [/\bCORPORATION\b/g, "CORP"], [/\bCOMPANY\b/g, "CO"],
  [/\bLIMITED\b/g, "LTD"], [/\bL\.?L\.?C\.?\b/g, "LLC"], [/\bL\.?P\.?\b/g, "LP"],
];
function key(s) {
  let t = String(s || "").toUpperCase().replace(/[^A-Z0-9.]/g, " ");
  for (const [re, to] of FORM) t = t.replace(re, to);
  return t.replace(/[^A-Z0-9]/g, "");
}

// Filers mistype the hours box, and the errors are enormous — one establishment in the
// 2025 file reports 140 billion hours for 137 people. Left in, a handful of these swamp
// every aggregate they touch: they drove the warehousing benchmark to a DART of 0.1,
// which would have made every real warehouse look 40× worse than its industry.
// A full-time year is ~2,000 hours; this band is wide enough for heavy overtime and for
// mostly-seasonal sites, and still excludes anything physically impossible.
const HPE_MIN = 100, HPE_MAX = 4000;
function plausible(r) {
  if (r.hours <= 0 || r.emp <= 0) return false;      // no denominator, or nothing to check it against
  const hpe = r.hours / r.emp;
  return hpe >= HPE_MIN && hpe <= HPE_MAX;
}

// ── a streaming CSV line splitter (quoted fields, embedded commas) ───────────
function splitCsv(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 1000) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  process.stdout.write(`  downloading ${url.split("/").pop()} … `);
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await new Promise((res, rej) => {
    const f = createWriteStream(dest);
    Readable.fromWeb(r.body).pipe(f).on("finish", res).on("error", rej);
  });
  console.log(`${(statSync(dest).size / 1e6).toFixed(0)} MB`);
  return dest;
}

// The zipped years need unzipping; macOS and Linux both ship `unzip`.
async function ensureCsv(year) {
  const url = SOURCES[year];
  if (!url) throw new Error(`no source for ${year}`);
  const raw = join(CACHE, url.split("/").pop());
  await download(url, raw);
  if (!raw.endsWith(".zip")) return raw;
  const dir = raw.replace(/\.zip$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    const { execFileSync } = await import("node:child_process");
    execFileSync("unzip", ["-o", "-q", raw, "-d", dir]);
  }
  const { readdirSync } = await import("node:fs");
  const csv = readdirSync(dir).find((f) => f.toLowerCase().endsWith(".csv"));
  if (!csv) throw new Error(`no csv inside ${raw}`);
  return join(dir, csv);
}

const num = (x) => { const n = Number(String(x || "").trim()); return Number.isFinite(n) ? n : 0; };
const RATE = 200000; // OSHA's basis: 100 full-time workers × 2,000 hours

async function main() {
  // ── the name → ticker lookup, from Exhibit 21 ──
  const subsFile = join(ROOT, "server", "generated", "subsidiaries.json");
  if (!existsSync(subsFile)) {
    console.error("Missing server/generated/subsidiaries.json — run scripts/fetch-subsidiaries.mjs first.");
    process.exit(1);
  }
  const subs = JSON.parse(readFileSync(subsFile, "utf8")).companies || {};
  const owner = new Map();            // normalised employer name → ticker
  const collide = new Set();
  // `curated` marks a hand-verified alias. The length guard exists to stop a short,
  // generic auto-derived name from swallowing unrelated employers — but a verified alias
  // has already cleared that bar by inspection, and UPS files 1,294 establishments under
  // exactly three characters.
  const claim = (name, ticker, curated = false) => {
    const k = key(name);
    if (!k || (!curated && k.length < 4)) return;
    const prev = owner.get(k);
    if (prev && prev !== ticker) { collide.add(k); owner.delete(k); return; }  // ambiguous → nobody gets it
    if (!collide.has(k)) owner.set(k, ticker);
  };
  for (const [ticker, c] of Object.entries(subs)) {
    claim(c.name, ticker);
    for (const s of c.subsidiaries || []) claim(s, ticker);
  }
  // Exhibit 21 carries legal names; employers file under the name on the building. The
  // curated alias list closes that gap — see server/lib/employer-aliases.js for the bar.
  const { aliasPairs } = await import("../server/lib/employer-aliases.js");
  let aliased = 0;
  for (const [name, ticker] of aliasPairs()) { if (subs[ticker]) { claim(name, ticker, true); aliased++; } }
  console.log(`Employer-name map: ${owner.size} names (${aliased} curated aliases) → ${Object.keys(subs).length} companies` +
              (collide.size ? `  (${collide.size} ambiguous names dropped)` : ""));

  // ── aggregate ──
  const perCompany = new Map();  // ticker → year → totals
  const perNaics = new Map();    // naics(4) → year → totals   (the benchmark population)
  const unmatched = new Map();   // employer name → hours, for coverage reporting

  const blank = () => ({ sites: 0, emp: 0, hours: 0, dafw: 0, djtr: 0, other: 0, deaths: 0, dafwDays: 0, djtrDays: 0 });
  const add = (bucket, r) => {
    bucket.sites += 1;
    bucket.emp += r.emp; bucket.hours += r.hours;
    bucket.dafw += r.dafw; bucket.djtr += r.djtr; bucket.other += r.other; bucket.deaths += r.deaths;
    bucket.dafwDays += r.dafwDays; bucket.djtrDays += r.djtrDays;
  };

  for (const year of YEARS) {
    console.log(`\n${year}:`);
    const csv = await ensureCsv(year);
    const rl = createInterface({ input: createReadStream(csv, { encoding: "utf8" }), crlfDelay: Infinity });
    let head = null, idx = {}, rows = 0, matched = 0, dropped = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (!head) {
        head = splitCsv(line).map((h) => h.trim());
        head.forEach((h, i) => { idx[h] = i; });
        continue;
      }
      const f = splitCsv(line);
      rows++;
      const r = {
        company: f[idx.company_name] || f[idx.establishment_name] || "",
        naics: String(f[idx.naics_code] || "").slice(0, 4),
        emp: num(f[idx.annual_average_employees]),
        hours: num(f[idx.total_hours_worked]),
        dafw: num(f[idx.total_dafw_cases]), djtr: num(f[idx.total_djtr_cases]),
        other: num(f[idx.total_other_cases]), deaths: num(f[idx.total_deaths]),
        dafwDays: num(f[idx.total_dafw_days]), djtrDays: num(f[idx.total_djtr_days]),
      };
      if (!plausible(r)) { dropped++; continue; }

      if (r.naics) {
        if (!perNaics.has(r.naics)) perNaics.set(r.naics, {});
        const y = perNaics.get(r.naics);
        y[year] ||= blank();
        add(y[year], r);
      }

      const ticker = owner.get(key(r.company));
      if (!ticker) {
        if (SHOW_UNMATCHED) unmatched.set(r.company, (unmatched.get(r.company) || 0) + r.hours);
        continue;
      }
      matched++;
      if (!perCompany.has(ticker)) perCompany.set(ticker, {});
      const y = perCompany.get(ticker);
      y[year] ||= blank();
      // Keep the NAICS a company actually operates under, weighted by hours, so the
      // benchmark compares warehouses to warehouses rather than to its HQ's code.
      y[year].naics ||= new Map();
      y[year].naics.set(r.naics, (y[year].naics.get(r.naics) || 0) + r.hours);
      y[year].spread ||= [];
      y[year].spread.push((r.dafw + r.djtr) * RATE / r.hours);
      add(y[year], r);
    }
    console.log(`  ${rows.toLocaleString()} establishments · ${dropped.toLocaleString()} implausible rows dropped · ${matched.toLocaleString()} matched to a ticker`);
  }

  // ── derive rates ──
  const dart = (b) => b.hours > 0 ? (b.dafw + b.djtr) * RATE / b.hours : null;
  const trir = (b) => b.hours > 0 ? (b.dafw + b.djtr + b.other) * RATE / b.hours : null;
  const round = (n, d = 2) => n == null ? null : Number(n.toFixed(d));

  const benchmarks = {};
  for (const [naics, years] of perNaics) {
    for (const [year, b] of Object.entries(years)) {
      if (b.sites < 20) continue;  // too thin to be a benchmark
      (benchmarks[naics] ||= {})[year] = { dart: round(dart(b)), trir: round(trir(b)), sites: b.sites };
    }
  }

  const companies = {};
  for (const [ticker, years] of perCompany) {
    const out = {};
    for (const [year, b] of Object.entries(years)) {
      const naics = [...b.naics.entries()].sort((x, y2) => y2[1] - x[1])[0]?.[0] || null;
      const bench = naics && benchmarks[naics]?.[year]?.dart;
      const d = dart(b);
      const sorted = b.spread.slice().sort((x, y2) => x - y2);
      const pct = (p) => sorted.length ? round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]) : null;
      out[year] = {
        sites: b.sites,
        employees: Math.round(b.emp),
        hours: Math.round(b.hours),
        hoursPerEmployee: b.emp > 0 ? Math.round(b.hours / b.emp) : null,
        dart: round(d), trir: round(trir(b)),
        // The raw case count is what says whether the rate means anything: these are
        // roughly Poisson, so the relative error is about 1/sqrt(cases).
        cases: Math.round(b.dafw + b.djtr),
        deaths: b.deaths,
        naics,
        industryDart: bench ?? null,
        vsIndustry: (bench && d != null) ? round(d / bench) : null,
        siteSpread: b.spread.length >= 5 ? { p10: pct(0.10), p50: pct(0.50), p90: pct(0.90) } : null,
      };
    }
    // An employer's filed establishment count can jump between years — Costco reports 711
    // sites in 2024 and 1,511 in 2025 — so consecutive rates may describe different
    // populations. Mark it rather than let a trend be read off a moving base.
    const yrs = Object.keys(out).sort();
    for (let i = 1; i < yrs.length; i++) {
      const a = out[yrs[i - 1]].sites, b = out[yrs[i]].sites;
      if (a > 0 && (b / a > 1.35 || b / a < 0.74)) out[yrs[i]].coverageShift = round(b / a);
    }
    companies[ticker] = out;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    source: "OSHA Injury Tracking Application, Form 300A summary data (employer-filed)",
    method: `DART = (days-away + job-transfer/restriction cases) × ${RATE} / hours worked. Industry benchmark is the median-equivalent rate across all ITA filers in the same 4-digit NAICS and year, so the comparison population and reporting rules are identical.`,
    caveat: "Under-reporting is documented and never symmetric: a high rate is hard to fake, a low one is not. A rate at or below benchmark means 'no adverse measure on file', never a clean workplace.",
    years: YEARS,
    count: Object.keys(companies).length,
    companies,
    benchmarks,
  }, null, 2) + "\n");

  console.log(`\nWrote ${OUT}`);
  console.log(`  companies with data : ${Object.keys(companies).length}`);
  console.log(`  NAICS benchmarks    : ${Object.keys(benchmarks).length}`);

  if (SHOW_UNMATCHED) {
    console.log(`\nLargest unmatched employers (by hours) — candidates for the Exhibit 21 map:`);
    [...unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, SHOW_UNMATCHED)
      .forEach(([n, h]) => console.log(`  ${(h / 1e6).toFixed(1).padStart(7)}M hrs  ${n}`));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
