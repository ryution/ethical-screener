# Methodology — how Steward decides what to flag

This document defines every ethical screen ("flag") Steward can apply: what it means,
what counts as a violation (and what deliberately does **not**), how we detect it, and
example companies. It is the source of truth for the classification engine and the basis
for the public **Methodology** page.

> **Two audiences.** Sections 1–4 are written to be shown publicly, close to as-is — they
> explain our reasoning and honesty rules. Section 6 (*Implementation*) is internal build
> detail (data pipeline, models) and would be trimmed or summarized for the public page.

Status legend for each flag: **Live** = shipping today (curated and/or SIC). **Proposed**
= agreed for the next build. **Reframed** = live today, scope changing.

---

## 1. The principles behind every flag

These are non-negotiable — they are the product's whole premise.

1. **Plain, checkable facts — never scores.** Every flag is a factual claim about what a
   company does, with a one-sentence reason a person can verify. No opaque "ESG score,"
   no vibes. If we can't say why in one sentence, it isn't a flag.
2. **Harm and culpability, not the product category.** We flag documented harm or
   conduct, not the mere existence of a product. A company supplying hospital morphine is
   not "opioids"; a company with opioid-marketing litigation and DEA settlements is. A
   bank that makes consumer loans is not "predatory"; one with the terms and enforcement
   actions that define predatory lending is.
3. **Cite the source.** A flag derived from a company's filing carries a verbatim quote
   from that filing and a link to it. No supporting quote → no flag. The reason a user
   reads is the company's own words, not our paraphrase.
4. **Materiality threshold.** We flag a company for a **line of business**, not an
   incidental mention. The bar is a reported revenue segment or a principal activity the
   company describes as its own — not "sells cigarettes at the register," not a risk
   factor, not a competitor reference.
5. **You draw the lines.** We never decide what is unethical for you. You pick the flags;
   we only ever explain what is there. Several flags are direction-contested (see §5) —
   we present them neutrally.
6. **Under-claim, never over-claim.** A clean result means "none of the names we track,"
   never "audited pure." A fund we can't see inside is "not analyzed," never "clean." We
   name companies inside funds; we never fake a per-company dollar amount.
7. **Honest freshness.** Every dataset carries a "last updated" date, shown in the UI.
8. **Honest scope — U.S.-listed only.** Our universe is companies that file with the SEC
   (10-K filers on EDGAR). Foreign-listed companies — which file 20-F or nothing with the
   SEC — are **not analyzed**, and neither are most ADRs. An overseas name coming back
   empty means "out of our scope," never "clean." We say so in the report rather than
   imply coverage we don't have.

---

## 2. How detection works — three layers

A company is flagged if **any** layer flags it. When layers overlap, the more precise
reason wins (curated > filing-cited > industry-code).

| Layer | What it is | Strength | Limitation |
|---|---|---|---|
| **Curated** | Hand-maintained `ticker → reason` list, researched from each company's primary business. | Precise, defensible, well-known names. | Doesn't scale; can go stale. |
| **Industry code (SIC)** | The company's SEC-registered [SIC](https://www.sec.gov/info/edgar/siccodes.htm) code mapped to a flag. Free from EDGAR, covers ~10,400 filers. | Broad, automatic, deterministic. | One code per company — misses secondary lines and any flag that cuts *across* an industry. |
| **Filing-cited (10-K)** | EDGAR full-text search finds candidate filings; a model reads the relevant section and returns a **verified quote**. | Catches secondary lines and the "fuzzy" flags SIC can't see; produces a real citation. | Higher effort; run periodically, not per-request. |

**Reliability tags** used in the catalogue below:

- ⬤ **Clean SIC** — the industry code *is* the activity (oil refining, cigarettes). SIC is authoritative.
- ◐ **Noisy signal** — a code or keyword exists but is shared with unrelated businesses; requires the filing-cited layer with the materiality + culpability test.
- ○ **Curated / external** — no usable free code; relies on the curated list and/or filing text.

---

## 3. The flag catalogue

Each flag: **key** (stable id) · **definition** · **counts as a violation** · **does not count** · **detection** · **examples**.

