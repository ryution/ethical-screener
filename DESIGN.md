# DESIGN.md — PlainStreet design system

A full specification of the visual system, derived from the CashPilot fintech reference.
Foundations, layout, and every component: anatomy, sizing, color, and states.

**Source and scope.** The system is modelled on a third-party product-design concept
("CashPilot", a Dribbble shot by its designer). We use it as a *visual* reference — palette,
type, shape, spacing, component patterns. We do not use its name, wordmark, sparkle logo,
illustrations, or copy, and nothing in this document should be read as license to. The
reference is a **mobile app**; PlainStreet is a **web app**, so this spec adapts screen
anatomy to a page and marks mobile-only components as such.

**Implementation.** Everything lives in [`src/Analyzer.jsx`](src/Analyzer.jsx) as inline
styles driven by token objects near the top of the file. No CSS framework, no CSS modules,
no component library. [`src/index.css`](src/index.css) holds only the page background, a
focus ring, and a reduced-motion rule.

> Measurements below are the spec values we standardize on, estimated proportionally from
> the reference at a 390pt-wide phone frame. They are targets, not pixel-measured truth.

---

## 1. Foundations

### 1.1 Color

The reference is a **near-black canvas with charcoal cards and two pastel accents**. There
is no light mode and no third accent.

#### Surfaces

| Role | Token | Value | Notes |
| --- | --- | --- | --- |
| Page | `L.bg` | `#0B0B0D` | Near-black, very slightly cool. Also set on `body` in `index.css`. |
| Card | `L.card` | `#17171A` | Default surface for content cards. |
| Raised | `A.raised` | `#202027` | One step up — a panel sitting *on* a card. |
| Border | `L.line` | `#26262B` | Hairline borders and dividers. |
| Soft fill | `L.lineSoft` | `#1F1F23` | Subtle fill behind small badges. |

The reference separates surfaces by **luminance, not by border**. Cards read as distinct
because `#17171A` sits above `#0B0B0D`, and borders are near-invisible hairlines that only
sharpen the edge. Don't add heavier borders to "define" a card — raise its fill instead.

#### Text

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary | `L.ink` / `D.ink` / `L.pine` | `#F4F4F5` | Headlines, values, primary copy. |
| Secondary | `L.muted` / `D.muted` | `#A1A1AA` | Body paragraphs, supporting copy. |
| Tertiary | `L.faint` / `D.faint` | `#71717A` | Captions, timestamps, inactive states. |

The reference uses a hard three-step hierarchy — white, mid-gray, dim-gray. Body paragraphs
under a headline are **secondary**, not primary; this is a big part of why the headlines
carry so much weight.

#### Accents

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary accent | `A.lav` | `#D3C8F8` | Buttons, links, progress fills, chart line. Selecting a *flag category* is coral, not lavender — see below. |
| Ink on lavender | `A.lavInk` | `#1B1030` | The only text color allowed on a lavender fill. |
| Positive accent | `A.lime` / `L.mint` / `L.good` | `#BEF264` | Positive deltas, live/on indicators, accent headline words. |
| Ink on lime | `A.limeInk` | `#17240A` | The only text color allowed on a lime fill. |

#### Semantic (reserved — never decorative)

| Role | Token | Value |
| --- | --- | --- |
| Ethical flag | `L.flag` | `#FCA5A5` |
| Flag fill / border | `L.flagBg` / `L.flagBorder` | `rgba(252,165,165,0.12)` / `rgba(252,165,165,0.28)` |
| Market up | *(hard-coded)* | `#4ADE80` |
| Market down | *(hard-coded)* | `#F87171` |

Coral covers the **whole flag lifecycle**, not just a flag badge: the category chips you
switch on to pick your values are coral too, so the category you select and the category
that comes back flagged are the same red end to end. It is still never decorative — if
something is coral it is about a flag.

#### The one hard rule

**A pastel used as a fill always carries its own near-black ink — never white.**
`A.lav` → `A.lavInk`. `A.lime` → `A.limeInk`.

