// The Ethical Portfolio Analyzer — the whole app, one file.
//
// Flow: sign in → pick the ethical lines you care about → connect your brokerage
// (read-only, via SnapTrade) → see which holdings conflict, and why.
//
// The analyzer is read-only; we never move money without the user's say-so. (Trading may
// come later as a paid feature — the free tool only reads and explains.)
//
// Visual language: modern dark fintech app. Near-black page (#0B0B0D) with charcoal cards
// floating on it; the whole product is dark, no light/paper mode. Generous rounding (20px
// cards, full pills on every button and badge) and one grotesque sans throughout, no serif
// anywhere. Two accents do all the work: a light navy blue is the primary (buttons, links,
// active states, always with deep-navy text on top when used as a fill), and lime is
// reserved for positive/live indicators. Coral is reserved strictly for flags.

import { Fragment, useEffect, useRef, useState } from "react";
import { displayName, reasonParts } from "./format.js";
import { gradeFor } from "./grade.js";
import { conductGradeFor, CONDUCT_CATEGORIES } from "./conductGrade.js";
import { compareFunds } from "./compare.js";
import { parsePortfolioCsv } from "./portfolioCsv.js";
import { DEFAULT_GOOGLE_CLIENT_ID } from "./googleClient.js";

// ── Palette ────────────────────────────────────────────────
// Deep navy throughout, no light mode. The page is the darkest ground; sections separate
// by stepping the navy rather than by rules, and panels lift off it by being a step
// lighter. One accent: a light blue for anything actionable or live, always carrying
// near-black navy ink when used as a fill. Coral is reserved strictly for flags, mint
// for positive.
const P = {
  page: "#0D1119",     // the page itself, the deepest ground
  block: "#121926",    // the analyzer band, where dense flag tables live
  band: "#151D2C",     // the nav strip and stepped sections
  bandDeep: "#101725", // a harder step down, so a seam reads as a colour change
  card: "#1A2333",     // panels lifted off the page
  deep: "#0A0E16",     // the ticker strip, darker than the page
  sky: "#9CCBF5",      // the accent: buttons, links, active states
  skyDeep: "#BFE0FB",  // the accent lifted, for small text that must clear AA
  navy: "#0E2338",     // ink on a sky fill
  ink: "#EDEFF3",
  mint: "#5FCF92", coral: "#EE7856",
};

// ── Tokens for the darker bands: light type on deep navy. ───────────────────
// muted/faint are sized against the LIGHTEST ground they ever land on (the lifted panel);
// at a step darker, 11-12px tertiary lines measured 3.95-4.46:1, just under AA.
const D = {
  ink: P.ink, muted: "#A5B0C5", faint: "#93A2BD",
  mint: P.sky, brass: P.sky, brassSoft: P.skyDeep,
  glassBorder: "rgba(237,239,243,0.14)",
  lift: "#1E2739", // navy raised one step, for panels sitting on the band
  block: P.block,
  flag: "#F2A98F", flagBg: "rgba(238,120,86,0.15)", flagBorder: "rgba(238,120,86,0.34)",
};
// ── Tokens for the page. `pine` and `teal` are legacy names from an older theme; the
// values are what matter. The whole product is dark, so these are light-on-dark too —
// the split from D is about which ground an element sits on, not light vs dark.
const L = {
  bg: P.page, card: P.card, line: "#2A3550", lineSoft: "#202B42",
  ink: P.ink, muted: "#A5B0C5", faint: "#93A2BD",
  pine: P.ink, teal: P.sky, mint: P.mint, brass: P.skyDeep,
  flag: P.coral, flagBg: "rgba(238,120,86,0.14)", flagBorder: "rgba(238,120,86,0.32)",
  good: P.mint,
};
// Accent fills. A sky or mint fill always carries near-black ink on top — never the page
// ink, which is what keeps these legible.
const A = { lav: P.sky, lavInk: P.navy, lime: P.mint, limeInk: "#10281B", raised: "#24304A" };
const sans = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const display = "'Familjen Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const serif = display;
const serifDisplay = display;
// The wordmark gets its own face so the brand isn't just the heading font at a larger
// size. Gabarito stands in for Okine, which Google Fonts doesn't carry.
const wordmark = "'Gabarito', 'Familjen Grotesk', -apple-system, sans-serif";
// High-contrast serif for headlines only. Everything else stays in the grotesks above.
const headline = "'DM Serif Display', Georgia, 'Times New Roman', serif";

// Solid block, square corners, no lift. Separation comes from the fill and the rule.
const card = (o = {}) => ({
  background: L.card, border: `1px solid ${L.line}`,
  ...o,
});

// The query string as it was when the page loaded. The hero rewrites the address bar as
// soon as it runs a lookup (so the URL always matches the view), which means anything
// read from `location.search` later — a reset token, a category filter, a campaign tag —
// is already gone. Read it once here, before any of that happens.
const URL_AT_LOAD = (() => { try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); } })();

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

// ── Where did this visitor come from? ─────────────────────────────────────────
// A post links to "/?symbol=VOO&ref=reddit-sideproject". The tag is kept for the visit
// (sessionStorage, this tab only) and sent with the few events we count, so the funnel
// can say which post produced searches — not just visits. Nothing about the visitor
// is stored; the server keeps aggregate counters per tag.
const REF_KEY = "ps_ref";
function captureRef() {
  try {
    const ref = URL_AT_LOAD.get("ref");
    if (ref) sessionStorage.setItem(REF_KEY, ref.slice(0, 40));
  } catch { /* storage may be unavailable */ }
}
function currentRef() { try { return sessionStorage.getItem(REF_KEY) || ""; } catch { return ""; } }
function ping(name) {
  try {
    const body = JSON.stringify({ name, ref: currentRef() });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/event", new Blob([body], { type: "application/json" }));
    else fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* never let analytics break the page */ }
}

export default function Analyzer() {
  const [user, setUser] = useState(undefined);
  // null, or which pop-up is open: "signup" (Get started), "login" (Sign in), or "reset"
  // when the visitor arrives from a password-reset email.
  const [authMode, setAuthMode] = useState(() => (URL_AT_LOAD.get("reset") ? "reset" : null));
  // A signed-in user can choose to browse the public search page without signing out.
  const [viewHome, setViewHome] = useState(false);
  useEffect(() => { api("/api/me").then((d) => signIn(d.user)).catch(() => setUser(null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // Signed-out visitors get Google's sign-in script in the background, so the button is
  // already there when they open Sign in or Get started.
  useEffect(() => {
    if (user !== null) return;
    const t = setTimeout(() => loadGsi().catch(() => {}), 1200);
    return () => clearTimeout(t);
  }, [user]);

  // A signed-in person's saved categories are the source of truth: copied to this device
  // so the home page picker opens with them, and updated from either picker.
  const signIn = (u) => { if (u?.screens?.length) saveSelection(u.screens); setUser(u); };
  const saveAccountScreens = (keys) => {
    setUser((u) => (u ? { ...u, screens: keys } : u));
    return api("/api/screens-select", { method: "POST", body: { screens: keys } });
  };

  if (user === undefined) return <Splash />;
  if (user && !viewHome) {
    return <Dashboard user={user} onSaveScreens={saveAccountScreens} onSignOut={() => { setUser(null); setAuthMode(null); }} onGoHome={() => setViewHome(true)} />;
  }
  // Already signed in and just browsing home: "Get started" and "Sign in" return to the
  // dashboard instead of opening the form again.
  const openAuth = (mode) => (user ? setViewHome(false) : setAuthMode(mode));
  return (
    <>
      <Landing onStart={() => openAuth("signup")} onSignIn={() => openAuth("login")} onPick={user ? saveAccountScreens : null} />
      {!user && authMode && (
        <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthMode(null)}
          onAuthed={(u) => { signIn(u); setViewHome(false); setAuthMode(null); }} />
      )}
    </>
  );
}

// ── The navy canvas: one flat block of deep navy, no gradient and no glow. The page is
// built from solid blocks butted against each other; every seam is a hard edge. ──
function Canvas({ children }) {
  return (
    <div style={{ position: "relative", fontFamily: sans, color: D.ink, overflow: "hidden", background: D.block }}>
      {children}
    </div>
  );
}

function Splash() {
  return (
    <Canvas>
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: wordmark, fontSize: 28, color: D.brassSoft, letterSpacing: "-0.02em" }}>PlainStreet</span>
      </div>
    </Canvas>
  );
}

// ── The live hero analyzer: type a ticker, see inside it, no login ───────────
// Initial ticker: from the ?symbol= URL param (shareable/bookmarkable), else VOO.
const initialSymbol = () => {
  try { return (URL_AT_LOAD.get("symbol") || "VOO").toUpperCase(); }
  catch { return "VOO"; }
};
// "?only=fossil_fuels,coal" narrows the category filter from the URL, so a link shared
// in a climate forum opens already showing just the climate flags.
const initialOnly = () => {
  try { const v = URL_AT_LOAD.get("only"); return v ? v.split(",").filter(Boolean) : null; }
  catch { return null; }
};
// "?symbol=VOO&vs=QQQ" opens straight into the side-by-side, so a comparison is as
// shareable as a single fund, which is the form most of these arrive in an argument.
const initialVs = () => {
  try { return (URL_AT_LOAD.get("vs") || "").toUpperCase(); }
  catch { return ""; }
};
// The categories someone picked, remembered on this device so they don't start over from
// "everything on" each visit. Browser storage can be missing or blocked (private windows),
// so every read and write is allowed to fail quietly.
// v2: the first version also saved the automatic starting selection, so visitors from the
// days when that was "nothing" stayed stuck on nothing. A new name drops those.
const SAVED_KEY = "plainstreet.categories.v2";
const savedSelection = () => {
  try { const v = JSON.parse(window.localStorage.getItem(SAVED_KEY)); return Array.isArray(v) ? v : null; }
  catch { return null; }
};
const saveSelection = (keys) => { try { window.localStorage.setItem(SAVED_KEY, JSON.stringify(keys)); } catch { /* ignore */ } };
// Keep the address bar in sync with what's on screen, so copying it shares this exact view.
function syncUrl(symbol, selected, screens, vs = "") {
  try {
    let qs = `?symbol=${encodeURIComponent(symbol)}`;
    if (vs) qs += `&vs=${encodeURIComponent(vs)}`;
    // Keys are [a-z_] so the comma can stay readable instead of becoming %2C.
    // Nothing selected leaves ?only= off; an empty one would just be noise in a shared link.
    if (selected && selected.size && screens.length && selected.size < screens.length) qs += `&only=${[...selected].join(",")}`;
    window.history.replaceState(null, "", qs);
  } catch { /* ignore */ }
}
// Faith-based starting sets. A preset only selects screens that already exist, so it
// asserts nothing new about any company. The note for a set is shown only while that set
// is the current selection: these traditions are not uniform, so the caveat belongs with
// the choice someone actually made rather than stacked up for all five at once.
const filterLink = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 11.5, color: D.mint };

