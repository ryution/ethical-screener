// Server-rendered preview page for one symbol — what link-preview crawlers get.
//
// Social sites (Reddit, X, LinkedIn, Slack, iMessage, Discord…) fetch a shared URL once
// and read its <title>, <meta name="description"> and Open Graph tags. Our frontend is a
// React bundle that only fills those in after JavaScript runs, which crawlers don't do,
// so a shared "/?symbol=VOO" showed a blank card. vercel.json sends those crawlers here
// instead; the HTML they get carries the real headline for that symbol.
//
// HONESTY: the numbers here are computed from the same lookup the app uses, at request
// time — never a hand-typed figure that goes stale.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupSymbol } from "./analyzer.js";

// A fund's own preview image if scripts/build-og.mjs has made one, otherwise the general
// one. Without this check a fund added after the last image build pointed at a missing file
// and shared links showed no picture.
const OG_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "og");
const ogFor = (sym) => (existsSync(join(OG_DIR, `${sym}.png`)) ? `/og/${sym}.png` : "/og/default.png");
import { displayName, reasonParts } from "../../src/format.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Same dedupe as the UI: dual share classes (GOOG/GOOGL) are one company.
function dedupe(contains) {
  const m = new Map();
  for (const c of contains) {
    const key = displayName(c.name) || c.ticker;
    const prev = m.get(key);
    if (!prev) { m.set(key, { ...c, flags: [...c.flags] }); continue; }
    for (const f of c.flags) if (!prev.flags.some((p) => p.key === f.key)) prev.flags.push(f);
  }
  return [...m.values()];
}

/** { title, description, ogImage, body } for a symbol — also used by the sitemap. */
export function shareMeta(symbol) {
  const r = lookupSymbol(symbol);
  const sym = r?.symbol || String(symbol || "").toUpperCase();
  const fallback = {
    title: "PlainStreet: What are you really investing in?",
    description: "Search any stock or ETF ticker. Explore company exposure to controversial ethics and corporate risk, from fossil fuels and weapons to opioids and surveillance.",
    ogImage: "/og/default.png", groups: [], r,
  };
  if (!r) return fallback;
  if (r.type === "fund" && r.analyzable === false) {
    return { ...fallback, title: `${sym} · not analyzed · PlainStreet`, description: `${r.name}: ${r.notAnalyzedReason}`, r };
  }
  if (r.type === "fund") {
    const contains = dedupe(r.contains);
    const byFlag = new Map();
    for (const c of contains) for (const f of c.flags) byFlag.set(f.label, (byFlag.get(f.label) || 0) + 1);
    const groups = [...byFlag.entries()].sort((a, b) => b[1] - a[1]);
    const top = groups.slice(0, 4).map(([l, n]) => `${n} ${l}`).join(", ");
    const of = r.totalCompanies ? ` of ${r.totalCompanies}` : "";
    const title = contains.length
      ? `${sym} holds ${contains.length} companies you may want to avoid · PlainStreet`
      : `${sym}: no flagged holdings among the names we track · PlainStreet`;
    const description = contains.length
      ? `${r.name} tracks ${r.basis}. ${contains.length}${of} companies are flagged: ${top}. Every flag has a one-sentence reason and a source.${r.asOf ? ` Holdings as of ${r.asOf}.` : ""}`
      : `${r.name} tracks ${r.basis}. None of its holdings are on the lists we track, which means "not one of the names we track," never "audited clean."`;
    return { title, description, ogImage: ogFor(sym), groups, contains, r };
  }
  if (r.type === "stock") {
    const labels = r.flags.map((f) => f.label).join(", ");
    // The raw reason carries a "Company — " prefix that the app strips before display;
    // strip it here too so a shared card never shows the authoring delimiter.
    const top = r.flags[0]?.reason ? reasonParts(r.flags[0].reason, displayName(r.name)) : null;
    const description = top ? [top.lead, top.rest].filter(Boolean).join(" ") : fallback.description;
    return { ...fallback, title: `${sym} · ${r.name} · flagged for ${labels} · PlainStreet`, description, r };
  }
  return { ...fallback, title: `${sym} · no flags among the names we track · PlainStreet`, description: r.known
    ? `${sym} isn't on any of the lists we track. That means "none of the names we track," never "audited clean."`
    : `We don't recognize ${sym}. If it's a fund, we can't see inside it yet, so it's "not analyzed," never "clean."`, r };
}

export function sharePage({ symbol, siteUrl }) {
  const m = shareMeta(symbol);
  const sym = m.r?.symbol || String(symbol || "VOO").toUpperCase();
  const base = String(siteUrl || "").replace(/\/$/, "");
  const pageUrl = `${base}/?symbol=${encodeURIComponent(sym)}`;
  const img = `${base}${m.ogImage}`;
  const list = m.groups.length
    ? `<ul>${m.groups.map(([l, n]) => `<li><b>${esc(l)}</b> · ${n}</li>`).join("")}</ul>
       <p>${m.contains.slice(0, 60).map((c) => esc(displayName(c.name) || c.ticker)).join(" · ")}${m.contains.length > 60 ? " · …" : ""}</p>`
    : "";
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PlainStreet">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:title" content="${esc(m.title)}">
<meta property="og:description" content="${esc(m.description)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(m.title)}">
<meta name="twitter:description" content="${esc(m.description)}">
<meta name="twitter:image" content="${esc(img)}">
<meta name="robots" content="noindex">
<style>body{font-family:system-ui,sans-serif;background:#FCEBD0;color:#1D3B28;max-width:640px;margin:40px auto;padding:0 20px;line-height:1.5}a{color:#5F5219}</style>
</head><body>
<h1>${esc(m.title)}</h1>
<p>${esc(m.description)}</p>
${list}
<p><a href="${esc(pageUrl)}">Open ${esc(sym)} on PlainStreet →</a></p>
</body></html>`;
}