This is the load-bearing rule of the whole system. White on `#D3C8F8` is ≈1.7:1 contrast —
unreadable, and the single fastest way to make the design look broken. In the reference,
every lavender and green surface has near-black text, including the buttons sitting on them.

#### Accent economy

The reference is disciplined about how *little* accent it uses. On a full screen there is
typically **one** accent-filled card, plus small accent badges. Everything else is charcoal
and gray. Two pastel cards adjacent to each other is the failure mode — it reads as
decoration rather than emphasis.

---

### 1.2 Typography

One family, **Plus Jakarta Sans** (Google Fonts, loaded in `index.html`), weights 300–800.
The reference uses a soft geometric sans with a double-story `a`, single-story `g`, and wide
apertures; Plus Jakarta Sans is the closest widely-available match.

There is **no second typeface**. Hierarchy comes from weight and size only.

```js
const sans = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const serif = sans;         // legacy alias — see §6
const serifDisplay = sans;  // legacy alias — see §6
```

#### Scale

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Hero H1 (web) | `clamp(34px, 6vw, 62px)` | 800 | `-0.04em` |
| Screen title | `clamp(30px, 5vw, 50px)` | 800 | `-0.035em` |
| Section H2 | `clamp(24px, 4vw, 38px)` | 700 | `-0.02em` |
| Card / row title | 18–20px | 700 | `-0.01em` |
| Big numeric value | 30–40px | 400–500 | `-0.02em` |
| Body | 14–16px | 400 | normal |
| Label / caption | 12–13px | 400–500 | normal |
| Badge / chip | 10–12.5px | 700 | `+0.04em`, often uppercase |

#### Rules from the reference

- **Tight negative tracking on large text** (`-0.02em` to `-0.04em`), normal tracking on
  body. This is most of what makes the headlines feel modern rather than generic.
- **Big numbers are set lighter than headlines** — weight 400–500, not 700+. A balance
  figure at weight 800 reads as shouting; the reference lets size alone do the work.
- **Accent words inside a headline.** The reference colors the second line of a title in
  lime (`Buying your` / `own house`). One colored fragment per headline, maximum.
- **Currency spacing.** The reference sets `$ 35,981.00` with a space after the symbol.
  Adopt it for large display figures only, not inline body text.
- **Middot separators** for metadata: `Total balance · All time`, `Individual · Real Estate`.

---

### 1.3 Spacing

An 4px base scale. Values that recur in the reference:

| Token | Use |
| --- | --- |
| 4 / 6 | Icon-to-label gap, badge padding (vertical) |
| 8 / 10 | Gap between cards in a grid, chip padding |
| 12 / 14 | Inside-card padding (compact), input padding |
| 16 / 20 | Screen edge padding, standard card padding |
| 24 / 28 | Gap between a title block and content |
| 32 / 40 | Gap between major sections |

**Screen edge padding is ~20px** on mobile. Cards are inset from the edge, not bled to it.

---

### 1.4 Radius

Rounded throughout — this is the system's most visible signature.

| Radius | Applies to | Count in file |
| --- | --- | --- |
| `999` (full pill) | Buttons, chips, badges, tags — anything with a short label | 14 |
| `20` | Cards, panels, dropdowns, accent callouts | 5 |
| `14` | Inputs, textareas, error boxes, small icon tiles | 6 |
| `12` | Dropdown list items | 1 |
| `"50%"` | Circular icon buttons, avatars | 1 |

Buttons are **full pills**, never slightly-rounded rectangles. Nested elements take a
smaller radius than their container (a 14px tile inside a 20px card), never equal or larger.

---

### 1.5 Elevation

Shadows are tuned for a **black** page — black at meaningful opacity, never a tinted
low-alpha shadow (which is invisible here).

```js
// card()
boxShadow: "0 1px 2px rgba(0,0,0,0.5), 0 10px 30px -18px rgba(0,0,0,0.8)"
// buttons
boxShadow: "0 10px 24px -14px rgba(0,0,0,0.7)"
```

