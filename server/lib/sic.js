// SIC (Standard Industrial Classification) → our ethical screens.
//
// EDGAR tags every public filer with a 4-digit SIC code (free, no key). For industries
// where the code cleanly implies the activity, we can auto-flag thousands of companies
// without hand-curation — this is what turns a list of ~83 into most of the market.
//
// HONESTY: we only map SIC codes where the classification is a plain factual statement
// about the company's line of business. Fuzzy categories with no clean SIC —
// surveillance, gambling, private prisons, adult, animal testing — are NOT guessed here;
// they stay curated (screens.js) and get AI-classified over time. Membership by SIC is a
// fact about the company's registered industry, not a judgment we're making.

const inRange = (sic, lo, hi) => sic >= lo && sic <= hi;

// Tickers whose SEC-registered SIC code is simply wrong for the company, so the automatic
// mapping would produce a false positive. These are individual data errors at the source,
// not a fault in the code→screen map, so we deny-list the ticker rather than un-map a code
// that's correct for everyone else. Keep the reason with each entry.
//   RKDA — Arcadia Biosciences is an agricultural-food science company (GoodWheat, body care),
//          but SEC codes it 1311 "Crude Petroleum & Natural Gas" — a legacy registration
//          artifact. It is not an oil & gas company.
//   SCGX — Saxon Capital Group is a dormant SEC-reporting shell with no operations (latest
//          10-K says so; SEC now codes it 7374 data-processing). An old filing referenced an
//          energy subsidiary, but the company has no oil & gas business today.
export const SIC_FALSE_POSITIVES = new Set(["RKDA", "SCGX"]);

/** Screen keys implied by a company's SIC code (may be empty). */
export function screensForSic(sicRaw, ticker) {
  if (ticker && SIC_FALSE_POSITIVES.has(String(ticker).toUpperCase())) return [];
  const sic = Number(sicRaw);
  if (!sic) return [];
  const keys = new Set();

  // Fossil fuels — coal, oil & gas extraction, refining, pipelines, gas utilities.
  // NOTE: 2990 ("misc products of petroleum & coal") is deliberately EXCLUDED — it sweeps
  // in lubricant blenders (Valvoline) and specialty-fluid chemists (Quaker), which aren't
  // fossil-fuel producers. Those come through curated/filing only.
  if (inRange(sic, 1220, 1241) || sic === 1311 || inRange(sic, 1381, 1389) || sic === 2911 ||
      inRange(sic, 4610, 4619) || inRange(sic, 4922, 4925) || sic === 5171) {
    keys.add("fossil_fuels");
  }
  // Tobacco — cigarettes, cigars, chewing/smoking tobacco, stemming & redrying.
  if (inRange(sic, 2100, 2141)) keys.add("tobacco");

  // Alcohol — malt beverages, malt, wine & brandy, distilled spirits, and wholesale.
  // Deliberately starts at 2082, NOT 2080: the generic "Beverages" code (2080) sweeps in
  // non-alcoholic names like Coca-Cola. True alcohol producers coded 2080 (e.g. some
  // spirits conglomerates) are caught by the curated list instead — precision over recall.
  if (inRange(sic, 2082, 2085) || sic === 5182) keys.add("alcohol");

  // Civilian firearms & small-arms ammunition — the ONLY weapons-adjacent code narrow
  // enough to be a plain fact. (See below: the broad "weapons" codes are NOT used — this
  // repo tried SIC 3812 for weapons/defense and found it swept in civilian GPS makers
  // like Garmin alongside real contractors; weapons is curated + filing-cited instead.)
  if (sic === 3484 || sic === 3482) keys.add("firearms");

  // Factory farming — industrial meat/poultry processing and livestock feedlots.
  // NOTE: 2013 ("sausages & other prepared meat products") is deliberately EXCLUDED — it
  // catches downstream prepared-foods brands that buy meat and make meals (Mama's Creations,
  // Bridgford jerky, Wing Yip sauces), not companies that raise or slaughter animals. Those
  // aren't "factory farming" in the sense this screen means (the harm is upstream slaughter,
  // not prepared-food manufacturing). Meat packing (2011) and poultry slaughter (2015) stay.
  if (sic === 2011 || sic === 2015 || sic === 211 || sic === 213) {
    keys.add("factory_farming");
  }

  // DELIBERATELY NOT SIC-CLASSIFIED (codes too coarse to be a plain factual claim):
  //  • weapons — 3480-3489 / 3760-3769 / 3795 / 3812 mix real defense primes with consumer
  //    GPS (Garmin), space launch (Rocket Lab), Tasers (Axon), and medical/nav instruments.
  //    Real weapons makers come from the curated list + filing-cited 10-K reading instead.
  //  • payday_lending — 6141 ("personal credit") lumps student lenders (Sallie Mae, Nelnet),
  //    BNPL (Affirm), and card banks (Bread) with genuine subprime. Curated only.
  return [...keys];
}

/** A specific, human-readable reason for a SIC-derived flag (the company's registered line
 *  of business), replacing the old generic "Classified under X (SIC Y)". Returns null for
 *  codes we don't classify. */
export function reasonForSic(sicRaw) {
  const sic = Number(sicRaw);
  if (!sic) return null;
  if (inRange(sic, 1220, 1241)) return "Coal mining.";
  if (sic === 1311) return "Crude-oil and natural-gas exploration and production.";
  if (sic === 1381) return "Drills oil and gas wells (oilfield services).";
  if (sic === 1382) return "Oil and gas field exploration services.";
  if (inRange(sic, 1383, 1389)) return "Oil and gas field services.";
  if (sic === 2911) return "Petroleum refining.";
  if (inRange(sic, 4610, 4619)) return "Operates crude-oil and refined-product pipelines.";
  if (sic === 4922) return "Natural-gas transmission pipelines.";
  if (sic === 4923) return "Natural-gas transmission and distribution.";
  if (inRange(sic, 4924, 4925)) return "Natural-gas distribution utility.";
  if (sic === 5171) return "Wholesale petroleum bulk stations and terminals.";
  if (inRange(sic, 2100, 2141)) return "Manufactures tobacco or nicotine products.";
  if (inRange(sic, 2082, 2085)) return "Produces beer, wine, or spirits.";
  if (sic === 5182) return "Wholesale distribution of alcoholic beverages.";
  if (sic === 3482 || sic === 3484) return "Manufactures small arms or ammunition.";
  if (sic === 2011) return "Industrial meat packing and processing.";
  if (sic === 2015) return "Poultry slaughtering and processing.";
  if (sic === 211 || sic === 213) return "Industrial livestock and feedlot operations.";
  return null;
}

// Which screens EDGAR/SIC can classify, vs which stay curated + AI. Used in the UI so we
// can honestly say how each flag was determined.
export const SIC_CLASSIFIED = [
  "fossil_fuels", "tobacco", "alcohol", "firearms", "factory_farming",
];
export const CURATED_ONLY = [
  "gambling", "big_tech_surveillance", "adult", "animal_testing", "private_prisons",
  // Curated seeds + filing-cited (10-K) detection; no clean SIC signal we use today.
  "opioids", "thermal_coal",
  // Removed from SIC (codes too coarse — see screensForSic); curated + filing only.
  "weapons", "payday_lending",
  // Curated + filing-cited; no clean SIC signal.
  "cannabis", "fur",
  // Curated only — a different kind of fact than a SIC code (see screens.js for why).
  "executive_enforcement", "historical_forced_labor", "forced_labor_supply_chain",
  "supplier_audit_violations",
];
