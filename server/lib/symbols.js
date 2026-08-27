// Ticker normalization — brokers disagree on how to write a class share. Our own data
// (screens.js, funds.js) uses dot notation (BF.B), the NYSE/SEC convention, but a
// brokerage feed might send "BF-B", "BF B", or "BFB" for the exact same security. Left
// unnormalized, a real holding could silently fail to match any screen.
//
// Scope is deliberately narrow: we only remap tickers that already exist in OUR known
// universe (curated + enriched), converting a broker's variant spelling to our
// canonical form. We never guess at a split for an unknown ticker (e.g. blindly
// assuming "BRKB" means "BRK" + class "B") — that would risk mismatching a real,
// unrelated ticker, exactly the kind of unchecked claim this product avoids making.

import { SCREENS } from "./screens.js";
import { FUNDS } from "./funds.js";
import { enrichedTickers } from "./enriched.js";

function allKnownTickers() {
  const set = new Set();
  for (const s of SCREENS) for (const t of Object.keys(s.tickers)) set.add(t);
  for (const t of Object.keys(FUNDS)) set.add(t);
  for (const t of enrichedTickers()) set.add(t);
  return set;
}

// variant (as a broker might send it) -> our canonical ticker. Only built for tickers
// that contain a "." — the only ambiguous case in our universe today.
const _variants = new Map();
for (const t of allKnownTickers()) {
  if (!t.includes(".")) continue;
  for (const variant of [t.replace(/\./g, "-"), t.replace(/\./g, ""), t.replace(/\./g, " ")]) {
    if (variant !== t) _variants.set(variant, t);
  }
}

/** Canonical form of a ticker, mapping known broker-format variants (BF-B, BFB, BF B)
 *  back to our dot notation (BF.B). Unknown tickers pass through unchanged. */
export function normalizeTicker(raw) {
  const t = String(raw || "").trim().toUpperCase();
  if (!t) return t;
  return _variants.get(t) || t;
}
