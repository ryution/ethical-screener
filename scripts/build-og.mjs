// Renders the Open Graph preview images (public/og/<SYMBOL>.png + default.png) with a
// headless browser. Categories shown are computed from the live data; counts are left
// out on purpose — an image is cached by social sites for weeks and a baked-in number
// would go stale while the tags (rendered per request) stay right.
//
// Run after refreshing holdings:  node scripts/build-og.mjs
// Needs Playwright (npx playwright install chromium) — a dev-only tool, not a dependency.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FUNDS } from "../server/lib/funds.js";
import { lookupSymbol } from "../server/lib/analyzer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "og");
mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const html = ({ eyebrow, title, sub, chips }) => `<!doctype html><html><head><meta charset="utf-8">
<style>
  body{margin:0;width:1200px;height:630px;background:#232420;font-family:"Familjen Grotesk",-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#FCEBD0;position:relative;overflow:hidden}
  .glow{position:absolute;inset:0;background:radial-gradient(900px 520px at 12% -10%,#2E2B25 0%,transparent 62%)}
  .wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{font-size:30px;font-weight:600;letter-spacing:-.02em}
  .eyebrow{font-size:20px;letter-spacing:.18em;text-transform:uppercase;color:#BA9F38;margin-bottom:18px}
  h1{font-size:74px;line-height:1.04;letter-spacing:-.035em;margin:0;font-weight:600;max-width:1000px}
  h1 em{font-style:normal;color:#BA9F38}
  .sub{font-size:28px;color:#BDB6A6;margin-top:22px}
  .chips{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
  .chip{font-size:22px;font-weight:600;color:#E08A72;background:rgba(224,138,114,.14);border:1.5px solid rgba(224,138,114,.45);border-radius:999px;padding:8px 18px}
  .foot{display:flex;justify-content:space-between;align-items:center;color:#948D80;font-size:22px}
</style></head><body><div class="glow"></div><div class="wrap">
  <div><div class="eyebrow">${esc(eyebrow)}</div><h1>${title}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div>
  <div>${chips.length ? `<div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}</div>
  <div class="foot"><span class="brand">PlainStreet</span><span>plainstreet.org · free, no account needed</span></div>
</div></body></html>`;

const cards = [["default", html({
  eyebrow: "The ethical portfolio analyzer",
  title: "Is your money already funding <em>what you fight against?</em>",
  sub: "Search any stock or ETF ticker to see what's really inside it.",
  chips: ["Fossil fuels", "Weapons & defense", "Tobacco", "Opioid crisis", "Surveillance & data", "Factory farming"],
})]];
for (const sym of Object.keys(FUNDS)) {
  const r = lookupSymbol(sym);
  const labels = new Map();
  for (const c of r.contains) for (const f of c.flags) labels.set(f.label, (labels.get(f.label) || 0) + 1);
  const chips = [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
  cards.push([sym, html({
    eyebrow: "What's really inside",
    title: `<em>${esc(sym)}</em> · ${esc(r.name)}`,
    sub: r.contains.length ? `Tracks ${r.basis}. Flagged holdings by category:` : `Tracks ${r.basis}.`,
    chips,
  })]);
}

const { chromium } = await import("playwright");
const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC, args: ["--no-sandbox"] } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, markup] of cards) {
  await page.setContent(markup, { waitUntil: "load" });
  await page.waitForTimeout(150);
  writeFileSync(join(OUT, `${name}.png`), await page.screenshot({ type: "png" }));
  process.stdout.write(`${name} `);
}
await browser.close();
console.log(`\nwrote ${cards.length} images → public/og/`);
