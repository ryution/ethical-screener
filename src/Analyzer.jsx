// The Ethical Portfolio Analyzer — the whole app, one file.
//
// Flow: sign in → pick the ethical lines you care about → connect your brokerage
// (read-only, via SnapTrade) → see which holdings conflict, and why.
//
// The analyzer is read-only; we never move money without the user's say-so. (Trading may
// come later as a paid feature — the free tool only reads and explains.)
//
// Visual language: a dark-green "liquid glass" hero for the marketing moment, then a
// light, high-contrast "paper" theme for everything you actually read and work in —
// so the data doesn't blur into a green wash.

import { useEffect, useState } from "react";

// ── Dark palette (hero + auth) ───────────────────────────────────────────────
const D = {
  ink: "#EAF3EE", muted: "#9FB6AB", faint: "#708C7F",
  mint: "#63D6A6", brass: "#D8B67E", brassSoft: "#ECD6A6",
  glassBorder: "rgba(255,255,255,0.14)",
};
// ── Light palette (body + app) ───────────────────────────────────────────────
const L = {
  bg: "#F4F1E9", card: "#FFFFFF", line: "#E6E1D4", lineSoft: "#EFEBE0",
  ink: "#1B2A23", muted: "#5C6B62", faint: "#93A096",
  pine: "#0E3A2E", teal: "#0E6B57", mint: "#1E9E77", brass: "#A9803F",
  flag: "#BE4F36", flagBg: "#FAEBE5", flagBorder: "#F0D2C7", good: "#1E7D57",
};
const sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const serif = "'Iowan Old Style', Georgia, 'Times New Roman', serif";