// Categories as one dropdown instead of a wall of 27 chips. The button says what is
// picked; the list opens below it with the faith-based sets first, then every category as a
// checkbox. Esc, Done or a click outside closes it.
// The search result card has its own type: Figtree for text, Bricolage Grotesque for the
// symbol and the big numbers (anything the card sets in the heading face). Its pieces set
// fonts inline, so these rules use !important to win over them, scoped to the card only.
const RESULT_FONTS_CSS = `
.ps-result, .ps-result * { font-family: "Figtree", ${sans} !important; }
.ps-result [style*="Familjen"], .ps-result .ps-num { font-family: "Bricolage Grotesque", "Figtree", sans-serif !important; letter-spacing: -0.02em; }
`;
// Hover and entrance for the category picker; inline styles can't do :hover.
const PICKER_CSS = `
.ps-upload:hover { background: rgba(156,203,245,0.12) !important; border-color: rgba(156,203,245,0.7) !important; }
.ps-pick-trigger:hover { border-color: rgba(237,239,243,0.3) !important; }
.ps-pick-row:hover { background: rgba(237,239,243,0.06) !important; }
.ps-pick-chip:hover { border-color: rgba(156,203,245,0.6) !important; }
@keyframes ps-pick-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.ps-pick-menu { animation: ps-pick-in .18s ease both; }
@media (prefers-reduced-motion: reduce) { .ps-pick-menu { animation: none; } }
`;
function CategoryPicker({ screens, presets, selected, toggle, setAll, allOn, onApply, onFind }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const have = new Set(screens.map((s) => s.key));
  // A preset can name a screen this deployment doesn't carry; drop those rather than
  // selecting keys that would silently match nothing.
  const usable = (presets || []).map((p) => ({ ...p, screens: p.screens.filter((k) => have.has(k)) })).filter((p) => p.screens.length);
  const isActive = (p) => selected.size === p.screens.length && p.screens.every((k) => selected.has(k));
  const active = usable.find(isActive);
  const labelOf = (k) => screens.find((s) => s.key === k)?.label || k;
  const picked = screens.filter((s) => selected.has(s.key)).map((s) => s.label);
  const summary = !selected.size ? "None selected yet"
    : allOn ? "All categories"
    : active ? active.label
    : picked.length <= 2 ? picked.join(", ")
    : `${picked.slice(0, 2).join(", ")} +${picked.length - 2}`;

  const check = (on) => ({ width: 18, height: 18, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 5,
    border: `1.5px solid ${on ? P.sky : "rgba(237,239,243,0.28)"}`, background: on ? P.sky : "transparent", color: P.navy,
    transition: "background .12s, border-color .12s" });
  const head = { fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: D.faint };
  const tick = <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.2 5 8.6 9.6 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

  return (
    <div style={{ marginTop: 22, maxWidth: 640 }}>
      <style>{PICKER_CSS}</style>
      {/* Says what this control is for, so a first-time visitor knows this is where they
          choose their values. */}
      <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: D.ink }}>Choose what you care about</div>
      <div style={{ fontFamily: sans, fontSize: 13, color: D.muted, margin: "3px 0 10px" }}>
        Pick the categories you want flagged, or start from a faith-based set.
      </div>
      <div ref={box} style={{ position: "relative" }}>
        <button className="ps-pick-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", cursor: "pointer",
            fontFamily: sans, fontSize: 15, color: D.ink, background: "rgba(237,239,243,0.10)",
            border: `1px solid ${open ? "rgba(156,203,245,0.55)" : D.glassBorder}`, borderRadius: 14, padding: "13px 15px", textAlign: "left" }}>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected.size ? D.ink : D.muted }}>{summary}</span>
          <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: P.navy, background: selected.size ? P.sky : "rgba(237,239,243,0.3)",
            borderRadius: 999, padding: "2px 9px" }}>{selected.size}/{screens.length}</span>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden style={{ flexShrink: 0, color: D.muted, transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }}>
            <path d="M3 5.2 7 9l4-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {selected.size > 0 && !open && (
          <button onClick={onFind} style={{ ...filterLink, fontSize: 13, fontWeight: 600, marginTop: 9 }}>Find funds for these →</button>
        )}

        {open && (
          <div role="dialog" aria-label="Choose categories" className="ps-pick-menu"
            style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 40,
              background: D.lift, border: `1px solid ${D.glassBorder}`, borderRadius: 16, boxShadow: "0 20px 50px rgba(0,0,0,0.45)", overflow: "hidden" }}>
            {usable.length > 0 && (
              <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${D.glassBorder}` }}>
                <div style={{ ...head, marginBottom: 9 }}>Faith-based sets</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {usable.map((p) => {
                    const on = isActive(p);
                    return (
                      <button key={p.key} onClick={() => onApply(p.screens)} aria-pressed={on} className="ps-pick-chip"
                        style={{ cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, borderRadius: 999, padding: "6px 13px",
                          color: on ? P.navy : D.ink, background: on ? P.sky : "rgba(237,239,243,0.06)",
                          border: `1px solid ${on ? P.sky : D.glassBorder}` }}>{p.label}</button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px 4px" }}>
              <span style={head}>Categories</span>
              <span style={{ display: "flex", gap: 14 }}>
                {!allOn && <button onClick={() => setAll(true)} style={{ ...filterLink, fontSize: 12.5 }}>Select all</button>}
                {selected.size > 0 && <button onClick={() => setAll(false)} style={{ ...filterLink, fontSize: 12.5 }}>Clear all</button>}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 2,
              padding: "4px 8px 8px", maxHeight: "min(46vh, 380px)", overflowY: "auto" }}>
              {screens.map((s) => {
                const on = selected.has(s.key);
                return (
                  <button key={s.key} onClick={() => toggle(s.key)} title={s.blurb} role="checkbox" aria-checked={on} className="ps-pick-row"
                    style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", cursor: "pointer",
                      background: "none", border: "none", borderRadius: 9, padding: "8px 8px", fontFamily: sans, fontSize: 14,
                      color: on ? D.ink : D.muted }}>
                    <span style={check(on)}>{on ? tick : null}</span>{s.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
              borderTop: `1px solid ${D.glassBorder}`, padding: "10px 12px 10px 16px" }}>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: D.faint }}>{selected.size} of {screens.length} selected</span>
              <button onClick={() => setOpen(false)} style={{ ...brassBtn(999, "8px 20px", 13.5) }}>Done</button>
            </div>
          </div>
        )}
      </div>
      {active && (
        <div style={{ marginTop: 10, padding: "11px 13px", background: "rgba(156,203,245,0.08)", border: `1px solid ${D.glassBorder}`, borderRadius: 12 }}>
          <div style={{ fontFamily: sans, fontSize: 12, color: D.brassSoft, marginBottom: 4 }}>
            {active.screens.map(labelOf).join(" · ")}
          </div>
          <p style={{ margin: 0, fontFamily: sans, fontSize: 12, color: D.muted, lineHeight: 1.55 }}>
            {active.note} Open Categories to make it yours.
          </p>
        </div>
      )}
    </div>
  );
}

function HeroAnalyzer({ onStart, onPick, snaptrade, meta }) {
  const [q, setQ] = useState(initialSymbol);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [screens, setScreens] = useState([]);
  const [selected, setSelected] = useState(null); // Set of screen keys; null until loaded
  const [presets, setPresets] = useState([]);
  // ── the second column ──
  // `vsInput` is what's in the box; `vs` is what's actually being compared, so a half-typed
  // ticker never changes the view. The raw lookup payloads are kept, not a finished
  // comparison: the model is rebuilt on every render from the current category selection,
  // which is what makes toggling a category re-rank without another request.
  const [vsInput, setVsInput] = useState(initialVs);
  const [vs, setVs] = useState("");
  const [cmp, setCmp] = useState(null);
  const [cmpBusy, setCmpBusy] = useState(false);
  const [cmpErr, setCmpErr] = useState("");
  const [cmpOpen, setCmpOpen] = useState(false);
  // ── alternatives ── a ranked list of funds in one group, for the selected categories
  const [altOpen, setAltOpen] = useState(false);
  const [pfOpen, setPfOpen] = useState(false);
  const [altGroup, setAltGroup] = useState(null);   // null: the group of the fund on the page
  const [alt, setAlt] = useState(null);
  const [altBusy, setAltBusy] = useState(false);
  const [altErr, setAltErr] = useState("");
  useEffect(() => {
    api("/api/screens").then((d) => {
      const list = (d.screens || []).slice().sort((a, b) => a.label.localeCompare(b.label));
      setScreens(list);
      setPresets(d.presets || []);
      // A link's ?only= wins; otherwise what this device remembers (an empty list stays
      // empty: that's what "Clear all" meant); otherwise everything, and the reader unticks
      // what they don't care about.
      const only = initialOnly();
      const pick = only || savedSelection();
      setSelected(new Set(pick ? pick.filter((k) => list.some((s) => s.key === k)) : list.map((s) => s.key)));
    }).catch(() => {});
  }, []);
  // Remember a selection only once the reader has changed it, never the automatic start.
  const chose = useRef(false);
  // Signed in, the choice is saved to the account too, a moment after the last click.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    if (!selected || !chose.current) return;
    saveSelection([...selected]);
    if (!pickRef.current) return;
    const t = setTimeout(() => pickRef.current([...selected]).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [selected]);
  const toggle = (k) => { chose.current = true; setSelected((prev) => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  }); };
  const allOn = selected && screens.length && selected.size === screens.length;
  const setAll = (on) => { chose.current = true; setSelected(on ? new Set(screens.map((s) => s.key)) : new Set()); };
  // Filter changes are reflected in the URL (after the first load has settled).
  // The filter, the fund and the second fund all belong in the address bar, and on a cold
  // load with "?vs=" they arrive in any order: the categories with /api/screens, the
  // result and the comparison with their own requests. Watching all three means whichever
  // lands last rewrites the URL with every part intact, instead of dropping what an
  // earlier write had already put there.
  useEffect(() => { if (result && selected) syncUrl(result.symbol, selected, screens, vs); /* eslint-disable-next-line */ }, [selected, vs, result]);

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
    // A new base fund makes the old second column meaningless, so it goes rather than
    // sitting there describing a comparison nobody asked for.
    setCmp(null); setVs(""); setCmpErr(""); setCmpOpen(false); setAltOpen(false);
    // Reflect the search in the URL so a result is shareable / bookmarkable.
    syncUrl(sym, selected, screens);
    try {
      const r = await api(`/api/lookup?symbol=${encodeURIComponent(sym)}`);
      setResult(r);
      document.title = pageTitle(r);
      ping("lookup");
      return r;
    }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const runCompare = async (symbol, baseSymbol) => {
    const other = (symbol ?? vsInput).trim().toUpperCase();
    const base = (baseSymbol || result?.symbol || "").toUpperCase();
    if (!other || !base) return;
    setCmpOpen(true);
    if (other === base) { setCmpErr(`${base} is already the fund on this page. Pick a different one.`); return; }
    setCmpBusy(true); setCmpErr(""); setCmp(null);
    try {
      const d = await api(`/api/compare?symbols=${encodeURIComponent(base)},${encodeURIComponent(other)}`);
      setCmp(d.results || []);
      setVs(other);
      syncUrl(base, selected, screens, other);
      ping("compare");
    }
    catch (e) { setCmpErr(e.message); }
    finally { setCmpBusy(false); }
  };
  const clearCompare = () => { setCmp(null); setVs(""); setVsInput(""); setCmpErr(""); setCmpOpen(false); syncUrl(result?.symbol || initialSymbol(), selected, screens); };
  // The Compare button next to Check. It uses whatever is in the search box: if that isn't
  // the fund already shown, it checks it first, then opens the dialog to pick a second fund.
  const openCompare = async () => {
    setShowSug(false);
    const typed = q.trim().toUpperCase();
    const r = typed && typed !== result?.symbol ? await run(typed) : result;
    if (!r) return;
    if (r.type === "stock") { setErr(`${r.symbol} is a company, not a fund. Compare works with funds like VOO or QQQ.`); return; }
    if (r.type !== "fund" || r.analyzable === false) { setErr(`We don't have holdings data for ${r.symbol}, so it can't be compared.`); return; }
    setCmpErr(""); setCmpOpen(true);
  };
  // The Alternatives button. Like Compare it checks what's typed first. A stock gets the
  // broad-market funds, since a stock has no group of its own.
  const openAlternatives = async () => {
    setShowSug(false);
    const typed = q.trim().toUpperCase();
    const r = typed && typed !== result?.symbol ? await run(typed) : result;
    if (!r) return;
    setAlt(null); setAltErr(""); setAltGroup(null); setAltOpen(true);
  };
  // "Find funds for these", from the category list: the same dialog, starting on the broad market.
  const openFinder = () => { setAlt(null); setAltErr(""); setAltGroup("broad"); setAltOpen(true); };
  // Refetch whenever the dialog is open and the group or the categories change. Only the
  // newest request may write, so a slow answer can't overwrite a newer one.
  const altReq = useRef(0);
  useEffect(() => {
    if (!altOpen || !selected) return;
    const id = ++altReq.current;
    const t = setTimeout(async () => {
      setAltBusy(true); setAltErr("");
      try {
        const qs = new URLSearchParams({ keys: [...selected].join(","), symbol: result?.symbol || "" });
        if (altGroup) qs.set("group", altGroup);
        const d = await api(`/api/alternatives?${qs}`);
        if (id === altReq.current) setAlt(d);
      } catch (e) { if (id === altReq.current) setAltErr(e.message); }
      finally { if (id === altReq.current) setAltBusy(false); }
    }, 150);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, [altOpen, altGroup, selected, result]);
  const closeAlternatives = () => { setAltOpen(false); setAlt(null); setAltGroup(null); };

  // Auto-load the initial symbol (from the URL, or VOO) so a visitor sees the surprise immediately.
  // A "?vs=" in the link opens the comparison with it, in one go.
  useEffect(() => {
    captureRef(); ping("landing_view");
    const want = initialVs();
    run(initialSymbol()).then((r) => { if (want && r?.type === "fund" && r.analyzable !== false) runCompare(want, r.symbol); });
    /* eslint-disable-next-line */
  }, []);

  // VOO is the one everybody owns; VTI the whole market; EFIV the ESG fund people assume
  // is clean; QQQ the contrast (almost nothing flagged).
  const examples = ["VOO", "VTI", "EFIV", "QQQ"];
  return (
    // Wide enough for the results to lay out in columns on a desktop; the search row and
    // its examples stay at a comfortable reading measure inside it.
    <div style={{ margin: "32px 0 0", textAlign: "left" }}>
      {/* Two columns on a wide screen: search and categories on the left, the portfolio
          upload as its own card on the right. On a phone the card follows the categories,
          so it doesn't sit under the search box like part of it. */}
      <style>{`
        .ps-find { display: grid; grid-template-columns: minmax(0, 640px) minmax(240px, 320px); gap: 24px 48px; justify-content: space-between; align-items: start; }
        @media (max-width: 960px) {
          .ps-find { grid-template-columns: minmax(0, 640px); }
          .ps-pf { display: flex; align-items: center; gap: 12px; padding: 12px 14px !important; }
          .ps-pf-icon { flex-shrink: 0; }
          .ps-pf-title { margin-top: 0 !important; font-size: 15px !important; flex: 1; min-width: 0; }
          .ps-pf-text { display: none; }
          .ps-pf-btn { flex-shrink: 0; padding: 8px 14px !important; font-size: 13px !important; }
        }
      `}</style>
      <div className="ps-find">
      <div>
      <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 600, color: D.ink, margin: "0 0 10px" }}>
        Have a stock or fund in mind? <span style={{ color: D.muted, fontWeight: 400 }}>Check whether it fits your values.</span>
      </div>
      {/* Wraps on a phone: the box takes the first line and Check and Compare drop below it,
          instead of squeezing the box to a third of the screen. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 640 }}>
        <div style={{ flex: "1 1 220px", minWidth: 0, position: "relative" }}>
          <input value={q} onChange={onInput} onKeyDown={onKey}
            onFocus={() => { if (sugg.length) setShowSug(true); }}
            onBlur={() => setTimeout(() => setShowSug(false), 140)}
            placeholder="Search a stock or ETF, like Apple, VOO or XLV" aria-label="Search a stock or ETF"
            autoComplete="off" role="combobox" aria-expanded={showSug} aria-autocomplete="list"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: sans, fontSize: 15, color: D.ink, background: "rgba(237,239,243,0.10)",
              border: `1px solid ${D.glassBorder}`, borderRadius: 14, padding: "14px 15px", outline: "none", }} />
          {showSug && sugg.length > 0 && (
            <ul role="listbox" style={{ position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, right: 0, margin: 0, padding: 4, listStyle: "none",
              background: D.lift,
              border: `1px solid ${D.glassBorder}`, borderRadius: 14, maxHeight: 320, overflowY: "auto" }}>
              {sugg.map((s, i) => (
                <li key={s.symbol} role="option" aria-selected={i === activeIdx}
                  onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 10, cursor: "pointer",
                    background: i === activeIdx ? "rgba(156,203,245,0.20)" : "transparent" }}>
                  <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 13, color: D.ink, minWidth: 52 }}>{s.symbol}</span>
                  <span style={{ fontFamily: sans, fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{s.name}</span>
                  {s.kind === "fund" && <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", color: A.lavInk, background: A.lav, borderRadius: 999, padding: "1px 6px" }}>FUND</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
          <button onClick={() => { setShowSug(false); run(); }} disabled={busy} style={brassBtn(999, "14px 18px", 15)}>{busy ? "…" : "Check"}</button>
          <button onClick={openCompare} disabled={busy} style={ghostBtn}>Compare</button>
          <button onClick={openAlternatives} disabled={busy} style={ghostBtn}>Alternatives</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", maxWidth: 640, margin: "10px 0 0" }}>
        <span style={{ fontFamily: sans, fontSize: 12, color: D.faint }}>Try:</span>
        {examples.map((x) => (
          <button key={x} onClick={() => { setQ(x); run(x); }} style={{ background: "rgba(237,239,243,0.08)", border: `1px solid ${D.glassBorder}`, color: D.muted, borderRadius: 999, padding: "4px 11px", fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{x}</button>
        ))}
      </div>
      {screens.length > 0 && selected && (
        <CategoryPicker screens={screens} presets={presets} selected={selected} toggle={toggle}
          setAll={setAll} allOn={allOn} onApply={(keys) => { chose.current = true; setSelected(new Set(keys)); }} onFind={openFinder} />
      )}
      </div>
      <aside className="ps-pf" style={{ background: "rgba(156,203,245,0.06)", border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: "20px 20px 18px" }}>
        <span aria-hidden className="ps-pf-icon" style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: "rgba(156,203,245,0.16)", color: P.sky }}>
          <svg width="17" height="17" viewBox="0 0 16 16"><path d="M8 11V3M4.5 6.5 8 3l3.5 3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        <div className="ps-pf-title" style={{ fontFamily: sans, fontSize: 16, fontWeight: 600, color: D.ink, marginTop: 12 }}>Check your whole portfolio</div>
        <p className="ps-pf-text" style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, lineHeight: 1.55, margin: "6px 0 14px" }}>
          Upload a positions CSV from your broker to see every flagged holding at once. It's read in your browser and nothing is saved.
        </p>
        <button onClick={() => setPfOpen(true)} className="ps-upload ps-pf-btn"
          style={{ cursor: "pointer", fontFamily: sans, fontSize: 14, fontWeight: 600, color: P.sky, background: "transparent",
            border: "1px solid rgba(156,203,245,0.5)", borderRadius: 999, padding: "9px 18px" }}>Upload a CSV →</button>
      </aside>
      </div>

      {err && <DarkErr>{err}</DarkErr>}
      {result && (
        <div className="ps-result">
          <style>{RESULT_FONTS_CSS}</style>
          <HeroResult result={filterBySelected(result, selected)} onStart={onStart} snaptrade={snaptrade} selectedCount={selected ? selected.size : 0} />
        </div>
      )}
      {/* The picker sits at the top of the dialog so a second fund can be swapped without
          closing it. The model is rebuilt on every render from the selected categories. */}
      {cmpOpen && result && (
        <CompareModal title={cmp ? `${result.symbol} vs ${vs}` : `Compare ${result.symbol}`}
          selectedCount={selected ? selected.size : 0} onClose={clearCompare}>
          <div style={{ marginTop: 16 }}>
            <CompareInvite symbol={result.symbol} value={vsInput} onChange={setVsInput}
              onRun={(x) => runCompare(x)} busy={cmpBusy} err={cmpErr} autoFocus={!cmp} />
          </div>
          {cmp && <CompareView model={compareFunds(cmp, selected || new Set())} />}
        </CompareModal>
      )}
      {pfOpen && (
        <CompareModal title="Check your portfolio" selectedCount={selected ? selected.size : 0} onClose={() => setPfOpen(false)}>
          <PortfolioView selected={selected || new Set()}
            onCheck={(sym) => { setPfOpen(false); setQ(sym); run(sym); }} />
        </CompareModal>
      )}
      {altOpen && (
        <CompareModal
          title={result?.type === "fund" && result.analyzable !== false && altGroup === null ? `Alternatives to ${result.symbol}` : "Funds for your categories"}
          selectedCount={selected ? selected.size : 0} onClose={closeAlternatives}>
          <AlternativesView data={alt} busy={altBusy} err={altErr} onGroup={setAltGroup}
            base={result?.type === "fund" && result.analyzable !== false ? result.symbol : null}
            note={result && result.type !== "fund" ? result.symbol : null}
            onCheck={(sym) => { closeAlternatives(); setQ(sym); run(sym); }}
            onCompare={(sym) => { closeAlternatives(); setVsInput(sym); runCompare(sym); }} />
        </CompareModal>
      )}
      {meta && meta.count > 0 && (
        <p style={{ fontFamily: sans, fontSize: 12, color: D.faint, margin: "14px 0 0", textAlign: "center" }}>
          Tracking {meta.count.toLocaleString("en-US")} U.S.-listed companies across {screens.length || "20"} categories
          {meta.lastUpdated ? ` · data updated ${new Date(meta.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
          {" · "}<a href="#methodology" style={{ color: D.muted }}>how flags are decided</a>
        </p>
      )}
    </div>
  );
}

// The tab title doubles as the headline when someone bookmarks or shares from the browser.
function pageTitle(r) {
  if (!r) return "PlainStreet";
  if (r.type === "fund" && Array.isArray(r.contains) && r.analyzable !== false) {
    const n = dedupeByName(r.contains).length;
    return n ? `${r.symbol} holds ${n} companies you may want to avoid · PlainStreet` : `${r.symbol} · no flagged holdings · PlainStreet`;
  }
  if (r.type === "fund") return `${r.symbol} · not analyzed · PlainStreet`;
  if (r.type === "stock") return `${r.symbol} · ${r.name} · PlainStreet`;
  return `${r.symbol} · no flags · PlainStreet`;
}

// Copy this exact view (symbol + category filter) — the share button on every result.
function ShareButton({ symbol, dark = false }) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = window.location.href.split("#")[0];
    const title = document.title;
    ping("share");
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      setDone(true); setTimeout(() => setDone(false), 1800);
    } catch { /* user cancelled or clipboard blocked — nothing to do */ }
  };
  return (
    <button onClick={share} aria-label={`Share ${symbol}`} style={{
      fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 999, padding: "5px 12px",
      background: "transparent", color: dark ? D.muted : L.muted, border: `1px solid ${dark ? D.glassBorder : L.line}`, whiteSpace: "nowrap",
    }}>{done ? "Link copied ✓" : "Share ↗"}</button>
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

// §3.6 — a letter and what it rests on. Shared by both grades so they read as a pair.
function Letter({ letter, tone }) {
  return (
    <div aria-hidden style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0,
      background: tone.bg, color: tone.ink, border: tone.border ? `1px solid ${tone.border}` : "none",
      display: "grid", placeItems: "center", fontFamily: display,
      fontSize: letter ? 30 : 11, fontWeight: 600, lineHeight: 1.1, textAlign: "center",
      letterSpacing: letter ? 0 : "0.04em" }}>
      {letter || <span style={{ opacity: 0.82 }}>NO<br />GRADE</span>}
    </div>
  );
}

