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
