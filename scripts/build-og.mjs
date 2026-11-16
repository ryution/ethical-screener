// Renders the link-preview images (public/og/<SYMBOL>.png + default.png): the picture
// iMessage, Slack and X show when someone shares a link. They match the site: navy ground,
// DM Serif headline, sky and coral, and each fund's own dot field (one dot per company,
// coral for the flagged ones, the same idea as the hero image).
//
// No numbers are written on the image. Sites cache a preview for weeks, so a printed count
// would go stale while the page's text tags (rendered per request) stay right. The dots
// keep the real proportion, which drifts slowly.
//
// Run after refreshing holdings:  node scripts/build-og.mjs
// Renders with Playwright if it is installed, otherwise with a local Google Chrome
// (CHROME=/path/to/chrome to point at another one).
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { FUNDS } from "../server/lib/funds.js";
import { lookupSymbol } from "../server/lib/analyzer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "public", "og");
mkdirSync(OUT, { recursive: true });

const C = { page: "#0D1119", ink: "#EDEFF3", muted: "#A5B0C5", faint: "#93A2BD", sky: "#9CCBF5", coral: "#EE7856" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hashName = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const nameKey = (n) => String(n || "").toUpperCase().replace(/\s+(?:CL|CLASS)\s+[A-Z0-9]$/, "").replace(/[^A-Z0-9]+/g, " ").trim();

// The same sunflower spiral as the hero. Big funds are drawn at most 520 dots with the
// flagged share kept, so VTI's 3,500 companies don't turn into grey mush.
function dotField(total, flaggedNames, size = 470) {
  const n = Math.max(1, Math.min(total || 500, 520));
  const flagged = Math.round((flaggedNames.length / Math.max(total || 1, 1)) * n);
  const R = size / 2 - 14, cx = size / 2, cy = size / 2;
  const coral = new Set();
  for (const name of flaggedNames.slice(0, flagged)) {
    let i = hashName(name) % n;
    while (coral.has(i)) i = (i + 1) % n;
    coral.add(i);
  }
  const dotR = Math.max(2.6, Math.min(5, (R / Math.sqrt(n)) * 0.42));
  let out = "";
  for (let i = 0; i < n; i++) {
    const r = (R * Math.sqrt(i + 0.5)) / Math.sqrt(n), a = i * 2.399963;
    const x = (cx + r * Math.cos(a)).toFixed(1), y = (cy + r * Math.sin(a)).toFixed(1);
    out += coral.has(i)
      ? `<circle cx="${x}" cy="${y}" r="${(dotR * 1.35).toFixed(2)}" fill="${C.coral}"/>`
      : `<circle cx="${x}" cy="${y}" r="${dotR.toFixed(2)}" fill="${C.sky}" fill-opacity="${(0.66 - 0.36 * (r / R)).toFixed(2)}"/>`;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
}

const page = ({ title, titleSize = 66, sub, line, art }) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Gabarito:wght@600&family=Hanken+Grotesk:wght@400;600&display=block">
<style>
  html,body{margin:0}
  body{width:1200px;height:630px;background:${C.page};color:${C.ink};font-family:"Hanken Grotesk",-apple-system,Helvetica,Arial,sans-serif;position:relative;overflow:hidden}
  .text{position:absolute;left:72px;top:64px;bottom:64px;width:570px;display:flex;flex-direction:column}
  h1{font-family:"DM Serif Display",Georgia,serif;font-weight:400;font-size:${titleSize}px;line-height:1.02;letter-spacing:-.01em;margin:0}
  .sub{font-size:27px;line-height:1.35;color:${C.muted};margin-top:22px}
  .line{font-size:23px;line-height:1.45;color:${C.coral};margin-top:22px;font-weight:600}
  .foot{margin-top:auto;display:flex;align-items:baseline;gap:18px}
  .brand{font-family:Gabarito,"Hanken Grotesk",sans-serif;font-weight:600;font-size:32px;letter-spacing:-.02em}
  .url{font-size:21px;color:${C.faint}}
  .art{position:absolute;right:56px;top:80px}
</style></head><body>
  <div class="text">
    <h1>${title}</h1>
    ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
    ${line ? `<div class="line">${esc(line)}</div>` : ""}
    <div class="foot"><span class="brand">PlainStreet</span><span class="url">plainstreet.org</span></div>
  </div>
  <div class="art">${art}</div>
</body></html>`;

// The flagged companies in a fund, one per company (GOOGL and GOOG are one).
function flaggedNames(r) {
  const seen = new Set();
  for (const c of r.contains || []) seen.add(nameKey(c.name) || c.ticker);
  return [...seen];
}

const cards = [];
{
  const voo = lookupSymbol("VOO");
  cards.push(["default", page({
    title: "Is your money invested where your values are?",
    sub: "Search any stock or ETF to see what's really inside it.",
    art: dotField(voo.totalCompanies || voo.totalHoldings, flaggedNames(voo)),
  })]);
}
for (const sym of Object.keys(FUNDS)) {
  const r = lookupSymbol(sym);
  if (!r || r.type !== "fund") continue;
  const names = flaggedNames(r);
  const labels = new Map();
  for (const c of r.contains) for (const f of c.flags) labels.set(f.label, (labels.get(f.label) || 0) + 1);
  const top = [...labels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([l]) => l);
  const titleSize = r.name.length > 40 ? 50 : r.name.length > 28 ? 56 : 64;
  cards.push([sym, page({
    title: `${esc(sym)}<br><span style="color:${C.sky}">${esc(r.name)}</span>`,
    titleSize,
    sub: `Tracks ${r.basis}.`,
    line: names.length ? `Holds companies flagged for ${top.join(", ").toLowerCase()}.` : "None of its holdings are on our lists.",
    art: dotField(r.totalCompanies || r.totalHoldings, names),
  })]);
}

// Render. Playwright if it's there, otherwise headless Chrome from the command line.
const tmp = join(tmpdir(), `og-${process.pid}`);
mkdirSync(tmp, { recursive: true });
let render;
try {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(process.env.PW_EXEC ? { executablePath: process.env.PW_EXEC, args: ["--no-sandbox"] } : {});
  const pg = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  render = async (markup, file) => {
    await pg.setContent(markup, { waitUntil: "networkidle" });
    await pg.evaluate(() => document.fonts.ready);
    writeFileSync(file, await pg.screenshot({ type: "png" }));
  };
  render.close = () => browser.close();
} catch {
  // One headless Chrome for every image, driven over the DevTools protocol (Node has
  // WebSocket built in). Chrome's own --screenshot flag would start a browser per image,
  // and on some versions it never exits afterwards.
  const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (!existsSync(chrome)) throw new Error("Neither Playwright nor Google Chrome found. Install one, or set CHROME=/path/to/chrome.");
  const { spawn } = await import("node:child_process");
  const profile = join(tmp, "profile");
  const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  // Chrome creates this file and fills it in a moment later, so wait for the port itself.
  const { readFileSync } = await import("node:fs");
  let port = "";
  for (let k = 0; k < 150 && !/^\d+$/.test(port); k++) {
    await new Promise((r) => setTimeout(r, 100));
    try { port = readFileSync(portFile, "utf8").split("\n")[0].trim(); } catch { /* not yet */ }
  }
  if (!port) throw new Error("Chrome did not open a DevTools port");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const waiting = new Map(); const events = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
    else if (d.method) events.push(d.method);
  };
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  render = async (markup, file) => {
    const html = join(tmp, "card.html");
    writeFileSync(html, markup);
    events.length = 0;
    await send("Page.navigate", { url: pathToFileURL(html).href });
    for (let k = 0; k < 200 && !events.includes("Page.loadEventFired"); k++) await new Promise((r) => setTimeout(r, 25));
    await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => 1)", awaitPromise: true });
    const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  };
  render.close = async () => {
    try { ws.close(); } catch { /* ignore */ }
    const exited = new Promise((r) => proc.once("exit", r));
    proc.kill("SIGKILL");
    await exited;
  };
}

// "node scripts/build-og.mjs VOO XBI" renders just those (plus nothing is deleted).
const only = process.argv.slice(2).map((s) => s.toUpperCase());
if (only.length) cards.splice(0, cards.length, ...cards.filter(([n]) => only.includes(n.toUpperCase())));
// Images for funds no longer in the catalogue are removed, so nothing stale gets served.
if (!only.length) for (const f of readdirSync(OUT)) if (f.endsWith(".png") && !new Set(cards.map(([n]) => `${n}.png`)).has(f)) rmSync(join(OUT, f));

for (const [name, markup] of cards) {
  await render(markup, join(OUT, `${name}.png`));
  process.stdout.write(`${name} `);
}
await render.close();
// Chrome's helper processes can still be writing to the profile for a moment.
try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir; the OS clears it */ }
console.log(`\nwrote ${cards.length} images → public/og/`);