const neutralTone = (dark) => ({
  bg: dark ? "rgba(237,239,243,0.10)" : A.raised,
  ink: dark ? D.ink : L.ink,
  border: dark ? D.glassBorder : L.line,
});

function Badge({ title, letter, meaning, sub, tone, dark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <Letter letter={letter} tone={tone} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
          textTransform: "uppercase", color: dark ? D.faint : L.faint, marginBottom: 2 }}>{title}</div>
        <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 600, color: dark ? D.ink : L.ink, lineHeight: 1.3 }}>
          {letter ? <>Grade {letter} <span style={{ fontWeight: 400, color: dark ? D.muted : L.muted }}>&middot; {meaning}</span></>
                  : <span style={{ fontWeight: 400, color: dark ? D.muted : L.muted }}>{meaning}</span>}
        </div>
        {sub ? <div style={{ fontFamily: sans, fontSize: 12, color: dark ? D.faint : L.faint, marginTop: 2 }}>{sub}</div> : null}
      </div>
    </div>
  );
}

// What a company SELLS. The letter describes the KIND of fact on record, never how bad it
// is, so it always travels with the flag underneath it rather than standing alone. There
// is no A: finding nothing is an absent result, not a good one.
function GradeBadge({ flags, selectedCount, known = true, dark = false }) {
  const g = gradeFor(flags || [], selectedCount, known);
  if (!selectedCount) return null;
  const tone = g.letter === "F" ? { bg: L.flag, ink: "#3A140C" }
    : g.letter === "D" ? { bg: A.lav, ink: A.lavInk }
    : neutralTone(dark);
  const sub = g.tripped
    ? `Trips ${g.tripped} of the ${g.of === 1 ? "1 category" : `${g.of} categories`} you picked`
    : known ? `Not on any of the ${g.of === 1 ? "1 list" : `${g.of} lists`} you picked. That isn't the same as checked and clear`
            : null;
  return <Badge title="What it sells" letter={g.letter} meaning={g.meaning} sub={sub} tone={tone} dark={dark} />;
}

// How a company BEHAVES. Separate letter and separate toggles, because almost every
// conduct record is a government finding and folding it into the sell-side ladder would
// make every large company an F.
function ConductBadge({ conduct, selectedCount, dark = false }) {
  const g = conductGradeFor(conduct || [], selectedCount);
  if (!selectedCount) return null;
  // Nothing measured at all is a different statement from measured-and-nothing-found,
  // and the difference is the point — so the empty case still renders.
  const tone = g.letter === "F" ? { bg: L.flag, ink: "#3A140C" }
    : g.letter === "D" ? { bg: A.lav, ink: A.lavInk }
    : neutralTone(dark);
  // The letter is the worst rung, but a company can trip more than one measure and the
  // reader should see that rather than only the loudest. FedEx is above its industry on
  // both worker injuries and environmental compliance; showing one would hide the other.
  const sub = g.worst
    ? (g.tripped > 1 ? `${g.worst.headline}, and ${g.tripped - 1} other measure${g.tripped > 2 ? "s" : ""}` : g.worst.headline)
    : (g.measured ? `We looked across ${g.measured === 1 ? "1 measure" : `${g.measured} measures`} and found nothing on file. Companies report many of these figures themselves.` : null);
  return <Badge title="How it behaves" letter={g.letter} meaning={g.meaning} sub={sub} tone={tone} dark={dark} />;
}

// A verified fact in the company's favour. Credits sit BESIDE the letters and are never
// an input to them: a credit can lift a company out of "no grade", and can never lower an
// F. Letting a certification net against a settlement is the greenwashing this product
// exists to replace, so the separation is structural rather than a rule to remember.
function Credit({ credit, dark }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start",
      border: `1px solid ${dark ? D.glassBorder : L.line}`, borderRadius: 12, padding: "10px 12px",
      background: dark ? "rgba(95,207,146,0.08)" : "rgba(95,207,146,0.10)" }}>
      <div aria-hidden style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, marginTop: 1,
        background: A.lime, color: A.limeInk, display: "grid", placeItems: "center",
        fontFamily: sans, fontSize: 13, fontWeight: 700 }}>+</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: dark ? D.ink : L.ink, lineHeight: 1.35 }}>
          {credit.label} <span style={{ fontWeight: 400, color: dark ? D.muted : L.muted }}>&middot; {credit.headline}</span>
        </div>
        <div style={{ fontFamily: sans, fontSize: 12, color: dark ? D.faint : L.faint, marginTop: 3, lineHeight: 1.5 }}>{credit.detail}</div>
      </div>
    </div>
  );
}

// A filed figure the reader judges for themselves. Political spending is lawful and every
// large company does it, so there is no letter here and no rung — only the number, who
// filed it, and the reader's own line. Deliberately styled unlike the grades and the
// credits so it never reads as a verdict.
function Disclosure({ item, dark }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
      borderTop: `1px solid ${dark ? D.glassBorder : L.line}`, paddingTop: 10 }}>
      <div style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", color: dark ? D.faint : L.faint, flexShrink: 0 }}>{item.label}</div>
      <div style={{ fontFamily: display, fontSize: 17, fontWeight: 600, color: dark ? D.ink : L.ink }}>{item.value}</div>
      <div style={{ fontFamily: sans, fontSize: 12, color: dark ? D.muted : L.muted, lineHeight: 1.5, flex: "1 1 240px", minWidth: 0 }}>
        {item.detail} <span style={{ color: dark ? D.faint : L.faint }}>&mdash; {item.source}</span>
      </div>
    </div>
  );
}

// The two letters as a pair, with any credits underneath. They answer different questions
// and are never averaged into each other.
function Grades({ flags, conduct, credits, political, selectedCount, known = true, dark = false }) {
  const list = credits || [];
  const disclosures = political?.lines || [];
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", alignItems: "start" }}>
        <GradeBadge flags={flags} selectedCount={selectedCount} known={known} dark={dark} />
        <ConductBadge conduct={conduct} selectedCount={CONDUCT_CATEGORIES.length} dark={dark} />
      </div>
      {list.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          {list.map((c) => <Credit key={c.key} credit={c} dark={dark} />)}
        </div>
      ) : null}
      {disclosures.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {disclosures.map((d) => <Disclosure key={d.key} item={d} dark={dark} />)}
        </div>
      ) : null}
    </div>
  );
}