### Environment

#### Fossil fuels — `fossil_fuels` · ⬤ · **Live**
- **Definition:** Extraction, refining, and transport of oil, gas, and coal.
- **Counts:** Oil & gas exploration/production, refining, oilfield services, pipelines, and gas utilities as a principal business.
- **Does not count:** A manufacturer that merely *consumes* fuel; a bank that lends to the sector (that's a different, deferred screen).
- **Detection:** SIC — coal 1220–1241, crude oil/gas 1311, oil/gas services 1381–1389, refining 2911, pipelines 4610–4619, gas utilities 4922–4925, petroleum wholesale 5171. Plus curated majors.
- **Examples:** ExxonMobil (XOM), Chevron (CVX), Kinder Morgan (KMI), Halliburton (HAL).

#### Thermal coal — `thermal_coal` · ⬤ · **Live**
- **Definition:** Mining of coal burned for power, and coal-fired generation. A stricter, climate-focused cut inside fossil fuels.
- **Counts:** Thermal/steam coal mining; utilities with material coal-fired generation.
- **Does not count:** Metallurgical (steelmaking) coal only, unless the user's line includes it — flagged distinctly if so.
- **Detection:** SIC 1220–1221 + full-text `"thermal coal"`, `"steam coal"` (≈650 filings). Confirm mining vs. incidental mention via the filing.
- **Examples:** Peabody Energy (BTU), Arch Resources, Alpha Metallurgical.

#### Deforestation & palm oil — `deforestation` · ◐ · **Proposed**
- **Definition:** Business tied to deforestation — palm oil, industrial logging, timberland conversion.
- **Counts:** Palm oil producers/traders; industrial logging; companies disclosing land conversion as an operation.
- **Does not count:** A packaged-goods company that merely *buys* palm oil, unless it's a disclosed sourcing controversy meeting the culpability bar.
- **Detection:** SIC lumber 2400s + full-text `"palm oil"`, `"timberland"` (≈520 filings) with materiality test.
- **Examples:** (largely non-US-listed; curated + ADR coverage.)

### Weapons & conflict

#### Weapons & defense — `weapons` · ◐ · **Live**
- **Definition:** Manufacture of military weapons and defense contracting.
- **Counts:** Defense primes, munitions, missiles, military aircraft/vehicles, defense electronics as a principal business.
- **Does not count:** Dual-use suppliers with no material defense segment; civilian aerospace with no military line.
- **Detection:** SIC ordnance 3480–3489, missiles/space 3760–3769, tanks 3795, guidance systems 3812. Note 3812 is broad (some civilian avionics) — confirm via segment. Plus curated primes.
- **Examples:** Lockheed Martin (LMT), RTX, General Dynamics (GD), Northrop Grumman (NOC).

#### Civilian firearms — `firearms` · ○ · **Live**
- **Definition:** Manufacture and large-scale retail of civilian guns and ammunition.
- **Counts:** Civilian firearm and ammunition makers; major firearms retailers.
- **Does not count:** Military-only ordnance (that's `weapons`); sporting-goods retailers where firearms are a minor line.
- **Detection:** Mostly **curated** — real makers register under generic ordnance SIC 3480 (Smith & Wesson, Sturm Ruger both do), which can't separate civilian from military, so SIC is unreliable here. Full-text `"firearms"` for candidates.
- **Examples:** Smith & Wesson (SWBI), Sturm Ruger (RGR), Olin/Winchester (OLN).

#### Nuclear weapons — `nuclear_weapons` · ○ · **Proposed**
- **Definition:** Participation in the nuclear-weapons supply chain (warheads, delivery systems, key components).
- **Counts:** Companies on recognized nuclear-weapons producer lists (e.g. ICAN / "Don't Bank on the Bomb") and those disclosing nuclear-weapons contracts.
- **Does not count:** Conventional defense with no nuclear-weapons work; **nuclear power** (deliberately excluded — see §5).
- **Detection:** **Curated** from published lists + full-text confirmation of nuclear-weapons contracts.
- **Examples:** subset of the defense primes with nuclear programs; curated.

### Social & human rights

#### Private prisons & immigration detention — `private_prisons` · ○ · **Reframed** (adds detention)
- **Definition:** For-profit incarceration, detention, and closely-tied services.
- **Counts:** Operators of private prisons and immigration-detention centers; for-profit detention as a principal business.
- **Does not count:** A general contractor that once built a facility; incidental government clients.
- **Detection:** **Curated** (operators register as REITs/contractors — GEO Group is SIC 1520, CoreCivic 6798, so SIC is blind) + full-text `"correctional facilities"`, `"immigration detention"` (the latter ≈30 filings, very clean).
- **Examples:** GEO Group (GEO), CoreCivic (CXW).

#### Surveillance & data brokers — `big_tech_surveillance` · ◐ · **Reframed** (adds data brokers)
- **Definition:** Business models built on large-scale collection and sale of personal data.
- **Counts:** Advertising built on personal-data profiling; data brokers that package and sell personal information; mass-surveillance analytics.
- **Does not count:** Software companies generally (same SIC as everyone), companies with a privacy breach but no data-driven business model.
- **Detection:** SIC 7370 is far too broad — relies on **curated** + full-text (`"personalized advertising"`, `"data broker"`, `"consumer data"`) with the business-model test.
- **Examples:** Meta (META), Alphabet (GOOGL/GOOG), Palantir (PLTR); data brokers (e.g. LiveRamp, Acxiom-type).

#### Predatory lending — `payday_lending` · ◐ · **Reframed** (culpability-based)
- **Definition:** High-cost consumer lending with predatory terms — payday, title, pawn, and subprime installment.
- **Counts:** Triple-digit-APR lending, title loans, and lenders with enforcement actions/consent orders defining the practice.
- **Does not count:** Ordinary consumer credit, prime installment lending, mainstream banks. (SIC 6141 "Personal Credit" sweeps these in — we narrow with the filing test.)
- **Detection:** SIC 6141 as a candidate net, then filing text (rates/terms, `"CFPB"`, consent orders) to confirm predatory terms. Plus curated.
- **Examples:** World Acceptance (WRLD), EZCORP (EZPW), Enova (ENVA), FirstCash (FCFS).

#### Forced labor & supply chain — `forced_labor` · ◐ · **Proposed**
- **Definition:** Documented forced labor or severe supply-chain human-rights violations.
- **Counts:** Companies with disclosed forced-labor findings, import bans, or UFLPA (Uyghur Forced Labor Prevention Act) enforcement tied to their operations/supply chain.
- **Does not count:** Boilerplate "we prohibit forced labor" policy language; generic supply-chain risk factors.
- **Detection:** Full-text `"forced labor"`, `"UFLPA"`, `"Uyghur"`, `"withhold release order"` — **only** where it describes an action against the company, not policy language. Materiality-heavy; strong Stage-2 required.
- **Examples:** case-by-case; driven by enforcement records.

### Health & vice

#### Tobacco & nicotine — `tobacco` · ⬤ · **Live**
- **Definition:** Cigarettes, cigars, vaping, and other nicotine products.
- **Counts:** Manufacturers and leaf suppliers as a principal business.
- **Does not count:** Retailers that stock tobacco among many goods.
- **Detection:** SIC 2100–2141. Plus curated.
- **Examples:** Altria (MO), Philip Morris International (PM), Turning Point Brands (TPB).

#### Alcohol — `alcohol` · ⬤ · **Live**
- **Definition:** Producers and wholesalers of beer, wine, and spirits.
- **Counts:** Brewing, winemaking, distilling, and alcohol wholesale.
- **Does not count:** Restaurants/retailers that serve alcohol; generic "Beverages" (SIC 2080) — we start at 2082 to avoid flagging Coca-Cola.
- **Detection:** SIC 2082–2085 + wholesale 5182. Plus curated.
- **Examples:** Anheuser-Busch InBev (BUD), Molson Coors (TAP), Constellation Brands (STZ).

#### Gambling — `gambling` · ○ · **Live**
- **Definition:** Casinos, sportsbooks, and betting platforms.
- **Counts:** Casino operators, sports-betting/iGaming, racetrack betting as a principal business.
- **Does not count:** Payment processors; hospitality companies with no gaming operation. (SIC 7990 is generic amusement — DraftKings registers there alongside gyms and arcades — so SIC is unreliable.)
- **Detection:** **Curated** + full-text `"casino"`, `"sportsbook"`, `"iGaming"`, `"wagering"` (≈290 filings for sportsbook) with the business test.
- **Examples:** DraftKings (DKNG), Las Vegas Sands (LVS), Caesars (CZR), Flutter (FLUT).

#### Adult entertainment — `adult` · ○ · **Live**
- **Definition:** Pornography and adult-content businesses.
- **Counts:** Adult content production/distribution; adult nightclubs as a principal business.
- **Does not count:** General media/streaming with incidental mature content.
- **Detection:** **Curated** (few pure-play public names; RCI registers as SIC 5812 "Eating Places") + full-text.
- **Examples:** RCI Hospitality (RICK).

#### Cannabis — `cannabis` · ⬤ · **Proposed** *(direction-contested)*
- **Definition:** Cultivation, processing, and sale of cannabis and cannabis products.
- **Counts:** Multi-state operators, cultivators, cannabis-derived product makers.
- **Does not count:** Hemp/CBD wellness only, if the user's line distinguishes it; pharma cannabinoids for medical use (flag separately if desired).
- **Detection:** Full-text `"cannabis"`, `"marijuana"` (≈3,800 filings) + SIC where present.
- **Examples:** Canopy Growth, Tilray, Green Thumb, Curaleaf.
- **Note:** Some users screen *against* cannabis (faith/vice); others specifically screen *for* it. Presented neutrally.

#### Opioid crisis — `opioids` · ◐ · **Live** *(culpability-based)*
- **Definition:** Documented culpability in the opioid epidemic — not the manufacture of legitimate pain medication.
- **Counts:** Opioid-marketing litigation, DEA enforcement, and settlements (manufacturers and distributors).
- **Does not count:** A company supplying medically-appropriate opioids (e.g. hospital morphine) with no misconduct record. **This is the defining example of the harm-not-category principle (§1.2).**
- **Detection:** Full-text `"opioid"` (≈2,500 filings) focused on the **Legal Proceedings** section — flag only on litigation/settlement/enforcement, cite that passage.
- **Examples:** implicated manufacturers and the big-three distributors (per public settlements); curated + cited.

### Animal welfare

#### Factory farming — `factory_farming` · ⬤ · **Live**
- **Definition:** Industrial animal agriculture and meat/poultry processing.
- **Counts:** Large-scale meat/poultry processing, industrial feedlots.
- **Does not count:** Plant-based food; small/pasture operations.
- **Detection:** SIC meat 2011/2013/2015, livestock 0211/0213. Plus curated.
- **Examples:** Tyson Foods (TSN), Hormel (HRL), BRF (BRFS).

#### Animal testing — `animal_testing` · ◐ · **Live**
- **Definition:** Cosmetics and contract research whose core business involves animal testing.
- **Counts:** Contract research orgs (CROs) with animal-study operations; cosmetics tied to animal testing.
- **Does not count:** Medical research where no animal testing is disclosed; the SIC 8731 "Commercial Research" code alone (shared with all R&D).
- **Detection:** **Curated** + full-text `"animal testing"`, `"preclinical"`, `"animal studies"` with the business test.
- **Examples:** Charles River Labs (CRL).

#### Fur & exotic leather — `fur` · ○ · **Proposed**
- **Definition:** Production or primary retail of animal fur and exotic-animal leather.
- **Counts:** Fur farming/processing; brands whose principal line is fur/exotic skins.
- **Does not count:** General apparel with incidental leather.
- **Detection:** **Curated** + full-text `"fur"`, `"exotic leather"`.
- **Examples:** curated (few pure-play public names).

### Faith-based

> Tradition- and direction-specific; presented neutrally and grouped so they don't
> clutter the default set. The seed of a larger opt-in faith pack over time.

#### Abortion & contraceptives — `abortion_contraceptives` · ○ · **Proposed**
- **Definition:** Manufacture of abortifacients or contraceptives, or provision of abortion services (Catholic / pro-life screen).
- **Counts:** Makers of abortifacient drugs or contraceptives as a material line; for-profit abortion providers.
- **Does not count:** Diversified pharma or hospital systems where it is not a disclosed principal activity (subject to the user's materiality threshold).
- **Detection:** **Curated** + full-text confirmation.

---

## 4. Contested-direction flags

Some flags are screened in **opposite directions** by different users. Our model —
"you draw the lines" — handles this: we describe the activity neutrally and let the user
decide. These include:

- **Cannabis** — vice/faith users screen out; others screen in.
- **Nuclear weapons / defense** — most screen out; some explicitly seek defense exposure.
- **Nuclear power** — *excluded as a flag* (low demand, genuinely contested as climate-positive).

---

## 5. What we deliberately excluded (and why)

- **Nuclear power** — contested (many consider it climate-positive); low screening demand.
- **For-profit education** — niche demand; keyword signal ("Title IV") is too noisy to be honest.
- **Sugar / ultra-processed food** — essentially no real divestment constituency.
- **Pork production** — a clean signal exists, but low priority for our audience; cut by choice.
- **Interest-based finance / Sharia** — the space is already well served (Zoya, Musaffa,
  IdealRatings), so we wouldn't be additive. The valuable part is the financial-ratio
  screen (debt ÷ market cap, interest income ÷ revenue vs. AAOIFI thresholds), which needs
  a fundamentals data feed we don't source; the only cheap piece (flag all conventional
  banks by SIC) is too blunt to ship. Deferred; revisit if we add a fundamentals source.
- **Deferred — no clean free signal:** mining/extractives, pesticides, conflict-minerals
  sourcing (Form SD is filed by 10,000+ companies and mostly reports "conflict-free," so
  filing ≠ violation), data-privacy breach events, and governance screens (executive pay,
  political lobbying, tax avoidance). These need external datasets we don't yet source.

---

## 6. Implementation (internal — trim for public page)

**Layered engine.** `server/lib/screens.js` (curated) and `server/lib/sic.js`
(SIC → flag) ship today; `server/lib/enriched.js` loads the SIC output. The filing-cited
layer writes a generated dataset (planned `server/generated/10k-flags.json`) loaded
alongside the others, unioned with precedence curated > filing-cited > SIC.

**Filing-cited pipeline (two-stage funnel):**
1. **Prefilter (free, no model):** EDGAR full-text search (`efts.sec.gov`) with a
   synonym phrase-set per flag, unioned with the SIC candidate set. Cast wide; do not
   apply materiality here.
2. **Classify (cheap model):** For each candidate, extract only the ±1 paragraph around
   the matched phrase + the revenue-segment note (never the whole 10-K). A Haiku pass
   returns `{flag, is_material, quote, revenue_context, confidence}`.

**False-positive guards:**
- **Programmatic quote verification** — reject any flag whose returned quote is not a
  verbatim substring of the source filing (kills hallucinated citations deterministically).
- **Affirmative-language test** — the quote must describe the company's own business, not
  a risk factor, competitor mention, or negation.
- **Revenue-segment grounding** — prefer flags backed by a reported segment/figure.
- **Section awareness** — a phrase appearing only in Risk Factors (not Item 1 Business)
  is down-weighted; culpability flags (opioids, forced labor) read Legal Proceedings.

**False-negative guards:**
- Synonym phrase-sets, not single keywords; union SIC + full-text nets; materiality
  applied only at Stage 2.

**Evaluation before scaling:** run the funnel over the curated list (a labeled gold set)
and measure precision/recall per flag; tune phrase-sets and prompts to a set bar before a
full-market run.

**Cost model:** classification runs via cheap-model subagents on the subscription plan
(no API), chunked across sessions to respect usage limits; latest-10-K-only, cached by
accession. Automated cron refresh of this layer is intentionally out of scope (it would
require API access); the SIC + holdings refresh remains automated.

---

*Every flag above resolves to a plain, checkable, cited fact. Where we can't meet that
bar for a company, we don't flag it — silence means "not one of the names we track,"
never "audited clean."*
