// Renders the site icon (public/favicon.svg) into the PNG and .ico files that search
// results, browser tabs, iPhone home screens and Android need. Google's results only use
// an icon of at least 48px that isn't SVG-only, which is why it kept showing an old one.
//
// Run after changing favicon.svg:  node scripts/build-icons.mjs
// Uses a local Google Chrome (CHROME=/path/to/chrome to point at another one).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const svg = readFileSync(join(PUB, "favicon.svg"), "utf8");
// Home-screen icons get square corners: iOS and Android round them on their own.
const square = svg.replace(/\s*rx="[^"]*"/, "");

const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) throw new Error("Google Chrome not found. Set CHROME=/path/to/chrome.");
const tmp = join(tmpdir(), `icons-${process.pid}`);
mkdirSync(tmp, { recursive: true });

// One Chrome per image with --screenshot; it is killed if it doesn't exit on its own.
async function render(markup, size, out) {
  const html = join(tmp, `i${size}.html`);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${size}px;height:${size}px">${markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</div></body></html>`);
  rmSync(out, { force: true });
  const p = spawn(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    `--user-data-dir=${join(tmp, "profile")}`, `--window-size=${size},${size}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: "ignore" });
  for (let k = 0; k < 200 && !existsSync(out); k++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 200));
  p.kill("SIGKILL");
  if (!existsSync(out)) throw new Error(`Chrome didn't write ${out}`);
  return readFileSync(out);
}

// An .ico that holds PNG images (supported by every browser since 2007).
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(([size, buf], i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map(([, b]) => b)]);
}

const outs = [
  ["favicon-48.png", svg, 48],
  ["favicon-96.png", svg, 96],
  ["icon-192.png", square, 192],
  ["icon-512.png", square, 512],
  ["apple-touch-icon.png", square, 180],
];
for (const [name, markup, size] of outs) {
  await render(markup, size, join(PUB, name));
  process.stdout.write(`${name} `);
}
const small = [];
for (const size of [16, 32, 48]) small.push([size, await render(svg, size, join(tmp, `ico${size}.png`))]);
writeFileSync(join(PUB, "favicon.ico"), ico(small));
console.log("favicon.ico");
try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp dir */ }