// Which funds hold this stock, and how much of each fund it is. Answers "do I already own
// this through my index fund?", the question a no-flags result otherwise leaves open.
function FundsHolding({ items, symbol }) {
  const [all, setAll] = useState(false);
  if (!items || !items.length) return null;
  const shown = all ? items : items.slice(0, 5);
  const max = Math.max(...items.map((x) => x.weight));
  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${L.line}` }}>
      <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: L.ink }}>Funds that hold {symbol}</div>
      <div style={{ fontFamily: sans, fontSize: 12.5, color: L.faint, margin: "2px 0 10px" }}>Its share of each fund, from the fund's latest holdings.</div>
      <div style={{ display: "grid", gap: 10 }}>
        {shown.map((x) => (
          <div key={x.funds.join()}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: sans, fontSize: 13.5, color: L.ink, minWidth: 0, flex: 1 }}>
                {x.funds.slice(0, 4).map((t, i) => (
                  <Fragment key={t}>{i ? ", " : ""}<a href={`/?symbol=${t}`} style={{ color: L.ink, fontWeight: 700, textDecoration: "none" }}>{t}</a></Fragment>
                ))}
                {x.funds.length > 4 ? ` +${x.funds.length - 4}` : ""}
                <span style={{ color: L.muted }}> · tracks {x.basis}</span>
              </span>
              <span className="ps-num" style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink, flexShrink: 0 }}>{x.weight < 0.1 ? "<0.1" : x.weight.toFixed(1)}%</span>
            </div>
            <div aria-hidden style={{ height: 5, borderRadius: 3, background: L.lineSoft, marginTop: 5 }}>
              <div style={{ height: "100%", width: `${Math.max(2, (x.weight / max) * 100)}%`, borderRadius: 3, background: P.sky, opacity: 0.75 }} />
            </div>
          </div>
        ))}
      </div>
      {items.length > 5 && (
        <button onClick={() => setAll((v) => !v)} style={{ ...filterLink, fontSize: 13, marginTop: 10 }}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
}

function HeroResult({ result, onStart, snaptrade, selectedCount = 0 }) {
  // The result panel is a light card sitting on the dark band, so everything inside it
  // uses the light ramp rather than the band's.
  const panel = { marginTop: 14, padding: "18px 20px", background: P.card, border: `1px solid ${L.line}`, borderRadius: 14 };
  const cta = <HeroCTA onStart={onStart} snaptrade={snaptrade} />;

  // Nothing selected yet, which is how a first visit starts. Ask for categories instead
  // of reporting "none of 500 companies match", which would read as clean.
  if (!selectedCount && (result.type === "stock" || (result.type === "none" && result.known) || (result.type === "fund" && result.analyzable !== false))) {
    const n = result.totalCompanies || result.totalHoldings;
    return (
      <div style={panel}>
        <div style={{ fontFamily: serif, fontSize: 20, color: L.ink }}>
          {result.symbol}{result.name ? <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}> · {displayName(result.name)}</span> : null}
        </div>
        <p style={{ fontFamily: sans, fontSize: 14, color: L.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
          {result.type === "fund"
            ? `Choose the categories you care about above, or a faith-based set, to see which of ${n ? `${result.symbol}'s ${n} companies` : `the companies in ${result.symbol}`} are on our lists.`
            : `Choose the categories you care about above, or a faith-based set, to see whether ${result.symbol} is on our lists.`}
        </p>
        {cta}
      </div>
    );
  }

  if (result.type === "none") {
    // Two different honest answers. A company we know and found nothing on is "no flags";
    // a symbol we don't recognize at all must not be dressed up as a result — it is most
    // often a fund we can't see inside, and "no flags" there would read as clean.
    if (result.known === false) {
      return (
        <div style={panel}>
          <div style={{ fontFamily: serif, fontSize: 19, color: L.ink }}>
            We don't recognize <b>{result.symbol}</b>.
          </div>
          <p style={{ fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
            It isn't a U.S.-listed company in our index, and it isn't a fund we can see inside. If it's a fund, that means <b style={{ color: L.ink }}>not analyzed</b>, never "clean." Check the spelling, or try one of the funds above.
          </p>
          {cta}
        </div>
      );
    }
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 19, color: L.ink }}>
            No flags for <b>{result.symbol}</b>{result.name ? <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}> · {displayName(result.name)}</span> : null}
          </div>
          <ShareButton symbol={result.symbol} />
        </div>
        {/* Nothing on our lists, which is not a pass — so the sell-side letter is absent
            and says so. The conduct letter beside it is the one that can still speak here,
            and for Amazon or FedEx it does. The unknown-symbol branch above gets neither. */}
        <p style={{ fontFamily: sans, fontSize: 14.5, color: L.ink, lineHeight: 1.55, margin: "10px 0 0" }}>
          We checked {result.name ? displayName(result.name) : result.symbol} against your {selectedCount} {selectedCount === 1 ? "category" : "categories"}. It isn't on any of them.
        </p>
        <p style={{ fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
          That means none of our lists name it, not that it was audited and found clean.
        </p>
        <QuotePanel symbol={result.symbol} />
        <div style={{ marginTop: 14 }}><Grades flags={[]} conduct={result.conduct} credits={result.credits} political={result.political} selectedCount={selectedCount} /></div>
        <FundsHolding items={result.inFunds} symbol={result.symbol} />
        {cta}
      </div>
    );
  }

  if (result.type === "stock") {
    if (!result.flags.length) {
      return (
        <div style={panel}>
          <div style={{ fontFamily: serif, fontSize: 19, color: L.ink }}>No flags for <b>{result.symbol}</b> in your selected categories.</div>
          <div style={{ marginTop: 14 }}><Grades flags={[]} conduct={result.conduct} credits={result.credits} political={result.political} selectedCount={selectedCount} /></div>
          <p style={{ fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
            Turn on more categories above to widen the check.
          </p>
          <QuotePanel symbol={result.symbol} />
          <FundsHolding items={result.inFunds} symbol={result.symbol} />
          {cta}
        </div>
      );
    }
    const flags = result.flags.slice().sort((a, b) => a.label.localeCompare(b.label));
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: L.ink }}>{result.symbol} · <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <ShareButton symbol={result.symbol} />
        </div>
        <QuotePanel symbol={result.symbol} />
        <div style={{ marginTop: 16 }}><Grades flags={flags} conduct={result.conduct} credits={result.credits} political={result.political} selectedCount={selectedCount} /></div>
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {flags.map((f) => <FlagCard key={f.key} flag={f} company={result.name} />)}
        </div>
        <FundsHolding items={result.inFunds} symbol={result.symbol} />
        {cta}
      </div>
    );
  }

  // fund we recognize but deliberately don't analyze (international / bond / commodity)
  if (result.type === "fund" && result.analyzable === false) {
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: L.ink }}>{result.symbol}{result.name ? <> · <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></> : null}</div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: L.muted, background: L.lineSoft, borderRadius: 999, padding: "3px 10px" }}>NOT ANALYZED</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: L.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
          {result.notAnalyzedReason} We call that <b style={{ color: L.ink }}>not analyzed</b>, never "clean."
        </p>
        {cta}
      </div>
    );
  }

  // fund — the money shot
  if (!result.contains.length) {
    return (
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: serif, fontSize: 20, color: L.ink }}>{result.symbol} · <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: A.lavInk, background: A.lav, borderRadius: 999, padding: "3px 10px" }}>FUND</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: L.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
          {(() => {
            // A fund we downloaded with nothing flagged. Say how many companies were checked,
            // and that zero flagged is not the same as clean.
            const n = result.totalCompanies || result.totalHoldings;
            const cats = selectedCount === 1 ? "1 category" : `${selectedCount} categories`;
            return `None of ${n ? `the ${n} companies in ${result.symbol}` : `the companies in ${result.symbol}`} are on our lists for the ${cats} you picked. That doesn't mean the fund is clean: companies we have no data on aren't counted.`;
          })()}
        </p>
        {result.asOf && (
          <p style={{ fontFamily: sans, fontSize: 11.5, color: L.faint, margin: "6px 0 0" }}>
            Holdings from {result.holdingsSource}, as of {result.asOf}.
          </p>
        )}
        {cta}
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
        <div style={{ fontFamily: serif, fontSize: 20, color: L.ink }}>{result.symbol} · <span style={{ color: L.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: A.lavInk, background: A.lav, borderRadius: 999, padding: "3px 10px" }}>FUND</span>
          <ShareButton symbol={result.symbol} />
        </span>
      </div>
      <p style={{ fontFamily: sans, fontSize: 13.5, color: L.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
        Tracks {result.basis} and holds <b style={{ color: L.ink }}>{contains.length}</b>
        {result.totalCompanies ? <> of its <b style={{ color: L.ink }}>{result.totalCompanies}</b></> : null} companies you may want to avoid.
        {(() => {
          // How much of the fund those companies are, by weight. Only when every one of
          // them has a weight; a partial sum would understate it.
          if (!contains.length || contains.some((c) => c.weight == null)) return null;
          const total = contains.reduce((n, c) => n + c.weight, 0);
          return <> Together they're <b style={{ color: L.ink }}>{pctLabel(total)}</b> of the fund{result.weighting === "equal" ? ", which gives every company an equal share" : ""}.</>;
        })()}
      </p>
      {result.asOf && (
        <p style={{ fontFamily: sans, fontSize: 11.5, color: L.faint, margin: "4px 0 0" }}>
          Holdings from {result.holdingsSource}, as of {result.asOf}.
        </p>
      )}
      <QuotePanel symbol={result.symbol} />
      <div style={{ marginTop: 16, display: "grid", gap: 9 }}>
        <FundBreakdown groups={groups} theme="light" />
      </div>
      {cta}
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
    // Two share classes of one company (GOOGL, GOOG) are one weight.
    if (c.weight != null) prev.weight = Number(((prev.weight ?? 0) + c.weight).toFixed(4));
  }
  return [...m.values()];
};

// A fund weight as people read it: "7.9%", "0.31%", "under 0.01%".
const pctLabel = (w) => (w == null ? "" : w >= 10 ? `${w.toFixed(1)}%` : w >= 0.01 ? `${w.toFixed(2)}%` : "under 0.01%");
const groupByFlag = (contains) => {
  const m = new Map();
  for (const c of contains) for (const f of c.flags) {
    if (!m.has(f.key)) m.set(f.key, { key: f.key, label: f.label, items: [] });
    m.get(f.key).items.push({ name: c.name, ticker: c.ticker, weight: c.weight ?? null, reason: f.reason, quote: f.quote, source: f.source, asOf: f.asOf });
  }
  // Categories alphabetical so the list is predictable. Inside one, the biggest share of the
  // fund comes first when we know the weights (that's the question: is Brown-Forman 0.1% or
  // 10%?), otherwise alphabetical.
  const groups = [...m.values()];
  for (const g of groups) {
    const known = g.items.every((it) => it.weight != null);
    g.weight = known ? Number(g.items.reduce((n, it) => n + it.weight, 0).toFixed(4)) : null;
    g.items.sort((a, b) => known ? b.weight - a.weight : (a.name || a.ticker).localeCompare(b.name || b.ticker));
  }
  return groups.sort((a, b) => a.label.localeCompare(b.label));
};


// ── Compare two funds ─────────────────────────────────────────────────────────
// A fund page can tell you VOO holds Exxon. The question people actually have is "VOO or
// QQQ?", and that one needs both baskets on a single screen. Everything here is computed
// in the browser from the same /api/lookup payloads the single-fund view already uses (see
// src/compare.js), so the comparison re-ranks the instant a category is toggled, and it can
// never contradict the page it was built from.

const COMPARE_PICKS = ["QQQ", "VTI", "EFIV", "SPYX", "XLV", "VTV"];

function CompareInvite({ symbol, value, onChange, onRun, busy, err, autoFocus }) {
  // Focus the box when the dialog opens so the reader can type straight away. This effect
  // runs before the dialog's own, which then leaves focus where it is.
  const box = useRef(null);
  useEffect(() => { if (autoFocus) box.current?.focus({ preventScroll: true }); /* eslint-disable-next-line */ }, []);
  const picks = COMPARE_PICKS.filter((s) => s !== symbol).slice(0, 4);
  const field = {
    fontFamily: sans, fontSize: 14, color: L.ink, background: L.lineSoft,
    border: `1px solid ${L.line}`, borderRadius: 12, padding: "10px 12px",
    outline: "none", width: 150, textTransform: "uppercase",
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: sans, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: L.faint }}>
          Compare {symbol} with
        </span>
        <input ref={box} value={value} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onRun(); }}
          placeholder="QQQ" aria-label={`Compare ${symbol} with another fund`}
          autoComplete="off" style={field} />
        <button onClick={() => onRun()} disabled={busy || !value.trim()}
          style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer",
            borderRadius: 999, padding: "9px 18px", border: "none",
            background: A.lav, color: A.lavInk, opacity: busy || !value.trim() ? 0.55 : 1 }}>
          {busy ? "…" : "Compare"}
        </button>
        {picks.map((x) => (
          <button key={x} onClick={() => { onChange(x); onRun(x); }}
            style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 999,
              padding: "5px 11px", background: "transparent", color: L.muted, border: `1px solid ${L.line}` }}>{x}</button>
        ))}
      </div>
      {err && <div style={{ marginTop: 10, fontFamily: sans, fontSize: 13, color: L.flag, background: L.flagBg,
        border: `1px solid ${L.flagBorder}`, padding: "9px 12px", borderRadius: 12 }}>{err}</div>}
    </div>
  );
}

// One fund's column: the ladder letter, and underneath it the three numbers the letter is
// made of. A fund we can't see inside gets the same card and says why instead. It must
// never read as the clean one.
function CompareColumn({ col, winner }) {
  const g = col.grade;
  const tone = g?.letter === "F" ? { bg: L.flag, ink: "#3A140C" }
    : g?.letter === "D" ? { bg: A.lav, ink: A.lavInk }
    : neutralTone(false);
  const isWinner = winner && col.symbol === winner;
  return (
    <div style={{ background: L.lineSoft, border: `1px solid ${isWinner ? A.lav : L.line}`, borderRadius: 14, padding: "13px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: display, fontSize: 18, color: L.ink }}>{col.symbol}</span>
        {isWinner && (
          <span style={{ fontFamily: sans, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em",
            color: A.lavInk, background: A.lav, borderRadius: 999, padding: "2px 8px" }}>BETTER MATCH</span>
        )}
      </div>
      <div style={{ fontFamily: sans, fontSize: 12, color: L.muted, margin: "3px 0 10px", lineHeight: 1.4 }}>
        {col.name || "Not recognized"}{col.basis ? ` · tracks ${col.basis}` : ""}
      </div>
      {col.analyzed ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Letter letter={g?.letter || null} tone={tone} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: L.ink, lineHeight: 1.35 }}>
                {col.flagged} flagged{col.totalCompanies ? <span style={{ fontWeight: 400, color: L.muted }}> of {col.totalCompanies} companies</span> : null}
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, color: L.muted, marginTop: 2, lineHeight: 1.4 }}>
                {col.rankable
                  ? <>{g.conduct} with a government finding or self-reported violation · <b style={{ color: L.ink }}>{g.share} per 100</b></>
                  : "Total holdings unknown"}
              </div>
              {/* An "A" sitting beside "34 flagged" would read as a contradiction without
                  the rung's own words: the fund ladder counts conduct, not flags. */}
              {col.rankable && g.meaning ? (
                <div style={{ fontFamily: sans, fontSize: 11.5, color: L.faint, marginTop: 2, lineHeight: 1.4 }}>{g.meaning}</div>
              ) : null}
              {col.rankable && g.vsMarket ? (
                <div style={{ fontFamily: sans, fontSize: 11.5, color: L.faint, marginTop: 2 }}>
                  {g.vsMarket}× the whole market's share
                </div>
              ) : null}
            </div>
          </div>
          {!col.rankable && col.reason && (
            <p style={{ fontFamily: sans, fontSize: 12, color: L.faint, margin: "9px 0 0", lineHeight: 1.5 }}>{col.reason}</p>
          )}
          {col.asOf && (
            <p style={{ fontFamily: sans, fontSize: 11, color: L.faint, margin: "8px 0 0" }}>Holdings as of {col.asOf}.</p>
          )}
        </>
      ) : (
        <>
          <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, color: L.muted,
            background: L.line, borderRadius: 999, padding: "3px 9px" }}>NOT COMPARED</span>
          <p style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, margin: "9px 0 0", lineHeight: 1.5 }}>{col.reason}</p>
        </>
      )}
    </div>
  );
}

// Category by category, which fund carries how many. The row that matters most is the one
// where a count is zero, so that cell is marked rather than left for the eye to find.
function CompareTable({ categories, columns }) {
  if (!categories.length) return null;
  const cell = { fontFamily: sans, fontSize: 13, padding: "8px 10px", borderTop: `1px solid ${L.line}` };
  return (
    <div style={{ marginTop: 16, border: `1px solid ${L.line}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `minmax(130px,1.6fr) repeat(${columns.length}, minmax(64px,1fr))`, alignItems: "stretch" }}>
        <div style={{ ...cell, borderTop: "none", fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", color: L.faint, background: L.lineSoft }}>Category</div>
        {columns.map((c) => (
          <div key={c.symbol} style={{ ...cell, borderTop: "none", textAlign: "right", fontWeight: 600, color: L.ink, background: L.lineSoft }}>{c.symbol}</div>
        ))}
        {categories.map((row) => (
          <Fragment key={row.key}>
            <div style={{ ...cell, color: L.flag, fontWeight: 600 }}>
              {row.label}
              {row.only && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 600, color: L.muted,
                background: L.line, borderRadius: 999, padding: "1px 7px" }}>only {row.only}</span>}
            </div>
            {columns.map((c) => {
              const n = row.counts[c.symbol] || 0;
              return (
                <div key={c.symbol} style={{ ...cell, textAlign: "right", color: n ? L.ink : L.faint, fontWeight: n ? 600 : 400 }}>
                  {n}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

const NameChips = ({ items }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
    {items.map((it) => (
      <span key={it.ticker + it.name} title={it.labels.join(" · ")}
        style={{ fontFamily: sans, fontSize: 11.5, fontWeight: 600, color: L.ink, background: L.lineSoft,
          border: `1px solid ${L.line}`, borderRadius: 999, padding: "3px 10px" }}>{it.name}</span>
    ))}
  </div>
);

// The comparison opens over the page rather than below it. The fund breakdown above is
// already long, and a second column, a category table and two name lists stacked under it
// put the answer several screens down. Esc, the backdrop and the Close button all close it,
// the page behind stops scrolling while it is open, and focus moves into the dialog and
// back to wherever it came from, so a keyboard reader isn't left on a page they can't see.
// Outlined button that sits beside the filled Check button.
const ghostBtn = { ...brassBtnBase(), background: "transparent", color: D.ink, border: `1px solid ${D.glassBorder}` };
function brassBtnBase() { return { borderRadius: 999, padding: "14px 16px", fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.005em" }; }

// The Alternatives dialog: funds in one group, ranked for the categories picked. Each row
// says how many of the page fund's flagged companies it also holds, because a fund can
// rank well on its share and still hold every one of them (VTI holds all of VOO's).
function AlternativesView({ data, busy, err, onGroup, base, note, onCheck, onCompare }) {
  const chip = (on) => ({ fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 999,
    padding: "5px 11px", border: `1px solid ${on ? A.lav : L.line}`, background: on ? A.lav : "transparent", color: on ? A.lavInk : L.muted });
  const small = { fontFamily: sans, fontSize: 12, color: L.faint, lineHeight: 1.5 };
  const btn = (primary) => ({ fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer", borderRadius: 999, padding: "6px 13px",
    border: primary ? "none" : `1px solid ${L.line}`, background: primary ? A.lav : "transparent", color: primary ? A.lavInk : L.ink });
  return (
    <div style={{ marginTop: 16 }}>
      {note && (
        <p style={{ ...small, margin: "0 0 12px", color: L.muted }}>
          {note} is a single company, so these are funds. We don't suggest single stocks: a stock with no flags usually means we have no data on it, not that it's clean.
        </p>
      )}
      {data && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {data.groups.map((g) => (
            <button key={g.key} onClick={() => onGroup(g.key)} style={chip(g.key === data.group)}>{g.label}</button>
          ))}
        </div>
      )}
      {err && <p style={{ ...small, color: L.flag, marginTop: 14 }}>{err}</p>}
      {!data && !err && <p style={{ ...small, marginTop: 14 }}>{busy ? "Loading…" : ""}</p>}
      {data && !data.selectedCount && (
        <p style={{ fontFamily: sans, fontSize: 14, color: L.muted, marginTop: 16 }}>No categories selected. Turn on at least one category to rank funds.</p>
      )}
      {data && data.selectedCount > 0 && (
        <>
          <p style={{ ...small, margin: "14px 0 0" }}>
            Fewest first: ranked by the share of holdings with a government finding or self-reported violation, then by the share flagged at all. Compare uses the same order.{busy ? " Updating…" : ""}
          </p>
          <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8, opacity: busy ? 0.6 : 1 }}>
            {data.rows.map((r, i) => (
              <li key={r.symbols[0]} style={{ background: r.current ? "rgba(156,203,245,0.10)" : L.lineSoft,
                border: `1px solid ${r.current ? A.lav : L.line}`, borderRadius: 12, padding: "11px 14px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 12, color: L.faint, minWidth: 20 }}>{i + 1}.</span>
                  <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: L.ink }}>{r.symbols[0]}</span>
                  {r.symbols.length > 1 && <span style={small}>same holdings as {r.symbols.slice(1).join(", ")}</span>}
                  {r.current && <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, color: A.lavInk, background: A.lav, borderRadius: 999, padding: "2px 8px" }}>ON THIS PAGE</span>}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    {!r.current && <button onClick={() => onCheck(r.symbols[0])} style={btn(false)}>Check</button>}
                    {!r.current && base && <button onClick={() => onCompare(r.symbols[0])} style={btn(true)}>Compare with {base}</button>}
                  </span>
                </div>
                <div style={{ ...small, color: L.muted, marginTop: 4 }}>{r.name} · tracks {r.basis}</div>
                <div style={{ fontFamily: sans, fontSize: 13, color: L.ink, marginTop: 6, lineHeight: 1.5 }}>
                  <b>{r.flagged} flagged</b> of {r.totalCompanies} companies ({r.flaggedPer100} per 100) · {r.conduct} with a government finding or self-reported violation ({r.conductPer100} per 100)
                </div>
                <div style={{ ...small, marginTop: 3 }}>
                  {r.overlap && <>Also holds <b style={{ color: r.overlap.held === r.overlap.of ? L.flag : L.muted }}>{r.overlap.held} of {r.overlap.symbol}'s {r.overlap.of}</b> flagged companies. </>}
                  {r.asOf && <>Holdings as of {r.asOf}.</>}
                </div>
              </li>
            ))}
          </ol>
          {!data.rows.length && <p style={{ ...small, marginTop: 14 }}>No funds in this group could be ranked.</p>}
          <ul style={{ margin: "16px 0 0", padding: "0 0 0 18px", display: "grid", gap: 6 }}>
            {[
              "Funds that track the same index hold the same companies, so they share a row.",
              base ? `Funds with thousands of small companies can rank higher partly because most legal findings in our data are about large companies. The "also holds" line shows how many of ${base}'s flagged companies each one still owns.` : null,
              "Fewer flagged companies doesn't mean a fund is clean. Companies we have no data on aren't counted.",
              "SPDR funds use daily holdings. The others come from quarterly SEC filings, so their dates are older.",
              "This only compares holdings. It doesn't cover fees, returns, or whether a fund is right for you.",
            ].filter(Boolean).map((c) => <li key={c} style={{ ...small, maxWidth: "76ch" }}>{c}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

// Every pop-up enters the same way: the page behind dims and blurs, and the panel fades in
// while rising a little. About half a second, so it reads as arriving rather than snapping.
// ── Uploaded portfolio ── a broker's positions CSV, read in the browser, checked against the
// selected categories. Until live brokerage tracking is ready, this is how someone sees
// their whole portfolio at once. Nothing is saved; changing categories re-checks it.
const usd = (c) => c == null ? null : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function PortfolioView({ selected, onCheck }) {
  const [holdings, setHoldings] = useState(null);
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const keys = [...selected].sort().join(",");

  const onFile = async (file) => {
    if (!file) return;
    setErr(""); setData(null); setHoldings(null); setFileName(file.name);
    if (file.size > 5 * 1024 * 1024) { setErr("That file is over 5 MB. A positions export is usually much smaller; check it's the right file."); return; }
    try { setHoldings(parsePortfolioCsv(await file.text())); }
    catch (e) { setErr(e.message || "Couldn't read that file."); }
  };

  useEffect(() => {
    if (!holdings) return;
    let live = true;
    setBusy(true); setErr("");
    fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ holdings, keys: keys ? keys.split(",") : [] }) })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Couldn't check that portfolio."); return j; })
      .then((j) => { if (live) setData(j); })
      .catch((e) => { if (live) setErr(e.message); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [holdings, keys]);

  const card = { background: P.card, border: `1px solid ${L.line}`, borderRadius: 12, padding: "14px 16px" };
  const pill = { display: "inline-block", fontFamily: sans, fontSize: 11.5, fontWeight: 600, color: D.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, borderRadius: 999, padding: "2px 9px", margin: "4px 6px 0 0" };
  const sym = (x) => <button onClick={() => onCheck(x)} style={{ ...filterLink, fontSize: 14, fontWeight: 700, color: L.ink }}>{x}</button>;
  const rows = data?.rows || [];
  const stocks = rows.filter((r) => r.kind === "stock" && r.flags.length);
  const funds = rows.filter((r) => r.kind === "fund" && r.flaggedCount).sort((a, b) => (b.exposureCents ?? 0) - (a.exposureCents ?? 0));
  const clean = rows.filter((r) => (r.kind === "stock" && !r.flags.length) || (r.kind === "fund" && !r.flaggedCount));
  const unseen = rows.filter((r) => r.kind === "not_analyzed" || r.kind === "unknown");
  const sm = data?.summary;

  return (
    <div style={{ paddingTop: 16, fontFamily: sans, color: L.ink }}>
      <p style={{ margin: "0 0 12px", fontSize: 14, color: L.muted, lineHeight: 1.55 }}>
        Export your positions from your broker as a CSV (Fidelity, Schwab, Vanguard, Robinhood and most others have one) and choose it here.
        We need a Symbol column; a value column lets us show dollars. The file is read in your browser and nothing is saved.
      </p>
      <label style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer", border: `1.5px dashed ${L.line}`, borderRadius: 12, padding: "16px 18px" }}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} style={{ display: "none" }} />
        <span style={{ ...brassBtn(999, "9px 18px", 14) }}>Choose CSV file</span>
        <span style={{ fontSize: 13, color: L.faint }}>{fileName || "or drop it here"}</span>
      </label>

      {err && <div role="alert" style={{ marginTop: 12, fontSize: 13.5, color: D.flag }}>{err}</div>}
      {busy && <div style={{ marginTop: 14, fontSize: 13.5, color: L.muted }}>Checking {holdings?.length} holdings…</div>}

      {data && !busy && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 16 }}>
            <div style={card}>
              <div style={{ fontSize: 12, color: L.faint }}>Holdings read</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{sm.holdings}</div>
              {sm.totalCents != null && <div style={{ fontSize: 12.5, color: L.muted }}>{usd(sm.totalCents)} total</div>}
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: L.faint }}>Stocks you own that are flagged</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: sm.directFlagged ? D.flag : L.ink }}>{sm.directFlagged}</div>
              {sm.directCents > 0 && <div style={{ fontSize: 12.5, color: L.muted }}>{usd(sm.directCents)}</div>}
            </div>
            <div style={card}>
              <div style={{ fontSize: 12, color: L.faint }}>Funds holding flagged companies</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, color: sm.fundsWithFlags ? D.flag : L.ink }}>{sm.fundsWithFlags}</div>
              {sm.fundExposureCents > 0 && <div style={{ fontSize: 12.5, color: L.muted }}>about {usd(sm.fundExposureCents)} of your money in them</div>}
            </div>
          </div>
          {!selected.size && <p style={{ fontSize: 13.5, color: D.flag, marginTop: 12 }}>No categories are selected, so nothing is flagged. Close this and choose some.</p>}

          {stocks.length > 0 && <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Stocks you own directly</h3>}
          <div style={{ display: "grid", gap: 8 }}>
            {stocks.map((r) => (
              <div key={r.symbol} style={card}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  {sym(r.symbol)}<span style={{ fontSize: 13, color: L.muted }}>{r.name}</span>
                  {r.valueCents != null && <span style={{ marginLeft: "auto", fontSize: 13, color: L.muted }}>{usd(r.valueCents)}</span>}
                </div>
                <div>{r.flags.map((f) => <span key={f.key} style={pill}>{f.label}</span>)}</div>
              </div>
            ))}
          </div>

          {funds.length > 0 && <h3 style={{ fontSize: 15, margin: "20px 0 8px" }}>Funds that hold flagged companies</h3>}
          <div style={{ display: "grid", gap: 8 }}>
            {funds.map((r) => (
              <div key={r.symbol} style={card}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  {sym(r.symbol)}<span style={{ fontSize: 13, color: L.muted }}>{r.name}</span>
                  {r.valueCents != null && <span style={{ marginLeft: "auto", fontSize: 13, color: L.muted }}>{usd(r.valueCents)}</span>}
                </div>
                <div style={{ fontSize: 13, color: L.muted, marginTop: 4 }}>
                  {r.flaggedCount}{r.total ? ` of ${r.total.toLocaleString("en-US")}` : ""} companies flagged
                  {r.flaggedWeight != null && `, ${r.flaggedWeight.toFixed(1)}% of the fund`}
                  {r.exposureCents != null && ` (about ${usd(r.exposureCents)} of yours)`}
                </div>
                <div style={{ fontSize: 12.5, color: L.faint, marginTop: 6, lineHeight: 1.6 }}>
                  Largest: {r.flagged.slice(0, 5).map((c) => `${c.name}${c.weight != null ? ` ${c.weight.toFixed(1)}%` : ""}`).join(", ")}
                  {r.flaggedCount > 5 ? `, and ${r.flaggedCount - 5} more` : ""}
                </div>
              </div>
            ))}
          </div>

          {clean.length > 0 && (
            <p style={{ fontSize: 13, color: L.muted, margin: "18px 0 0", lineHeight: 1.6 }}>
              <strong style={{ color: L.ink }}>No flags for your categories:</strong> {clean.map((r) => r.symbol).join(", ")}
            </p>
          )}
          {unseen.length > 0 && (
            <p style={{ fontSize: 13, color: L.muted, margin: "10px 0 0", lineHeight: 1.6 }}>
              <strong style={{ color: L.ink }}>Not checked:</strong> {unseen.map((r) => r.symbol).join(", ")}.
              {" "}These are funds we can't see inside yet, cash, bonds or symbols we don't recognize. Not checked is not the same as clean.
            </p>
          )}
          {data.truncated && <p style={{ fontSize: 13, color: L.faint }}>Only the first 500 holdings were checked.</p>}
        </>
      )}
    </div>
  );
}

const MODAL_CSS = `
@keyframes ps-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ps-panel-in { from { opacity: 0; transform: translateY(22px) scale(.985); } to { opacity: 1; transform: none; } }
.ps-backdrop { animation: ps-backdrop-in .45s ease both; }
.ps-panel { animation: ps-panel-in .6s cubic-bezier(.2,.7,.2,1) .06s both; }
@media (prefers-reduced-motion: reduce) { .ps-backdrop, .ps-panel { animation-duration: .01s; animation-delay: 0s; } }
`;
const BACKDROP = { position: "fixed", inset: 0, zIndex: 100, background: "rgba(8,11,18,0.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" };

function CompareModal({ title, selectedCount, onClose, children }) {
  const panel = useRef(null);
  // `onClose` is a fresh function every render. Holding the latest one in a ref keeps the
  // effect below to a single run, so it doesn't refocus the dialog on every keystroke.
  const close = useRef(onClose);
  close.current = onClose;
  // Read during the first render, before the input inside takes focus.
  const opener = useRef(null);
  if (opener.current === null) opener.current = document.activeElement;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      const o = opener.current;
      if (o && typeof o.focus === "function") o.focus();
    };
  }, []);

  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}
      style={{ ...BACKDROP, overflowY: "auto",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "clamp(12px,5vh,56px) 16px" }}>
      <style>{MODAL_CSS}</style>
      <div ref={panel} className="ps-panel" tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        style={{ width: "min(920px,100%)", background: P.block, border: `1px solid ${L.line}`,
          borderRadius: 18, outline: "none", boxShadow: "0 24px 70px rgba(0,0,0,0.55)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", gap: 12,
          padding: "16px 20px", background: P.block, borderBottom: `1px solid ${L.line}`,
          borderRadius: "18px 18px 0 0" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontSize: 20, color: L.ink, lineHeight: 1.2 }}>{title}</div>
            <div style={{ fontFamily: sans, fontSize: 12, color: L.faint, marginTop: 3 }}>
              {selectedCount
                ? `Using your ${selectedCount} selected ${selectedCount === 1 ? "category" : "categories"}. Close this to change them.`
                : "No categories selected."}
            </div>
          </div>
          <button onClick={() => close.current()} aria-label="Close comparison"
            style={{ marginLeft: "auto", flexShrink: 0, cursor: "pointer", fontFamily: sans, fontSize: 13,
              fontWeight: 600, color: L.muted, background: "transparent", border: `1px solid ${L.line}`,
              borderRadius: 999, padding: "7px 14px" }}>Close ✕</button>
        </div>
        <div style={{ padding: "2px 20px 22px" }}>{children}</div>
      </div>
    </div>
  );
}

