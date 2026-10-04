// Trade names employers use when filing with regulators.
//
// Exhibit 21 gives a company's LEGAL subsidiary names, but an employer filling in an OSHA
// form usually writes the name on the building. UPS files 1,139 courier establishments as
// plain "UPS"; Target files 2,300 stores as "Target". Neither string appears in either
// company's Exhibit 21, so the authoritative map misses their entire U.S. workforce.
//
// This is the curated layer that closes that gap, and it is deliberately small and manual.
// Every entry must be verified against the regulator data before it is added — check that
// the establishments sit in the industry and geography you would expect for that company.
// The verification is recorded beside each entry so a reviewer can repeat it.
//
// The bar for adding a name: it must be unambiguous on its own. "Target" earns its place
// because 2,300 discount department stores in 51 states can only be one company. A short
// or generic trade name that could belong to somebody else does not go in this file — a
// missed company costs us coverage, a wrong one puts real injury records on an innocent
// employer.

export const EMPLOYER_ALIASES = {
  // Meatpackers file under the brand on the plant, not the legal entity.
  TSN: ["Tyson Foods", "Tyson Fresh Meats", "Tyson"],
  HRL: ["Hormel Foods", "Hormel"],
  SFD: ["Smithfield Foods", "Smithfield"],
  // 1,139 courier and express delivery sites (NAICS 4921) across 52 states, 2025 ITA.
  UPS: ["UPS"],
  // 2,300 discount department stores (NAICS 4521) across 51 states, 2025 ITA.
  TGT: ["Target"],
  // 1,229 wholesale grocer sites (NAICS 4552) plus refrigerated warehousing, 49 states.
  COST: ["Costco Wholesale"],
  // 417M hours of courier operations (NAICS 4921); the airline files separately.
  FDX: ["Federal Express Corporation", "FedEx Express", "FedEx Ground"],
};

/** Flat [name, ticker] pairs, for building a lookup. */
export const aliasPairs = () =>
  Object.entries(EMPLOYER_ALIASES).flatMap(([ticker, names]) => names.map((n) => [n, ticker]));

// ── Facility-name aliases, for regulators that name SITES rather than employers ──
//
// EPA's ECHO names the building: "WALMART SUPERCENTER 1234", "COSTCO GASOLINE", "TARGET
// STORE T-0456". None of those starts with a name the company filed with the SEC, so
// Walmart matched 3 of its 4,902 facilities until this existed.
//
// These are matched as an ANCHORED PREFIX, not an exact key — a facility counts when its
// name begins with one of these on a word boundary. That is what keeps "ON TARGET" and
// "PRIMO KROGER" (a water-vending firm operating inside Kroger stores) out, while keeping
// "KROGER FUEL" and "COSTCO LOGISTICS" in.
//
// Each entry was read off the actual ECHO facility list, not guessed. Where a bare brand
// name could belong to a different public company it is deliberately NOT used: "Target"
// alone would reach Target Hospitality Corp, so Target is matched on its site prefixes.
export const FACILITY_ALIASES = {
  TSN:  ["Tyson"],
  HRL:  ["Hormel"],
  SFD:  ["Smithfield"],
  WMT:  ["Walmart", "Wal-Mart", "Wal Mart"],          // SUPERCENTER, NEIGHBORHOOD MARKET, DISTRIBUTION, FUEL
  COST: ["Costco"],                                    // WHOLESALE, LOGISTICS, GASOLINE, DEPOT, BUSINESS
  KR:   ["Kroger", "The Kroger"],                      // CO, STORE, FUEL, numbered sites
  TGT:  ["Target Store", "Target Corporation", "Target Distribution", "Target T"],
  AMZN: ["Amazon"],
  UPS:  ["UPS", "United Parcel"],
  FDX:  ["FedEx", "Federal Express"],
  HD:   ["Home Depot", "The Home Depot"],
};

/** Flat [prefix, ticker] pairs for building a facility-name lookup. */
export const facilityPairs = () =>
  Object.entries(FACILITY_ALIASES).flatMap(([ticker, names]) => names.map((n) => [n, ticker]));

// ── Registry names, for lobbying and campaign-finance filings ────────────────
//
// These registries name the company itself, so neither the OSHA employer names nor the
// EPA facility prefixes fit. Most companies are handled by stripping the legal form off
// their SEC name ("TARGET CORP" -> "Target Corporation"); these are the ones where that
// derivation produces the wrong string.
//
// Amazon is the clear case: its SEC name is "AMAZON COM INC", which derives to "AMAZON
// COM" and matches 6 lobbying filings. It files as "AMAZON.COM SERVICES LLC" and plain
// "AMAZON", and the correct query returns 104.
export const REGISTRY_ALIASES = {
  AMZN: ["Amazon.com", "Amazon"],
  // "Target" is a common word, and stripping the legal form off "TARGET CORP" produces
  // exactly that — which accepts TARGET HOSPITALITY CORP (a different listed company),
  // MARATHON TARGETS, BULLSEYE TARGET SYSTEMS and PIXELS ON TARGET. Name it in full.
  TGT:  ["Target Corporation"],
  COST: ["Costco Wholesale", "Costco"],
  UPS:  ["United Parcel Service"],
  FDX:  ["FedEx", "Federal Express"],
};
