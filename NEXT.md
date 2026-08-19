# NEXT — project status & what's left

Snapshot of where Steward (the ethical portfolio analyzer) stands, and the work ahead.
Living doc — update as things land. See [`PLAN.md`](PLAN.md) for the why, this for the what.

---

## What's built and working

The analyzer is live, tested end-to-end, and deployed-ready.

- **Read-only brokerage connection** (SnapTrade) — verified against the live sandbox with
  real test credentials. Connect → read holdings → never trade, never move money.
- **Ethical screens** — 12 flags, ~83 hand-curated companies, each with a plain,
  checkable one-line reason.
- **Fund look-through** — we look inside known index funds (VOO, SPY, VTI, QQQ, and the
  common mutual funds) and surface the flagged companies hiding inside, from the issuer's
  live daily holdings. VOO shows 48; VTI (total market) shows 117.
- **Live hero widget** — type any ticker, no login, see inside it instantly. Auto-loads
  VOO so a visitor immediately sees the S&P 500 surprise. Hits the real backend.
- **EDGAR enrichment layer** — free SEC data maps SIC industry codes to screens, scaling
  coverage toward the whole market (~10,400 filers) without hand-curation. Curated list
  stays precise; EDGAR fills breadth; a "last updated" stamp keeps it honest. The full
  ~10,400-filer run has been executed and shipped.
- **Live ETF holdings** — fund look-through no longer relies on hand-typed constituent
  lists. `scripts/fetch-holdings.mjs` pulls each index's holdings from the issuer's
  daily-published file (State Street SPDR: SPY for the S&P 500, SPTM for the total market),
  keeps only the names our screens flag, and overlays them via `holdings.js`. Curated
  lists remain the fallback; the Nasdaq-100 stays curated (no free live source).
- **Hands-off data freshness** — a monthly GitHub Action (`.github/workflows/refresh-data.yml`)
  re-runs both enrichment scripts, validates the output (`lint:data` + tests), and commits
  the regenerated files, which triggers a Vercel redeploy. No servers, no paid APIs.
- **Auth + security** — scrypt passwords, sessions, CSRF, rate limits, security headers,
  constant-time login, email verification/reset.
- **Design** — dark-green liquid-glass hero, light "paper" dashboard (two-tone so it
  doesn't blend).
- **49 passing tests**, clean build and lint; `npm run lint:data` validates the dataset.
- **Docs** — README, PLAN, SECURITY, compliance/REGULATORY all current.
- **Regulatorily clear** — no advice, no custody, no accounts: not an adviser,
  broker-dealer, or money transmitter.

---

## What's left

### Data depth — raises the product's ceiling
1. ~~**Run the full EDGAR enrichment**~~ — ✅ done. The full ~10,400-filer run has shipped;
   the monthly Action re-runs it to catch new filers.
2. ~~**Live ETF holdings**~~ — ✅ done via issuer-published holdings (`fetch-holdings.mjs`,
   State Street SPDR daily files). Still worth adding a *second* source for redundancy —
   if SPDR ever changes its file format or URL, the fetch falls back to curated lists, but
   a backup source (iShares needs a browser-style fetch; FMP free tier needs a key) would
   keep it live. Nasdaq-100 has no free live source yet.
3. **AI enrichment pass** — use an LLM to classify the fuzzy screens SIC can't
   (surveillance, gambling, private prisons) across the market. The "last updated" stamp is
   already in place.
4. **Faith screen data** — gather data first. Exclusion lists for Christian / Jewish /
   Islamic; real **Sharia** also needs financial-ratio data (debt, interest income) from a
   fundamentals source (IdealRatings / Musaffa / Zoya are the reference points).
5. **Symbol normalization** — class shares differ by broker (`BRK.B` vs `BRK-B` vs `BRKB`);
   normalize before matching so nothing slips through on real brokerage connections.

### Product / business
6. **Paid trading tier** — SnapTrade can execute where the broker allows. Sell it as a paid
   convenience the user drives: strictly "execute what you chose," **never "sell this."**
   Needs counsel sign-off on that line before launch (it's the one feature that can pull us
   toward adviser status).
7. **Deploy for real** — confirm the Render deployment; paste SnapTrade + Resend keys;
   verify a sending domain for email links.
8. **Rotate the SnapTrade test key** — it passed through chat; rotate before production.

### Polish / hardening
9. **Encrypt the stored SnapTrade `userSecret`** at rest (it reads holdings, can't move
   money, but still).
10. **2FA**, durable error monitoring (Sentry/Datadog), Terms of Service + Privacy Policy.

### Much later
11. **Giving rail** (RoundUp.org model — round-ups → monthly Stripe charge → third-party DAF)
    only once the analyzer has users. See [`compliance/REGULATORY.md`](compliance/REGULATORY.md).

---

## Highest-leverage next step

**Live ETF holdings + the full EDGAR run.** Together they take the product from "curated
demo" to "works across the real market" — the biggest jump available for the least risk.

## Notes / decisions locked in

- **Information only.** We never say "sell this." The output describes what's there and why.
  Trading, if added, is a paid convenience the user initiates — not a recommendation.
- **Honesty rules** (see PLAN.md): plain factual flags, funds we don't know are "not
  analyzed" (never "clean"), we name companies inside funds but never fake per-company
  dollar amounts, and index membership shifts are disclosed.
- **Free data sources only** — EDGAR (no key), issuer holdings, FMP free tier.
- **The platform needn't be a nonprofit** — RoundUp.org is a for-profit partnered with a
  separate foundation. Entity notes in PLAN.md.