The reference leans on **fill luminance** for depth far more than shadow. Shadow is a
secondary cue for floating elements (the FAB, dropdowns, primary CTAs) only.

---

## 2. Layout

### 2.1 Screen anatomy (reference / mobile)

Top to bottom, every reference screen follows the same skeleton:

```
┌─────────────────────────────┐
│ status bar                  │  system
├─────────────────────────────┤
│ ← Back        [logo]    [+] │  top bar        h ≈ 44
├─────────────────────────────┤
│ Title, two lines            │  title block    mt 20
│ Secondary body paragraph    │                 mt 12
├─────────────────────────────┤
│ ① Section heading           │  section        mt 32
│ ┌───────────┐ ┌───────────┐ │  content grid   gap 10
│ │  card     │ │  card     │ │
│ └───────────┘ └───────────┘ │
│ ② Section heading           │  section        mt 32
├─────────────────────────────┤
│  ⌂   ⌕   ✦   ▤   ⇄          │  tab bar        mobile only
└─────────────────────────────┘
```

**Top bar** is transparent over the page background — not a filled header. Left slot is
back/primary, right slot is a circular icon action, center is optional.

**Title block** is the anchor: a large two-line title, then a secondary-gray paragraph.
Never a title alone.

**Content** is a single column of full-width cards, or a 2-up grid of stat cards. The
reference never goes past two columns on mobile.

### 2.2 Web adaptation (PlainStreet)

| Reference (mobile) | PlainStreet (web) |
| --- | --- |
| Status bar + top bar | Sticky nav — wordmark left, links + pill CTA right |
| Screen title block | Hero H1 + secondary paragraph, centered, max-width ~720px |
| Single-column cards | Content column, `max-width: 800px`, centered |
| 2-up stat grid | `repeat(auto-fill, minmax(228px, 1fr))` |
| Bottom tab bar + FAB | **Not implemented** — no mobile-app chrome on web |

Page content is centered with a max width; cards do not stretch to the full viewport.

### 2.3 Content rhythm

The reference alternates **dense card blocks** with **breathing room**, and never runs more
than ~3 cards before a section heading or a title. When a list grows past that, it becomes a
scrollable section with its own header and count badge (`Goals ③`).

---

## 3. Components

### 3.1 Pill button

The primary interactive element. Full-round, flat, no gloss, no gradient.

| Variant | Fill | Text | Border | Shadow | Use |
| --- | --- | --- | --- | --- | --- |
| Primary | `A.lav` | `A.lavInk` | none | yes | Page-level CTA |
| Primary (bordered) | `A.lav` | `A.lavInk` | `1px A.lav` | no | Inline CTA |
| On-accent | `#FFFFFF` | `A.lavInk` | none | no | A button *inside* a pastel card |
| Ghost | transparent | `L.ink` | `1px L.line` | no | Secondary action |
| Link | none | `A.lav` | none | none | Tertiary |

Padding: `9px 18px` (compact) → `14px 24px` (standard) → `16px 32px` (large).
Weight 700, size 14–16px, tracking `-0.005em`.

**On-accent variant matters.** In the reference, the `Edit` and `Find out` buttons sit on
pastel cards and are filled **white** with dark text — not lavender-on-lavender. A primary
button inside an accent card must switch to the white variant or it disappears.

Helpers: `mintBtn()`, `brassBtn(r, pad, fs)`, `darkBtn(r, pad, fs)`, `linkBtn(color)`.

### 3.2 Circular icon button

40×40, `borderRadius: "50%"`, transparent or `L.card` fill, `1px L.line` border, icon in
`L.ink`. Used for back, close, add, notifications, and carousel arrows.

### 3.3 Card

Base container. `L.card` fill, `1px L.line` border, radius 20, standard shadow, padding
`14–22px`. Helper: `card(overrides)`.