function CompareView({ model }) {
  const { verdict } = model;
  const shown = model.funds.filter((f) => f.analyzed);
  const sub = { fontFamily: sans, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: L.faint, margin: "16px 0 0" };
  return (
    <div style={{ marginTop: 14 }}>
      {/* The answer first, then everything it is made of. And where the honest answer is
          "we can't rank these", that sentence sits in exactly the same place a winner would. */}
      <div style={{ background: verdict.winner ? "rgba(156,203,245,0.10)" : L.lineSoft,
        border: `1px solid ${verdict.winner ? A.lav : L.line}`, borderRadius: 14, padding: "14px 16px" }}>
        <div style={{ fontFamily: serif, fontSize: 18, color: L.ink, lineHeight: 1.35 }}>{verdict.headline}</div>
        {verdict.detail && (
          <p style={{ fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.6, margin: "7px 0 0", maxWidth: "76ch" }}>{verdict.detail}</p>
        )}
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
        {model.funds.map((col) => <CompareColumn key={col.symbol} col={col} winner={verdict.winner} />)}
      </div>

      <CompareTable categories={model.categories} columns={shown} />

      {shown.length > 1 && (
        <div style={{ marginTop: 4 }}>
          {model.companies.shared.length > 0 && (
            <>
              <div style={sub}>Both hold ({model.companies.shared.length})</div>
              <NameChips items={model.companies.shared} />
            </>
          )}
          {shown.map((c) => {
            const only = model.companies.only[c.symbol] || [];
            if (!only.length) return null;
            return (
              <Fragment key={c.symbol}>
                <div style={sub}>Only in {c.symbol} ({only.length})</div>
                <NameChips items={only} />
              </Fragment>
            );
          })}
        </div>
      )}

      {verdict.caveats.length > 0 && (
        <ul style={{ margin: "16px 0 0", padding: "0 0 0 18px", display: "grid", gap: 6 }}>
          {verdict.caveats.map((c, i) => (
            <li key={i} style={{ fontFamily: sans, fontSize: 12, color: L.faint, lineHeight: 1.55, maxWidth: "76ch" }}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FundBreakdown({ groups, theme }) {
  const [open, setOpen] = useState(null);            // evidence panel: "flagKey:TICKER"
  const [openGroups, setOpenGroups] = useState({});  // flagKey -> expanded
  const dark = theme === "dark";
  const c = dark
    ? { ink: D.ink, muted: D.muted, faint: D.faint, link: A.lav, panel: "rgba(237,239,243,0.07)", border: D.glassBorder, surface: "rgba(237,239,243,0.05)", flag: D.flag }
    : { ink: L.ink, muted: L.muted, faint: L.faint, link: A.lav, panel: L.lineSoft, border: L.line, surface: L.card, flag: L.flag };
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
        // The header right above already names the company, so drop the reason's own
        // "Company — " prefix the same way the stock view does.
        const openReason = openItem
          ? Object.values(reasonParts(openItem.reason, displayName(openItem.name))).filter(Boolean).join(" ")
          : "";
        return (
          <div key={g.key} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, overflow: "hidden" }}>
            <button
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              aria-controls={`grp-${g.key}`}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", background: "none", border: "none", cursor: "pointer",
                textAlign: "left", fontFamily: sans,
              }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: c.flag, letterSpacing: "-0.01em" }}>{g.label}</span>
              <span style={{
                marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: c.ink,
                background: c.panel, border: `1px solid ${c.border}`, borderRadius: 999,
                padding: "1px 9px", minWidth: 26, textAlign: "center", whiteSpace: "nowrap",
              }}>{g.items.length}{g.weight != null ? ` · ${pctLabel(g.weight)}` : ""}</span>
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
                        title={`${it.ticker}: why this is flagged`}
                        style={{
                          fontFamily: sans, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                          borderRadius: 999, padding: "3px 10px", textAlign: "left",
                          background: chipOpen ? A.lav : c.panel,
                          color: chipOpen ? A.lavInk : c.ink,
                          border: `1px solid ${chipOpen ? A.lav : c.border}`,
                          transition: "background .12s, color .12s, border-color .12s",
                        }}>{displayName(it.name)}{it.weight != null && <span style={{ fontWeight: 500, opacity: 0.75 }}> {pctLabel(it.weight)}</span>}</button>
                    );
                  })}
                </div>
                {openItem && (
                  <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6 }}>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>
                      <b>{openItem.ticker}</b> · {displayName(openItem.name)}
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{openReason}</div>
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
  const surface = dark ? "rgba(237,239,243,0.05)" : L.card;
  const border = dark ? D.glassBorder : L.line;
  const ink = dark ? D.ink : L.ink;
  const muted = dark ? D.muted : L.muted;
  const { lead, rest } = reasonParts(flag.reason, company);
  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: "14px 16px", display: "grid", gap: 9 }}>
      <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 600, color: dark ? D.flag : L.flag, background: dark ? D.flagBg : L.flagBg, border: `1px solid ${dark ? D.flagBorder : L.flagBorder}`, borderRadius: 999, padding: "3px 10px", justifySelf: "start" }}>{flag.label}</span>
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
          "{quote}"
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
  if (stage === "sent") return <div style={{ fontFamily: sans, fontSize: 12, color: muted }}>Thanks, we'll review this.</div>;
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
        style={{ fontFamily: sans, fontSize: 12.5, padding: "6px 8px", borderRadius: 10, border: `1px solid ${muted}`, background: "transparent", color: "inherit", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: linkColor, background: "none", border: `1px solid ${linkColor}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>Send report</button>
        <button onClick={() => setStage("idle")} style={{ fontFamily: sans, fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
// The follow-up under a result. It used to be a filled light-blue card, loud enough that it
// was read before the result itself. Now it's one quiet line below a rule; the email field
// only appears once someone asks to be notified. When SnapTrade isn't configured, the
// line asks for an email instead of offering a connect that would fail.
const HeroCTA = ({ onStart, snaptrade }) => (
  <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${L.line}` }}>
    {snaptrade === false ? <WaitlistCallout /> : (
      <p style={{ margin: 0, fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.6 }}>
        That's one ticker. To check your whole portfolio at once,{" "}
        <button onClick={onStart} style={{ ...ctaLink }}>connect your brokerage</button> (read-only).
      </p>
    )}
  </div>
);
const ctaLink = { background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, color: A.lav, textDecoration: "underline", textUnderlineOffset: 3 };

