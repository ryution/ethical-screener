// Read a broker's positions export (CSV) into holdings: [{ symbol, quantity, valueCents }].
//
// Brokers lay these files out differently: Fidelity puts notes under the table, Schwab puts
// a title line above it, Vanguard repeats a header per account. What they share is a header
// row with a Symbol (or Ticker) column, usually a quantity column and usually a value column.
// So: find that header row, read the rows under it, keep anything that looks like a ticker,
// and add up the same symbol across accounts. The file is read in the browser; only the
// holdings go to the server to be checked.

const SYMBOL = /^(symbol|ticker|ticker symbol|symbol\/cusip|security symbol|stock symbol)$/i;
const VALUE = /^(current value|market value|mkt val( \(market value\))?|total value|value|current market value|market value \(\$\)|position value|equity)$/i;
const QTY = /^(quantity|qty|shares|share quantity|quantity\/units|units)$/i;

/** RFC 4180 style rows: quoted fields, commas and newlines inside quotes, "" escapes. */
export function csvRows(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const money = (v) => {
  const t = String(v ?? "").trim().replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!t || t === "--" || t === "n/a") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Holdings from a positions CSV. Throws with a plain message when it can't find any. */
export function parsePortfolioCsv(text) {
  const rows = csvRows(text);
  const bySymbol = new Map();
  let found = false;
  let col = null;
  for (const raw of rows) {
    const cells = raw.map((c) => String(c ?? "").trim());
    // A header row (the first one, or a repeated one per account) sets the columns.
    const si = cells.findIndex((c) => SYMBOL.test(c));
    if (si >= 0) {
      col = { s: si, v: cells.findIndex((c) => VALUE.test(c)), q: cells.findIndex((c) => QTY.test(c)) };
      found = true;
      continue;
    }
    if (!col) continue;
    // Fidelity marks money-market cash as "SPAXX**"; BRK/B is BRK.B.
    let sym = (cells[col.s] || "").toUpperCase().replace(/\*+$/, "").replace("/", ".");
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) continue;
    const value = col.v >= 0 ? money(cells[col.v]) : null;
    const qty = col.q >= 0 ? money(cells[col.q]) : null;
    const prev = bySymbol.get(sym) || { symbol: sym, quantity: null, valueCents: null };
    if (qty != null) prev.quantity = Number(((prev.quantity ?? 0) + qty).toFixed(6));
    if (value != null) prev.valueCents = (prev.valueCents ?? 0) + Math.round(value * 100);
    bySymbol.set(sym, prev);
  }
  if (!found) throw new Error("Couldn't find a Symbol or Ticker column. Export your positions as a CSV from your broker and try again.");
  const holdings = [...bySymbol.values()];
  if (!holdings.length) throw new Error("Found the Symbol column, but no tickers under it.");
  return holdings;
}
