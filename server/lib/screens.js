// The ethical screens — the substance of the analyzer.
//
// A screen is one moral flag a user can turn on (e.g. "Fossil fuels"). Each screen
// names the companies that violate it, by ticker, with a one-line reason a human can
// read. When a user connects a brokerage, we match their holdings against the screens
// they chose and show them what conflicts.
//
// HONESTY RULES, because this product's whole premise is not overstating:
//   1. Every flag is a plain, checkable factual claim about what the company does —
//      not a computed "ESG score", not a vibe. If we can't say why in one sentence, it
//      isn't in here.
//   2. This is a curated starter list of large, widely-held names, NOT a complete
//      holdings database. We say so in the UI. A clean result means "none of the names
//      we track", never "audited clean".
//   3. Funds (ETFs/mutual funds) hold hundreds of companies. We can flag a fund's
//      *stated strategy* (e.g. a fossil-fuel ETF) but we do NOT claim to see inside a
//      broad index fund. Look-through holdings data is a later, sourced feature.
//
// Sources for these classifications are the companies' own primary lines of business,
// which is deliberately the least arguable basis. Reasonable people draw these lines
// differently — which is why the user picks the flags, and we only ever explain.

/**
 * @typedef {Object} Screen
 * @property {string} key      stable id, stored in user config
 * @property {string} label    UI label
 * @property {string} blurb    one line describing what it flags
 * @property {Object<string,string>} tickers  TICKER -> reason (why it violates THIS screen)
 * @property {string[]} [fundStrategies]  fund tickers whose stated strategy conflicts
 */