function WaitlistCallout() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | asking | busy | done | error
  const [msg, setMsg] = useState("");
  const submit = async () => {
    setState("busy");
    try {
      await api("/api/waitlist", { method: "POST", body: { email } });
      setState("done"); ping("waitlist_join");
    } catch (e) { setMsg(e.message); setState("error"); }
  };
  const text = { margin: 0, fontFamily: sans, fontSize: 13, color: L.muted, lineHeight: 1.6 };
  if (state === "done") return <p style={text}>You're on the list. We'll email once, when whole-account checking opens.</p>;
  if (state === "idle") {
    return (
      <p style={text}>
        Checking a whole brokerage account at once is coming.{" "}
        <button onClick={() => setState("asking")} style={ctaLink}>Get notified</button>
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
      <input id="waitlist-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
        aria-label="Email for the waitlist" autoFocus onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ flex: "1 1 200px", fontFamily: sans, fontSize: 13.5, padding: "8px 11px", border: `1px solid ${L.line}`, background: "transparent", color: L.ink, outline: "none" }} />
      <button onClick={submit} disabled={state === "busy"} style={{ ...ctaLink, textDecoration: "none", border: `1px solid ${A.lav}`, padding: "7px 14px" }}>
        {state === "busy" ? "…" : "Notify me"}
      </button>
      <span style={{ ...text, fontSize: 12, flexBasis: "100%" }}>
        {state === "error" ? msg : "One email when it opens. Read-only, through your broker's own login; we never move money."}
      </span>
    </div>
  );
}

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
    const color = up ? L.good : L.flag;
    return (
      <span key={q.symbol + keySuffix} style={{ display: "inline-flex", alignItems: "baseline", gap: 8, padding: "0 22px", fontFamily: sans, fontSize: 13, whiteSpace: "nowrap" }}>
        <span style={{ fontWeight: 600, color: D.ink, letterSpacing: "0.02em" }}>{q.symbol}</span>
        <span style={{ color: D.muted }}>${q.price.toFixed(2)}</span>
        <span style={{ color, fontWeight: 600 }}>{up ? "▲" : "▼"} {Math.abs(q.changePercent).toFixed(2)}%</span>
      </span>
    );
  };

  return (
    <div style={{ background: P.deep, borderBottom: "1px solid rgba(255,255,255,0.08)", overflow: "hidden", padding: "9px 0" }}>
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
    position: "absolute", top: "50%", [side]: 8, transform: "translateY(-50%)",
    width: 40, height: 40, borderRadius: 0, border: "none",
    background: "rgba(13,17,25,0.72)", color: P.ink, fontFamily: sans, fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center", zIndex: 2,
  });

  if (items && items.length === 0) return null; // nothing tracked is in the news right now
  return (
    <section id="news" style={{ ...wrap, padding: "clamp(40px,5vw,60px) 24px 0", scrollMarginTop: 70 }}>
      <div style={{ marginBottom: 26 }}>
        <h2 style={{ fontFamily: headline, fontSize: "clamp(32px,4.6vw,48px)", color: L.pine, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>Hot off the wire</h2>
        <p style={{ fontFamily: sans, fontSize: 15, color: L.muted, margin: "8px 0 0" }}>Recent BBC and New York Times headlines that name a company we flag, with the flag it carries.</p>
      </div>
      {!items ? (
        <p style={{ textAlign: "center", fontFamily: sans, color: L.faint, fontSize: 14 }}>Loading…</p>
      ) : (
        <div style={{ position: "relative" }}>
          <button onClick={() => scrollByCards(-1)} aria-label="Scroll left" className="ps-news-arrow" style={arrowBtn("left")}>‹</button>
          <button onClick={() => scrollByCards(1)} aria-label="Scroll right" className="ps-news-arrow" style={arrowBtn("right")}>›</button>
          {/* Each story is one photo, edge to edge. It darkens toward the bottom, where the
              source, the flagged company and the headline sit over it. No frame or panel:
              the space between photos is the only separation. */}
          <style>{`
            .ps-news-tile img { transition: transform .5s ease; }
            .ps-news-tile:hover img, .ps-news-tile:focus-visible img { transform: scale(1.04); }
            .ps-news-tile:focus-visible { outline: 2px solid ${A.lav}; outline-offset: 3px; }
            @media (max-width: 600px) { .ps-news-arrow { display: none !important; } }
          `}</style>
          <div ref={trackRef} style={{
            display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x mandatory",
            padding: "0 0 6px", scrollbarWidth: "none",
          }}>
            {items.map((it, i) => (
              <a key={i} href={it.link} target="_blank" rel="noopener noreferrer" className="ps-news-tile"
                 style={{
                   position: "relative", display: "block", overflow: "hidden", textDecoration: "none", color: "inherit",
                   height: 340, background: P.card, flex: "0 0 clamp(250px, 31%, 340px)", scrollSnapAlign: "start",
                 }}>
                {it.image && (
                  <img src={it.image} alt="" loading="lazy"
                       style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                )}
                <div aria-hidden style={{ position: "absolute", inset: 0,
                  background: "linear-gradient(to bottom, rgba(13,17,25,0) 30%, rgba(13,17,25,0.72) 58%, rgba(13,17,25,0.96) 100%)" }} />
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 18px 18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: A.lav }}>{it.source}</span>
                    {agoLabel(it.publishedAt) && <span style={{ fontFamily: sans, fontSize: 11, color: "rgba(237,239,243,0.7)" }}>{agoLabel(it.publishedAt)}</span>}
                  </div>
                  <div style={{ fontFamily: headline, fontSize: 21, color: P.ink, fontWeight: 400, lineHeight: 1.2 }}>{it.title}</div>
                  {it.companies.slice(0, 2).map((c) => (
                    <div key={c.ticker} style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: "rgba(237,239,243,0.82)", marginTop: 8 }}>
                      {c.name}{c.flags?.length ? <span style={{ color: P.coral }}> · {c.flags[0]}</span> : null}
                    </div>
                  ))}
                </div>
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
  ["Every flag is a verifiable fact", "Each flag states something a company does, with a one-sentence reason you can check for yourself. Nothing here is an ESG score. The letter grade is not a score either. It applies one plain rule to the flags you are currently looking at, so it tells you what kind of fact is on record rather than how bad we think it is, and it shifts as you change the categories. Where we cannot give a reason in a sentence, there is no flag."],
  ["We flag documented conduct", "A company that supplies hospital morphine does not carry the opioid flag. A company that has faced opioid-marketing litigation and paid settlements does. We go by what a company has been documented doing. Belonging to an industry is not by itself a finding."],
  ["Every flag cites a source", "When a flag comes from a company's filing, it carries a quote from that filing and a link to the document. We drop any flag we cannot support with a quote. What you read is the company describing itself, in its own words."],
  ["We flag a reported line of business", "A flag has to rest on a reported segment or a principal activity. Selling cigarettes at the register does not qualify, and a passing mention in a risk-factor section does not either."],
  ["You choose which flags apply", "We do not decide what counts as unethical for you. You pick the flags and we explain what turns up. People screen a few of these in opposite directions, so for those we describe what is there without taking a side."],
  ["A clean result is never a guarantee", "A clean result tells you that none of the names we track came up. It does not tell you a company has been audited and found sound. Where we cannot see inside a fund, we label it not analyzed and leave it there."],
  ["Every dataset shows when it was updated", "Every dataset carries the date it was last refreshed, so you can judge how current an answer is."],
  ["We cover U.S.-listed companies only", "We cover companies that file with the SEC. Foreign-listed companies, including 20-F filers and most ADRs, sit outside that. An empty result for one of those means we did not look, rather than that we looked and found nothing."],
];
const METHOD_LAYERS = [
  ["Curated", "A hand-maintained list of companies, researched from each one's primary business.", "This is where the names people ask about most live: ExxonMobil, Lockheed Martin, Altria. Each entry is written and checked by hand, so the list is short."],
  ["Industry code (SIC)", "The company's SEC-registered industry code, mapped to a flag where the code is a plain fact (oil refining, cigarettes).", "It covers every SEC filer without anyone typing anything. It only knows a company's main industry, though."],
  ["Filing-cited (10-K)", "We read the relevant section of a company's annual report and return a verified, verbatim quote.", "Berkshire Hathaway's industry code says insurance. Its annual report also describes about 20,900 miles of gas pipeline, and that's how it gets flagged here, with the quote attached so you can read it yourself."],
];
const METHOD_CATALOGUE = [
  ["Environment", [
    { name: "Fossil fuels", status: "Live", def: "Extraction, refining, and transport of oil, gas, and coal.", counts: "Oil & gas exploration/production, refining, oilfield services, pipelines, and gas utilities as a principal business.", not: "A manufacturer that merely consumes fuel; a bank that lends to the sector.", ex: "ExxonMobil, Chevron, Kinder Morgan, Halliburton." },
    { name: "Coal", status: "Live", def: "Coal mining and coal-fired power generation, a stricter, climate-focused cut inside fossil fuels.", counts: "Thermal/steam coal mining; utilities with material coal-fired generation.", not: "Metallurgical (steelmaking) coal only, unless your line includes it.", ex: "Peabody Energy, Alliance Resource Partners, Duke Energy." },
  ]],
  ["Weapons & conflict", [
    { name: "Weapons & defense", status: "Live", def: "Manufacture of military weapons and defense contracting.", counts: "Defense primes, munitions, missiles, military aircraft/vehicles, defense electronics as a principal business.", not: "Dual-use suppliers with no material defense segment; civilian aerospace.", ex: "Lockheed Martin, RTX, General Dynamics, Northrop Grumman." },
    { name: "Civilian firearms", status: "Live", def: "Manufacture and large-scale retail of civilian guns and ammunition.", counts: "Civilian firearm and ammunition makers; major firearms retailers.", not: "Military-only ordnance (that's weapons); shops where firearms are a minor line.", ex: "Smith & Wesson, Sturm Ruger, Olin/Winchester." },
  ]],
  ["Social & human rights", [
    { name: "Private prisons & detention", status: "Live", def: "For-profit incarceration, detention, and closely-tied services.", counts: "Operators of private prisons and immigration-detention centers.", not: "A general contractor that once built a facility; incidental government clients.", ex: "GEO Group, CoreCivic." },
    { name: "Surveillance & data brokers", status: "Live", def: "Business models built on large-scale collection and sale of personal data.", counts: "Ad businesses built on personal-data profiling; data brokers; mass-surveillance analytics.", not: "Software companies generally; a one-off privacy breach without a data-driven model.", ex: "Meta, Alphabet, Palantir, LiveRamp." },
    { name: "Predatory lending", status: "Live", def: "High-cost consumer lending with predatory terms: payday, title, pawn, and subprime.", counts: "Triple-digit-APR lending, title loans, and lenders with enforcement actions defining the practice.", not: "Ordinary consumer credit, prime installment lending, mainstream banks.", ex: "World Acceptance, EZCORP, Enova, Credit Acceptance." },
    { name: "Supply-chain forced labor", status: "Live", def: "A subsidiary named on a current US government forced-labor determination.", counts: "US DHS's UFLPA Entity List or an active CBP Withhold Release Order against a company the business controls.", not: "Boilerplate 'we prohibit forced labor' policy language; NGO allegations without a government finding.", ex: "Zijin Mining Group (Xinjiang subsidiaries on the UFLPA list; a Serbian subsidiary under an active CBP order)." },
    { name: "Self-reported supply-chain violations", status: "Live", def: "Labor violations a company's own supplier audits found and disclosed.", counts: "A company's own published audit findings. This is a lower bar than a government determination, but it is the company's own admission, remediation included.", not: "Third-party allegations the company hasn't itself confirmed.", ex: "Apple (its own 2025 supply-chain report disclosed 10 Core Violations in 2024)." },
    { name: "Leadership enforcement actions", status: "Live", def: "A CURRENT top executive facing real SEC, DOJ, or government fraud enforcement.", counts: "An actual enforcement proceeding against a sitting CEO/chair/controlling shareholder, stated with its actual resolution (settled without admission, convicted, etc.).", not: "News-cycle 'controversy'; a departed executive; a pardoned or dismissed case.", ex: "Tesla (Musk, 2018 SEC settlement), Icahn Enterprises (Icahn, 2024 SEC settlement)." },
  ]],
  ["Historical", [
    { name: "WWII-era forced labor", status: "Live", def: "Documented use of forced or slave labor during the Nazi era, by the company or a direct predecessor.", counts: "Historically documented forced/slave labor, always shown alongside what restitution was made, if any.", not: "Unrelated modern-day criticism; contested historical characterizations without a primary source.", ex: "Volkswagen, Ford, IBM, Bayer, BASF. Restitution status differs by company and is stated for each." },
  ]],
  ["Health & vice", [
    { name: "Tobacco & nicotine", status: "Live", def: "Cigarettes, cigars, vaping, and other nicotine products.", counts: "Manufacturers and leaf suppliers as a principal business.", not: "Retailers that stock tobacco among many goods.", ex: "Altria, Philip Morris International, Turning Point Brands." },
    { name: "Alcohol", status: "Live", def: "Producers and wholesalers of beer, wine, and spirits.", counts: "Brewing, winemaking, distilling, and alcohol wholesale.", not: "Restaurants/retailers that serve alcohol; generic non-alcoholic 'Beverages.'", ex: "Anheuser-Busch InBev, Molson Coors, Constellation Brands." },
    { name: "Gambling", status: "Live", def: "Casinos, sportsbooks, and betting platforms.", counts: "Casino operators, sports-betting/iGaming, racetrack betting as a principal business.", not: "Payment processors; hospitality with no gaming operation.", ex: "DraftKings, Las Vegas Sands, Caesars, Flutter." },
    { name: "Adult entertainment", status: "Live", def: "Pornography and adult-content businesses.", counts: "Adult content production/distribution; adult nightclubs as a principal business.", not: "General media/streaming with incidental mature content.", ex: "RCI Hospitality." },
    { name: "Cannabis", status: "Live", def: "Cultivation, processing, and sale of cannabis and cannabis products.", counts: "Multi-state operators, cultivators, cannabis-product makers.", not: "Hemp/CBD wellness only; medical cannabinoids (flag separately if desired).", ex: "Canopy Growth, Tilray, Green Thumb, Curaleaf.", contested: true },
    { name: "Opioid crisis", status: "Live", def: "Documented culpability in the opioid epidemic, not legitimate pain medication.", counts: "Opioid-marketing litigation, DEA enforcement, and settlements (makers and distributors).", not: "A company supplying medically-appropriate opioids with no misconduct record.", ex: "Implicated manufacturers and the big-three distributors, by public settlement." },
  ]],
  ["Animal welfare", [
    { name: "Factory farming", status: "Live", def: "Industrial animal agriculture and meat/poultry processing.", counts: "Large-scale meat/poultry slaughter and packing, industrial feedlots.", not: "Plant-based food; small/pasture operations; prepared-food brands that buy meat to make jerky or deli meals (the slaughter is upstream).", ex: "Tyson Foods, Hormel, Smithfield, Pilgrim's Pride." },
    { name: "Animal testing", status: "Live", def: "Contract research and cosmetics whose core business involves animal testing.", counts: "Contract research orgs with animal-study operations; cosmetics tied to animal testing.", not: "Medical research where no animal testing is disclosed.", ex: "Charles River Labs, LabCorp." },
    { name: "Fur & exotic leather", status: "Live", def: "Production or primary retail of animal fur and exotic-animal leather.", counts: "Fur farming/processing; brands whose principal line is fur/exotic skins.", not: "General apparel with incidental leather.", ex: "A deliberately narrow, curated set. Few US-listed pure-plays exist." },
  ]],
  ["Faith-based", [
    { name: "Pork production", status: "Live", def: "Hog production and pork processing as a reported segment or principal line of business.", counts: "Companies whose own segment reporting names pork, or that state pork as a principal raw material.", not: "Grocers and restaurants that sell pork among many goods; prepared-food brands that buy pork downstream.", ex: "Smithfield Foods, Tyson Foods, Hormel Foods, Seaboard." },
    { name: "Interest-based finance", status: "Live", def: "Banks and consumer lenders whose principal business is lending at interest, excluded under sharia screening as riba.", counts: "Commercial banks, savings institutions, and card issuers whose filings report net interest income as a primary revenue line.", not: "Conventional insurers, which sharia screens exclude on a separate ground we do not yet cover; payment processors that take fees rather than interest.", ex: "JPMorgan Chase, Bank of America, Capital One, Synchrony Financial." },
  ]],
];

// ── Landing ─────────────────────────────────────────────────────────────────
function Landing({ onStart, onSignIn, onPick }) {
  const [route, setRoute] = useState(typeof window !== "undefined" ? window.location.hash : "");
  // Server capabilities + data freshness, fetched once and handed to the hero: whether
  // brokerage connect is configured (decides which call-to-action to show) and how many
  // companies the data covers.
  const [server, setServer] = useState({ snaptrade: null, meta: null });
  useEffect(() => {
    const h = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", h);
    api("/api/screens").then((d) => setServer({ snaptrade: !!d.snaptrade, meta: d.data || null })).catch(() => {});
    return () => window.removeEventListener("hashchange", h);
  }, []);
  // "#methodology" is its own page and opens at the top. Any other hash is a section on the
  // home page (#news, #how-it-works), so scroll to it once the page is on screen.
  useEffect(() => {
    const id = route.slice(1);
    const el = id && route !== "#methodology" ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo(0, 0);
  }, [route]);
  if (route === "#methodology") return <Methodology onStart={onStart} />;
  return <LandingHome onStart={onStart} onSignIn={onSignIn} onPick={onPick} snaptrade={server.snaptrade} meta={server.meta} />;
}

// ── Methodology ───────────────────────────────────────────────────────────────
// Reads like an article down to the categories: one column, the rules as paragraphs with a
// bold lead-in, the three sources as a small table. The categories are a reference list:
// a search box, and one line per category that opens to what counts and what doesn't.
function Methodology({ onStart }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const col = { maxWidth: 760, margin: "0 auto", padding: "0 24px" };
  const h2 = { fontFamily: headline, fontWeight: 400, fontSize: "clamp(30px,4vw,40px)", lineHeight: 1.1, color: D.ink, margin: "64px 0 18px" };
  const para = { fontFamily: sans, fontSize: 17.5, lineHeight: 1.7, color: D.muted, margin: "0 0 18px" };
  const cell = { padding: "14px 12px 14px 0", borderTop: `1px solid ${L.line}`, verticalAlign: "top", fontFamily: sans, fontSize: 15, lineHeight: 1.55, color: D.muted };
  const needle = q.trim().toLowerCase();
  const groups = METHOD_CATALOGUE
    .map(([g, flags]) => [g, flags.filter((f) => !needle || `${f.name} ${f.def} ${f.counts} ${f.ex}`.toLowerCase().includes(needle))])
    .filter(([, f]) => f.length);
  return (
    <div style={{ background: P.page, minHeight: "100dvh", color: D.ink }}>
      <MethodNav onStart={onStart} />
      <style>{`@media (max-width: 560px) { .ps-cat-row { flex-wrap: wrap; } .ps-cat-name { min-width: 0 !important; width: 100%; } }`}</style>
      <header style={{ ...col, padding: "clamp(48px,8vw,96px) 24px 8px" }}>
        <h1 style={{ fontFamily: headline, fontWeight: 400, fontSize: "clamp(42px,6.2vw,68px)", lineHeight: 1.02, letterSpacing: "-0.015em", margin: 0 }}>How PlainStreet decides what to flag</h1>
        <p style={{ ...para, fontSize: "clamp(18px,2vw,21px)", color: D.ink, opacity: 0.85, margin: "22px 0 0" }}>{METHOD_INTRO}</p>
      </header>
      <article style={{ ...col, paddingBottom: 48 }}>
        <h2 style={h2}>The rules</h2>
        {METHOD_PRINCIPLES.map(([t, d]) => (
          <p key={t} style={para}><b style={{ color: D.ink, fontWeight: 600 }}>{t}.</b> {d}</p>
        ))}

        <h2 style={h2}>Where flags come from</h2>
        <p style={para}>A company is flagged if any of three sources flags it. When two agree, the more precise reason is the one you see.</p>
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 0" }}>
          <tbody>
            {METHOD_LAYERS.map(([name, what, strength]) => (
              <tr key={name}>
                <td style={{ ...cell, width: "26%", color: D.ink, fontWeight: 600 }}>{name}</td>
                <td style={cell}>{what} {strength}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={h2}>Categories</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories, like coal or opioids" aria-label="Search categories"
          style={{ width: "100%", maxWidth: 460, boxSizing: "border-box", fontFamily: sans, fontSize: 15, color: D.ink, background: "transparent",
            border: `1px solid ${D.glassBorder}`, borderRadius: 999, padding: "11px 16px", outline: "none", marginBottom: 20 }} />
        {!groups.length && <p style={{ fontFamily: sans, color: D.muted }}>No category matches "{q}".</p>}
        {groups.map(([g, flags]) => (
          <div key={g} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: D.faint, marginBottom: 4 }}>{g}</div>
            {flags.map((f) => {
              const isOpen = open === f.name;
              return (
                <div key={f.name} style={{ borderTop: `1px solid ${L.line}` }}>
                  <button onClick={() => setOpen(isOpen ? null : f.name)} aria-expanded={isOpen} className="ps-cat-row"
                    style={{ width: "100%", display: "flex", alignItems: "baseline", gap: "4px 14px", background: "none", border: "none", cursor: "pointer", padding: "14px 0", textAlign: "left" }}>
                    <span className="ps-cat-name" style={{ fontFamily: sans, fontSize: 15.5, fontWeight: 600, color: D.ink, minWidth: 190 }}>{f.name}</span>
                    <span style={{ fontFamily: sans, fontSize: 14, color: D.muted, flex: 1 }}>{f.def}</span>
                    <span aria-hidden style={{ color: D.faint, fontSize: 12, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                  </button>
                  {isOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18, padding: "0 0 18px" }}>
                      {[["Counts", f.counts, L.good], ["Doesn't count", f.not, L.flag], ["For example", f.ex, D.faint]].map(([k, val, c]) => (
                        <div key={k}>
                          <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: c, marginBottom: 4 }}>{k}</div>
                          <div style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.55, color: D.muted }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </article>
      <MethodClose onStart={onStart} />
    </div>
  );
}

// The Methodology page's nav, closing line and footer, in the landing page's style.
function MethodNav({ onStart }) {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 20, borderBottom: `1px solid ${L.line}`, background: P.band }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px" }}>
        <a href="#" style={{ fontFamily: wordmark, fontSize: 25, fontWeight: 600, color: L.ink, letterSpacing: "-0.02em", textDecoration: "none" }}>PlainStreet</a>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <a href="#" style={{ fontFamily: sans, fontSize: 15, color: L.ink, textDecoration: "none" }}>Check a fund</a>
          <button onClick={onStart} style={startBtn(999, "10px 20px", 15)}>Get started</button>
        </div>
      </div>
    </nav>
  );
}
function MethodClose({ onStart }) {
  return (
    <>
      <section style={{ borderTop: `1px solid ${L.line}` }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(40px,6vw,64px) 24px clamp(64px,8vw,96px)", textAlign: "center" }}>
          <p style={{ fontFamily: headline, fontSize: "clamp(24px,3.4vw,32px)", lineHeight: 1.25, color: D.ink, margin: 0 }}>
            No flag means a company isn't one of the names we track. It never means it was audited and found clean.
          </p>
          <button onClick={onStart} style={{ ...startBtn(999, "14px 28px", 16), marginTop: 28 }}>See what you own</button>
        </div>
      </section>
      <footer style={{ borderTop: `1px solid ${L.line}` }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "22px 24px 80px", display: "flex", justifyContent: "center", gap: "8px 22px", flexWrap: "wrap" }}>
          <a href="#" style={{ fontFamily: sans, fontSize: 14, color: L.muted, textDecoration: "none" }}>PlainStreet</a>
          <span style={{ fontFamily: sans, fontSize: 14, color: L.faint }}>Read-only portfolio analysis. Not investment advice.</span>
        </div>
      </footer>
    </>
  );
}
const METHOD_INTRO = "A flag is a checkable fact about what a company does, with a reason and a source. Here is what counts, what doesn't, and where each flag comes from.";

// The steps read as a list of headlines; the body for one appears when the pointer or
// keyboard focus lands on it. Hover alone would strand touch and keyboard users, so each
// row is a real button: focus opens it, and a tap toggles it.
function StepList({ steps }) {
  const [open, setOpen] = useState(0);
  return (
    <div style={{ borderTop: `1px solid ${L.line}` }}>
      {steps.map((s, i) => {
        const on = open === i;
        return (
          <button key={s.n} type="button" aria-expanded={on}
            onMouseEnter={() => setOpen(i)}
            onFocus={() => setOpen(i)}
            onClick={() => setOpen(on ? -1 : i)}
            style={{
              display: "block", width: "100%", textAlign: "left", cursor: "pointer",
              background: "none", border: "none", borderBottom: `1px solid ${L.line}`,
              padding: "18px 0", color: "inherit", font: "inherit",
            }}>
            <div style={{ fontFamily: headline, fontSize: "clamp(26px,3.8vw,38px)", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.08, color: on ? L.pine : L.muted, transition: "color .2s" }}>{s.t}</div>
            {/* 0fr -> 1fr animates to the body's natural height without measuring it. */}
            <div style={{ display: "grid", gridTemplateRows: on ? "1fr" : "0fr", transition: "grid-template-rows .3s ease" }}>
              <div style={{ overflow: "hidden" }}>
                <p style={{ margin: 0, paddingTop: 14, fontFamily: sans, fontSize: 15.5, lineHeight: 1.6, color: L.muted, maxWidth: 640, opacity: on ? 1 : 0, transition: "opacity .25s ease" }}>{s.b}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// Hero image: VOO drawn from its real holdings. One dot per company, laid out in a
// sunflower spiral; the companies on at least one of our lists are coral. The count and
// the share are the live numbers, so the picture changes when the holdings do.
// Where a flagged company sits in the spiral is set by a hash of its name, so it stays
// put between visits; the position itself means nothing, and the caption doesn't claim it does.
const HERO_FUND = "VOO";
const HERO_LABELS = ["XOM", "LMT", "MO", "META"];
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const hashName = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function HeroArt() {
  const [fund, setFund] = useState(null);
  useEffect(() => { api(`/api/lookup?symbol=${HERO_FUND}`).then(setFund).catch(() => {}); }, []);
  const total = fund?.totalCompanies || fund?.totalHoldings || 500;
  const flagged = fund ? dedupeByName(fund.contains || []) : [];

  const W = 460, cx = 230, cy = 200, R = 150;
  const dots = Array.from({ length: total }, (_, i) => {
    const r = (R * Math.sqrt(i + 0.5)) / Math.sqrt(total);
    const a = i * 2.399963;   // the golden angle, in radians
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), r };
  });
  // Give each flagged company its own dot.
  const owner = new Map();
  for (const c of flagged) {
    let i = hashName(c.name) % total;
    while (owner.has(i)) i = (i + 1) % total;
    owner.set(i, c);
  }
  // Labels sit in fixed slots down each side, so they never run off the edge or stack on
  // each other; an elbowed leader line runs from each slot to its dot.
  const picked = [...owner].filter(([, c]) => HERO_LABELS.includes(c.ticker)).slice(0, 4);
  const labelled = [];
  for (const side of [-1, 1]) {
    const mine = picked.filter(([i]) => (dots[i].x < cx ? -1 : 1) === side).sort((a, b) => dots[a[0]].y - dots[b[0]].y);
    mine.forEach(([i, c], k) => {
      const slotY = cy - ((mine.length - 1) * 34) / 2 + k * 34;
      labelled.push({ i, c, side, slotY, x: cx + side * (R + 30) });
    });
  }

  return (
    <figure className="ps-hero-art" style={{ margin: 0, width: "100%", maxWidth: 440, justifySelf: "end" }}>
      <svg viewBox={`0 0 ${W} 400`} role="img" style={{ width: "100%", display: "block" }}
        aria-label={fund ? `${total} dots, one per company in ${HERO_FUND}; ${flagged.length} are highlighted as flagged` : `Dots for the companies in ${HERO_FUND}`}>
        {Array.from({ length: 72 }, (_, k) => {
          const a = (k / 72) * Math.PI * 2, long = k % 6 === 0;
          const r1 = R + 12, r2 = R + (long ? 22 : 17);
          return <line key={k} x1={cx + r1 * Math.cos(a)} y1={cy + r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy + r2 * Math.sin(a)} stroke={P.ink} strokeOpacity={long ? 0.5 : 0.22} strokeWidth="1" />;
        })}
        {dots.map((d, i) => {
          const c = owner.get(i);
          if (c) return null;
          return <circle key={i} cx={d.x} cy={d.y} r="2.8" fill={P.sky} fillOpacity={0.66 - 0.36 * (d.r / R)} />;
        })}
        {[...owner].map(([i, c]) => (
          <circle key={c.name} cx={dots[i].x} cy={dots[i].y} r="3.8" fill={P.coral}>
            <title>{displayName(c.name)}</title>
          </circle>
        ))}
        {labelled.map(({ i, c, side, slotY, x }) => {
          const d = dots[i];
          const elbowX = cx + side * (R + 14);
          return (
            <g key={c.ticker}>
              <circle cx={d.x} cy={d.y} r="7.5" fill="none" stroke={P.coral} strokeWidth="1.3" />
              <polyline points={`${d.x + side * 7.5},${d.y} ${elbowX},${slotY} ${x},${slotY}`} fill="none" stroke={P.ink} strokeOpacity="0.6" strokeWidth="1" />
              <text x={x + side * 6} y={slotY + 4} textAnchor={side > 0 ? "start" : "end"}
                style={{ fontFamily: mono, fontSize: 13, fill: P.ink, letterSpacing: "0.04em" }}>{c.ticker}</text>
            </g>
          );
        })}
      </svg>
      {fund && (
        <figcaption style={{ fontFamily: mono, fontSize: 11.5, color: D.faint, lineHeight: 1.55, marginTop: 6, textAlign: "center" }}>
          {HERO_FUND}: {total} companies, one dot each.{" "}
          <span style={{ color: P.coral }}>{flagged.length}</span> are on at least one of our lists.
        </figcaption>
      )}
    </figure>
  );
}

function LandingHome({ onStart, onSignIn, onPick, snaptrade, meta }) {
  const wrap = { maxWidth: 1000, margin: "0 auto", padding: "0 24px" };
  const steps = [
    { n: "1", t: "Pick what matters to you", b: "Fossil fuels, weapons, tobacco, gambling, surveillance, and more. Flip on the causes you care about. We only ever check for what you choose." },
    { n: "2", t: snaptrade === false ? "Check any fund" : "Connect your brokerage", b: snaptrade === false
      ? "Type the ticker of a fund you own. We name the flagged companies inside it, with the reason for each. Whole-account checking through a read-only brokerage link is coming. Leave an email above to hear when."
      : "One secure, read-only link through SnapTrade. Works with Robinhood, Schwab, Fidelity, E*TRADE, Webull, and others. We can see your holdings, never touch them." },
    { n: "3", t: "See what clashes", b: "A plain list of what you own that crosses your lines, including the companies hiding inside your index funds, each with a one-sentence reason." },
  ];
  return (
    <div style={{ fontFamily: sans, background: L.bg }}>
      <TickerTape />
      {/* ── Dark hero with the live analyzer ── */}
      <Canvas>
        <nav style={{ position: "sticky", top: 0, zIndex: 20, borderBottom: `1px solid ${L.line}`, background: P.band }}>
          {/* Nothing in the nav wraps. As the screen narrows, the section links drop out
              (all three are in the footer too): News and How it works first, then
              Methodology, so the logo, Sign in and Get started always fit on one line. */}
          <style>{`
            .ps-nav-actions > * { white-space: nowrap; }
            @media (max-width: 900px) { .ps-nav-extra { display: none; } .ps-nav-actions { gap: 20px !important; } }
            @media (max-width: 560px) { .ps-nav-methodology { display: none; } .ps-nav-actions { gap: 16px !important; } }
          `}</style>
          {/* Full-bleed on purpose: the nav is chrome, so the wordmark sits against the
              page gutter instead of being pulled inward by the 1000px content column. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, padding: "14px clamp(16px,3vw,28px)" }}>
            <span style={{ flexShrink: 0, fontFamily: wordmark, fontSize: 25, fontWeight: 600, color: L.ink, letterSpacing: "-0.02em" }}>PlainStreet</span>
            <div className="ps-nav-actions" style={{ display: "flex", alignItems: "center", gap: 26 }}>
              <a href="#news" className="ps-nav-extra" style={{ fontFamily: sans, fontSize: 15, color: L.ink, textDecoration: "none" }}>News</a>
              <a href="#how-it-works" className="ps-nav-extra" style={{ fontFamily: sans, fontSize: 15, color: L.ink, textDecoration: "none" }}>How it works</a>
              <a href="#methodology" className="ps-nav-methodology" style={{ fontFamily: sans, fontSize: 15, color: L.ink, textDecoration: "none" }}>Methodology</a>
              <button onClick={onSignIn} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 15, color: L.ink }}>Sign in</button>
              <button onClick={onStart} style={startBtn(999, "10px 20px", 15)}>Get started</button>
            </div>
          </div>
        </nav>
        <header>
          <style>{`
            .ps-hero { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 28px; align-items: center; }
            .ps-hero-title { font-size: clamp(42px, 5.6vw, 72px); }
            @media (max-width: 760px) { .ps-hero { grid-template-columns: 1fr; } .ps-hero-art { display: none; } }
          `}</style>
          <div style={{ ...wrap, maxWidth: 1160, padding: "clamp(36px,6vw,72px) 24px clamp(32px,4vw,48px)" }}>
            <div className="ps-hero">
              <div>
                <h1 className="ps-hero-title" style={{ fontFamily: headline, fontWeight: 400, lineHeight: 1.0, letterSpacing: "-0.015em", margin: 0, color: D.ink }}>
                  Is your money invested where your values are?
                </h1>
                <p style={{ fontFamily: "'IBM Plex Sans', " + sans, fontSize: "clamp(16px,1.6vw,20px)", lineHeight: 1.5, color: D.muted, margin: "22px 0 0", maxWidth: 540 }}>
                  Even broad market funds hold companies that might not match your values. Search any stock or ETF to see what's really inside.
                </p>
              </div>
              <HeroArt />
            </div>
            <VerifiedBanner />
            <HeroAnalyzer onStart={onStart} onPick={onPick} wrap={wrap} snaptrade={snaptrade} meta={meta} />
            <p style={{ fontFamily: sans, fontSize: 12.5, color: D.faint, marginTop: 18 }}>Read-only analysis. We never move your money without your say-so.</p>
          </div>
        </header>
      </Canvas>

      {/* ── Light body: hot news ── */}
      <HotNews wrap={wrap} />

      {/* ── Charcoal block: how it works. Columns are separated by a rule above each
             one, not by a card, so the band reads as one solid field. ── */}
      <section id="how-it-works" style={{ background: P.band, scrollMarginTop: 70 }}>
        <div style={{ ...wrap, padding: "clamp(40px,5vw,60px) 24px" }}>
          <h2 style={{ fontFamily: headline, fontSize: "clamp(32px,4.6vw,48px)", color: L.pine, fontWeight: 400, margin: "0 0 26px", letterSpacing: "-0.01em" }}>How it works</h2>
          <StepList steps={steps} />
        </div>
      </section>

      {/* ── Navy block: honesty. A different solid from the band above it, so the seam
             between the two is a hard colour change rather than a rule. ── */}
      <section style={{ background: P.bandDeep }}>
        <div style={{ ...wrap, maxWidth: 720, textAlign: "center", padding: "clamp(36px,5vw,56px) 24px" }}>
          <h2 style={{ fontFamily: headline, fontSize: "clamp(30px,4.4vw,42px)", color: D.ink, fontWeight: 400, margin: 0, letterSpacing: "-0.01em" }}>We'd rather under-claim than mislead</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: D.muted, lineHeight: 1.7, margin: "16px 0 0" }}>
            Every flag is a checkable fact about what a company does, with a reason and a source. We read the holdings of more than 100 funds and show where each list came from and how recent it is. A fund we can't see inside is marked "not analyzed," never clean. We cover U.S.-listed companies, so no flags means none of the names we track, not that a company was audited and found clean.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ ...wrap, textAlign: "center", padding: "clamp(40px,5vw,64px) 24px" }}>
        <h2 style={{ fontFamily: headline, fontSize: "clamp(40px,6.4vw,68px)", color: L.pine, fontWeight: 400, margin: "0 0 12px", letterSpacing: "-0.015em" }}>See what you own.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: L.muted, margin: "0 0 26px" }}>Free, read-only, about two minutes.</p>
        <button onClick={onStart} style={startBtn(999, "16px 32px", 16)}>Get started</button>
      </section>

      <footer style={{ borderTop: `1px solid ${L.line}` }}>
        <div style={{ ...wrap, padding: "22px 24px", display: "flex", justifyContent: "center", flexWrap: "wrap", gap: "8px 22px", alignItems: "center" }}>
          <a href="#news" style={{ fontFamily: sans, fontSize: 14, color: L.muted, textDecoration: "none" }}>News</a>
          <a href="#how-it-works" style={{ fontFamily: sans, fontSize: 14, color: L.muted, textDecoration: "none" }}>How it works</a>
          <a href="#methodology" style={{ fontFamily: sans, fontSize: 14, color: L.muted, textDecoration: "none" }}>Methodology</a>
          <span style={{ fontFamily: sans, fontSize: 14, color: L.faint }}>Read-only portfolio analysis. Not investment advice.</span>
        </div>
      </footer>
    </div>
  );
}

// ── Auth (dark glass moment) ────────────────────────────────────────────────
// The reset email links to "/?reset=<token>". Nothing rendered that route before, so the
// link led to the normal home page and the token was silently lost.
const resetTokenFromUrl = () => URL_AT_LOAD.get("reset") || "";

function VerifiedBanner() {
  const [state] = useState(() => URL_AT_LOAD.get("verified"));
  if (state !== "1" && state !== "0") return null;
  const ok = state === "1";
  return (
    <div role="status" style={{ display: "inline-block", margin: "0 auto 16px", fontFamily: sans, fontSize: 13, borderRadius: 0, padding: "6px 14px",
      background: ok ? "rgba(156,203,245,0.18)" : D.flagBg, color: ok ? A.lime : D.flag, border: `1px solid ${ok ? "rgba(156,203,245,0.40)" : D.flagBorder}` }}>
      {ok ? "Email verified. Sign in to continue." : "That verification link is invalid or expired. Sign in and request a new one."}
    </div>
  );
}

// Google's sign-in script, loaded once, the first time a sign-in pop-up opens.
let gsiLoading = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiLoading) {
    gsiLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { gsiLoading = null; reject(new Error("Google sign-in didn't load")); };
      document.head.appendChild(s);
    });
  }
  return gsiLoading;
}

// Sign in and Get started as a pop-up over the page, after Medium's: the page blurs, a
// centered panel with a serif heading, the form, and a line to switch to the other one.
function AuthModal({ mode, setMode, onClose, onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);
  const go = (m) => { setMode(m); setErr(""); setInfo(""); };
  // "Continue with Google": Google's own button, drawn into this box. It only appears once
  // the server has a client ID and Google's script has loaded; otherwise the email form is
  // all there is, and nothing about it changes.
  const gBox = useRef(null);
  const [gReady, setGReady] = useState(false);
  const onGoogle = useRef(null);
  onGoogle.current = async (resp) => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      const d = await api("/api/auth-google", { method: "POST", body: { credential: resp.credential } });
      if (d.created) ping("signup");
      onAuthed(d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (mode !== "login" && mode !== "signup") return;
    let cancelled = false;
    (async () => {
      try {
        // Built in, not fetched: asking the server first left the button missing for
        // several seconds whenever the server was waking up.
        const googleClientId = DEFAULT_GOOGLE_CLIENT_ID;
        await loadGsi();
        if (cancelled || !gBox.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({ client_id: googleClientId, callback: (r) => onGoogle.current(r), ux_mode: "popup" });
        gBox.current.innerHTML = "";
        window.google.accounts.id.renderButton(gBox.current, {
          theme: "filled_black", size: "large", shape: "pill", logo_alignment: "left",
          text: mode === "signup" ? "signup_with" : "signin_with",
          width: Math.min(360, gBox.current.parentElement?.offsetWidth || 360),
        });
        setGReady(true);
      } catch { /* no Google button; email still works */ }
    })();
    return () => { cancelled = true; };
  }, [mode]);
  const submit = async () => {
    setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "forgot") {
        const d = await api("/api/reset-request", { method: "POST", body: { email } });
        setInfo(d.message + (d.devLink ? ` Dev link: ${d.devLink}` : ""));
        return;
      }
      if (mode === "reset") {
        const d = await api("/api/reset", { method: "POST", body: { token: resetTokenFromUrl(), password } });
        try { window.history.replaceState(null, "", "/"); } catch { /* ignore */ }
        setInfo(d.message); setMode("login"); setPassword("");
        return;
      }
      const d = await api(mode === "signup" ? "/api/signup" : "/api/login", { method: "POST", body: { email, password } });
      if (mode === "signup") ping("signup");
      onAuthed(d.user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const heads = { signup: "Join PlainStreet.", login: "Welcome back.", forgot: "Reset your password.", reset: "Choose a new password." };
  const subs = {
    signup: "See what's really inside your portfolio. Free and read-only.",
    login: null,
    forgot: "Enter your email and we'll send you a reset link.",
    reset: "At least 10 characters.",
  };
  const field = { width: "100%", boxSizing: "border-box", fontFamily: sans, fontSize: 15, color: D.ink, background: "transparent",
    border: `1px solid ${D.glassBorder}`, borderRadius: 999, padding: "13px 18px", outline: "none" };
  const small = { fontFamily: sans, fontSize: 14.5, color: D.muted, margin: 0 };
  const underline = { ...linkBtn(D.ink), fontSize: 14.5, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 };
  return (
    <div className="ps-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}
      style={{ ...BACKDROP, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{MODAL_CSS}</style>
      <div className="ps-panel" role="dialog" aria-modal="true" aria-label={heads[mode]}
        style={{ position: "relative", width: "min(640px,100%)", background: P.card, borderRadius: 4,
          padding: "clamp(44px,8vh,72px) 24px clamp(32px,6vh,52px)", boxShadow: "0 30px 90px rgba(0,0,0,0.55)", textAlign: "center" }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: "absolute", top: 14, right: 16, background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 24, lineHeight: 1, padding: 6 }}>×</button>
        <h2 style={{ fontFamily: headline, fontWeight: 400, fontSize: "clamp(32px,5vw,42px)", color: D.ink, margin: 0, letterSpacing: "-0.01em" }}>{heads[mode]}</h2>
        {subs[mode] && <p style={{ ...small, margin: "12px auto 0", maxWidth: 380, lineHeight: 1.5 }}>{subs[mode]}</p>}
        <div style={{ maxWidth: 360, margin: "32px auto 0", display: "grid", gap: 12, textAlign: "left" }}>
          {(mode === "login" || mode === "signup") && (
            <>
              {/* Google draws its button in its own frame, so the thin white border sits on
                  a box that hugs it. */}
              <div ref={gBox} style={{ display: "flex", justifyContent: "center", width: "fit-content", margin: "0 auto",
                borderRadius: 999, overflow: "hidden", border: gReady ? "1px solid rgba(237,239,243,0.85)" : "none", minHeight: gReady ? 0 : 42 }} />
              {gReady && (
                <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: sans, fontSize: 12.5, color: D.faint, margin: "4px 0" }}>
                  <span style={{ flex: 1, height: 1, background: D.glassBorder }} />or with email<span style={{ flex: 1, height: 1, background: D.glassBorder }} />
                </div>
              )}
            </>
          )}
          {mode !== "reset" && (
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" autoFocus
              onKeyDown={(e) => e.key === "Enter" && (mode === "forgot" ? submit() : null)} style={field} />
          )}
          {mode !== "forgot" && (
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={mode === "reset"}
              placeholder={mode === "login" ? "Password" : mode === "reset" ? "New password" : "Password (at least 10 characters)"}
              aria-label={mode === "reset" ? "New password" : "Password"} onKeyDown={(e) => e.key === "Enter" && submit()} style={field} />
          )}
          {err && <DarkErr>{err}</DarkErr>}
          {info && <div role="status" style={{ fontFamily: sans, fontSize: 13, color: D.ink, background: "rgba(237,239,243,0.08)", border: `1px solid ${D.glassBorder}`, padding: "10px 12px", lineHeight: 1.5, overflowWrap: "anywhere" }}>{info}</div>}
          <button onClick={submit} disabled={busy} style={{ ...startBtn(999, "13px 20px", 15), width: "100%", marginTop: 4 }}>
            {busy ? "…" : { signup: "Create account", login: "Sign in", forgot: "Send reset link", reset: "Set new password" }[mode]}
          </button>
        </div>
        <div style={{ marginTop: 30, display: "grid", gap: 12 }}>
          {mode === "login" && <p style={small}>No account? <button onClick={() => go("signup")} style={underline}>Create one</button></p>}
          {mode === "login" && <p style={small}>Forgot your password? <button onClick={() => go("forgot")} style={underline}>Reset it</button>.</p>}
          {mode === "signup" && <p style={small}>Already have an account? <button onClick={() => go("login")} style={underline}>Sign in</button></p>}
          {(mode === "forgot" || mode === "reset") && <p style={small}><button onClick={() => go("login")} style={underline}>Back to sign in</button></p>}
        </div>
        <p style={{ ...small, fontSize: 12.5, color: D.faint, marginTop: 30 }}>Read-only. We never move your money.</p>
      </div>
    </div>
  );
}

// ── Dashboard (light theme) ─────────────────────────────────────────────────
function Dashboard({ user, onSaveScreens, onSignOut, onGoHome }) {
  const [screens, setScreens] = useState(null);
  // Starts from what they saved last time (it comes with the account), not from the
  // brokerage analysis, which only answers once a brokerage is connected.
  const [selected, setSelected] = useState(() => new Set(user.screens || []));
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
  const saveScreens = async () => {
    setErr("");
    try {
      await onSaveScreens([...selected]);
      saveSelection([...selected]);
      setSaved(true);
      if (analysis) refresh();
    } catch (e) { setErr(e.message || "Couldn't save. Try again."); }
  };
  const connect = async () => {
    setErr("");
    try { const { url } = await api("/api/brokerage-connect", { method: "POST" }); window.location.href = url; }
    catch (e) { setErr(e.message); }
  };

  return (
    <div style={{ minHeight: "100dvh", background: L.bg, fontFamily: sans, color: L.ink }}>
      {/* light top bar */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: L.bg, borderBottom: `1px solid ${L.line}` }}>
        {/* Logo + "Search a ticker" + email + "Sign out" don't all fit below ~480px — the
            email (unbounded length) was the worst offender, overflowing off-screen. Hide
            it on narrow screens; flexWrap is a safety net if it's still tight. */}
        <style>{`@media (max-width: 480px) { .ps-dash-email { display: none; } }`}</style>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <button onClick={onGoHome} style={{ ...linkBtn(L.pine), fontFamily: serifDisplay, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>PlainStreet</button>
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
                    textAlign: "left", cursor: "pointer", padding: "14px 15px", borderRadius: 0,
                    background: on ? "rgba(238,120,86,0.14)" : L.card,
                    border: `1.5px solid ${on ? L.flagBorder : L.line}`,
                    transition: "all .14s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: L.ink }}>{s.label}</span>
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

        <LSection n="2" title="Connect your brokerage" sub="Read-only, through SnapTrade. We can see your holdings, but we only read them, and never move money without your say-so.">
          {analysis ? (
            <div style={card({ padding: "15px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" })}>
              <span style={{ color: L.good, fontWeight: 600, fontFamily: sans, fontSize: 14 }}>✓ Connected</span>
              <span style={{ color: L.muted, fontFamily: sans, fontSize: 14 }}>· {analysis.accounts.map((a) => a.name).join(", ")}</span>
              <button onClick={connect} style={{ ...linkBtn(L.teal), marginLeft: "auto" }}>Reconnect</button>
            </div>
          ) : loading ? (
            <div style={card({ padding: "15px 18px" })}><Muted>Reading your holdings… this can take a few seconds.</Muted></div>
          ) : user.snaptradeEnabled === false ? (
            <WaitlistCallout />
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
              sub="Look-through below. We name every company inside." />
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
            <div key={h.account + h.symbol} style={card({ padding: "15px 17px", marginBottom: 10 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div><span style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: L.ink }}>{h.symbol}</span><span style={{ fontFamily: sans, fontSize: 13, color: L.muted }}> · {h.description}</span></div>
                <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: L.ink }}>{money(h.valueCents)}</span>
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
              <div key={h.account + h.symbol} style={card({ padding: "15px 17px", marginBottom: 10 })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div><span style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: L.ink }}>{h.symbol}</span><span style={{ fontFamily: sans, fontSize: 13, color: L.muted }}> · {h.description}</span></div>
                  <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: L.ink }}>{money(h.valueCents)}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: L.faint, marginTop: 2 }}>Tracks {h.fundBasis}, holds {fundContains.length} flagged companies</div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <FundBreakdown groups={groups} theme="light" />
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* honest method note */}
      <div style={card({ padding: "14px 16px", marginTop: 16, background: L.lineSoft })}>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, lineHeight: 1.65 }}>
          We checked <b style={{ color: L.ink }}>{summary.analyzedStocks}</b> direct holding{summary.analyzedStocks === 1 ? "" : "s"} and looked inside{" "}
          <b style={{ color: L.ink }}>{summary.analyzedFunds}</b> fund{summary.analyzedFunds === 1 ? "" : "s"} using their published holdings.
          {summary.opaqueFunds > 0 && <> {summary.opaqueFunds} other fund{summary.opaqueFunds === 1 ? " isn't" : "s aren't"} one we can see inside yet, so {summary.opaqueFunds === 1 ? "it's" : "they're"} marked "not analyzed" rather than clean.</>}
          {" "}Index membership shifts over time, and a fund's dollar breakdown per company needs weights we don't show. We name the companies, not the cents.
        </div>
      </div>

      <details style={{ marginTop: 14 }}>
        <summary style={{ fontFamily: sans, fontSize: 13, color: L.teal, cursor: "pointer", fontWeight: 600 }}>See all {holdings.length} holdings</summary>
        <div style={card({ marginTop: 10, padding: "6px 16px" })}>
          {holdings.map((h, i) => (
            <div key={h.account + h.symbol} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: sans, fontSize: 13, padding: "9px 2px", borderBottom: i < holdings.length - 1 ? `1px solid ${L.lineSoft}` : "none" }}>
              <span style={{ color: L.ink }}><b>{h.symbol}</b> <span style={{ color: L.muted }}>{h.description}</span></span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {h.conflicted ? <span style={{ color: L.flag, fontSize: 11, fontWeight: 600 }}>● flagged</span>
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
const SubHead = ({ children }) => <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: L.brass, fontWeight: 600, margin: "6px 0 10px" }}>{children}</div>;

// ── Shared ────────────────────────────────────────────────────────────────────
function LSection({ n, title, sub, children }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 11 }}>
        <span style={{ fontFamily: serif, fontSize: 15, color: L.brass, fontWeight: 600 }}>{n}</span>
        <h2 style={{ fontFamily: serif, fontSize: 22, color: L.pine, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
      </div>
      {sub && <p style={{ fontFamily: sans, fontSize: 13.5, color: L.muted, margin: "6px 0 15px", lineHeight: 1.5 }}>{sub}</p>}
      {!sub && <div style={{ height: 13 }} />}
      {children}
    </section>
  );
}
const Muted = ({ children }) => <div style={{ fontFamily: sans, fontSize: 13.5, color: L.muted }}>{children}</div>;
const LErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, padding: "10px 12px", borderRadius: 0 }}>{children}</div>;
const DarkErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: D.flag, background: D.flagBg, border: `1px solid ${D.flagBorder}`, padding: "10px 12px", borderRadius: 0 }}>{children}</div>;

