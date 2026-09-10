// Writes public/sitemap.xml: the home page plus one URL per fund we can see inside, so
// "what's inside VOO" style searches have a page to land on. Run: node scripts/build-sitemap.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FUNDS } from "../server/lib/funds.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "https://www.plainstreet.org";
const today = new Date().toISOString().slice(0, 10);
const urls = ["/", "/#methodology", ...Object.keys(FUNDS).map((s) => `/?symbol=${s}`)];
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${BASE}${u.replace(/&/g, "&amp;")}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>
`;
writeFileSync(join(HERE, "..", "public", "sitemap.xml"), xml);
console.log(`sitemap: ${urls.length} URLs`);