### 3.4 Stat card

A labelled value, optionally with a delta badge and an action.

```
┌──────────────────────────┐
│ Label            (?)     │  12–13px, L.muted
│                          │
│ [+0.8%]                  │  optional delta badge
│ $ 21,231.00              │  30–34px, weight 400–500, L.ink
│                          │
│ ( Edit )                 │  optional pill button
└──────────────────────────┘
```

Laid out 2-up with a 10px gap. Label on top, value dominant, action at the bottom. The
optional `(?)` is a tertiary-gray help affordance beside the label.

**Accent variant:** identical structure, `A.lav` fill, `A.lavInk` for label *and* value, and
a white on-accent button. Used for the single most important stat on a screen — one per
screen, maximum.

### 3.5 Accent callout card

The reference's attention-getter: a pastel card that surfaces an insight or a prompt.

```
┌────────────────────────────────────┐
│ ✦ Label                        ×   │  icon + 13px label + dismiss
│ Headline question or statement     │  18–20px, weight 600–700
│                          ( Action )│  white pill button
└────────────────────────────────────┘
```

- Fill: `A.lime` or `A.lav`. All text in the matching `*Ink`.
- Radius 20, padding ~16px.
- Always dismissible (`×`, top-right, ink at ~60% opacity).
- The action button is the **white on-accent variant**, right-aligned.
- Lime = informational/positive prompt. Lavender = progress/status affirmation.

### 3.6 Badge / chip

| Type | Spec |
| --- | --- |
| Delta | Pill, `A.lime` fill, `A.limeInk` text, 10–11px, weight 700, padding `2px 8px` |
| Count | Circle or pill, `1px L.line` border, transparent, `L.ink` |
| Tag | Pill, `L.lineSoft` fill, `L.muted` text, 10–11px, uppercase, `+0.04em` |
| Flag | Pill, `L.flagBg` fill, `L.flagBorder` border, `L.flag` text |

### 3.7 List row with progress

The goals pattern — the reference's richest component.

```
┌──────────────────────────────────────┐
│ [🏠]  Buy a house                 ›  │  40×40 tile r14 · 18px title · chevron
│       Individual · Real Estate       │  12–13px, L.muted, middot separator
│       ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░   │  progress, 4px, r999
│       $ 51,385.00      $ 167,800.00  │  12–13px — current left, target right
└──────────────────────────────────────┘
```

- Card fill `L.card`, radius 20, padding ~14px, 10px gap between rows.
- Icon tile: 40×40, radius 14, holds an emoji or glyph.
- Progress track `L.line`, fill `A.lav`, height 4px, fully rounded.
- The value pair is left/right justified on one line — current vs. target.

### 3.8 Inset range chip

Inside the lavender callout: a white rounded bar with three values — min (dim), current
(bold, centered), max (dim). White fill, radius 14, `A.lavInk` text.

### 3.9 Area chart

- Line: 2px, `A.lav` or near-white.
- Fill: vertical gradient from `A.lav` at ~35% opacity down to transparent.
- No axes, no gridlines, no labels — the number above it carries the value.
- Height ~130px, full content width, sits directly under the headline figure.

**Not implemented.** PlainStreet has no chart component today.

### 3.10 Bottom tab bar + FAB — *mobile only, not implemented*

5 slots; active item gets a lighter circular pill behind it; the center is a raised lavender
circular FAB with a glow. Documented for completeness; PlainStreet is a web app and has no
equivalent.

### 3.11 Avatar

Circular, 32–36px, `1px L.line` border.

### 3.12 Input

`L.card` or translucent fill, `1px D.glassBorder`, radius 14, padding `12–14px`, `L.ink`
text, `L.faint` placeholder, `outline: none` (the focus ring comes from `index.css`).

---

## 4. Motion

The reference is a static mockup, so motion is our own restraint rather than a spec:

