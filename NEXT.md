# NEXT — project status & what's left

Snapshot of where PlainStreet (the ethical portfolio analyzer) stands, and the work ahead.
Living doc — update as things land. See [`PLAN.md`](PLAN.md) for the why, this for the what.

---

## ⚠ Push status — read this first

Local `main` is **3 commits ahead of `origin/main`** and has been for a while:
`817067b`, `3067c4b`, `379d232` (nav fix, autocomplete/mobile-nav fix, full redesign).

Push has been failing with `fatal: unable to access '...': Recv failure: Connection reset
by peer` — GitHub specifically is unreachable from this machine while other sites (Google,
SEC.gov) load fine. Unclear if it's a local network/firewall/VPN issue or transient on
GitHub's end. **First thing to try in a new session: `git push origin main` again.**

Separately (already resolved, but worth knowing): an earlier push was rejected because the
git credential lacks `workflow` scope, which GitHub requires for *any* commit that touches
`.github/workflows/*`. Worked around by reverting that one file's content to match
`origin/main` exactly (it still says "Steward" in a comment + a User-Agent string — cosmetic
only). If a future change legitimately needs to touch that workflow file, it'll need a PAT
with `workflow` scope.

---

## What's built and working

- **20 ethical screens, 124+ curated companies**, plus ~301 EDGAR-classified and live
  filing-cited detection on top. Screens span the original set (fossil fuels, weapons,
  tobacco, gambling, surveillance, private prisons, predatory lending, factory farming,
  animal testing, cannabis, fur, opioids, coal...) plus four added this session:
  **Leadership enforcement actions** (current execs w/ real SEC/DOJ fraud actions — Tesla/
  Musk, Icahn Enterprises/Icahn), **WWII-era forced labor** (historical, always paired with
  restitution status — VW, Ford, IBM, Bayer, BASF), **Supply-chain forced labor** (US
  government UFLPA/CBP determinations — Zijin Mining), **Self-reported supply-chain
  violations** (a company's own audit disclosures — Apple).
- **Live fund holdings** two ways: this repo's own `holdings.js`/`fetch-holdings.mjs`
  (issuer daily files, basis-grouped) is what `funds.js` actually reads from; my earlier
  NPORT-P-based script (`scripts/fetch-fund-holdings.mjs`) was superseded during the merge
  and removed as dead code.
- **Read-only brokerage connection** (SnapTrade sandbox-verified), full auth (scrypt,
  sessions, CSRF, rate limits), **SnapTrade `userSecret` encrypted at rest** (AES-256-GCM,
  fail-soft without `ENCRYPTION_KEY` — see `server/lib/secretBox.js`).
- **Broker ticker-format normalization** (`BF-B`/`BFB`/`BF.B` all resolve correctly —
  `server/lib/symbols.js`), scoped narrowly (only remaps known tickers, never guesses).
- **Hot news carousel** — BBC + NYT headlines matched to tracked companies, headline/
  source/link only, never a summary we wrote (`server/lib/news.js`). Deliberately not
  Google News RSS — its license restricts reuse outside a personal feed reader.
- **Live ticker-tape marquee** — Yahoo Finance's unofficial chart endpoint, server-cached
  60s so request volume stays constant regardless of traffic (`server/lib/quotes.js`).
  Worth knowing: unofficial/undocumented endpoint, could break or get rate-limited without
  notice; fine for now, a real launch wants a licensed data provider.
- **Search autocomplete, shareable/bookmarkable ticker links, a quiet "dispute a flag"
  path**, a full public Methodology page (`#methodology`) documenting every screen.
- **Full redesign this session**: real serif (Source Serif 4) for headlines paired with
  Libre Franklin for body/UI — previously both tokens resolved to the *same* font, which
  was flattening the whole hierarchy. Deep navy/charcoal + muted gold replacing the old
  forest-green "Mission Green" theme (read more "outdoor brand" than "financial product").
  Hero copy sharpened to "Is your money **already** funding what you fight against? **Let's
  find out.**"
- **Nav fixed**: signed-in users previously had no way back to the public search short of
  signing out; the dashboard/public nav now round-trip properly. Mobile nav no longer
  overflows (email/Methodology link hidden below 480px, was crowding/overflowing).
- **61 passing tests**, 0 lint errors, `npm run lint:data` validates the dataset.
- **Regulatorily clear** — no advice, no custody, no accounts.

---

## Known issues, not yet fixed

- **Fund breakdown is a wall of text.** Look up a widely-held fund (e.g. VOO) and open a
  large flag group like "Fossil fuels · 24+" — it's a single comma-separated paragraph with
  a dotted underline on every company name. Fine for 2-3 names, genuinely hard to scan for
  20-40. Flagged, not started. Probably wants real chips/a grid instead of a run-on
  sentence, plus normalizing the casing (raw SEC names are ALL CAPS; curated names are
  Title Case — they currently sit side-by-side in the same list looking inconsistent).
- **Nazi-era / leadership-enforcement / forced-labor screens need periodic re-verification.**
  Unlike SIC-based facts, these can go stale in ways nothing auto-detects (a pardon, a
  dismissed case, a departed executive, a bankruptcy — this already happened once to a
  strong candidate, Trevor Milton/Nikola, during research for this feature). No automation
  for this yet; a human needs to re-check the `screens.js` entries periodically.

---

## What's left

### Data depth
1. **AI enrichment pass** for fuzzy screens (surveillance, gambling, private prisons) SIC
   can't classify — deliberately not attempted broadly yet; bulk-classifying obscure
   companies risks the exact "checkable fact, not a vibe" premise this product is built on.
   A *bounded* pass (e.g. just S&P 500 constituents, clearly labeled "AI-classified,
   unverified") was proposed but not built.
2. **Faith screen data** — needs data first. Real Sharia compliance needs financial-ratio
   data from a paid source (IdealRatings/Musaffa/Zoya); conflicts with the "free data only"
   rule already locked in. Christian/Jewish/Islamic exclusion lists are more tractable but
   need editorial care given the sensitivity.
3. **Second live-holdings source for redundancy** — if the issuer daily-file format/URL
   `fetch-holdings.mjs` depends on changes, it falls back to curated lists silently. A
   backup source would keep coverage live either way. Nasdaq-100 still has no free live
   source at all.

### Product / business (needs accounts/credentials/legal — not code)
4. **Paid trading tier** — needs counsel sign-off first; the one feature that risks pulling
   toward adviser status.
5. **Real deployment** — no live instance exists anywhere yet. Needs: hosting (Render/
   Vercel), a real Postgres (Supabase), SnapTrade + Resend production keys, a verified
   sending domain.
6. **Rotate the SnapTrade test key** — it passed through chat at some point; needs rotating
   via the SnapTrade dashboard before any real launch.

### Polish / hardening
7. **2FA**, durable error monitoring (Sentry/Datadog — there's a lightweight in-house
   fallback ring-buffer in `api.mjs` for now), Terms of Service + Privacy Policy (no draft
   exists yet).
8. **Mobile polish beyond the nav fix** — the nav overflow is fixed, but a fuller mobile
   pass (result-list reflow, tap targets, the "wall of text" fund breakdown especially)
   hasn't happened.

### Much later
9. **Giving rail** (RoundUp.org model) — only once the analyzer has real users.

---

## Notes / decisions locked in

- **Information only.** Never "sell this" — output describes what's there and why.
- **Honesty rules**: plain factual flags, "not analyzed" ≠ "clean," name companies inside
  funds but never fake per-company dollar amounts, restitution/response status always
  stated alongside a historical or enforcement-action flag (never one-sided).
- **Free data sources only**, with one exception under active reconsideration: the
  ticker-tape's Yahoo Finance endpoint is unofficial (see above) — accepted for now as
  low-stakes (public price data, not an editorial claim), flagged for a licensed provider
  before any real commercial launch.
- **The brand name is "PlainStreet"** (renamed from "Steward" this session, after briefly
  being "Verity"). If you see "Steward" anywhere outside the one workflow-file exception
  above, it's a miss — flag it.
- **The platform needn't be a nonprofit** — RoundUp.org is a for-profit partnered with a
  separate foundation. Entity notes in PLAN.md.
