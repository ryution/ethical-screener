// The Ethical Portfolio Analyzer — the whole app, one file.
//
// Flow: sign in → pick the ethical lines you care about → connect your brokerage
// (read-only, via SnapTrade) → see which holdings conflict, and why.
//
// The analyzer is read-only; we never move money without the user's say-so. (Trading may
// come later as a paid feature — the free tool only reads and explains.)
//
// Visual language — modern dark fintech app. Near-black page (#0B0B0D) with charcoal cards
// floating on it; the whole product is dark, no light/paper mode. Generous rounding (20px
// cards, full pills on every button and badge) and one soft geometric sans throughout — no
// serif anywhere. Two pastel accents do all the work: lavender is the primary (buttons,
// links, active states, always with near-black text on top when used as a fill), and lime
// is reserved for positive/live indicators. Coral is reserved strictly for flags.

import { useEffect, useRef, useState } from "react";
import { displayName, reasonParts } from "./format.js";

// ── Hero / auth surfaces (over the near-black canvas) ────────────────────────
const D = {
  ink: "#F4F4F5", muted: "#A1A1AA", faint: "#71717A",
  mint: "#D3C8F8", brass: "#D3C8F8", brassSoft: "#D3C8F8",
  glassBorder: "rgba(255,255,255,0.10)",
};
// ── App surfaces. Historically the "light" theme; now dark like everything else,
// so the token names read oddly (`pine` is the brightest text, not a dark green).
// Kept as-is deliberately: renaming them means touching ~200 call sites for zero
// visual change. Values are the source of truth, names are legacy.
const L = {
  bg: "#0B0B0D", card: "#17171A", line: "#26262B", lineSoft: "#1F1F23",
  ink: "#F4F4F5", muted: "#A1A1AA", faint: "#71717A",
  pine: "#F4F4F5", teal: "#D3C8F8", mint: "#BEF264", brass: "#D3C8F8",
  flag: "#FCA5A5", flagBg: "rgba(252,165,165,0.12)", flagBorder: "rgba(252,165,165,0.28)",
  good: "#BEF264",
};
// Accent fills. When lavender or lime is used as a background it always carries its
// matching near-black ink on top — never white, which is what makes pastel-on-dark work.
const A = { lav: "#D3C8F8", lavInk: "#1B1030", lime: "#BEF264", limeInk: "#17240A", raised: "#202027" };
const sans = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
// One family does everything now — headlines included. `serif`/`serifDisplay` are legacy
// aliases kept so the ~30 headline call sites don't all need editing; hierarchy comes from
// weight and size, not from a second typeface.
const serif = sans;
const serifDisplay = sans;

// A quiet frosted panel over the near-black canvas — restrained blur, hairline border.
const glass = (o = {}) => ({
  background: "rgba(237,239,243,0.06)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  border: `1px solid ${D.glassBorder}`,
  borderRadius: 20,
  boxShadow: "0 18px 40px -22px rgba(0,0,0,0.55)",
  ...o,
});
// Solid card with a soft lift.
const card = (o = {}) => ({
  background: L.card, border: `1px solid ${L.line}`, borderRadius: 20,
  boxShadow: "0 1px 2px rgba(0,0,0,0.5), 0 10px 30px -18px rgba(0,0,0,0.8)",
  ...o,
});