/** @type {Screen[]} */
export const SCREENS = [
  {
    key: "fossil_fuels",
    label: "Fossil fuels",
    blurb: "Oil, gas, and coal extraction, and pipelines.",
    tickers: {
      XOM: "ExxonMobil — integrated oil & gas major.",
      CVX: "Chevron — integrated oil & gas major.",
      COP: "ConocoPhillips — oil & gas exploration and production.",
      SHEL: "Shell — integrated oil & gas major.",
      BP: "BP — integrated oil & gas major.",
      OXY: "Occidental Petroleum — oil & gas exploration and production.",
      SLB: "Schlumberger — oilfield services.",
      HAL: "Halliburton — oilfield services.",
      ENB: "Enbridge — oil & gas pipelines.",
      KMI: "Kinder Morgan — oil & gas pipelines.",
      MPC: "Marathon Petroleum — petroleum refining.",
      VLO: "Valero — petroleum refining.",
      PSX: "Phillips 66 — petroleum refining.",
      WMB: "Williams Companies — natural gas pipelines.",
      OKE: "ONEOK — natural gas gathering and pipelines.",
      DVN: "Devon Energy — oil & gas exploration and production.",
      FANG: "Diamondback Energy — oil & gas exploration and production.",
      EOG: "EOG Resources — oil & gas exploration and production.",
      HES: "Hess — oil & gas exploration and production.",
      BKR: "Baker Hughes — oilfield services.",
      CTRA: "Coterra Energy — oil & gas exploration and production.",
      TRP: "TC Energy — oil & gas pipelines.",
      EPD: "Enterprise Products — natural gas & petrochemical pipelines.",
      ET: "Energy Transfer — oil & gas pipelines.",
    },
  },
  {
    key: "weapons",
    label: "Weapons & defense",
    blurb: "Military weapons manufacturing and defense contracting.",
    tickers: {
      LMT: "Lockheed Martin — F-35 and F-22 fighter jets, THAAD and PAC-3 missile defense, Hellfire and Javelin missiles, and the Trident II submarine-launched nuclear ballistic missile.",
      RTX: "RTX (Raytheon) — Tomahawk and AMRAAM missiles, the Patriot air-defense system, and StormBreaker precision-guided bombs.",
      NOC: "Northrop Grumman — the B-21 Raider stealth bomber, the Sentinel intercontinental ballistic missile, and sustainment of the Minuteman III nuclear force.",
      GD: "General Dynamics — M1 Abrams tanks and Stryker combat vehicles, and (via Electric Boat) Columbia-, Ohio-, and Virginia-class nuclear submarines.",
      BA: "Boeing — F-15 and F/A-18 fighter jets, the AH-64 Apache attack helicopter, and Harpoon and SLAM missiles, alongside its commercial jets.",
      LHX: "L3Harris — tactical battlefield radios, electronic-warfare systems, and (via Aerojet Rocketdyne) missile and rocket propulsion.",
      HII: "Huntington Ingalls — the sole U.S. builder of aircraft carriers, and a builder of nuclear submarines and amphibious warships.",
      LDOS: "Leidos — systems and software for the Pentagon and intelligence agencies, including sensors, surveillance, and battle-management systems.",
      TXT: "Textron — Bell military helicopters (V-22 Osprey, UH-1), plus Textron Systems armored vehicles, munitions, and drones.",
      KTOS: "Kratos — target and attack drones, and hypersonic and missile-defense systems.",
      AVAV: "AeroVironment — Switchblade loitering munitions ('kamikaze drones') and small military reconnaissance UAVs.",
      BAESY: "BAE Systems — combat vehicles, naval guns, precision munitions, and F-35 electronic-warfare and airframe work.",
      DRS: "Leonardo DRS — infrared sensors, electro-optical targeting systems, and naval power and weapons-control systems.",
      NPK: "National Presto — 40mm ammunition, precision-guided munitions, and ordnance for the U.S. military (Defense segment).",
      BWXT: "BWX Technologies — nuclear reactors for U.S. Navy submarines and carriers, and operations across the U.S. nuclear-weapons complex.",
      AERG: "Applied Energetics — develops directed-energy (laser) weapons for defense use.",
    },
  },
  {
    key: "firearms",
    label: "Civilian firearms",
    blurb: "Manufacturers and large retailers of civilian guns and ammunition.",
    tickers: {
      SWBI: "Smith & Wesson — handguns, revolvers, and M&P-line pistols and AR-15-style rifles.",
      RGR: "Sturm Ruger — handguns, revolvers, and rifles, including AR-15-pattern rifles.",
      OLN: "Olin — Winchester-brand ammunition, and operator of the U.S. Army's Lake City small-arms ammunition plant.",
      VSTO: "Vista Outdoor — Federal, CCI, Remington, and Speer ammunition brands.",
      POWW: "AMMO Inc — rifle and handgun ammunition manufacturer.",
      AOUT: "American Outdoor Brands — shooting and hunting accessories, spun off from Smith & Wesson.",
    },
  },
  {
    key: "tobacco",
    label: "Tobacco & nicotine",
    blurb: "Cigarettes, cigars, vaping, and other nicotine products.",
    tickers: {
      MO: "Altria — cigarettes (Marlboro US) and vaping.",
      PM: "Philip Morris International — cigarettes and nicotine.",
      BTI: "British American Tobacco — cigarettes and nicotine.",
      TPB: "Turning Point Brands — smokeless and alternative tobacco.",
      UVV: "Universal Corp — leaf tobacco supplier.",
      IMBBY: "Imperial Brands — cigarettes and nicotine.",
      JAPAY: "Japan Tobacco — cigarettes and nicotine.",
    },
  },
  {
    key: "gambling",
    label: "Gambling",
    blurb: "Casinos, sportsbooks, and betting platforms.",
    tickers: {
      DKNG: "DraftKings — sports betting and iGaming.",
      LVS: "Las Vegas Sands — casinos.",
      WYNN: "Wynn Resorts — casinos.",
      MGM: "MGM Resorts — casinos and betting.",
      CZR: "Caesars Entertainment — casinos and sportsbook.",
      PENN: "PENN Entertainment — casinos and sportsbook.",
      FLUT: "Flutter — sports betting (FanDuel, Paddy Power).",
      BYD: "Boyd Gaming — casinos.",
      CHDN: "Churchill Downs — racetracks and betting.",
      RSI: "Rush Street Interactive — online casino and sportsbook.",
      GDEN: "Golden Entertainment — casinos and taverns.",
    },
  },
  {
    key: "alcohol",
    label: "Alcohol",
    blurb: "Producers of beer, wine, and spirits.",
    tickers: {
      BUD: "Anheuser-Busch InBev — beer.",
      TAP: "Molson Coors — beer.",
      STZ: "Constellation Brands — beer, wine, spirits.",
      DEO: "Diageo — spirits (Johnnie Walker, Guinness).",
      SAM: "Boston Beer — beer and hard seltzer.",
      "BF.B": "Brown-Forman — spirits (Jack Daniel's).",
    },
  },
  {
    key: "adult",
    label: "Adult entertainment",
    blurb: "Pornography and adult-content businesses.",
    tickers: {
      // Few pure-play public names; RCI (Rick's Cabaret / RCI Hospitality) is the clearest.
      RICK: "RCI Hospitality — adult nightclubs.",
    },
  },
  {
    key: "big_tech_surveillance",
    label: "Surveillance & data",
    blurb: "Business models built on large-scale personal-data collection.",
    tickers: {
      META: "Meta — targets advertising by profiling billions of users across Facebook, Instagram, and WhatsApp and tracking them around the web.",
      GOOGL: "Alphabet — targets advertising by profiling users across Search, YouTube, Android, Chrome, and third-party sites and apps.",
      GOOG: "Alphabet — targets advertising by profiling users across Search, YouTube, Android, Chrome, and third-party sites and apps.",
      PLTR: "Palantir — Gotham and Foundry platforms used for military targeting, policing, and immigration enforcement (ICE) surveillance.",
    },
  },
  {
    key: "factory_farming",
    label: "Factory farming",
    blurb: "Industrial animal agriculture and meat processing.",
    tickers: {
      TSN: "Tyson Foods — industrial-scale slaughter and processing of chicken, beef, and pork.",
      HRL: "Hormel — industrial slaughter and meatpacking of pork and turkey (Spam, packaged meats).",
      BRFS: "BRF — industrial-scale poultry and pork slaughter and processing.",
    },
  },
  {
    key: "animal_testing",
    label: "Animal testing",
    blurb: "Cosmetics and contract research involving animal testing.",
    tickers: {
      // Contract research orgs whose core business includes animal studies.
      CRL: "Charles River Labs — breeds and sells purpose-bred research animals, including beagles and non-human primates, and runs preclinical toxicity and safety studies on live animals for drug developers.",
    },
  },
  {
    key: "private_prisons",
    label: "Private prisons",
    blurb: "For-profit incarceration and detention.",
    tickers: {
      GEO: "GEO Group — operates private prisons and ICE immigration-detention centers, and electronically monitors migrants awaiting hearings (BI Inc.).",
      CXW: "CoreCivic — operates private prisons and ICE immigration-detention facilities under government contracts.",
    },
  },
  {
    key: "payday_lending",
    label: "Predatory lending",
    blurb: "High-interest payday, title, and subprime consumer lenders.",
    tickers: {
      WRLD: "World Acceptance — high-interest consumer installment loans.",
      EZPW: "EZCORP — pawn loans.",
      FCFS: "FirstCash — pawn and consumer finance.",
      ENVA: "Enova — online subprime consumer lending.",
      CURO: "CURO Group — payday and title loans.",
      OPRT: "Oportun — subprime consumer lending.",
      CACC: "Credit Acceptance — subprime auto lending; CFPB and state predatory-lending actions.",
      OMF: "OneMain — high-rate subprime consumer installment lending.",
    },
  },
  {
    key: "opioids",
    label: "Opioid crisis",
    blurb: "Culpability in the opioid epidemic — settlements, litigation, or enforcement (not legitimate pain medicine).",
    tickers: {
      TEVA: "Teva Pharmaceutical — opioid manufacturer; national opioid settlement.",
      MNK: "Mallinckrodt — opioid manufacturer; opioid-driven bankruptcy settlements.",
      MCK: "McKesson — opioid distributor; national opioid settlement.",
      CAH: "Cardinal Health — opioid distributor; national opioid settlement.",
      COR: "Cencora (AmerisourceBergen) — opioid distributor; national opioid settlement.",
    },
  },
  {
    key: "thermal_coal",
    label: "Coal",
    blurb: "Coal mining and coal-fired power generation.",
    tickers: {
      BTU: "Peabody Energy — thermal and metallurgical coal mining.",
      ARLP: "Alliance Resource Partners — thermal coal mining.",
      HNRG: "Hallador Energy — thermal coal mining and coal-fired power.",
    },
  },
  {
    key: "cannabis",
    label: "Cannabis",
    blurb: "Cultivation, processing, and sale of cannabis and cannabis products.",
    // Direction-contested: some users screen this out (faith/vice), others screen for it.
    // We only describe the business; you decide.
    tickers: {
      CGC: "Canopy Growth — Canadian licensed cannabis producer.",
      TLRY: "Tilray Brands — cannabis producer (medical and adult-use).",
      CRON: "Cronos Group — cannabis producer.",
      ACB: "Aurora Cannabis — cannabis producer.",
      SNDL: "SNDL — cannabis producer and retailer.",
      OGI: "OrganiGram — cannabis producer.",
      GTBIF: "Green Thumb Industries — U.S. multi-state cannabis operator.",
      CURLF: "Curaleaf — U.S. multi-state cannabis operator.",
      TCNNF: "Trulieve — U.S. multi-state cannabis operator.",
      CRLBF: "Cresco Labs — U.S. multi-state cannabis operator.",
      VRNO: "Verano Holdings — U.S. multi-state cannabis operator.",
      HCMC: "Healthier Choices Management — patented Q-Cup and Q-Unit concentrate vaporizers marketed for cannabis and CBD, plus related vaping-patent licensing. (Also flagged tobacco for its nicotine vape retail.)",
    },
  },
  {
    key: "fur",
    label: "Fur & exotic leather",
    blurb: "Production or primary retail of animal fur and exotic-animal leather.",
    // Genuinely small category: no US-listed pure-plays exist (fur farms and exotic
    // tanneries are private). The public exposure is via luxury houses (ADRs) that keep
    // fur or exotic skins as a material product line.
    tickers: {
      LVMUY: "LVMH (Louis Vuitton) — mink fur and exotic skins (crocodile, python, ostrich).",
      HESAY: "Hermès — controls crocodile/alligator tanneries for its exotic-leather goods.",
      SFRGF: "Salvatore Ferragamo — ongoing crocodile, alligator, python, and ostrich leather lines.",
      PPRUF: "Kering (Gucci) — python and crocodile leather goods (fur-free, but exotic skins remain).",
    },
  },
  {
    // A different kind of fact than the other screens: not what the company DOES, but a
    // verifiable government enforcement action against its CURRENT top executive. Kept to
    // a strict, narrow bar:
    //   1. The action is real and checkable — an actual SEC/DOJ/AG proceeding, not news
    //      "controversy" or a political dispute. Every reason states what happened and its
    //      resolution (settled without admission, convicted, etc.) — never implies more
    //      than what was actually adjudicated or admitted.
    //   2. The named executive must be CURRENTLY in that role. This list needs active
    //      maintenance — a departure, pardon, dismissal, or bankruptcy makes an entry
    //      stale and it should be removed. (Trevor Milton / Nikola was the leading
    //      candidate for this screen until research turned up all three: pardoned in
    //      2025, the SEC dismissed its own case against him, and Nikola itself went
    //      bankrupt and delisted in 2025 — a real-time example of why this list can't be
    //      "set and forget" like the others.)
    key: "executive_enforcement",
    label: "Leadership enforcement actions",
    blurb: "Current top executives who have faced real SEC, DOJ, or government fraud enforcement.",
    tickers: {
      TSLA: "Tesla — CEO Elon Musk settled SEC securities-fraud charges in 2018 over a misleading 'funding secured' go-private tweet; paid a $20M personal fine and stepped down as board chairman for three years, without admitting or denying wrongdoing.",
      IEP: "Icahn Enterprises — Chairman and controlling shareholder Carl Icahn settled SEC charges in 2024 for failing to disclose billions in personal margin loans secured by his IEP units; paid a $500K personal fine, without admitting or denying wrongdoing.",
      MSTR: "Strategy (formerly MicroStrategy) — Executive Chairman Michael Saylor and the company settled a DC Attorney General tax-fraud lawsuit in 2024 for $40M over falsely claiming residency outside DC to avoid paying DC income taxes; both denied wrongdoing.",
    },
  },
  {
    // Historical, not current-business, and deliberately NOT framed as "avoid this" —
    // informational context the user can weigh however they want. Two rules unique to
    // this screen:
    //   1. Every entry pairs the documented historical fact with whatever restitution or
    //      acknowledgment (or lack of it) is on the record, so it's never one-sided. Some
    //      companies here made early, substantial amends; at least one made none — both
    //      are stated as plainly as the history itself, not editorialized.
    //   2. Sourced to the serious historical record (USHMM's Holocaust Encyclopedia,
    //      historian-led studies commissioned by the companies themselves, the German
    //      government's "Remembrance, Responsibility and Future" restitution foundation's
    //      own public records) — not news-cycle "controversy." This is exactly the kind
    //      of narrow, well-documented case that a vaguer "controversial past" standard
    //      would NOT meet for most companies, which is why this list stays this short.
    key: "historical_forced_labor",
    label: "WWII-era forced labor",
    blurb: "Documented use of forced or slave labor during the Nazi era, by the company or a direct predecessor — shown alongside what restitution was made, if any.",
    tickers: {
      VWAGY: "Volkswagen — used an estimated 20,000 forced laborers, including concentration-camp prisoners, at its Wolfsburg plant during WWII. Became the first German company to fund restitution (1991), later folded into Germany's national forced-labor compensation program.",
      F: "Ford — its German subsidiary, Ford-Werke, used over 2,000 forced and slave laborers during WWII. A 2001 independent historian-led study (commissioned and funded by Ford) found the company did not profit from this labor; Ford called its use 'wrong and cannot be justified' and contributed $13M to Germany's restitution fund plus $4M to related human-rights research.",
      IBM: "IBM — its German subsidiary, Dehomag, supplied Hollerith tabulating machines used by the Nazi regime for population registration and camp logistics (documented in Edwin Black's 'IBM and the Holocaust'). IBM has not made a public apology or restitution payment specific to this; related lawsuits were dismissed in 2006 on statute-of-limitations grounds, not on the merits.",
      BAYRY: "Bayer — as a legal successor to IG Farben, which built and operated the Auschwitz-Monowitz forced-labor camp (~25,000 deaths). Bayer is a founding member of Germany's national forced-labor restitution foundation.",
      BASFY: "BASF — as a legal successor to IG Farben, which built and operated the Auschwitz-Monowitz forced-labor camp (~25,000 deaths). BASF contributed roughly €70M to Germany's national forced-labor restitution foundation.",
    },
  },
  {
    // Current, not historical — and a NARROW bar, same spirit as executive_enforcement:
    // only a named subsidiary actually placed on an official US government forced-labor
    // determination (DHS's UFLPA Entity List, or an active CBP Withhold Release Order),
    // not general supply-chain criticism or NGO reports. Researching this turned up a
    // structural finding worth recording: the ~200 UFLPA entities and ~60 active CBP WROs
    // are almost entirely private companies or foreign-exchange-only listings (Taiwan,
    // Shanghai, Shenzhen, Hong Kong) that a US brokerage can't actually hold — this list
    // is short because very few named entities are reachable through a US ticker at all,
    // not because forced-labor findings are rare.
    key: "forced_labor_supply_chain",
    label: "Supply-chain forced labor",
    blurb: "A subsidiary is named on a current US government forced-labor determination (UFLPA Entity List or CBP Withhold Release Order) — not the parent's own direct conduct, but real, active US enforcement against a company it controls.",
    tickers: {
      ZIJMY: "Zijin Mining Group — two Xinjiang subsidiaries (Xinjiang Zijin Nonferrous Metals; Xinjiang Zijin Zinc Industry) are on the US DHS's UFLPA Entity List for presumed Uyghur forced labor; a separate, 63%-owned Serbian subsidiary (Serbia Zijin Copper) is under an active US CBP Withhold Release Order (issued June 2026) for forced labor in copper production.",
      ZIJMF: "Zijin Mining Group — two Xinjiang subsidiaries (Xinjiang Zijin Nonferrous Metals; Xinjiang Zijin Zinc Industry) are on the US DHS's UFLPA Entity List for presumed Uyghur forced labor; a separate, 63%-owned Serbian subsidiary (Serbia Zijin Copper) is under an active US CBP Withhold Release Order (issued June 2026) for forced labor in copper production.",
    },
  },
  {
    // A different, WEAKER evidentiary tier than forced_labor_supply_chain, and labeled as
    // such — not a government finding, but the company's OWN disclosure in its own
    // published supplier-audit report. That's still a checkable, citable fact (a specific
    // report, a specific page, a specific number), just a lower bar than "a government
    // agency determined this." Most large electronics/apparel/auto companies with complex
    // supply chains (Apple, Nike, HP, Dell, Samsung, Intel, ...) publish something like
    // this; only Apple is researched and added so far. Always states what was found AND
    // what the company says it did about it — never just the violation count in isolation.
    key: "supplier_audit_violations",
    label: "Self-reported supply-chain violations",
    blurb: "Labor violations the company's own supplier audits found and disclosed in its own published report — a lower bar than a government finding, but the company's own admission, remediation included.",
    tickers: {
      AAPL: "Apple — its own 2025 supply-chain report disclosed 10 'Core Violations' (its most serious category) in 2024: nine from suppliers falsifying working-hours records, one a health-and-safety violation. Since 2008, Apple has had suppliers repay $34.5M in recruitment fees to over 37,700 workers under its zero-fees policy (recruitment fees are a recognized forced-labor risk indicator). Apple states it found no instances of forced labor in 2024 and no cases of underage labor in over five years.",
    },
  },
];