// Buttons — flat, no gloss, full pills. All three primaries are lavender-on-near-black and
// differ only in border/shadow; they're near-duplicates now and could collapse into one.
const brassBtn = (r = 0, pad = "14px 24px", fs = 15) => ({
  background: A.lav, color: A.lavInk, border: `1px solid ${A.lav}`, borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.005em",
});
// Borderless variant with a lift — used for the big page-level CTAs.
const darkBtn = (r = 0, pad = "14px 24px", fs = 15) => ({
  background: A.lav, color: A.lavInk, border: "none", borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.005em",
});
// "Get started" is the one thing on the page we want people to press, so it gets
// the sky accent to itself — every other filled button is chartreuse.
const startBtn = (r = 999, pad = "14px 24px", fs = 15) => ({
  background: A.lav, color: A.lavInk, border: `1px solid ${A.lav}`, borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 600, cursor: "pointer", letterSpacing: "-0.005em",
});
const linkBtn = (color) => ({ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, color });

// ── Design-system components — see DESIGN.md §3 ──────────────────────────────

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
      fontFamily: sans, fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: "2px 8px",
      // The delta sits inside the result panel, which is a light card, so it takes the
      // page's terracotta rather than the lifted tint the dark bands use.
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
        <path d={`${line} L${W},${H} L0,${H} Z`} fill={color} fillOpacity="0.16" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {hasMark && (
        <>
          <div aria-hidden style={{
            position: "absolute", top: 6, bottom: 0,
            left: `${(activeIdx / (data.length - 1)) * 100}%`,
            width: 1, background: "rgba(237,239,243,0.34)", pointerEvents: "none",
          }} />
          <div aria-hidden style={{
            position: "absolute",
            left: `${(activeIdx / (data.length - 1)) * 100}%`,
            top: y(data[activeIdx]) + 6, width: 9, height: 9, borderRadius: "50%",
            background: color, border: `2px solid ${P.page}`,
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
  const dim = accent ? "rgba(10,26,51,0.62)" : L.muted;
  return (
    <div style={card({
      padding: "16px 18px", background: accent ? A.lav : L.card, borderRadius: 14,
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

// §3.7 — list row with progress. The bar renders only when `pct` is a real ratio; a
// progress bar with an invented denominator is exactly the kind of fake number this
// product promises never to show.
function ProgressRow({ icon, title, subtitle, leftValue, rightValue, pct, tone = A.lav }) {
  const p = typeof pct === "number" && Number.isFinite(pct) ? Math.max(0, Math.min(1, pct)) : null;
  return (
    <div style={card({ padding: "14px 15px", marginBottom: 10, display: "grid", gap: 9 })}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {icon && <div style={{ width: 40, height: 40, borderRadius: 0, background: L.lineSoft, display: "grid", placeItems: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: sans, fontSize: 16, fontWeight: 600, color: L.ink, letterSpacing: "-0.01em" }}>{title}</div>
          {subtitle && <div style={{ fontFamily: sans, fontSize: 12.5, color: L.muted, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
      {p !== null && (
        <div style={{ height: 4, borderRadius: 0, background: L.line, overflow: "hidden" }}>
          <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 0, background: tone }} />
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
// The price chart sits on a pane of "liquid glass": translucent and frosted, a bright edge
// along the top, a soft sheen fading down, and a blurred glow behind it in the trend's
// color (mint up, coral down) so the glass has something to catch.
const GLASS_CSS = `
.ps-glass { position: relative; isolation: isolate; overflow: hidden; border-radius: 22px; padding: 16px 18px 6px;
  background: linear-gradient(150deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 48%, rgba(255,255,255,0.07));
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(255,255,255,0.05), inset 0 0 26px rgba(255,255,255,0.04), 0 16px 40px rgba(0,0,0,0.32);
  backdrop-filter: blur(22px) saturate(170%); -webkit-backdrop-filter: blur(22px) saturate(170%); }
.ps-glass::before { content: ""; position: absolute; inset: -35%; z-index: -1; pointer-events: none; opacity: .6; filter: blur(34px);
  background: radial-gradient(38% 46% at 22% 82%, var(--ps-glow) 0%, transparent 70%), radial-gradient(32% 38% at 84% 16%, rgba(156,203,245,0.38) 0%, transparent 70%); }
.ps-glass::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 26%); }
.ps-seg { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.13); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
.ps-seg button { font-family: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; border: none; border-radius: 999px;
  padding: 4px 11px; min-width: 34px; background: transparent; color: rgba(237,239,243,0.62); transition: background .2s, color .2s, box-shadow .2s; }
.ps-seg button:hover { color: rgba(237,239,243,0.9); }
.ps-seg button[aria-pressed="true"] { color: #fff; background: linear-gradient(180deg, rgba(255,255,255,0.30), rgba(255,255,255,0.12));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(255,255,255,0.08), 0 2px 10px rgba(0,0,0,0.28); }
`;

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
    <div className="ps-glass" style={{ marginTop: 16, fontFamily: sans, "--ps-glow": up ? "rgba(95,207,146,0.55)" : "rgba(238,120,86,0.55)" }}>
      <style>{GLASS_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: L.muted }}>
          {stamp || `Last price · ${q.label}`}
        </span>
        <div role="group" aria-label="Chart range" className="ps-seg" style={{ marginLeft: "auto" }}>
          {QUOTE_RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} aria-pressed={r.key === range}>{r.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
        <span className="ps-num" style={{ fontFamily: sans, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: L.ink, lineHeight: 1.1 }}>$ {shownPrice.toFixed(2)}</span>
        <DeltaBadge pct={shownPct} />
      </div>
      <div style={{ opacity: busy ? 0.45 : 1, transition: "opacity .15s" }}>
        <Sparkline data={q.spark} height={110} color={up ? A.lime : L.flag} label={q.label}
          onScrub={setScrub} activeIdx={scrub} />
      </div>
    </div>
  );
}