// Frosted-glass surface, dark theme only.
const glass = (o = {}) => ({
  background: "rgba(255,255,255,0.055)",
  backdropFilter: "blur(22px) saturate(150%)",
  WebkitBackdropFilter: "blur(22px) saturate(150%)",
  border: `1px solid ${D.glassBorder}`,
  borderRadius: 20,
  boxShadow: "0 14px 44px -16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.09)",
  ...o,
});
// Solid light card with a soft lift.
const card = (o = {}) => ({
  background: L.card, border: `1px solid ${L.line}`, borderRadius: 16,
  boxShadow: "0 1px 2px rgba(20,39,31,0.04), 0 8px 24px -16px rgba(20,39,31,0.18)",
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
  useEffect(() => { api("/api/me").then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);

  if (user === undefined) return <Splash />;
  if (user) return <Dashboard user={user} onSignOut={() => { setUser(null); setShowAuth(false); }} />;
  if (showAuth) return <Auth onAuthed={setUser} onBack={() => setShowAuth(false)} />;
  return <Landing onStart={() => setShowAuth(true)} />;
}

// ── The dark canvas: deep-green gradient + floating orbs ─────────────────────
function Canvas({ children }) {
  return (
    <div style={{ position: "relative", fontFamily: sans, color: D.ink, overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background:
        "radial-gradient(1200px 700px at 12% -8%, #124d3c 0%, transparent 55%)," +
        "radial-gradient(1000px 800px at 92% 8%, #0b5f4c 0%, transparent 50%)," +
        "linear-gradient(160deg, #0a1f18 0%, #081712 70%, #060f0c 100%)" }}>
        <Orb x="8%" y="18%" s={340} c="rgba(99,214,166,0.16)" />
        <Orb x="86%" y="26%" s={420} c="rgba(14,107,87,0.30)" />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 200,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)" }} />
      </div>
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
const Orb = ({ x, y, s, c }) => (
  <div style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%",
    background: c, filter: "blur(90px)", transform: "translate(-50%,-50%)" }} />
);

function Splash() {
  return (
    <Canvas>
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <span style={{ fontFamily: serif, fontSize: 28, color: D.brassSoft, letterSpacing: "-0.02em" }}>Steward</span>
      </div>
    </Canvas>
  );
}

// ── The live hero analyzer: type a ticker, see inside it, no login ───────────
function HeroAnalyzer({ onStart }) {
  const [q, setQ] = useState("VOO");
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

  const run = async (symbol) => {
    const sym = (symbol ?? q).trim().toUpperCase();
    if (!sym) return;
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await api(`/api/lookup?symbol=${encodeURIComponent(sym)}`)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  // Auto-load VOO on mount so a visitor sees the surprise immediately.
  useEffect(() => { run("VOO"); /* eslint-disable-next-line */ }, []);

  const examples = ["VOO", "QQQ", "SCHB", "XLV"];
  return (
    <div style={{ maxWidth: 560, margin: "30px auto 0", textAlign: "left" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Try a ticker — VOO, QQQ, SCHB, XLV…" aria-label="Ticker symbol"
          style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 15, color: D.ink, background: "rgba(255,255,255,0.08)",
            border: `1px solid ${D.glassBorder}`, borderRadius: 12, padding: "14px 15px", outline: "none",
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", textTransform: "uppercase" }} />
        <button onClick={() => run()} disabled={busy} style={brassBtn(12, "14px 22px", 15)}>{busy ? "…" : "Check"}</button>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontFamily: sans, fontSize: 12, color: D.faint }}>Try:</span>
        {examples.map((x) => (
          <button key={x} onClick={() => { setQ(x); run(x); }} style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${D.glassBorder}`, color: D.muted, borderRadius: 20, padding: "4px 11px", fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{x}</button>
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
                  style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 20, padding: "4px 12px",
                    border: `1px solid ${on ? "rgba(99,214,166,0.5)" : D.glassBorder}`,
                    background: on ? "rgba(99,214,166,0.16)" : "transparent",
                    color: on ? "#CFF3E2" : D.faint, transition: "all .12s" }}>
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
        <div style={{ fontFamily: serif, fontSize: 19, color: "#F4FAF6" }}>
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
          <div style={{ fontFamily: serif, fontSize: 19, color: "#F4FAF6" }}>No flags for <b>{result.symbol}</b> in your selected categories.</div>
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
        <div style={{ fontFamily: serif, fontSize: 20, color: "#F4FAF6" }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {flags.map((f) => (
            <div key={f.key} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <FlagChip>{f.label}</FlagChip>
                <span style={{ fontFamily: sans, fontSize: 13, color: D.ink, lineHeight: 1.45 }}>{f.reason}</span>
              </div>
              <FlagEvidence quote={f.quote} source={f.source} asOf={f.asOf} muted={D.muted} link="#CFE8DA" />
            </div>
          ))}
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
          <div style={{ fontFamily: serif, fontSize: 20, color: "#F4FAF6" }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: D.muted, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "3px 10px" }}>NOT ANALYZED</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "8px 0 0", lineHeight: 1.55 }}>
          {result.notAnalyzedReason} We call that <b style={{ color: "#F4FAF6" }}>not analyzed</b> — never "clean."
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
          <div style={{ fontFamily: serif, fontSize: 20, color: "#F4FAF6" }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
          <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: "#0A2A20", background: D.brassSoft, borderRadius: 20, padding: "3px 10px" }}>FUND</span>
        </div>
        <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
          No holdings in this fund match your selected categories. Turn on more categories above to widen the check.
        </p>
        <HeroCTA onStart={onStart} />
      </div>
    );
  }
  const groups = groupByFlag(result.contains);
  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: serif, fontSize: 20, color: "#F4FAF6" }}>{result.symbol} · <span style={{ color: D.muted, fontFamily: sans, fontSize: 15 }}>{result.name}</span></div>
        <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: "#0A2A20", background: D.brassSoft, borderRadius: 20, padding: "3px 10px" }}>FUND</span>
      </div>
      <p style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
        Tracks {result.basis} — and holds <b style={{ color: "#F4FAF6" }}>{result.contains.length}</b> companies you may want to avoid:
      </p>
      <div style={{ marginTop: 12, display: "grid", gap: 9 }}>
        <FundBreakdown groups={groups} theme="dark" />
      </div>
      <HeroCTA onStart={onStart} />
    </div>
  );
}

const groupByFlag = (contains) => {
  const m = new Map();
  for (const c of contains) for (const f of c.flags) {
    if (!m.has(f.key)) m.set(f.key, { key: f.key, label: f.label, items: [] });
    m.get(f.key).items.push({ name: c.name, ticker: c.ticker, reason: f.reason, quote: f.quote, source: f.source, asOf: f.asOf });
  }
  // Alphabetical by category label, so the list order is predictable — not "whatever we
  // happen to have the most of."
  return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
};

// The clickable fund breakdown: every flagged holding is a quiet link; clicking one
// reveals WHY it was flagged, and — understated, one level down — a way to dispute it.
// The dispute path is deliberately not loud: the default view reads as confident, and
// only a user who knows a specific name is wrong goes looking for it.
function FundBreakdown({ groups, theme }) {
  const [open, setOpen] = useState(null); // "flagKey:TICKER"
  const dark = theme === "dark";
  const Chip = dark ? FlagChip : LFlagChip;
  const c = dark
    ? { ink: D.ink, muted: D.muted, faint: D.faint, link: "#CFE8DA", panel: "rgba(255,255,255,0.06)", border: D.glassBorder }
    : { ink: L.ink, muted: L.faint, faint: L.faint, link: "#2F6B4F", panel: "rgba(0,0,0,0.03)", border: "rgba(0,0,0,0.10)" };
  return (
    <>
      {groups.map((g) => {
        const openItem = g.items.find((it) => open === `${g.key}:${it.ticker}`);
        return (
          <div key={g.key} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
              <Chip>{g.label} · {g.items.length}</Chip>
              <span style={{ fontFamily: sans, fontSize: 12.5, color: c.ink, lineHeight: 1.6 }}>
                {g.items.map((it, i) => (
                  <span key={it.ticker + i}>
                    <span
                      onClick={() => setOpen(open === `${g.key}:${it.ticker}` ? null : `${g.key}:${it.ticker}`)}
                      style={{ cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textDecorationColor: c.faint, textUnderlineOffset: 3 }}
                    >{it.name}</span>{i < g.items.length - 1 ? ", " : ""}
                  </span>
                ))}
              </span>
            </div>
            {openItem && (
              <div style={{ background: c.panel, border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 12px", display: "grid", gap: 6 }}>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: c.ink, lineHeight: 1.5 }}>
                  <b>{openItem.ticker}</b> · {openItem.name} — flagged <b>{g.label}</b>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>{openItem.reason}</div>
                <FlagEvidence quote={openItem.quote} source={openItem.source} asOf={openItem.asOf} muted={c.muted} link={c.link} />
                <ReportControl item={openItem} group={g} linkColor={c.link} muted={c.muted} />
              </div>
            )}
          </div>
        );
      })}
    </>
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
        style={{ fontFamily: sans, fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: `1px solid ${muted}`, background: "transparent", color: "inherit", resize: "vertical" }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button onClick={submit} disabled={busy} style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: linkColor, background: "none", border: `1px solid ${linkColor}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Send report</button>
        <button onClick={() => setStage("idle")} style={{ fontFamily: sans, fontSize: 12, color: muted, background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}
const FlagChip = ({ children }) => (
  <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: "#F2A98F", background: "rgba(238,120,86,0.15)", border: "1px solid rgba(238,120,86,0.34)", borderRadius: 6, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{children}</span>
);
const HeroCTA = ({ onStart }) => (
  <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${D.glassBorder}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
    <span style={{ fontFamily: sans, fontSize: 13, color: D.muted }}>That's one ticker. See your whole portfolio at once:</span>
    <button onClick={onStart} style={{ ...mintBtn(), padding: "10px 18px", fontSize: 14, marginLeft: "auto" }}>Connect brokerage →</button>
  </div>
);

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
    { name: "Deforestation & palm oil", status: "Planned", def: "Business tied to deforestation — palm oil, industrial logging, timberland conversion.", counts: "Palm-oil producers/traders; industrial logging; disclosed land conversion.", not: "A packaged-goods company that merely buys palm oil, absent a disclosed controversy.", ex: "Largely non-US-listed; curated coverage." },
  ]],
  ["Weapons & conflict", [
    { name: "Weapons & defense", status: "Live", def: "Manufacture of military weapons and defense contracting.", counts: "Defense primes, munitions, missiles, military aircraft/vehicles, defense electronics as a principal business.", not: "Dual-use suppliers with no material defense segment; civilian aerospace.", ex: "Lockheed Martin, RTX, General Dynamics, Northrop Grumman." },
    { name: "Civilian firearms", status: "Live", def: "Manufacture and large-scale retail of civilian guns and ammunition.", counts: "Civilian firearm and ammunition makers; major firearms retailers.", not: "Military-only ordnance (that’s weapons); shops where firearms are a minor line.", ex: "Smith & Wesson, Sturm Ruger, Olin/Winchester." },
    { name: "Nuclear weapons", status: "Planned", def: "Participation in the nuclear-weapons supply chain.", counts: "Companies on recognized producer lists and those disclosing nuclear-weapons contracts.", not: "Conventional defense with no nuclear work; nuclear power (excluded).", ex: "A subset of defense primes; curated." },
  ]],
  ["Social & human rights", [
    { name: "Private prisons & detention", status: "Live", def: "For-profit incarceration, detention, and closely-tied services.", counts: "Operators of private prisons and immigration-detention centers.", not: "A general contractor that once built a facility; incidental government clients.", ex: "GEO Group, CoreCivic." },
    { name: "Surveillance & data brokers", status: "Live", def: "Business models built on large-scale collection and sale of personal data.", counts: "Ad businesses built on personal-data profiling; data brokers; mass-surveillance analytics.", not: "Software companies generally; a one-off privacy breach without a data-driven model.", ex: "Meta, Alphabet, Palantir, LiveRamp." },
    { name: "Predatory lending", status: "Live", def: "High-cost consumer lending with predatory terms — payday, title, pawn, subprime.", counts: "Triple-digit-APR lending, title loans, and lenders with enforcement actions defining the practice.", not: "Ordinary consumer credit, prime installment lending, mainstream banks.", ex: "World Acceptance, EZCORP, Enova, Credit Acceptance." },
    { name: "Forced labor & supply chain", status: "Planned", def: "Documented forced labor or severe supply-chain human-rights violations.", counts: "Disclosed forced-labor findings, import bans, or UFLPA enforcement tied to the company.", not: "Boilerplate “we prohibit forced labor” policy language.", ex: "Case-by-case, driven by enforcement records." },
  ]],
  ["Health & vice", [
    { name: "Tobacco & nicotine", status: "Live", def: "Cigarettes, cigars, vaping, and other nicotine products.", counts: "Manufacturers and leaf suppliers as a principal business.", not: "Retailers that stock tobacco among many goods.", ex: "Altria, Philip Morris International, Turning Point Brands." },
    { name: "Alcohol", status: "Live", def: "Producers and wholesalers of beer, wine, and spirits.", counts: "Brewing, winemaking, distilling, and alcohol wholesale.", not: "Restaurants/retailers that serve alcohol; generic non-alcoholic “Beverages.”", ex: "Anheuser-Busch InBev, Molson Coors, Constellation Brands." },
    { name: "Gambling", status: "Live", def: "Casinos, sportsbooks, and betting platforms.", counts: "Casino operators, sports-betting/iGaming, racetrack betting as a principal business.", not: "Payment processors; hospitality with no gaming operation.", ex: "DraftKings, Las Vegas Sands, Caesars, Flutter." },
    { name: "Adult entertainment", status: "Live", def: "Pornography and adult-content businesses.", counts: "Adult content production/distribution; adult nightclubs as a principal business.", not: "General media/streaming with incidental mature content.", ex: "RCI Hospitality." },
    { name: "Cannabis", status: "Planned", def: "Cultivation, processing, and sale of cannabis and cannabis products.", counts: "Multi-state operators, cultivators, cannabis-product makers.", not: "Hemp/CBD wellness only; medical cannabinoids (flag separately if desired).", ex: "Canopy Growth, Tilray, Green Thumb, Curaleaf.", contested: true },
    { name: "Opioid crisis", status: "Live", def: "Documented culpability in the opioid epidemic — not legitimate pain medication.", counts: "Opioid-marketing litigation, DEA enforcement, and settlements (makers and distributors).", not: "A company supplying medically-appropriate opioids with no misconduct record.", ex: "Implicated manufacturers and the big-three distributors, by public settlement." },
  ]],
  ["Animal welfare", [
    { name: "Factory farming", status: "Live", def: "Industrial animal agriculture and meat/poultry processing.", counts: "Large-scale meat/poultry processing, industrial feedlots.", not: "Plant-based food; small/pasture operations.", ex: "Tyson Foods, Hormel, Seaboard." },
    { name: "Animal testing", status: "Live", def: "Contract research and cosmetics whose core business involves animal testing.", counts: "Contract research orgs with animal-study operations; cosmetics tied to animal testing.", not: "Medical research where no animal testing is disclosed.", ex: "Charles River Labs, LabCorp." },
    { name: "Fur & exotic leather", status: "Planned", def: "Production or primary retail of animal fur and exotic-animal leather.", counts: "Fur farming/processing; brands whose principal line is fur/exotic skins.", not: "General apparel with incidental leather.", ex: "Curated (few pure-play public names)." },
  ]],
  ["Faith-based", [
    { name: "Abortion & contraceptives", status: "Planned", def: "Manufacture of abortifacients or contraceptives, or provision of abortion services.", counts: "Makers of abortifacient drugs or contraceptives as a material line; for-profit abortion providers.", not: "Diversified pharma where it isn’t a disclosed principal activity.", ex: "Curated + filing-cited.", contested: true },
  ]],
];
const METHOD_EXCLUDED = [
  ["Nuclear power", "Genuinely contested (many consider it climate-positive) and low screening demand."],
  ["Interest-based finance / Sharia", "Already well served by dedicated tools; the valuable part needs a fundamentals data feed we don’t source, and the cheap piece (flag all banks by code) is too blunt to ship honestly."],
  ["For-profit education, sugar / ultra-processed food, pork", "Little real divestment constituency, or a signal too noisy to be honest."],
  ["Mining, pesticides, conflict minerals, governance", "No clean, free signal yet — these need external datasets we don’t source. Silence is honest; a bad guess isn’t."],
];

function Methodology({ onStart }) {
  const wrap = { maxWidth: 900, margin: "0 auto", padding: "0 24px" };
  const StatusBadge = ({ s }) => (
    <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
      color: s === "Live" ? L.good : L.brass, background: s === "Live" ? "rgba(30,125,87,0.12)" : "rgba(169,128,63,0.12)",
      border: `1px solid ${s === "Live" ? "rgba(30,125,87,0.3)" : "rgba(169,128,63,0.3)"}`, borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap" }}>{s}</span>
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
            <a href="#" style={{ fontFamily: serif, fontSize: 21, fontWeight: 700, color: D.ink, letterSpacing: "-0.02em", textDecoration: "none" }}>Steward</a>
            <button onClick={onStart} style={brassBtn(9, "9px 18px", 14)}>Get started</button>
          </div>
        </nav>
        <header>
          <div style={{ ...wrap, padding: "clamp(48px,7vw,80px) 24px clamp(36px,5vw,56px)" }}>
            <p style={{ fontFamily: sans, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: D.brassSoft, margin: "0 0 18px" }}>Methodology</p>
            <h1 style={{ fontFamily: serif, fontWeight: 800, fontSize: "clamp(30px,5vw,50px)", lineHeight: 1.06, margin: 0, letterSpacing: "-0.035em", color: "#F4FAF6" }}>
              How Steward decides what to flag.
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
                      {f.contested && <span style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: L.muted, background: "rgba(0,0,0,0.05)", border: `1px solid ${L.line}`, borderRadius: 5, padding: "2px 7px" }}>Contested</span>}
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
        <div style={{ ...wrap, padding: "clamp(48px,7vw,72px) 24px" }}>
          <SectionHead n="04" title="What we deliberately excluded" sub="Where we can’t meet the plain-cited-fact bar, we don’t flag — silence beats a bad guess." />
          <div style={{ display: "grid", gap: 14 }}>
            {METHOD_EXCLUDED.map(([t, d]) => (
              <div key={t} style={{ display: "grid", gridTemplateColumns: "minmax(120px,220px) 1fr", gap: 16, alignItems: "baseline", paddingBottom: 14, borderBottom: `1px solid ${L.line}` }}>
                <span style={{ fontFamily: serif, fontSize: 16, fontWeight: 700, color: L.pine }}>{t}</span>
                <span style={{ fontFamily: sans, fontSize: 14.5, color: L.muted, lineHeight: 1.55 }}>{d}</span>
              </div>
            ))}
          </div>
          <p style={{ fontFamily: serif, fontStyle: "italic", fontSize: 17, color: L.pine, lineHeight: 1.6, margin: "32px 0 0", textAlign: "center", maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
            Every flag resolves to a plain, checkable, cited fact. Where we can’t meet that bar, we don’t flag it — silence means “not one of the names we track,” never “audited clean.”
          </p>
        </div>
      </section>

      <section style={{ ...wrap, textAlign: "center", padding: "clamp(48px,8vw,90px) 24px" }}>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(24px,4vw,36px)", color: L.pine, fontWeight: 700, margin: "0 0 20px", letterSpacing: "-0.02em" }}>See what you own.</h2>
        <button onClick={onStart} style={darkBtn(14, "16px 32px", 16)}>Get started</button>
      </section>

      <footer style={{ ...wrap, maxWidth: 1000, borderTop: `1px solid ${L.line}`, padding: "22px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <a href="#" style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: L.muted, textDecoration: "none" }}>Steward</a>
        <span style={{ fontFamily: sans, fontSize: 12.5, color: L.faint }}>Read-only portfolio analysis. Not investment advice.</span>
      </footer>
    </div>
  );
}
const SectionHead = ({ n, title, sub }) => (
  <div style={{ marginBottom: 28 }}>
    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: L.brass, marginBottom: 8 }}>{n}</div>
    <h2 style={{ fontFamily: serif, fontSize: "clamp(24px,3.6vw,34px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>{title}</h2>
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
      {/* ── Dark hero with the live analyzer ── */}
      <Canvas>
        <nav style={{ position: "sticky", top: 0, zIndex: 20, borderBottom: `1px solid ${D.glassBorder}`, background: "rgba(8,20,16,0.5)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
          <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
            <span style={{ fontFamily: serif, fontSize: 21, fontWeight: 700, color: D.ink, letterSpacing: "-0.02em" }}>Steward</span>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <a href="#methodology" style={{ fontFamily: sans, fontSize: 13.5, color: D.muted, textDecoration: "none" }}>Methodology</a>
              <button onClick={onStart} style={brassBtn(9, "9px 18px", 14)}>Get started</button>
            </div>
          </div>
        </nav>
        <header>
          <div style={{ ...wrap, textAlign: "center", padding: "clamp(56px,9vw,96px) 24px clamp(48px,7vw,80px)" }}>
            <p style={{ fontFamily: sans, fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: D.brassSoft, marginBottom: 22 }}>The ethical portfolio analyzer</p>
            <h1 style={{ fontFamily: serif, fontWeight: 800, fontSize: "clamp(34px,6vw,62px)", lineHeight: 1.04, margin: 0, letterSpacing: "-0.04em", color: "#F4FAF6" }}>
              Is your money funding<br /><span style={{ color: D.mint }}>what you fight against?</span>
            </h1>
            <p style={{ fontFamily: sans, fontSize: "clamp(16px,2vw,19px)", lineHeight: 1.6, color: D.muted, margin: "24px auto 0", maxWidth: 560 }}>
              Even broad market funds hide holdings that might not match your values. Search any stock or ETF ticker to see what’s really inside your portfolio.
            </p>
            <HeroAnalyzer onStart={onStart} wrap={wrap} />
            <p style={{ fontFamily: sans, fontSize: 12.5, color: D.faint, marginTop: 18 }}>Read-only analysis. We never move your money without your say-so.</p>
          </div>
        </header>
      </Canvas>

      {/* ── Light body: how it works ── */}
      <section style={{ ...wrap, padding: "clamp(56px,9vw,96px) 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 34 }}>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(26px,4vw,38px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Three steps, two minutes.</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(258px,1fr))", gap: 18 }}>
          {steps.map((s) => (
            <div key={s.n} style={card({ padding: "26px 24px" })}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: L.pine, color: D.brassSoft, display: "grid", placeItems: "center", fontFamily: serif, fontSize: 14, fontWeight: 700 }}>{s.n}</div>
              <div style={{ fontFamily: serif, fontSize: 20, color: L.pine, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 14 }}>{s.t}</div>
              <p style={{ fontFamily: sans, fontSize: 14, color: L.muted, lineHeight: 1.6, margin: "9px 0 0" }}>{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Light body: honesty ── */}
      <section style={{ background: L.card, borderTop: `1px solid ${L.line}`, borderBottom: `1px solid ${L.line}` }}>
        <div style={{ ...wrap, maxWidth: 720, textAlign: "center", padding: "clamp(48px,8vw,80px) 24px" }}>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(24px,4vw,32px)", color: L.pine, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>We'd rather under-claim than mislead.</h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: L.muted, lineHeight: 1.7, margin: "16px 0 0" }}>
            We check individual stocks against a curated list of companies, and give the reason for every flag. Our coverage is U.S.-listed companies that file with the SEC — foreign-listed companies aren't analyzed yet, so an ADR or overseas name may come back empty simply because we haven't reached it. We don't peer inside broad index funds and pretend we can — an unanalyzed fund is labeled as such, not called clean. A clean result means "none of the names we track," never "audited pure." You draw the lines; we show you where your money already sits.
          </p>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ ...wrap, textAlign: "center", padding: "clamp(60px,10vw,110px) 24px" }}>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(28px,4.5vw,42px)", color: L.pine, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.02em" }}>See what you own.</h2>
        <p style={{ fontFamily: sans, fontSize: 16, color: L.muted, margin: "0 0 26px" }}>Free, read-only, about two minutes.</p>
        <button onClick={onStart} style={darkBtn(14, "16px 32px", 16)}>Get started</button>
      </section>

      <footer style={{ ...wrap, borderTop: `1px solid ${L.line}`, padding: "22px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <span style={{ fontFamily: serif, fontSize: 15, fontWeight: 700, color: L.muted }}>Steward</span>
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
          <h1 style={{ fontFamily: serif, fontSize: 30, color: D.ink, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
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
function Dashboard({ user, onSignOut }) {
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
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(244,241,233,0.85)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderBottom: `1px solid ${L.line}` }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: serif, fontSize: 20, fontWeight: 700, color: L.pine, letterSpacing: "-0.02em" }}>Steward</span>
          <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: sans, fontSize: 12.5, color: L.muted }}>{user.email}</span>
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
                    textAlign: "left", cursor: "pointer", padding: "14px 15px", borderRadius: 14,
                    background: on ? "#EAF4EE" : L.card,
                    border: `1.5px solid ${on ? L.teal : L.line}`,
                    boxShadow: on ? "0 6px 18px -10px rgba(14,107,87,0.4)" : "0 1px 2px rgba(20,39,31,0.04)",
                    transition: "all .14s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink }}>{s.label}</span>
                      <span style={{ fontFamily: sans, fontSize: 15, color: on ? L.teal : L.faint }}>{on ? "✓" : "+"}</span>
                    </div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: L.muted, marginTop: 4, lineHeight: 1.45 }}>{s.blurb}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: L.faint, marginTop: 7 }}>{s.count} companies tracked</div>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={saveScreens} disabled={!selected.size} style={{ ...darkBtn(11, "11px 20px", 15), opacity: selected.size ? 1 : 0.4 }}>
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
              <button onClick={connect} style={darkBtn(12, "14px 24px", 15)}>Connect brokerage →</button>
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
      {/* headline */}
      <div style={{ ...card({ padding: "22px 24px", marginBottom: 16, background: L.pine, border: "none" }) }}>
        {nothing ? (
          <div style={{ fontFamily: serif, fontSize: 23, letterSpacing: "-0.01em", color: "#F4FAF6" }}>No conflicts among the names we track.</div>
        ) : (
          <>
            <div style={{ fontFamily: sans, fontSize: 13, color: D.brassSoft, fontWeight: 600 }}>What clashes with your values</div>
            <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 4, color: "#F4FAF6", lineHeight: 1.15 }}>
              {summary.directConflictValueCents > 0 && <>{money(summary.directConflictValueCents)} held directly</>}
              {summary.directConflictValueCents > 0 && summary.fundConflictCount > 0 && <span style={{ color: "#8FB0A4" }}>, plus</span>}
              {summary.fundConflictCount > 0 && <> {summary.fundConflictCount} fund{summary.fundConflictCount === 1 ? "" : "s"} holding flagged companies</>}
            </div>
          </>
        )}
      </div>

      {summary.byFlag.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {summary.byFlag.map((f) => (
            <span key={f.key} style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, borderRadius: 20, padding: "6px 13px" }}>
              {f.label}{f.valueCents > 0 ? `: ${money(f.valueCents)}` : ""}{f.fundCompanies > 0 ? ` · ${f.fundCompanies} in funds` : ""}
            </span>
          ))}
        </div>
      )}

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
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {h.flags.map((f) => (
                  <div key={f.key} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <LFlagChip>{f.label}</LFlagChip>
                    <span style={{ fontFamily: sans, fontSize: 12.5, color: L.ink, lineHeight: 1.45 }}>{f.reason}</span>
                  </div>
                ))}
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
            const groups = groupByFlag(h.contains);
            return (
              <div key={h.account + h.symbol} style={card({ padding: "15px 17px", marginBottom: 10, borderLeft: `3px solid ${L.brass}` })}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div><span style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: L.ink }}>{h.symbol}</span><span style={{ fontFamily: sans, fontSize: 13, color: L.muted }}> · {h.description}</span></div>
                  <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: L.ink }}>{money(h.valueCents)}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 12, color: L.faint, marginTop: 2 }}>Tracks {h.fundBasis} — holds {h.contains.length} flagged companies</div>
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
const LFlagChip = ({ children }) => <span style={{ fontFamily: sans, fontSize: 11, fontWeight: 700, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, borderRadius: 6, padding: "2px 8px", flexShrink: 0, whiteSpace: "nowrap" }}>{children}</span>;

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
          border: `1px solid ${D.glassBorder}`, borderRadius: 11, padding: "12px 13px", outline: "none",
          backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }} />
    </label>
  );
}
const Muted = ({ children }) => <div style={{ fontFamily: sans, fontSize: 13.5, color: L.muted }}>{children}</div>;
const LErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: L.flag, background: L.flagBg, border: `1px solid ${L.flagBorder}`, padding: "10px 12px", borderRadius: 10 }}>{children}</div>;
const DarkErr = ({ children }) => <div style={{ marginTop: 12, fontFamily: sans, fontSize: 13, color: "#F2A98F", background: "rgba(238,120,86,0.13)", border: "1px solid rgba(238,120,86,0.34)", padding: "10px 12px", borderRadius: 10 }}>{children}</div>;

// Buttons
const mintBtn = () => ({
  backgroundImage: "linear-gradient(180deg, rgba(99,214,166,0.95), rgba(14,107,87,0.95))",
  color: "#06231A", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 12, padding: "12px 20px",
  fontFamily: sans, fontSize: 15, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 8px 24px -10px rgba(99,214,166,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
});
const brassBtn = (r = 12, pad = "14px 24px", fs = 15) => ({
  backgroundImage: "linear-gradient(180deg, #E7CE9E, #C9A16A)", color: "#241A0A",
  border: "1px solid rgba(255,255,255,0.3)", borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 8px 24px -10px rgba(216,182,126,0.6), inset 0 1px 0 rgba(255,255,255,0.45)",
});
// Solid pine button for the light theme.
const darkBtn = (r = 12, pad = "14px 24px", fs = 15) => ({
  background: L.pine, color: "#F1F7F3", border: "none", borderRadius: r, padding: pad,
  fontFamily: sans, fontSize: fs, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 8px 22px -12px rgba(14,58,46,0.7)",
});
const linkBtn = (color) => ({ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: 600, color });