// Fast lookup: TICKER -> [{ key, label, reason }] across every screen, so matching a
// holding is O(1) per screen rather than scanning.
const _index = new Map();
const _names = new Map(); // ticker -> display name, parsed from the reason ("Name — …")
for (const s of SCREENS) {
  for (const [ticker, reason] of Object.entries(s.tickers)) {
    const upper = ticker.toUpperCase();
    if (!_index.has(upper)) _index.set(upper, []);
    _index.get(upper).push({ key: s.key, label: s.label, reason });
    if (!_names.has(upper)) _names.set(upper, reason.split(" — ")[0]);
  }
}

/** Human name for a ticker (from its screen reason), or the ticker itself. */
export const companyName = (t) => _names.get(String(t || "").toUpperCase()) || t;

export const SCREEN_KEYS = SCREENS.map((s) => s.key);
export const isScreenKey = (k) => SCREEN_KEYS.includes(k);
/** Every ticker any curated screen flags — the hand-curated half of the screened universe. */
export const SCREEN_TICKERS = [..._index.keys()];
const _labels = new Map(SCREENS.map((s) => [s.key, s.label]));
/** UI label for a screen key. */
export const screenLabel = (k) => _labels.get(k) || k;

/** All flags that apply to a ticker, filtered to the screens the user turned on. */
export function flagsFor(ticker, activeKeys) {
  if (!ticker) return [];
  const active = new Set(activeKeys);
  return (_index.get(ticker.toUpperCase()) || []).filter((f) => active.has(f.key));
}

/** Public catalogue for the UI (no reason strings — those attach to matches). */
export const screenCatalogue = SCREENS.map(({ key, label, blurb, tickers }) => ({
  key,
  label,
  blurb,
  count: Object.keys(tickers).length,
}));