// ── Tiny API helper ───────────────────────────────────────────────────────────
async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
const money = (cents) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Analyzer() {
  const [user, setUser] = useState(undefined);
  const [showAuth, setShowAuth] = useState(false);
  // A signed-in user can choose to browse the public search page without signing out.
  const [viewHome, setViewHome] = useState(false);
  useEffect(() => { api("/api/me").then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);

  if (user === undefined) return <Splash />;
  if (user && !viewHome) {
    return <Dashboard user={user} onSignOut={() => { setUser(null); setShowAuth(false); }} onGoHome={() => setViewHome(true)} />;
  }
  if (!user && showAuth) return <Auth onAuthed={(u) => { setUser(u); setViewHome(false); }} onBack={() => setShowAuth(false)} />;
  // Already signed in and just browsing home: "Get started" returns to the dashboard
  // instead of showing the signup form again.
  return <Landing onStart={() => (user ? setViewHome(false) : setShowAuth(true))} />;
}

// ── The navy canvas: flat deep charcoal-navy, one soft top-left highlight, no orbs ──
function Canvas({ children }) {
  return (
    <div style={{ position: "relative", fontFamily: sans, color: D.ink, overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background:
        "radial-gradient(1100px 620px at 14% -12%, #16121F 0%, transparent 64%)," +
        "linear-gradient(180deg, #0E0E12 0%, #0B0B0D 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

function Splash() {
  return (
    <Canvas>
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: serifDisplay, fontSize: 28, color: D.brassSoft, letterSpacing: "-0.02em" }}>PlainStreet</span>
      </div>
    </Canvas>
  );
}

// ── The live hero analyzer: type a ticker, see inside it, no login ───────────
// Initial ticker: from the ?symbol= URL param (shareable/bookmarkable), else VOO.
const initialSymbol = () => {
  try { return (new URLSearchParams(window.location.search).get("symbol") || "VOO").toUpperCase(); }
  catch { return "VOO"; }
};
function HeroAnalyzer({ onStart }) {
  const [q, setQ] = useState(initialSymbol);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [screens, setScreens] = useState([]);
  const [selected, setSelected] = useState(null); // Set of screen keys; null until loaded
  useEffect(() => {
    api("/api/screens").then((d) => {
      const list = (d.screens || []).slice().sort((a, b) => a.label.localeCompare(b.label));
      setScreens(list);
      setSelected(new Set(list.map((s) => s.key)));
    }).catch(() => {});
  }, []);
  const toggle = (k) => setSelected((prev) => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });
  const allOn = selected && screens.length && selected.size === screens.length;
  const setAll = (on) => setSelected(on ? new Set(screens.map((s) => s.key)) : new Set());

  // ── search autocomplete ──
  const [sugg, setSugg] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const sugTimer = useRef(null);
  const onInput = (e) => {
    const v = e.target.value; setQ(v); setActiveIdx(-1);
    const s = v.trim();
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (!s) { setSugg([]); setShowSug(false); return; }
    sugTimer.current = setTimeout(async () => {
      try { const d = await api(`/api/suggest?q=${encodeURIComponent(s)}`); setSugg(d.results || []); setShowSug(true); }
      catch { setSugg([]); setShowSug(false); }
    }, 110);
  };
  const pick = (s) => { setQ(s.symbol); setSugg([]); setShowSug(false); setActiveIdx(-1); run(s.symbol); };
  const onKey = (e) => {
    if (showSug && sugg.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, sugg.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); return; }
      if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(sugg[activeIdx]); return; }
      if (e.key === "Escape") { setShowSug(false); return; }
    }
    if (e.key === "Enter") { setShowSug(false); run(); }
  };

  const run = async (symbol) => {
    const sym = (symbol ?? q).trim().toUpperCase();
    if (!sym) return;
    setBusy(true); setErr(""); setResult(null);
    // Reflect the search in the URL so a result is shareable / bookmarkable.
    try { window.history.replaceState(null, "", `?symbol=${encodeURIComponent(sym)}`); } catch { /* ignore */ }
    try { setResult(await api(`/api/lookup?symbol=${encodeURIComponent(sym)}`)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  // Auto-load the initial symbol (from the URL, or VOO) so a visitor sees the surprise immediately.
  useEffect(() => { run(initialSymbol()); /* eslint-disable-next-line */ }, []);

  const examples = ["VOO", "QQQ", "SCHB", "XLV"];
  return (
    // Wide enough for the results to lay out in columns on a desktop; the search row and
    // its examples stay at a comfortable reading measure inside it.
    <div style={{ maxWidth: 980, margin: "30px auto 0", textAlign: "left" }}>
      <div style={{ display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <input value={q} onChange={onInput} onKeyDown={onKey}
            onFocus={() => { if (sugg.length) setShowSug(true); }}
            onBlur={() => setTimeout(() => setShowSug(false), 140)}
            placeholder="Search a stock or ETF — try “Apple”, VOO, XLV…" aria-label="Search a stock or ETF"
            autoComplete="off" role="combobox" aria-expanded={showSug} aria-autocomplete="list"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: sans, fontSize: 15, color: D.ink, background: "rgba(255,255,255,0.08)",
              border: `1px solid ${D.glassBorder}`, borderRadius: 14, padding: "14px 15px", outline: "none",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />
          {showSug && sugg.length > 0 && (
            <ul role="listbox" style={{ position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, right: 0, margin: 0, padding: 4, listStyle: "none",
              background: "rgba(18,18,22,0.97)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              border: `1px solid ${D.glassBorder}`, borderRadius: 20, boxShadow: "0 16px 40px -12px rgba(0,0,0,0.6)", maxHeight: 320, overflowY: "auto" }}>
              {sugg.map((s, i) => (
                <li key={s.symbol} role="option" aria-selected={i === activeIdx}
                  onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 12, cursor: "pointer",
                    background: i === activeIdx ? "rgba(211,200,248,0.16)" : "transparent" }}>
                  <span style={{ fontFamily: sans, fontWeight: 700, fontSize: 13, color: D.ink, minWidth: 52 }}>{s.symbol}</span>
                  <span style={{ fontFamily: sans, fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{s.name}</span>
                  {s.kind === "fund" && <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", color: A.lavInk, background: A.lav, borderRadius: 999, padding: "1px 6px" }}>FUND</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={() => { setShowSug(false); run(); }} disabled={busy} style={brassBtn(999, "14px 22px", 15)}>{busy ? "…" : "Check"}</button>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", maxWidth: 560, margin: "10px auto 0" }}>
        <span style={{ fontFamily: sans, fontSize: 12, color: D.faint }}>Try:</span>
        {examples.map((x) => (
          <button key={x} onClick={() => { setQ(x); run(x); }} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${D.glassBorder}`, color: D.muted, borderRadius: 999, padding: "4px 11px", fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{x}</button>
        ))}
      </div>

      {screens.length > 0 && selected && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${D.glassBorder}`, paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 9 }}>
            <span style={{ fontFamily: sans, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: D.faint }}>Filter to what you care about</span>
            <button onClick={() => setAll(!allOn)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 11.5, color: D.mint }}>
              {allOn ? "Clear all" : "Select all"}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {screens.map((s) => {
              const on = selected.has(s.key);
              return (
                <button key={s.key} onClick={() => toggle(s.key)} title={s.blurb}
                  style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 999, padding: "4px 12px",
                    // Selected categories use the flag coral, not the lavender accent: this
                    // is the same red the category wears in the results, so picking a
                    // category and seeing it come back flagged is one continuous colour.
                    border: `1px solid ${on ? "rgba(252,165,165,0.5)" : D.glassBorder}`,
                    background: on ? "rgba(252,165,165,0.16)" : "transparent",
                    color: on ? L.flag : D.faint, transition: "all .12s" }}>
                  {on ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {err && <DarkErr>{err}</DarkErr>}
      {result && <HeroResult result={filterBySelected(result, selected)} onStart={onStart} />}
    </div>
  );
}

// Apply the visitor's category filter to a lookup result — hide flags/holdings for
// screens they've switched off. null selection = everything on.
function filterBySelected(result, selected) {
  if (!selected || !result) return result;
  if (result.type === "stock") {
    return { ...result, flags: (result.flags || []).filter((f) => selected.has(f.key)) };
  }
  if (result.type === "fund" && Array.isArray(result.contains)) {
    const contains = result.contains
      .map((c) => ({ ...c, flags: c.flags.filter((f) => selected.has(f.key)) }))
      .filter((c) => c.flags.length);
    return { ...result, contains };
  }
  return result;
}

function HeroResult({ result, onStart }) {
  const panel = glass({ marginTop: 14, padding: "18px 20px", background: "rgba(255,255,255,0.07)" });

  if (result.type === "none") {
    return (
      <div style={panel}>
        <div style={{ fontFamily: serif, fontSize: 19, color: D.ink }}>
          No flags for <b>{result.symbol}</b> among the names we track.
        </div>
        <p style={{ fontFamily: sans, fontSize: 13, color: D.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
          That doesn't mean it's audited clean — only that it isn't a company (or a fund we can see inside) on our lists. We cover U.S.-listed companies that file with the SEC, so foreign-listed names may simply be out of scope. Connect your brokerage to check everything at once.
        </p>
        <HeroCTA onStart={onStart} />
      </div>
    );
  }

  if (result.type === "stock") {
    if (!result.flags.length) {
      return (
        <div style={panel}>
          <div style={{ fontFamily: serif, fontSize: 19, color: D.ink }}>No flags for <b>{result.symbol}</b> in your selected categories.</div>
          <p style={{ fontFamily: sans, fontSize: 13, color: D.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
            Turn on more categories above to widen the check.
          </p>
          <HeroCTA onStart={onStart} />
        </div>
      );
    }
    const flags = result.flags.slice().sort((a, b) => a.label.localeCompare(b.label));
    return (
      <div style={panel}>
        <div style={{ fontFamily: serif, fontSize: 20, color: D.ink }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
        <QuotePanel symbol={result.symbol} />
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {flags.map((f) => <FlagCard key={f.key} flag={f} company={result.name} dark />)}
        </div>
        <HeroCTA onStart={onStart} />
      </div>
    );
  }

  // fund we recognize but deliberately don't analyze (international / bond / commodity)
  if (result.type === "fund" && result.analyzable === false) {
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: D.ink }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: D.muted, background: "rgba(255,255,255,0.08)", borderRadius: 999, padding: "3px 10px" }}>NOT ANALYZED</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
          {result.notAnalyzedReason} We call that <b style={{ color: D.ink }}>not analyzed</b> — never "clean."
        </p>
        <HeroCTA onStart={onStart} />
      </div>
    );
  }

  // fund — the money shot
  if (!result.contains.length) {
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: D.ink }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: A.lavInk, background: A.lav, borderRadius: 999, padding: "3px 10px" }}>FUND</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
          No holdings in this fund match your selected categories. Turn on more categories above to widen the check.
        </p>
        <HeroCTA onStart={onStart} />
      </div>
    );
  }
  // Dedupe before both the count and the grouping so the headline number and the cards
  // can't disagree.
  const contains = dedupeByName(result.contains);
  const groups = groupByFlag(contains);
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: serif, fontSize: 20, color: D.ink }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: A.lavInk, background: A.lav, borderRadius: 999, padding: "3px 10px" }}>FUND</span>
      </div>
      <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
        Tracks {result.basis} — and holds <b style={{ color: D.ink }}>{contains.length}</b> companies you may want to avoid:
      </p>
      <QuotePanel symbol={result.symbol} />
      <div style={{ marginTop: 16, display: "grid", gap: 9 }}>
        <FundBreakdown groups={groups} theme="dark" />
      </div>
      <HeroCTA onStart={onStart} />
    </div>
  );
}

// A company with dual share classes (GOOGL/GOOG) arrives as two rows with the same name
// and identical flags. Two identical chips look like a bug, and counting Alphabet twice
// overstates "companies you may want to avoid" — it's one company. Merge on display name,
// keeping the first ticker and the union of flags.
const dedupeByName = (contains) => {
  const m = new Map();
  for (const c of contains) {
    const key = displayName(c.name) || c.ticker;
    const prev = m.get(key);
    if (!prev) { m.set(key, { ...c, flags: [...c.flags] }); continue; }
    for (const f of c.flags) if (!prev.flags.some((p) => p.key === f.key)) prev.flags.push(f);
  }
  return [...m.values()];
};

const groupByFlag = (contains) => {
  const m = new Map();
  for (const c of contains) for (const f of c.flags) {
    if (!m.has(f.key)) m.set(f.key, { key: f.key, label: f.label, items: [] });
    m.get(f.key).items.push({ name: c.name, ticker: c.ticker, reason: f.reason, quote: f.quote, source: f.source, asOf: f.asOf });
  }
  // Alphabetical by category label, and alphabetical by company name within each category,
  // so the list order is predictable — not "whatever we happen to have the most of."
  const groups = [...m.values()];
  for (const g of groups) g.items.sort((a, b) => (a.name || a.ticker).localeCompare(b.name || b.ticker));
  return groups.sort((a, b) => a.label.localeCompare(b.label));
};


function FundBreakdown({ groups, theme }) {
  const [open, setOpen] = useState(null);            // evidence panel: "flagKey:TICKER"
  const [openGroups, setOpenGroups] = useState({});  // flagKey -> expanded
  const dark = theme === "dark";
  const c = dark
    ? { ink: D.ink, muted: D.muted, faint: D.faint, link: A.lav, panel: "rgba(255,255,255,0.05)", border: D.glassBorder, surface: "rgba(255,255,255,0.035)" }
    : { ink: L.ink, muted: L.muted, faint: L.faint, link: A.lav, panel: "rgba(255,255,255,0.05)", border: L.line, surface: L.card };
  const toggle = (key) => setOpenGroups((s) => ({ ...s, [key]: !s[key] }));
  return (
    // Collapsed by default: the first thing you see is every category that has a problem
    // and how many companies are in it — the shape of the fund at a glance. Opening one is
    // a deliberate act, so no single category can bury the others.
    // Responsive columns: one on a phone, two or three on a desktop — 10+ categories in a
    // single column is a long scroll for no reason. `alignItems: start` keeps an opened
    // category from stretching its neighbours to match.
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 8, alignItems: "start" }}>
      {groups.map((g) => {
        const isOpen = !!openGroups[g.key];
        const openItem = g.items.find((it) => open === `${g.key}:${it.ticker}`);
        return (
          <div key={g.key} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 16, overflow: "hidden" }}>
            <button
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              aria-controls={`grp-${g.key}`}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
                textAlign: "left", fontFamily: sans,
              }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: L.flag, letterSpacing: "-0.01em" }}>{g.label}</span>
              <span style={{
                marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: c.ink,
                background: c.panel, border: `1px solid ${c.border}`, borderRadius: 999,
                padding: "1px 9px", minWidth: 26, textAlign: "center",
              }}>{g.items.length}</span>
              <span aria-hidden style={{
                fontSize: 11, color: c.muted, lineHeight: 1,
                transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s",
              }}>▼</span>
            </button>
            {isOpen && (
              <div id={`grp-${g.key}`} style={{ padding: "0 14px 13px", display: "grid", gap: 10 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {g.items.map((it, i) => {
                    const chipOpen = open === `${g.key}:${it.ticker}`;
                    return (
                      <button key={it.ticker + i}
                        onClick={() => setOpen(chipOpen ? null : `${g.key}:${it.ticker}`)}
                        title={`${it.ticker} — why this is flagged`}
                        style={{
                          fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          borderRadius: 999, padding: "3px 10px", textAlign: "left",
                          background: chipOpen ? A.lav : c.panel,
                          color: chipOpen ? A.lavInk : c.ink,
                          border: `1px solid ${chipOpen ? A.lav : c.border}`,
                          transition: "background .12s, color .12s, border-color .12s",
                        }}>{displayName(it.name)}</button>
                    );
                  })}
                </div>
                {openItem && (
                  <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 14, padding: "10px 12px", display: "grid", gap: 6 }}>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>
                      <b>{openItem.ticker}</b> · {displayName(openItem.name)}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{openItem.reason}</div>
                    <FlagEvidence quote={openItem.quote} source={openItem.source} asOf={openItem.asOf} muted={c.muted} link={c.link} />
                    <ReportControl item={openItem} group={g} linkColor={c.link} muted={c.muted} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


// §3.3 — one card per flag. The label used to sit in a narrow left column with the whole
// finding crammed beside it, which turned three sentences into a thin wall of text.
function FlagCard({ flag, company, dark = false }) {
  const surface = dark ? "rgba(255,255,255,0.035)" : L.card;
  const border = dark ? D.glassBorder : L.line;
  const ink = dark ? D.ink : L.ink;
  const muted = dark ? D.muted : L.muted;
  const { lead, rest } = reasonParts(flag.reason, company);
  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 20, padding: "14px 16px", display: "grid", gap: 9 }}>
      <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, borderRadius: 999, padding: "3px 10px", justifySelf: "start" }}>{flag.label}</span>
      <div style={{ fontFamily: sans, fontSize: 14.5, lineHeight: 1.6, color: ink, maxWidth: "68ch", letterSpacing: "-0.005em" }}>{lead}</div>
      {rest && <div style={{ fontFamily: sans, fontSize: 13.5, lineHeight: 1.62, color: muted, maxWidth: "68ch" }}>{rest}</div>}
      <FlagEvidence quote={flag.quote} source={flag.source} asOf={flag.asOf} muted={muted} link={A.lav} />
    </div>
  );
}

// The receipt: a verbatim quote from the company's filing plus a link to the source, so a
// surprising flag ("Walmart · opioids") reads as a checkable fact, not an accusation.
function FlagEvidence({ quote, source, asOf, muted, link }) {
  if (!quote && !source) return null;
  return (
    <div style={{ display: "grid", gap: 5 }}>
      {quote && (
        <div style={{ fontFamily: sans, fontSize: 12, color: muted, fontStyle: "italic", borderLeft: `2px solid ${muted}`, paddingLeft: 9, lineHeight: 1.5 }}>
          “{quote}”
        </div>
      )}
      {source && (
        <a href={source} target="_blank" rel="noopener noreferrer" style={{ fontFamily: sans, fontSize: 11.5, color: link, textDecoration: "none", justifySelf: "start" }}>
          Source: {asOf || "SEC filing"} ↗
        </a>
      )}
    </div>
  );
}

function ReportControl({ item, group, linkColor, muted }) {
  const [stage, setStage] = useState("idle"); // idle | form | sent
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (stage === "sent") return <div style={{ fontFamily: sans, fontSize: 12, color: muted }}>Thanks — we'll review this.</div>;
  if (stage === "idle") {
    return (
      <button onClick={() => setStage("form")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 11.5, color: muted, textDecoration: "underline", textUnderlineOffset: 2, justifySelf: "start" }}>
        Think this is wrong?
      </button>
    );
  }
  const submit = async () => {
    setBusy(true);
    try {
      await api("/api/report", { method: "POST", body: { ticker: item.ticker, flag: group.key, label: group.label, reason: item.reason, note } });
      setStage("sent");
    } catch { setStage("sent"); } // fail quietly — a dispute is low-stakes
  };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's off about this flag? (optional)" rows={2}
        style={{ fontFamily: sans, fontSize: 12.5, padding: "6px 8px", borderRadius: 14, border: `1px solid ${muted}`, background: "transparent", color: "inherit", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: linkColor, background: "none", border: `1px solid ${linkColor}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>Send report</button>
        <button onClick={() => setStage("idle")} style={{ fontFamily: sans, fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
// §3.5 — the one accent-filled card on a result screen: a prompt with an action.
const HeroCTA = ({ onStart }) => (
  <div style={{ marginTop: 18 }}>
    <Callout label="That's one ticker" headline="See your whole portfolio at once."
      actionLabel="Connect brokerage →" onAction={onStart} />
  </div>
);

// Relative "N days ago" label, used by HotNews for each headline's timestamp.
function agoLabel(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ── Ticker tape: a scrolling marquee of live-ish prices across the top of the page,
// Wall-Street-display style. Purely decorative/informational — it isn't tied to the
// ethical screens, just sets the "this is a real market" tone before the hero.
function TickerTape() {
  const [quotes, setQuotes] = useState([]);
  useEffect(() => {
    const load = () => api("/api/ticker-tape").then((d) => setQuotes(d.quotes || [])).catch(() => {});
    load();
    const id = setInterval(load, 60_000); // matches the server's own cache TTL
    return () => clearInterval(id);
  }, []);
  if (!quotes.length) return null;

  const Item = ({ q, keySuffix }) => {
    const up = q.changePercent >= 0;
    const color = up ? "#4ADE80" : "#F87171";
    return (
      <span key={q.symbol + keySuffix} style={{ display: "inline-flex", alignItems: "baseline", gap: 8, padding: "0 22px", fontFamily: sans, fontSize: 13, whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 700, color: D.ink, letterSpacing: "0.02em" }}>{q.symbol}</span>
        <span style={{ color: D.muted }}>${q.price.toFixed(2)}</span>
        <span style={{ color, fontWeight: 600 }}>{up ? "▲" : "▼"} {Math.abs(q.changePercent).toFixed(2)}%</span>
      </span>
    );
  };

  return (
    <div style={{ background: "#0D0D11", borderBottom: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", padding: "9px 0" }}>
      <style>{`
        @keyframes ps-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ps-ticker-track { display: inline-flex; animation: ps-ticker-scroll 45s linear infinite; }
        .ps-ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="ps-ticker-track">
        {quotes.map((q) => <Item q={q} keySuffix="a" key={q.symbol + "a"} />)}
        {quotes.map((q) => <Item q={q} keySuffix="b" key={q.symbol + "b"} />)}
      </div>
    </div>
  );
}

// ── Hot news: recent headlines mentioning a company we track (BBC + NYT). We only
// ever show the headline, outlet, and a link out — never a summary we wrote.
function HotNews({ wrap }) {
  const [items, setItems] = useState(null); // null = loading, [] = loaded empty
  const trackRef = useRef(null);
  useEffect(() => {
    api("/api/news").then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);
  const scrollByCards = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.95, behavior: "smooth" });
  };
  const arrowBtn = (side) => ({
    position: "absolute", top: "50%", [side]: -4, transform: "translateY(-50%)",
    width: 40, height: 40, borderRadius: "50%", border: `1px solid ${L.line}`,
    background: L.card, color: L.pine, fontFamily: sans, fontSize: 18, cursor: "pointer",
    boxShadow: "0 4px 16px -6px rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 2,
  });

  if (items && items.length === 0) return null; // nothing tracked is in the news right now
  return (
    <section style={{ ...wrap, padding: "clamp(56px,9vw,96px) 24px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 34 }}>
        <p style={{ fontFamily: sans, fontSize: 12.5, letterSpacing: "0.16em", textTransform: "uppercase", color: L.brass, marginBottom: 10 }}>From BBC &amp; The New York Times</p>
        <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(26px,4vw,38px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Hot off the wire.</h2>
        <p style={{ fontFamily: sans, fontSize: 14.5, color: L.muted, margin: "10px 0 0" }}>Recent reporting on companies we track — headline and source, always linking to the original story.</p>
      </div>
      {!items ? (
        <p style={{ textAlign: "center", fontFamily: sans, color: L.faint, fontSize: 14 }}>Loading…</p>
      ) : (
        <div style={{ position: "relative" }}>
          <button onClick={() => scrollByCards(-1)} aria-label="Scroll left" style={arrowBtn("left")}>‹</button>
          <button onClick={() => scrollByCards(1)} aria-label="Scroll right" style={arrowBtn("right")}>›</button>
          <div ref={trackRef} style={{
            display: "flex", gap: 18, overflowX: "auto", scrollSnapType: "x mandatory",
            padding: "4px 4px 14px", margin: "0 -4px", scrollbarWidth: "none",
          }}>
            {items.map((it, i) => (
              <a key={i} href={it.link} target="_blank" rel="noopener noreferrer"
                 style={{
                   ...card({ padding: 0, overflow: "hidden" }), display: "block", textDecoration: "none", color: "inherit",
                   flex: "0 0 clamp(250px, 31%, 340px)", scrollSnapAlign: "start",
                 }}>
                <div style={{ padding: "16px 18px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: L.teal, background: L.lineSoft, borderRadius: 999, padding: "3px 10px" }}>{it.source}</span>
                    {it.companies.slice(0, 2).map((c) => (
                      <span key={c.ticker} style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: L.muted }}>{c.name}</span>
                    ))}
                    {agoLabel(it.publishedAt) && <span style={{ fontFamily: sans, fontSize: 11, color: L.faint, marginLeft: "auto" }}>{agoLabel(it.publishedAt)}</span>}
                  </div>
                  <div style={{ fontFamily: serif, fontSize: 16.5, color: L.ink, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em", minHeight: "2.7em" }}>{it.title}</div>
                </div>
                {it.image && (
                  <img src={it.image} alt="" loading="lazy"
                       style={{ width: "100%", height: 150, objectFit: "cover", display: "block", borderTop: `1px solid ${L.lineSoft}` }} />
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Methodology (public page, mirrors METHODOLOGY.md §1–5) ───────────────────
const METHOD_PRINCIPLES = [
  ["Plain, checkable facts — never scores.", "Every flag is a factual claim about what a company does, with a one-sentence reason you can verify. No opaque “ESG score,” no vibes. If we can’t say why in one sentence, it isn’t a flag."],
  ["Harm and culpability, not the product category.", "We flag documented conduct, not the mere existence of a product. A company supplying hospital morphine is not “opioids”; a company with opioid-marketing litigation and settlements is."],
  ["Cite the source.", "A flag from a company’s filing carries a verbatim quote from that filing and a link to it. No supporting quote → no flag. You read the company’s own words, not our paraphrase."],
  ["Materiality threshold.", "We flag a line of business, not an incidental mention — a reported segment or principal activity, not “sells cigarettes at the register” and not a risk-factor aside."],
  ["You draw the lines.", "We never decide what is unethical for you. You pick the flags; we only explain what’s there. Some flags are screened in opposite directions by different people — we present those neutrally."],
  ["Under-claim, never over-claim.", "A clean result means “none of the names we track,” never “audited pure.” A fund we can’t see inside is “not analyzed,” never “clean.”"],
  ["Honest freshness.", "Every dataset carries a “last updated” date."],
  ["U.S.-listed only.", "Our universe is companies that file with the SEC. Foreign-listed companies (20-F filers, most ADRs) are not analyzed — an empty result there means out-of-scope, never clean."],
];
const METHOD_LAYERS = [
  ["Curated", "A hand-maintained list of companies, researched from each one’s primary business.", "Precise and defensible for well-known names."],
  ["Industry code (SIC)", "The company’s SEC-registered industry code, mapped to a flag where the code is a plain fact (oil refining, cigarettes).", "Broad, automatic, and deterministic across the market."],
  ["Filing-cited (10-K)", "We read the relevant section of a company’s annual report and return a verified, verbatim quote.", "Catches secondary lines of business and produces a real receipt."],
];
const METHOD_CATALOGUE = [
  ["Environment", [
    { name: "Fossil fuels", status: "Live", def: "Extraction, refining, and transport of oil, gas, and coal.", counts: "Oil & gas exploration/production, refining, oilfield services, pipelines, and gas utilities as a principal business.", not: "A manufacturer that merely consumes fuel; a bank that lends to the sector.", ex: "ExxonMobil, Chevron, Kinder Morgan, Halliburton." },
    { name: "Coal", status: "Live", def: "Coal mining and coal-fired power generation — a stricter, climate-focused cut inside fossil fuels.", counts: "Thermal/steam coal mining; utilities with material coal-fired generation.", not: "Metallurgical (steelmaking) coal only, unless your line includes it.", ex: "Peabody Energy, Alliance Resource Partners, Duke Energy." },
  ]],
  ["Weapons & conflict", [
    { name: "Weapons & defense", status: "Live", def: "Manufacture of military weapons and defense contracting.", counts: "Defense primes, munitions, missiles, military aircraft/vehicles, defense electronics as a principal business.", not: "Dual-use suppliers with no material defense segment; civilian aerospace.", ex: "Lockheed Martin, RTX, General Dynamics, Northrop Grumman." },
    { name: "Civilian firearms", status: "Live", def: "Manufacture and large-scale retail of civilian guns and ammunition.", counts: "Civilian firearm and ammunition makers; major firearms retailers.", not: "Military-only ordnance (that’s weapons); shops where firearms are a minor line.", ex: "Smith & Wesson, Sturm Ruger, Olin/Winchester." },
  ]],
  ["Social & human rights", [
    { name: "Private prisons & detention", status: "Live", def: "For-profit incarceration, detention, and closely-tied services.", counts: "Operators of private prisons and immigration-detention centers.", not: "A general contractor that once built a facility; incidental government clients.", ex: "GEO Group, CoreCivic." },
    { name: "Surveillance & data brokers", status: "Live", def: "Business models built on large-scale collection and sale of personal data.", counts: "Ad businesses built on personal-data profiling; data brokers; mass-surveillance analytics.", not: "Software companies generally; a one-off privacy breach without a data-driven model.", ex: "Meta, Alphabet, Palantir, LiveRamp." },
    { name: "Predatory lending", status: "Live", def: "High-cost consumer lending with predatory terms — payday, title, pawn, subprime.", counts: "Triple-digit-APR lending, title loans, and lenders with enforcement actions defining the practice.", not: "Ordinary consumer credit, prime installment lending, mainstream banks.", ex: "World Acceptance, EZCORP, Enova, Credit Acceptance." },
    { name: "Supply-chain forced labor", status: "Live", def: "A subsidiary named on a current US government forced-labor determination.", counts: "US DHS's UFLPA Entity List or an active CBP Withhold Release Order against a company the business controls.", not: "Boilerplate “we prohibit forced labor” policy language; NGO allegations without a government finding.", ex: "Zijin Mining Group (Xinjiang subsidiaries on the UFLPA list; a Serbian subsidiary under an active CBP order)." },
    { name: "Self-reported supply-chain violations", status: "Live", def: "Labor violations a company's own supplier audits found and disclosed.", counts: "A company's own published audit findings — a lower bar than a government determination, but the company's own admission, remediation included.", not: "Third-party allegations the company hasn't itself confirmed.", ex: "Apple (its own 2025 supply-chain report disclosed 10 Core Violations in 2024)." },
    { name: "Leadership enforcement actions", status: "Live", def: "A CURRENT top executive facing real SEC, DOJ, or government fraud enforcement.", counts: "An actual enforcement proceeding against a sitting CEO/chair/controlling shareholder, stated with its actual resolution (settled without admission, convicted, etc.).", not: "News-cycle “controversy”; a departed executive; a pardoned or dismissed case.", ex: "Tesla (Musk, 2018 SEC settlement), Icahn Enterprises (Icahn, 2024 SEC settlement)." },
  ]],
  ["Historical", [
    { name: "WWII-era forced labor", status: "Live", def: "Documented use of forced or slave labor during the Nazi era, by the company or a direct predecessor.", counts: "Historically documented forced/slave labor, always shown alongside what restitution was made, if any.", not: "Unrelated modern-day criticism; contested historical characterizations without a primary source.", ex: "Volkswagen, Ford, IBM, Bayer, BASF — restitution status differs by company and is stated for each." },
  ]],
  ["Health & vice", [
    { name: "Tobacco & nicotine", status: "Live", def: "Cigarettes, cigars, vaping, and other nicotine products.", counts: "Manufacturers and leaf suppliers as a principal business.", not: "Retailers that stock tobacco among many goods.", ex: "Altria, Philip Morris International, Turning Point Brands." },
    { name: "Alcohol", status: "Live", def: "Producers and wholesalers of beer, wine, and spirits.", counts: "Brewing, winemaking, distilling, and alcohol wholesale.", not: "Restaurants/retailers that serve alcohol; generic non-alcoholic “Beverages.”", ex: "Anheuser-Busch InBev, Molson Coors, Constellation Brands." },
    { name: "Gambling", status: "Live", def: "Casinos, sportsbooks, and betting platforms.", counts: "Casino operators, sports-betting/iGaming, racetrack betting as a principal business.", not: "Payment processors; hospitality with no gaming operation.", ex: "DraftKings, Las Vegas Sands, Caesars, Flutter." },
    { name: "Adult entertainment", status: "Live", def: "Pornography and adult-content businesses.", counts: "Adult content production/distribution; adult nightclubs as a principal business.", not: "General media/streaming with incidental mature content.", ex: "RCI Hospitality." },
    { name: "Cannabis", status: "Live", def: "Cultivation, processing, and sale of cannabis and cannabis products.", counts: "Multi-state operators, cultivators, cannabis-product makers.", not: "Hemp/CBD wellness only; medical cannabinoids (flag separately if desired).", ex: "Canopy Growth, Tilray, Green Thumb, Curaleaf.", contested: true },
    { name: "Opioid crisis", status: "Live", def: "Documented culpability in the opioid epidemic — not legitimate pain medication.", counts: "Opioid-marketing litigation, DEA enforcement, and settlements (makers and distributors).", not: "A company supplying medically-appropriate opioids with no misconduct record.", ex: "Implicated manufacturers and the big-three distributors, by public settlement." },
  ]],
  ["Animal welfare", [
    { name: "Factory farming", status: "Live", def: "Industrial animal agriculture and meat/poultry processing.", counts: "Large-scale meat/poultry slaughter and packing, industrial feedlots.", not: "Plant-based food; small/pasture operations; prepared-food brands that buy meat to make jerky or deli meals (the slaughter is upstream).", ex: "Tyson Foods, Hormel, Smithfield, Pilgrim’s Pride." },
    { name: "Animal testing", status: "Live", def: "Contract research and cosmetics whose core business involves animal testing.", counts: "Contract research orgs with animal-study operations; cosmetics tied to animal testing.", not: "Medical research where no animal testing is disclosed.", ex: "Charles River Labs, LabCorp." },
    { name: "Fur & exotic leather", status: "Live", def: "Production or primary retail of animal fur and exotic-animal leather.", counts: "Fur farming/processing; brands whose principal line is fur/exotic skins.", not: "General apparel with incidental leather.", ex: "A deliberately narrow, curated set — few US-listed pure-plays." },
  ]],
];
function Methodology({ onStart }) {
  const wrap = { maxWidth: 900, margin: "0 auto", padding: "0 24px" };
  const StatusBadge = ({ s }) => (
    <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
      color: s === "Live" ? L.good : L.brass, background: s === "Live" ? "rgba(30,125,87,0.12)" : "rgba(169,128,63,0.12)",
      border: `1px solid ${s === "Live" ? "rgba(190,242,100,0.35)" : "rgba(255,255,255,0.16)"}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>{s}</span>
  );
  const Field = ({ label, children, color }) => (
    <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 12, alignItems: "baseline" }}>
      <span style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: color || L.faint }}>{label}</span>
      <span style={{ fontFamily: sans, fontSize: 14.5, color: L.ink, lineHeight: 1.55 }}>{children}</span>
    </div>
  );
  return (
    <div style={{ fontFamily: sans, background: L.bg, minHeight: "100dvh" }}>
      <Canvas>
        <nav style={{ borderBottom: `1px solid ${D.glassBorder}` }}>
          <div style={{ ...wrap, maxWidth: 1000, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
            <a href="#" style={{ fontFamily: serifDisplay, fontSize: 21, fontWeight: 700, color: D.ink, letterSpacing: "-0.02em", textDecoration: "none" }}>PlainStreet</a>
            <button onClick={onStart} style={brassBtn(999, "9px 18px", 14)}>Get started</button>
          </div>
        </nav>
        <header>
          <div style={{ ...wrap, padding: "clamp(48px,7vw,80px) 24px clamp(36px,5vw,56px)" }}>
            <p style={{ fontFamily: sans, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: D.brassSoft, margin: "0 0 18px" }}>Methodology</p>
            <h1 style={{ fontFamily: serifDisplay, fontWeight: 800, fontSize: "clamp(30px,5vw,50px)", lineHeight: 1.06, margin: 0, letterSpacing: "-0.035em", color: D.ink }}>
              How PlainStreet decides what to flag.
            </h1>
            <p style={{ fontFamily: sans, fontSize: "clamp(15px,1.8vw,18px)", lineHeight: 1.65, color: D.muted, margin: "20px 0 0", maxWidth: 640 }}>
              Every flag is a plain, checkable fact about what a company does — what it means, what counts as a violation (and what deliberately does not), how we find it, and the source behind it.
            </p>
          </div>
        </header>
      </Canvas>

      <section style={{ ...wrap, padding: "clamp(48px,7vw,72px) 24px" }}>
        <SectionHead n="01" title="The principles behind every flag" sub="Non-negotiable — they are the product’s whole premise." />
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 18, counterReset: "p" }}>
          {METHOD_PRINCIPLES.map(([t, d], i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: 14, alignItems: "baseline" }}>
              <span style={{ fontFamily: serif, fontSize: 18, fontWeight: 700, color: L.brass }}>{String(i + 1).padStart(2, "0")}</span>
              <p style={{ margin: 0, fontFamily: sans, fontSize: 15.5, lineHeight: 1.6, color: L.muted }}>
                <b style={{ color: L.pine }}>{t}</b> {d}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section style={{ background: L.card, borderTop: `1px solid ${L.line}`, borderBottom: `1px solid ${L.line}` }}>
        <div style={{ ...wrap, padding: "clamp(48px,7vw,72px) 24px" }}>
          <SectionHead n="02" title="How detection works — three layers" sub="A company is flagged if any layer flags it. When layers overlap, the most precise reason wins." />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
            {METHOD_LAYERS.map(([name, what, strength], i) => (
              <div key={i} style={card({ padding: "22px 20px", background: L.bg })}>
                <div style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: L.brass }}>Layer {i + 1}</div>
                <div style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: L.pine, letterSpacing: "-0.01em", margin: "6px 0 8px" }}>{name}</div>
                <p style={{ margin: 0, fontFamily: sans, fontSize: 14, color: L.muted, lineHeight: 1.55 }}>{what}</p>
                <p style={{ margin: "8px 0 0", fontFamily: sans, fontSize: 13, color: L.faint, lineHeight: 1.5, fontStyle: "italic" }}>{strength}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ ...wrap, padding: "clamp(48px,7vw,72px) 24px" }}>
        <SectionHead n="03" title="The flag catalogue" sub="Every screen we can apply, grouped by theme. “Planned” flags are agreed for a coming build." />
        <div style={{ display: "grid", gap: 40 }}>
          {METHOD_CATALOGUE.map(([group, flags]) => (
            <div key={group}>
              <h3 style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: L.pine, letterSpacing: "-0.015em", margin: "0 0 16px", paddingBottom: 10, borderBottom: `2px solid ${L.line}` }}>{group}</h3>
              <div style={{ display: "grid", gap: 16 }}>
                {flags.map((f) => (
                  <div key={f.name} style={card({ padding: "20px 22px" })}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                      <span style={{ fontFamily: serif, fontSize: 19, fontWeight: 700, color: L.ink, letterSpacing: "-0.01em" }}>{f.name}</span>
                      <StatusBadge s={f.status} />
                      {f.contested && <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: L.muted, background: "rgba(255,255,255,0.06)", border: `1px solid ${L.line}`, borderRadius: 999, padding: "2px 7px" }}>Contested</span>}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <Field label="Definition">{f.def}</Field>
                      <Field label="Counts" color={L.good}>{f.counts}</Field>
                      <Field label="Doesn’t count" color={L.flag}>{f.not}</Field>
                      <Field label="Examples">{f.ex}</Field>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: L.card, borderTop: `1px solid ${L.line}` }}>
        <div style={{ ...wrap, padding: "clamp(48px,7vw,72px) 24px", textAlign: "center" }}>
          <p style={{ fontFamily: serif, fontStyle: "italic", fontSize: "clamp(18px,2.4vw,22px)", color: L.pine, lineHeight: 1.6, margin: 0, maxWidth: 660, marginLeft: "auto", marginRight: "auto" }}>
            Every flag resolves to a plain, checkable, cited fact. Where we can’t meet that bar, we don’t flag it — silence means “not one of the names we track,” never “audited clean.”
          </p>
        </div>
      </section>

      <section style={{ ...wrap, textAlign: "center", padding: "clamp(48px,8vw,90px) 24px" }}>
        <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(24px,4vw,36px)", color: L.pine, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>See what you own.</h2>
        <button onClick={onStart} style={darkBtn(999, "16px 32px", 16)}>Get started</button>
      </section>

      <footer style={{ ...wrap, maxWidth: 1000, borderTop: `1px solid ${L.line}`, padding: "22px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <a href="#" style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: L.muted, textDecoration: "none" }}>PlainStreet</a>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: L.faint }}>Read-only portfolio analysis. Not investment advice.</span>
      </footer>
    </div>
  );
}
const SectionHead = ({ n, title, sub }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: L.brass, marginBottom: 8 }}>{n}</div>
    <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(24px,3.6vw,34px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
    {sub && <p style={{ fontFamily: sans, fontSize: 15.5, color: L.muted, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 620 }}>{sub}</p>}
  </div>
);

// ── Landing ─────────────────────────────────────────────────────────────────
function Landing({ onStart }) {
  const [route, setRoute] = useState(typeof window !== "undefined" ? window.location.hash : "");
  useEffect(() => {
    const h = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  if (route === "#methodology") return <Methodology onStart={onStart} />;
  return <LandingHome onStart={onStart} />;
}

function LandingHome({ onStart }) {
  const wrap = { maxWidth: 1000, margin: "0 auto", padding: "0 24px" };
  const steps = [
    { n: "01", t: "Pick what matters to you", b: "Fossil fuels, weapons, tobacco, gambling, surveillance, and more. Flip on the causes you care about — we only ever check for what you choose." },
    { n: "02", t: "Connect your brokerage", b: "One secure, read-only link through SnapTrade. Works with Robinhood, Schwab, Fidelity, E*TRADE, Webull, and others. We can see your holdings — never touch them." },
    { n: "03", t: "See what clashes", b: "A plain list of what you own that crosses your lines — including the companies hiding inside your index funds, each with a one-sentence reason." },
  ];
  return (
    <div style={{ fontFamily: sans, background: L.bg }}>
      <TickerTape />
      {/* ── Dark hero with the live analyzer ── */}
      <Canvas>
        <nav style={{ position: "sticky", top: 0, zIndex: 20, borderBottom: `1px solid ${D.glassBorder}`, background: "rgba(18,18,22,0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          {/* Below ~480px, "PlainStreet" + "Methodology" + "Get started" don't fit on one
              line and crowd together with no gap. Methodology is already in the footer,
              so it's the one to drop on narrow screens rather than wrap the sticky nav. */}
          <style>{`@media (max-width: 480px) { .ps-nav-methodology { display: none; } }`}</style>
          <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
            <span style={{ fontFamily: serifDisplay, fontSize: 21, fontWeight: 700, color: D.ink, letterSpacing: "-0.02em" }}>PlainStreet</span>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <a href="#methodology" className="ps-nav-methodology" style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, textDecoration: "none" }}>Methodology</a>
              <button onClick={onStart} style={brassBtn(999, "9px 18px", 14)}>Get started</button>
            </div>
          </div>
        </nav>
        <header>
          <div style={{ ...wrap, textAlign: "center", padding: "clamp(56px,9vw,96px) 24px clamp(48px,7vw,80px)" }}>
            <p style={{ fontFamily: sans, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: D.brassSoft, marginBottom: 22 }}>The ethical portfolio analyzer</p>
            <h1 style={{ fontFamily: serifDisplay, fontWeight: 800, fontSize: "clamp(34px,6vw,62px)", lineHeight: 1.04, margin: 0, letterSpacing: "-0.04em", color: D.ink }}>
              Is your money already funding<br /><span style={{ color: D.mint }}>what you fight against?</span>
            </h1>
            <p style={{ fontFamily: sans, fontSize: "clamp(16px,2vw,19px)", lineHeight: 1.6, color: D.muted, margin: "24px auto 0", maxWidth: 560 }}>
              <span style={{ color: D.brassSoft, fontWeight: 600 }}>Let's find out.</span> Even broad market funds hide holdings that might not match your values. Search any stock or ETF ticker to see what’s really inside your portfolio.
            </p>
            <HeroAnalyzer onStart={onStart} wrap={wrap} />
            <p style={{ fontFamily: sans, fontSize: 12.5, color: D.faint, marginTop: 18 }}>Read-only analysis. We never move your money without your say-so.</p>
          </div>
        </header>
      </Canvas>

      {/* ── Light body: hot news ── */}
      <HotNews wrap={wrap} />

      {/* ── Light body: how it works ── */}
      <section style={{ ...wrap, padding: "clamp(56px,9vw,96px) 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(26px,4vw,38px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Three steps, two minutes.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(258px,1fr))", gap: 18 }}>
          {steps.map((s) => (
            <div key={s.n} style={card({ padding: "26px 24px" })}>
              <div style={{ width: 38, height: 38, borderRadius: 14, background: A.lav, color: A.lavInk, display: "grid", placeItems: "center", fontFamily: serif, fontSize: 14, fontWeight: 700 }}>{s.n}</div>
              <div style={{ fontFamily: serif, fontSize: 20, color: L.pine, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 14 }}>{s.t}</div>
              <p style={{ fontFamily: sans, fontSize: 14, color: L.muted, lineHeight: 1.6, margin: "9px 0 0" }}>{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Light body: honesty ── */}
      <section style={{ background: L.card, borderTop: `1px solid ${L.line}`, borderBottom: `1px solid ${L.line}` }}>
        <div style={{ ...wrap, maxWidth: 720, textAlign: "center", padding: "clamp(48px,8vw,80px) 24px" }}>
          <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(24px,4vw,32px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>We'd rather under-claim than mislead.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: L.muted, lineHeight: 1.7, margin: "16px 0 0" }}>
            We check individual stocks against a curated list of companies, and give the reason for every flag. Our coverage is U.S.-listed companies that file with the SEC — foreign-listed companies aren't analyzed yet, so an ADR or overseas name may come back empty simply because we haven't reached it. We don't peer inside broad index funds and pretend we can — an unanalyzed fund is labeled as such, not called clean. A clean result means "none of the names we track," never "audited pure." You draw the lines; we show you where your money already sits.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ ...wrap, textAlign: "center", padding: "clamp(60px,10vw,110px) 24px" }}>
        <h2 style={{ fontFamily: serifDisplay, fontSize: "clamp(28px,4.5vw,42px)", color: L.pine, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.02em" }}>See what you own.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: L.muted, margin: "0 0 26px" }}>Free, read-only, about two minutes.</p>
        <button onClick={onStart} style={darkBtn(999, "16px 32px", 16)}>Get started</button>
      </section>

      <footer style={{ ...wrap, borderTop: `1px solid ${L.line}`, padding: "22px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: L.muted }}>PlainStreet</span>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <a href="#methodology" style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, textDecoration: "none" }}>Methodology</a>
          <span style={{ fontFamily: sans, fontSize: 12.5, color: L.faint }}>Read-only portfolio analysis. Not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}

// ── Auth (dark glass moment) ────────────────────────────────────────────────
function Auth({ onAuthed, onBack }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const d = await api(mode === "signup" ? "/api/signup" : "/api/login", { method: "POST", body: { email, password } });
      onAuthed(d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Canvas>
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "40px 20px" }}>
        <div style={glass({ width: "100%", maxWidth: 420, padding: "34px 32px" })}>
          {onBack && <button onClick={onBack} style={{ ...linkBtn(D.mint), marginBottom: 20, color: D.muted }}>← Back</button>}
          <h1 style={{ fontFamily: serifDisplay, fontSize: 30, color: D.ink, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p style={{ fontFamily: sans, fontSize: 14.5, color: D.muted, margin: "0 0 24px", lineHeight: 1.5 }}>See what's really inside your portfolio.</p>
          <DarkField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <div style={{ height: 12 }} />
          <DarkField label="Password" type="password" value={password} onChange={setPassword} placeholder={mode === "signup" ? "At least 10 characters" : "Your password"} onEnter={submit} />
          {err && <DarkErr>{err}</DarkErr>}
          <button onClick={submit} disabled={busy} style={{ ...mintBtn(), marginTop: 20, width: "100%" }}>
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setErr(""); }} style={{ ...linkBtn(D.mint), marginTop: 16, display: "block", width: "100%", textAlign: "center" }}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </div>
    </Canvas>
  );
}

// ── Dashboard (light theme) ─────────────────────────────────────────────────
function Dashboard({ user, onSignOut, onGoHome }) {
  const [screens, setScreens] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [saved, setSaved] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api("/api/screens").then((d) => setScreens(d.screens)).catch(() => {});
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const refresh = async () => {
    try {
      const d = await api("/api/analysis");
      if (d.connected) setAnalysis(d);
      if (Array.isArray(d.screens) && d.screens.length) setSelected(new Set(d.screens));
    } catch { /* not connected yet */ }
  };
  useEffect(() => {
    if (new URLSearchParams(location.search).get("connected") !== "1") return;
    history.replaceState({}, "", "/");
    setLoading(true);
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try { const d = await api("/api/analysis"); if (d.connected) { setAnalysis(d); setLoading(false); clearInterval(id); } } catch { /* retry */ }
      if (tries > 12) { setLoading(false); clearInterval(id); }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const toggle = (key) => { setSaved(false); setSelected((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); };
  const saveScreens = async () => { await api("/api/screens/select", { method: "POST", body: { screens: [...selected] } }); setSaved(true); if (analysis) refresh(); };
  const connect = async () => {
    setErr("");
    try { const { url } = await api("/api/brokerage/connect", { method: "POST" }); window.location.href = url; }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ minHeight: "100dvh", background: L.bg, fontFamily: sans, color: L.ink }}>
      {/* light top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(11,11,13,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: `1px solid ${L.line}` }}>
        {/* Logo + "Search a ticker" + email + "Sign out" don't all fit below ~480px — the
            email (unbounded length) was the worst offender, overflowing off-screen. Hide
            it on narrow screens; flexWrap is a safety net if it's still tight. */}
        <style>{`@media (max-width: 480px) { .ps-dash-email { display: none; } }`}</style>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button onClick={onGoHome} style={{ ...linkBtn(L.pine), fontFamily: serifDisplay, fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>PlainStreet</button>
          <span style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <button onClick={onGoHome} style={linkBtn(L.teal)}>Search a ticker</button>
            <span className="ps-dash-email" style={{ fontFamily: sans, fontSize: 12.5, color: L.muted }}>{user.email}</span>
            <button onClick={async () => { try { await api("/api/logout", { method: "POST" }); } catch { /* noop */ } onSignOut(); }} style={linkBtn(L.teal)}>Sign out</button>
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "26px 20px 90px" }}>
        <LSection n="1" title="Choose your ethical lines" sub="Turn on the ones you care about. We only flag what you flag.">
          {!screens ? <Muted>Loading…</Muted> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(228px,1fr))", gap: 11 }}>
              {screens.map((s) => {
                const on = selected.has(s.key);
                return (
                  <button key={s.key} onClick={() => toggle(s.key)} style={{
                    textAlign: "left", cursor: "pointer", padding: "14px 15px", borderRadius: 20,
                    background: on ? "rgba(252,165,165,0.13)" : L.card,
                    border: `1.5px solid ${on ? L.flagBorder : L.line}`,
                    boxShadow: on ? "0 6px 20px -10px rgba(252,165,165,0.3)" : "0 1px 2px rgba(0,0,0,0.5)",
                    transition: "all .14s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink }}>{s.label}</span>
                      <span style={{ fontFamily: sans, fontSize: 15, color: on ? L.flag : L.faint }}>{on ? "✓" : "+"}</span>
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: L.muted, marginTop: 4, lineHeight: 1.45 }}>{s.blurb}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: L.faint, marginTop: 7 }}>{s.count} companies tracked</div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={saveScreens} disabled={!selected.size} style={{ ...darkBtn(999, "11px 20px", 15), opacity: selected.size ? 1 : 0.4 }}>
              Save {selected.size ? `(${selected.size})` : ""}
            </button>
            {saved && <span style={{ fontFamily: sans, fontSize: 13, color: L.good, fontWeight: 600 }}>Saved ✓</span>}
          </div>
        </LSection>

        <LSection n="2" title="Connect your brokerage" sub="Read-only, through SnapTrade. We can see your holdings — we only read them, and never move money without your say-so.">
          {analysis ? (
            <div style={card({ padding: "15px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" })}>
              <span style={{ color: L.good, fontWeight: 700, fontFamily: sans, fontSize: 14 }}>✓ Connected</span>
              <span style={{ color: L.muted, fontFamily: sans, fontSize: 14 }}>· {analysis.accounts.map((a) => a.name).join(", ")}</span>
              <button onClick={connect} style={{ ...linkBtn(L.teal), marginLeft: "auto" }}>Reconnect</button>
            </div>
          ) : loading ? (
            <div style={card({ padding: "15px 18px" })}><Muted>Reading your holdings… this can take a few seconds.</Muted></div>
          ) : (
            <>
              <button onClick={connect} style={darkBtn(999, "14px 24px", 15)}>Connect brokerage →</button>
              <p style={{ fontFamily: sans, fontSize: 12, color: L.faint, marginTop: 11, lineHeight: 1.5 }}>
                You'll authorize the connection on SnapTrade, then come back here. Supports Robinhood, Schwab, Fidelity, E*TRADE, Webull, and more.
              </p>
            </>
          )}
          {err && <LErr>{err}</LErr>}
        </LSection>

        {analysis && <Results analysis={analysis} />}
      </div>
    </div>
  );
}

function Results({ analysis }) {
  const { summary, conflictedStocks, conflictedFunds, holdings } = analysis;
  const nothing = summary.directConflictCount === 0 && summary.fundConflictCount === 0
    && (summary.analyzedStocks > 0 || summary.analyzedFunds > 0);
  return (
    <LSection n="3" title="What we found" sub={null}>
      {/* §3.4 — the headline stats. One accent card, never two. */}
      {nothing ? (
        <div style={card({ padding: "22px 24px", marginBottom: 16 })}>
          <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", color: L.ink }}>No conflicts among the names we track.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginBottom: 16 }}>
          {summary.directConflictValueCents > 0 && (
            <StatCard accent label="Held directly" value={money(summary.directConflictValueCents)}
              sub={`${summary.directConflictCount} holding${summary.directConflictCount === 1 ? "" : "s"} that clash with your screens`} />
          )}
          {summary.fundConflictCount > 0 && (
            <StatCard label="Funds holding flagged companies" value={String(summary.fundConflictCount)}
              sub="Look-through below — we name every company inside." />
          )}
        </div>
      )}

      {/* §3.7 — where the conflicts concentrate. The bar is a real share of flagged
          value; when nothing is held directly there's no denominator, so no bar. */}
      {summary.byFlag.length > 0 && (() => {
        const totalFlagged = summary.byFlag.reduce((n, f) => n + (f.valueCents || 0), 0);
        return (
          <div style={{ marginBottom: 20 }}>
            <SubHead>Where it concentrates</SubHead>
            {summary.byFlag.map((f) => (
              <ProgressRow key={f.key} title={f.label} tone={L.flag}
                pct={totalFlagged > 0 && f.valueCents > 0 ? f.valueCents / totalFlagged : null}
                leftValue={f.valueCents > 0 ? money(f.valueCents) : null}
                rightValue={f.fundCompanies > 0 ? `${f.fundCompanies} in funds` : null} />
            ))}
          </div>
        );
      })()}

      {/* direct stock holdings */}
      {conflictedStocks.length > 0 && (
        <>
          <SubHead>Held directly</SubHead>
          {conflictedStocks.map((h) => (
            <div key={h.account + h.symbol} style={card({ padding: "15px 17px", marginBottom: 10, borderLeft: `3px solid ${L.flag}` })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div><span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: L.ink }}>{h.symbol}</span><span style={{ fontFamily: sans, fontSize: 13, color: L.muted }}> · {h.description}</span></div>
                <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink }}>{money(h.valueCents)}</span>
              </div>
              <div style={{ fontFamily: sans, fontSize: 11.5, color: L.faint, marginTop: 2 }}>{h.account} · {h.units} shares</div>
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {h.flags.map((f) => <FlagCard key={f.key} flag={f} company={h.description} />)}
              </div>
            </div>
          ))}
        </>
      )}

      {/* fund look-through */}
      {conflictedFunds.length > 0 && (
        <>
          <SubHead>Inside your funds</SubHead>
          {conflictedFunds.map((h) => {
            const fundContains = dedupeByName(h.contains);
            const groups = groupByFlag(fundContains);
            return (
              <div key={h.account + h.symbol} style={card({ padding: "15px 17px", marginBottom: 10, borderLeft: `3px solid ${L.brass}` })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div><span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: L.ink }}>{h.symbol}</span><span style={{ fontFamily: sans, fontSize: 13, color: L.muted }}> · {h.description}</span></div>
                  <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink }}>{money(h.valueCents)}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: L.faint, marginTop: 2 }}>Tracks {h.fundBasis} — holds {fundContains.length} flagged companies</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <FundBreakdown groups={groups} theme="light" />
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* honest method note */}
      <div style={card({ padding: "14px 16px", marginTop: 16, background: L.lineSoft, boxShadow: "none" })}>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, lineHeight: 1.65 }}>
          We checked <b style={{ color: L.ink }}>{summary.analyzedStocks}</b> direct holding{summary.analyzedStocks === 1 ? "" : "s"} and looked inside{" "}
          <b style={{ color: L.ink }}>{summary.analyzedFunds}</b> fund{summary.analyzedFunds === 1 ? "" : "s"} using their published holdings.
          {summary.opaqueFunds > 0 && <> {summary.opaqueFunds} other fund{summary.opaqueFunds === 1 ? " isn't" : "s aren't"} one we can see inside yet, so {summary.opaqueFunds === 1 ? "it's" : "they're"} marked "not analyzed" rather than clean.</>}
          {" "}Index membership shifts over time, and a fund's dollar breakdown per company needs weights we don't show — we name the companies, not the cents.
        </div>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ fontFamily: sans, fontSize: 13, color: L.teal, cursor: "pointer", fontWeight: 600 }}>See all {holdings.length} holdings</summary>
        <div style={card({ marginTop: 10, padding: "6px 16px" })}>
          {holdings.map((h, i) => (
            <div key={h.account + h.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: sans, fontSize: 13, padding: "9px 2px", borderBottom: i < holdings.length - 1 ? `1px solid ${L.lineSoft}` : "none" }}>
              <span style={{ color: L.ink }}><b>{h.symbol}</b> <span style={{ color: L.muted }}>{h.description}</span></span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {h.conflicted ? <span style={{ color: L.flag, fontSize: 11, fontWeight: 700 }}>● flagged</span>
                  : h.analyzable ? <span style={{ color: L.good, fontSize: 11 }}>clear</span>
                  : <span style={{ color: L.faint, fontSize: 11 }}>not analyzed</span>}
                <span style={{ color: L.muted, minWidth: 78, textAlign: "right" }}>{money(h.valueCents)}</span>
              </span>
            </div>
          ))}
        </div>
      </details>
    </LSection>
  );
}
const SubHead = ({ children }) => <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: L.brass, fontWeight: 700, margin: "6px 0 10px" }}>{children}</div>;

// ── Shared ────────────────────────────────────────────────────────────────────
function LSection({ n, title, sub, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
        <span style={{ fontFamily: serif, fontSize: 15, color: L.brass, fontWeight: 700 }}>{n}</span>
        <h2 style={{ fontFamily: serif, fontSize: 22, color: L.pine, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
      </div>
      {sub && <p style={{ fontFamily: sans, fontSize: 13.5, color: L.muted, margin: "6px 0 15px", lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: 13 }} />}
      {children}
    </section>
  );
}
function DarkField({ label, type = "text", value, onChange, placeholder, onEnter }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontFamily: sans, fontSize: 11.5, color: D.muted, marginBottom: 5 }}>{label}</div>
      <input type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
        style={{ width: "100%", fontFamily: sans, fontSize: 14, color: D.ink, background: "rgba(255,255,255,0.06)",
          border: `1px solid ${D.glassBorder}`, borderRadius: 14, padding: "12px 13px", outline: "none",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />
    </label>
  );
}
const Muted = ({ children }) => <div style={{ fontFamily: sans, fontSize: 13.5, color: L.muted }}>{children}</div>;
const LErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, padding: "10px 12px", borderRadius: 14 }}>{children}</div>;
const DarkErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, padding: "10px 12px", borderRadius: 14 }}>{children}</div>;

// Buttons — flat, no gloss, full pills. All three primaries are lavender-on-near-black and
// differ only in border/shadow; they're near-duplicates now and could collapse into one.
const mintBtn = () => ({
  background: A.lav, color: A.lavInk, border: `1px solid ${A.lav}`, borderRadius: 999, padding: "12px 20px",
  fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.005em",
  boxShadow: "0 10px 24px -14px rgba(0,0,0,0.7)",
});
const brassBtn = (r = 999, pad = "14px 24px", fs = 15) => ({
  background: A.lav, color: A.lavInk, border: `1px solid ${A.lav}`, borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.005em",
});
// Borderless variant with a lift — used for the big page-level CTAs.
const darkBtn = (r = 999, pad = "14px 24px", fs = 15) => ({
  background: A.lav, color: A.lavInk, border: "none", borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.005em",
  boxShadow: "0 10px 24px -14px rgba(0,0,0,0.7)",
});
const linkBtn = (color) => ({ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, color });

// ── Design-system components — see DESIGN.md §3 ──────────────────────────────

// §3.1 — a button sitting ON a pastel fill is white, not lavender-on-lavender, or it
// dissolves into its own card.
const onAccentBtn = (r = 999, pad = "8px 16px", fs = 13) => ({
  background: "#FFFFFF", color: A.lavInk, border: "none", borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.005em",
});

// §3.6 — delta badge. Lime when up, coral when down; each carries its own ink.
// An all-time change can be five figures (AAPL is up ~246,000% since its 1980 IPO).
// Two decimals on that is noise, and the digits overflow the badge — drop to whole
// numbers with separators once past 1000%.
const fmtPct = (pct) => (Math.abs(pct) >= 1000
  ? Math.round(pct).toLocaleString("en-US") + "%"
  : pct.toFixed(2) + "%");

function DeltaBadge({ pct }) {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  return (
    <span style={{
      fontFamily: sans, fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
      background: up ? A.lime : L.flagBg, color: up ? A.limeInk : L.flag,
      border: up ? "none" : `1px solid ${L.flagBorder}`, whiteSpace: "nowrap",
    }}>{up ? "+" : ""}{fmtPct(pct)}</span>
  );
}

// §3.9 — area chart: line plus gradient fill, no axes, no gridlines, no labels; the figure
// above it carries the value. Renders nothing without at least two real points — we never
// draw a shape just to fill the space.
//
// Scrubbable: pointer (mouse or touch) reports the nearest index to `onScrub`, so the
// caller can show the exact value at that moment. `touchAction: pan-y` keeps vertical page
// scrolling working on a phone while horizontal drags scrub.
function Sparkline({ data, height = 130, color = A.lav, label = "", onScrub, activeIdx = null }) {
  const gid = useRef(`sp-${Math.random().toString(36).slice(2, 9)}`);
  const boxRef = useRef(null);
  if (!Array.isArray(data) || data.length < 2) return null;
  const W = 600, H = height;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => H - ((v - min) / span) * (H * 0.82) - H * 0.09; // 9% breathing room
  const line = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const pick = (clientX) => {
    const el = boxRef.current;
    if (!el || !onScrub) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onScrub(Math.round(frac * (data.length - 1)));
  };

  // The SVG is stretched horizontally (preserveAspectRatio="none"), so a <circle> inside it
  // would render as an ellipse. The marker is positioned HTML instead — the vertical scale
  // is 1:1 because the viewBox height equals the rendered height, so `y()` is already px.
  const hasMark = activeIdx !== null && activeIdx >= 0 && activeIdx < data.length;
  return (
    <div ref={boxRef} style={{ position: "relative", touchAction: "pan-y", cursor: onScrub ? "crosshair" : "default" }}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => onScrub && onScrub(null)}
      // A finger never fires pointerleave — without these the readout would stay frozen
      // on the last touched point after the drag ends. A mouse keeps hovering, so it is
      // left alone and cleared by pointerleave instead.
      onPointerUp={(e) => { if (onScrub && e.pointerType !== "mouse") onScrub(null); }}
      onPointerCancel={() => onScrub && onScrub(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={label ? `Price trend, ${label}, ${data.length} points` : `Price trend, ${data.length} points`}
        style={{ width: "100%", height, display: "block", marginTop: 6 }}>
        <defs>
          <linearGradient id={gid.current} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid.current})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {hasMark && (
        <>
          <div aria-hidden style={{
            position: "absolute", top: 6, bottom: 0,
            left: `${(activeIdx / (data.length - 1)) * 100}%`,
            width: 1, background: "rgba(255,255,255,0.28)", pointerEvents: "none",
          }} />
          <div aria-hidden style={{
            position: "absolute",
            left: `${(activeIdx / (data.length - 1)) * 100}%`,
            top: y(data[activeIdx]) + 6, width: 9, height: 9, borderRadius: "50%",
            background: color, border: "2px solid #0B0B0D",
            transform: "translate(-50%,-50%)", pointerEvents: "none",
          }} />
        </>
      )}
    </div>
  );
}

// §3.4 — stat card. Label on top, value dominant but set LIGHT (weight 500, never 700+ —
// size does the work). `accent` is the one-per-screen lavender variant.
function StatCard({ label, value, sub, delta, accent = false, action }) {
  const ink = accent ? A.lavInk : L.ink;
  const dim = accent ? "rgba(27,16,48,0.62)" : L.muted;
  return (
    <div style={card({
      padding: "16px 18px", background: accent ? A.lav : L.card,
      border: accent ? "none" : `1px solid ${L.line}`,
      display: "grid", gap: 8, alignContent: "start",
    })}>
      <div style={{ fontFamily: sans, fontSize: 12.5, color: dim, fontWeight: 500 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: sans, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", color: ink, lineHeight: 1.1 }}>{value}</span>
        {delta}
      </div>
      {sub && <div style={{ fontFamily: sans, fontSize: 12, color: dim, lineHeight: 1.45 }}>{sub}</div>}
      {action}
    </div>
  );
}

// §3.5 — accent callout: pastel fill, dark ink, dismissible, white on-accent action.
function Callout({ tone = "lav", label, headline, actionLabel, onAction }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const lime = tone === "lime";
  const fill = lime ? A.lime : A.lav;
  const ink = lime ? A.limeInk : A.lavInk;
  const dim = lime ? "rgba(23,36,10,0.66)" : "rgba(27,16,48,0.66)";
  return (
    <div style={{ background: fill, borderRadius: 20, padding: "15px 16px", display: "grid", gap: 9, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {label && <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 700, color: dim }}>{label}</span>}
        <button onClick={() => setGone(true)} aria-label="Dismiss"
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: dim, fontFamily: sans, fontSize: 17, lineHeight: 1, padding: 2 }}>×</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: ink, letterSpacing: "-0.01em", lineHeight: 1.3, flex: "1 1 240px" }}>{headline}</div>
        {actionLabel && <button onClick={onAction} style={onAccentBtn()}>{actionLabel}</button>}
      </div>
    </div>
  );
}

// §3.7 — list row with progress. The bar renders only when `pct` is a real ratio; a
// progress bar with an invented denominator is exactly the kind of fake number this
// product promises never to show.
function ProgressRow({ icon, title, subtitle, leftValue, rightValue, pct, tone = A.lav }) {
  const p = typeof pct === "number" && Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : null;
  return (
    <div style={card({ padding: "14px 15px", marginBottom: 10, display: "grid", gap: 9 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {icon && <div style={{ width: 40, height: 40, borderRadius: 14, background: L.lineSoft, display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 700, color: L.ink, letterSpacing: "-0.01em" }}>{title}</div>
          {subtitle && <div style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {p !== null && (
        <div style={{ height: 4, borderRadius: 999, background: L.line, overflow: "hidden" }}>
          <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 999, background: tone }} />
        </div>
      )}
      {(leftValue || rightValue) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: sans, fontSize: 12.5, color: L.muted }}>
          <span style={{ color: L.ink }}>{leftValue}</span><span>{rightValue}</span>
        </div>
      )}
    </div>
  );
}

// A scrubbed point needs a "when". Intraday windows want a time of day; longer ones want
// a date — "Aug 14" is useless on a 1-day chart and "2:35 PM" is useless on a 1-year one.
const fmtStamp = (unixSec, range) => {
  const d = new Date(unixSec * 1000);
  if (range === "1D") return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (range === "1W") return d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  if (range === "ALL") return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// The windows the chart offers. Mirrors RANGES in server/lib/quotes.js — the server is
// the authority on what each one means; this is only the button order and labels.
const QUOTE_RANGES = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "All" },
];

// §1.2 + §3.9 — the headline figure with its chart directly beneath, and the window it
// covers stated rather than implied. Self-fetching and self-hiding: if there's no quote
// for this symbol the panel simply doesn't render.
function QuotePanel({ symbol }) {
  const [range, setRange] = useState("1M");
  const [q, setQ] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scrub, setScrub] = useState(null); // index under the pointer, or null
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setScrub(null);
    api(`/api/quote?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((d) => { if (alive) { setQ(d.quote); setBusy(false); } })
      .catch(() => { if (alive) { setQ(null); setBusy(false); } });
    return () => { alive = false; };
  }, [symbol, range]);
  // Keep the old series on screen while a new window loads — blanking the panel makes the
  // whole card jump. But never show one symbol's numbers under another's name.
  if (!q || typeof q.price !== "number" || q.symbol !== String(symbol).toUpperCase()) return null;
  // While scrubbing, the headline figure and badge report the point under the pointer,
  // measured against the same baseline the window's own percentage uses. Let go and it
  // snaps back to the latest price — no separate floating tooltip to clip or mis-place.
  const scrubbing = scrub !== null && Array.isArray(q.spark) && scrub < q.spark.length;
  const shownPrice = scrubbing ? q.spark[scrub] : q.price;
  const shownPct = scrubbing && q.base ? ((shownPrice - q.base) / q.base) * 100 : q.changePercent;
  const stamp = scrubbing && q.times && q.times[scrub] ? fmtStamp(q.times[scrub], q.range) : null;
  const up = q.changePercent >= 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: D.muted }}>
          {stamp || `Last price · ${q.label}`}
        </span>
        <div role="group" aria-label="Chart range" style={{ marginLeft: "auto", display: "flex", gap: 4, flexWrap: "wrap" }}>
          {QUOTE_RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={on}
                style={{
                  fontFamily: sans, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                  borderRadius: 999, padding: "3px 10px", minWidth: 34,
                  background: on ? A.lav : "transparent",
                  color: on ? A.lavInk : D.muted,
                  border: `1px solid ${on ? A.lav : D.glassBorder}`,
                  transition: "background .12s, color .12s, border-color .12s",
                }}>{r.label}</button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
        <span style={{ fontFamily: sans, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: D.ink, lineHeight: 1.1 }}>$ {shownPrice.toFixed(2)}</span>
        <DeltaBadge pct={shownPct} />
      </div>
      <div style={{ opacity: busy ? 0.45 : 1, transition: "opacity .15s" }}>
        <Sparkline data={q.spark} height={110} color={up ? A.lime : L.flag} label={q.label}
          onScrub={setScrub} activeIdx={scrub} />
      </div>
    </div>
  );
}