- Transitions ~120–140ms ease on color, border, and background for interactive states.
- No entrance animations, parallax, or scroll-jacking.
- The ticker marquee is the one continuous animation.
- `prefers-reduced-motion` collapses everything to 0.01ms (`index.css`).

---

## 5. Implementation status

| Component | Status |
| --- | --- |
| Color, type, radius, elevation foundations | ✅ Implemented |
| Pill buttons, cards, badges, chips, inputs | ✅ Implemented |
| Circular icon buttons | ✅ Implemented (carousel arrows) |
| Accent callout card | ⚠️ Partial — accent fills exist, no dedicated dismissible component |
| Stat card (accent variant) | ⚠️ Partial — no delta badge or `(?)` affordance |
| List row with progress | ❌ Not built |
| Area chart | ❌ Not built |
| Bottom tab bar + FAB | ❌ Not applicable (web) |

Existing components: `Canvas`, `HeroAnalyzer`, `HeroResult`, `HeroCTA`, `FundBreakdown`,
`FlagChip`, `FlagEvidence`, `HotNews`, `TickerTape`, `Methodology`, `LSection`,
`SectionHead`, `SubHead`, `Dashboard`, `Results`, `Auth`, `Splash`.

---

## 6. Legacy naming — read the value, not the name

The token names predate two full redesigns and are now actively misleading:

| Name | Actually is |
| --- | --- |
| `L.pine` | The **brightest** text color, `#F4F4F5` — not a dark green |
| `L.teal` | Lavender `#D3C8F8` |
| `L.mint` / `A.lime` | The same lime, duplicated |
| `D.brass` / `D.brassSoft` | Lavender |
| `brassBtn` / `mintBtn` / `darkBtn` | All three are lavender pills |
| `serif` / `serifDisplay` | Aliases pointing at `sans` |
| `D` vs `L` | Once "dark hero" vs "light body". Both dark now; the split is vestigial. |

Renaming means touching ~200 call sites for zero visual change, so **values are the source
of truth and names are noise**.

One caution on the font aliases: an *earlier* version had `serif` and `sans` resolving to
the same font **by accident**, which silently flattened every headline. The current aliasing
is deliberate and documented. Don't assume an alias is intentional just because it exists.

**Known cruft:** `mintBtn` / `brassBtn` / `darkBtn` are near-identical and could collapse
into one helper with variant flags. Don't add a fourth.

---

## 7. Gotchas

**`body` background is duplicated.** `index.css` sets `body { background: #0B0B0D }` and
`L.bg` carries the same value in JS, with no link between them. Change the page background
and you must change both, or you get a mismatched band under short pages. This already
caused a full-screen cream rectangle during a theme change.

**The focus ring lives in CSS, not JS.** `:focus-visible` in `index.css` uses `!important`
to beat the inline `outline: none` on inputs. It's lavender `#D3C8F8`. Change the accent,
change it too — it sat green through an entire theme cycle before anyone noticed.

**There is no light mode.** Don't add a `prefers-color-scheme` block expecting `L` to be
the light half. It isn't.

**Inverting a theme is where contrast bugs hide.** After any palette change, sweep for
dark-on-dark text programmatically rather than by eye — compute the WCAG ratio of every text
node against its resolved background and flag anything under 3:1. The last conversion passed
with zero real hits (the only match was a `<style>` tag's invisible text).

---

## 8. Checklist for a design change

- [ ] Used tokens, not raw hex
- [ ] Pastel fills carry their matching `*Ink` text color
- [ ] A button inside a pastel card uses the **white** on-accent variant
- [ ] At most one accent-filled card per screen
- [ ] Buttons use a helper and are full pills
- [ ] Nested radius is smaller than its container
- [ ] Shadows are black-based, not tinted
- [ ] Didn't repurpose coral (flags) or ticker green/red
- [ ] Changed `body` background in **both** `index.css` and `L.bg`, if applicable
- [ ] Contrast swept, no dark-on-dark
- [ ] `npm run lint` and `npm test` pass
- [ ] Checked at 375px as well as desktop
