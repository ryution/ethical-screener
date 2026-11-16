// Fund look-through — the point of the whole product for normal people.
//
// Most people don't hold Exxon directly; they hold an S&P 500 fund that holds Exxon.
// For a curated set of well-known index funds we know their constituents from public,
// published holdings, so we can look inside and surface the flagged companies.
//
// HONESTY RULES (this product's premise):
//   1. Only funds listed here are looked into. Anything else stays "not analyzed" —
//      we never guess at a fund's contents.
//   2. Each fund's actual constituent list, when we have it, comes from its latest SEC
//      NPORT-P filing (scripts/fetch-fund-holdings.mjs — free, official, no API key).
//      A fund without a fresh filing falls back to the hand-curated list below, so the
//      product still works if the fetch hasn't been run yet or a filing lookup fails.
//   3. We never attribute an exact dollar amount to a company *inside* a fund — that
//      needs per-name weights we don't have. We name the companies, not the dollars.
//
// The lists below are screened companies (from screens.js) that are established
// large-cap members of each index. Deliberately conservative: a name is included only
// where its membership is stable and well-known. They are the FALLBACK — when
// fetch-holdings.mjs has run, holdings.js overlays the issuer's live constituents.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { basketFor } from "./holdings.js";

// Every registered U.S. fund ticker, from the SEC (scripts/fetch-fund-tickers.mjs). Used
// only to recognize a fund we don't look inside, so it reads "not analyzed" rather than
// "we don't recognize this symbol".
const FUND_TICKERS_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "fund-tickers.json");
let REGISTERED_FUNDS = new Set();
try { if (existsSync(FUND_TICKERS_FILE)) REGISTERED_FUNDS = new Set(JSON.parse(readFileSync(FUND_TICKERS_FILE, "utf8")).symbols); } catch { /* recognition only */ }

// Screened companies that are established S&P 500 constituents.
const SP500 = [
  // fossil fuels
  "XOM", "CVX", "COP", "OXY", "SLB", "HAL", "KMI", "MPC", "VLO", "PSX",
  "WMB", "OKE", "DVN", "FANG", "EOG", "HES", "BKR", "CTRA",
  // weapons & defense
  "LMT", "RTX", "NOC", "GD", "BA", "LHX", "HII", "TXT", "LDOS",
  // tobacco
  "MO", "PM",
  // gambling
  "LVS", "MGM", "WYNN", "CZR",
  // alcohol
  "STZ", "TAP", "BF.B",
  // surveillance & data
  "META", "GOOGL", "GOOG", "PLTR",
  // factory farming
  "TSN", "HRL",
];

// Total US market holds everything in the S&P 500 plus smaller-cap screened names.
const TOTAL = [...new Set([...SP500,
  "SWBI", "RGR", "OLN", "VSTO", "POWW", "AOUT",   // firearms
  "DKNG", "PENN", "BYD", "CHDN", "RSI", "GDEN",   // gambling
  "GEO", "CXW",                                    // private prisons
  "WRLD", "EZPW", "FCFS", "ENVA",                  // predatory lending
  "TPB", "UVV",                                    // tobacco
  "KTOS", "AVAV",                                  // defense
  "SAM",                                           // alcohol
])];

// Nasdaq-100 is tech-heavy: few of our screened names, mostly the data/ad giants.
const NASDAQ100 = ["META", "GOOGL", "GOOG", "PLTR"];

// Large-cap growth split — the data/ad giants sit on the growth side.
const GROWTH = ["META", "GOOGL", "GOOG", "PLTR"];
// Large-cap value split — energy, defense, and tobacco are classic value sectors.
const VALUE = ["XOM", "CVX", "COP", "OXY", "SLB", "HAL", "MPC", "VLO", "PSX", "WMB", "OKE",
  "LMT", "RTX", "NOC", "GD", "LHX", "MO", "PM"];
// Health-care sector — mostly opioid culpability (makers + distributors).
const HEALTHCARE = ["JNJ", "MCK", "CAH", "COR"];

// Each fund tracks one BASIS. The screened constituents for a basis come, when we've
// fetched them, from the issuer's daily holdings (see holdings.js / fetch-holdings.mjs);
// otherwise from the conservative curated fallback above. Grouping by basis means one
// authoritative live source refreshes every fund that tracks it (SPY→S&P 500, SPTM→total,
// SPYG→growth, SPYV→value). The Nasdaq-100 comes from QQQ's SEC filing; the curated list
// is only used if that filing is missing.
const FALLBACK = { sp500: SP500, total: TOTAL, nasdaq100: NASDAQ100, large_growth: GROWTH, large_value: VALUE, healthcare: HEALTHCARE };
// Bases with no curated fallback (ESG / fossil-free / Dow / mid / small) exist only while
// the live basket is present; without it the fund is simply not in the catalogue, which
// the UI reports as "not analyzed" — never as an empty (i.e. clean-looking) fund.
const holdsFor = (basisKey) => basketFor(basisKey) || FALLBACK[basisKey] || null;

const CATALOGUE = {
  VOO:   { name: "Vanguard S&P 500 ETF",                    basis: "the S&P 500",             basisKey: "sp500" },
  SPY:   { name: "SPDR S&P 500 ETF",                        basis: "the S&P 500",             basisKey: "sp500" },
  IVV:   { name: "iShares Core S&P 500 ETF",                basis: "the S&P 500",             basisKey: "sp500" },
  SPLG:  { name: "SPDR Portfolio S&P 500 ETF",              basis: "the S&P 500",             basisKey: "sp500" },
  FXAIX: { name: "Fidelity 500 Index Fund",                 basis: "the S&P 500",             basisKey: "sp500" },
  VFIAX: { name: "Vanguard 500 Index Fund",                 basis: "the S&P 500",             basisKey: "sp500" },
  SWPPX: { name: "Schwab S&P 500 Index Fund",               basis: "the S&P 500",             basisKey: "sp500" },
  VTI: { name: "Vanguard Total Stock Market ETF", basis: "the total US market (CRSP US Total Market Index)", basisKey: "crsp_total" },
  ITOT: { name: "iShares Core S&P Total US Stock Market ETF", basis: "the total US market (S&P Total Market Index)", basisKey: "sp_total" },
  VTSAX: { name: "Vanguard Total Stock Market Index Fund", basis: "the total US market (CRSP US Total Market Index)", basisKey: "crsp_total" },
  SCHB: { name: "Schwab U.S. Broad Market ETF", basis: "the broad US market (Dow Jones U.S. Broad Stock Market Index)", basisKey: "dj_broad" },
  QQQ: { name: "Invesco QQQ Trust (Nasdaq-100)", basis: "the Nasdaq-100", basisKey: "nasdaq100" },
  XLV:   { name: "Health Care Select Sector SPDR",          basis: "the U.S. health-care sector", basisKey: "healthcare" },
  VUG: { name: "Vanguard Growth ETF", basis: "US large-cap growth (CRSP US Large Cap Growth Index)", basisKey: "crsp_growth" },
  IWF: { name: "iShares Russell 1000 Growth ETF", basis: "the Russell 1000 Growth", basisKey: "r1000_growth" },
  SCHG: { name: "Schwab U.S. Large-Cap Growth ETF", basis: "US large-cap growth (Dow Jones U.S. Large-Cap Growth Index)", basisKey: "dj_lc_growth" },
  VTV: { name: "Vanguard Value ETF", basis: "US large-cap value (CRSP US Large Cap Value Index)", basisKey: "crsp_value" },
  IWD: { name: "iShares Russell 1000 Value ETF", basis: "the Russell 1000 Value", basisKey: "r1000_value" },
  SCHV: { name: "Schwab U.S. Large-Cap Value ETF", basis: "US large-cap value (Dow Jones U.S. Large-Cap Value Index)", basisKey: "dj_lc_value" },
  // "Responsible" cuts of the S&P 500 — the question people actually ask is whether the
  // ESG version of their fund is clean. Live holdings only (see holdsFor).
  EFIV:  { name: "SPDR S&P 500 ESG ETF",                    basis: "the S&P 500 ESG index",   basisKey: "sp500_esg" },
  SPYX:  { name: "SPDR S&P 500 Fossil Fuel Reserves Free ETF", basis: "the S&P 500 ex-fossil-fuel-reserves index", basisKey: "sp500_ffree" },
  DIA:   { name: "SPDR Dow Jones Industrial Average ETF",   basis: "the Dow Jones Industrial Average", basisKey: "dow30" },
  SPMD:  { name: "SPDR Portfolio S&P 400 Mid Cap ETF",      basis: "the S&P MidCap 400",      basisKey: "midcap" },
  IJH:   { name: "iShares Core S&P Mid-Cap ETF",            basis: "the S&P MidCap 400",      basisKey: "midcap" },
  SPSM:  { name: "SPDR Portfolio S&P 600 Small Cap ETF",    basis: "the S&P SmallCap 600",    basisKey: "smallcap" },
  IJR:   { name: "iShares Core S&P Small-Cap ETF",          basis: "the S&P SmallCap 600",    basisKey: "smallcap" },
  // SPDR funds that track an index already covered above.
  MDY:   { name: "SPDR S&P MidCap 400 ETF Trust", basis: "the S&P MidCap 400", basisKey: "midcap" },
  SPTM: { name: "SPDR Portfolio S&P 1500 Composite Stock Market ETF", basis: "the total US market (S&P Composite 1500)", basisKey: "total" },
  // Sector, industry and dividend SPDRs, each with its own daily holdings file. Live
  // holdings only, like the ESG funds above.
  XLK: { name: "Technology Select Sector SPDR", basis: "U.S. large-cap technology stocks", basisKey: "xlk" },
  XLF: { name: "Financial Select Sector SPDR", basis: "U.S. large-cap financial stocks", basisKey: "xlf" },
  XLE: { name: "Energy Select Sector SPDR", basis: "U.S. large-cap energy stocks", basisKey: "xle" },
  XLY: { name: "Consumer Discretionary Select Sector SPDR", basis: "U.S. large-cap consumer discretionary stocks", basisKey: "xly" },
  XLP: { name: "Consumer Staples Select Sector SPDR", basis: "U.S. large-cap consumer staples stocks", basisKey: "xlp" },
  XLI: { name: "Industrial Select Sector SPDR", basis: "U.S. large-cap industrial stocks", basisKey: "xli" },
  XLB: { name: "Materials Select Sector SPDR", basis: "U.S. large-cap materials stocks", basisKey: "xlb" },
  XLU: { name: "Utilities Select Sector SPDR", basis: "U.S. large-cap utility stocks", basisKey: "xlu" },
  XLRE: { name: "Real Estate Select Sector SPDR", basis: "U.S. large-cap real estate stocks", basisKey: "xlre" },
  XLC: { name: "Communication Services Select Sector SPDR", basis: "U.S. large-cap communication services stocks", basisKey: "xlc" },
  XBI: { name: "SPDR S&P Biotech ETF", basis: "U.S. biotech stocks", basisKey: "xbi" },
  XPH: { name: "SPDR S&P Pharmaceuticals ETF", basis: "U.S. pharmaceutical stocks", basisKey: "xph" },
  XHE: { name: "SPDR S&P Health Care Equipment ETF", basis: "U.S. health care equipment stocks", basisKey: "xhe" },
  XHS: { name: "SPDR S&P Health Care Services ETF", basis: "U.S. health care services stocks", basisKey: "xhs" },
  XOP: { name: "SPDR S&P Oil & Gas Exploration & Production ETF", basis: "U.S. oil and gas producers", basisKey: "xop" },
  XES: { name: "SPDR S&P Oil & Gas Equipment & Services ETF", basis: "U.S. oil and gas equipment and services stocks", basisKey: "xes" },
  XME: { name: "SPDR S&P Metals & Mining ETF", basis: "U.S. metals and mining stocks", basisKey: "xme" },
  XRT: { name: "SPDR S&P Retail ETF", basis: "U.S. retail stocks", basisKey: "xrt" },
  XHB: { name: "SPDR S&P Homebuilders ETF", basis: "U.S. homebuilder stocks", basisKey: "xhb" },
  KRE: { name: "SPDR S&P Regional Banking ETF", basis: "U.S. regional bank stocks", basisKey: "kre" },
  KBE: { name: "SPDR S&P Bank ETF", basis: "U.S. bank stocks", basisKey: "kbe" },
  KIE: { name: "SPDR S&P Insurance ETF", basis: "U.S. insurance stocks", basisKey: "kie" },
  KCE: { name: "SPDR S&P Capital Markets ETF", basis: "U.S. capital markets stocks", basisKey: "kce" },
  XAR: { name: "SPDR S&P Aerospace & Defense ETF", basis: "U.S. aerospace and defense stocks", basisKey: "xar" },
  XSD: { name: "SPDR S&P Semiconductor ETF", basis: "U.S. semiconductor stocks", basisKey: "xsd" },
  XSW: { name: "SPDR S&P Software & Services ETF", basis: "U.S. software and services stocks", basisKey: "xsw" },
  XTL: { name: "SPDR S&P Telecom ETF", basis: "U.S. telecom stocks", basisKey: "xtl" },
  XTN: { name: "SPDR S&P Transportation ETF", basis: "U.S. transportation stocks", basisKey: "xtn" },
  XNTK: { name: "SPDR NYSE Technology ETF", basis: "large U.S.-listed technology stocks", basisKey: "xntk" },
  SDY: { name: "SPDR S&P Dividend ETF", basis: "U.S. stocks that have raised dividends for 20+ years", basisKey: "sdy" },
  SPYD: { name: "SPDR Portfolio S&P 500 High Dividend ETF", basis: "the 80 highest-yielding S&P 500 stocks", basisKey: "spyd" },
  // Funds read from their SEC Form N-PORT filings (scripts/fetch-nport.mjs). Holdings
  // are as of the filing's quarter end, which the page shows.
  QQQM: { name: "Invesco NASDAQ 100 ETF", basis: "the Nasdaq-100", basisKey: "nasdaq100" },
  VIGAX: { name: "Vanguard Growth Index Fund", basis: "US large-cap growth (CRSP US Large Cap Growth Index)", basisKey: "crsp_growth" },
  VVIAX: { name: "Vanguard Value Index Fund", basis: "US large-cap value (CRSP US Large Cap Value Index)", basisKey: "crsp_value" },
  VONG: { name: "Vanguard Russell 1000 Growth ETF", basis: "the Russell 1000 Growth", basisKey: "r1000_growth" },
  VONV: { name: "Vanguard Russell 1000 Value ETF", basis: "the Russell 1000 Value", basisKey: "r1000_value" },
  SPYG: { name: "SPDR Portfolio S&P 500 Growth ETF", basis: "the S&P 500 Growth Index", basisKey: "large_growth" },
  IVW: { name: "iShares S&P 500 Growth ETF", basis: "the S&P 500 Growth Index", basisKey: "large_growth" },
  VOOG: { name: "Vanguard S&P 500 Growth ETF", basis: "the S&P 500 Growth Index", basisKey: "large_growth" },
  SPYV: { name: "SPDR Portfolio S&P 500 Value ETF", basis: "the S&P 500 Value Index", basisKey: "large_value" },
  IVE: { name: "iShares S&P 500 Value ETF", basis: "the S&P 500 Value Index", basisKey: "large_value" },
  VOOV: { name: "Vanguard S&P 500 Value ETF", basis: "the S&P 500 Value Index", basisKey: "large_value" },
  // Same 500 companies as SPY, but each one is an equal slice of the fund, so its weights
  // come from the count rather than from SPY's file.
  RSP: { name: "Invesco S&P 500 Equal Weight ETF", basis: "the S&P 500", basisKey: "sp500", equalWeight: true },
  FSKAX: { name: "Fidelity Total Market Index Fund", basis: "the total US market (Dow Jones U.S. Total Stock Market Index)", basisKey: "fid_total" },
  FZROX: { name: "Fidelity ZERO Total Market Index Fund", basis: "the total US market (Fidelity U.S. Total Investable Market Index)", basisKey: "fzrox" },
  SWTSX: { name: "Schwab Total Stock Market Index Fund", basis: "the total US market (Dow Jones U.S. Total Stock Market Index)", basisKey: "swtsx" },
  IWB: { name: "iShares Russell 1000 ETF", basis: "the Russell 1000", basisKey: "russell1000" },
  VONE: { name: "Vanguard Russell 1000 ETF", basis: "the Russell 1000", basisKey: "russell1000" },
  IWM: { name: "iShares Russell 2000 ETF", basis: "the Russell 2000", basisKey: "russell2000" },
  VTWO: { name: "Vanguard Russell 2000 ETF", basis: "the Russell 2000", basisKey: "russell2000" },
  IWV: { name: "iShares Russell 3000 ETF", basis: "the Russell 3000", basisKey: "russell3000" },
  VTHR: { name: "Vanguard Russell 3000 ETF", basis: "the Russell 3000", basisKey: "russell3000" },
  IWR: { name: "iShares Russell Mid-Cap ETF", basis: "the Russell Midcap", basisKey: "russell_mid" },
  VV: { name: "Vanguard Large-Cap ETF", basis: "US large caps (CRSP US Large Cap Index)", basisKey: "crsp_large" },
  VO: { name: "Vanguard Mid-Cap ETF", basis: "US mid caps (CRSP US Mid Cap Index)", basisKey: "crsp_mid" },
  VB: { name: "Vanguard Small-Cap ETF", basis: "US small caps (CRSP US Small Cap Index)", basisKey: "crsp_small" },
  VXF: { name: "Vanguard Extended Market ETF", basis: "US stocks outside the S&P 500", basisKey: "crsp_ext" },
  SCHX: { name: "Schwab U.S. Large-Cap ETF", basis: "US large caps (Dow Jones U.S. Large-Cap Index)", basisKey: "dj_lc" },
  SCHM: { name: "Schwab U.S. Mid-Cap ETF", basis: "US mid caps (Dow Jones U.S. Mid-Cap Index)", basisKey: "dj_mc" },
  SCHA: { name: "Schwab U.S. Small-Cap ETF", basis: "US small caps (Dow Jones U.S. Small-Cap Index)", basisKey: "dj_sc" },
  MGK: { name: "Vanguard Mega Cap Growth ETF", basis: "the largest US growth stocks (CRSP US Mega Cap Growth Index)", basisKey: "crsp_mega_growth" },
  SCHD: { name: "Schwab U.S. Dividend Equity ETF", basis: "US dividend stocks (Dow Jones U.S. Dividend 100 Index)", basisKey: "schd" },
  VIG: { name: "Vanguard Dividend Appreciation ETF", basis: "US stocks with 10+ years of dividend growth", basisKey: "vig" },
  VYM: { name: "Vanguard High Dividend Yield ETF", basis: "US high-dividend stocks (FTSE High Dividend Yield Index)", basisKey: "vym" },
  DGRO: { name: "iShares Core Dividend Growth ETF", basis: "US dividend-growth stocks (Morningstar index)", basisKey: "dgro" },
  DVY: { name: "iShares Select Dividend ETF", basis: "US high-dividend stocks (Dow Jones U.S. Select Dividend Index)", basisKey: "dvy" },
  HDV: { name: "iShares Core High Dividend ETF", basis: "US high-dividend stocks (Morningstar Dividend Yield Focus Index)", basisKey: "hdv" },
  NOBL: { name: "ProShares S&P 500 Dividend Aristocrats ETF", basis: "S&P 500 stocks with 25+ years of dividend increases", basisKey: "nobl" },
  DGRW: { name: "WisdomTree U.S. Quality Dividend Growth Fund", basis: "US dividend-growth stocks (WisdomTree index)", basisKey: "dgrw" },
  VGT: { name: "Vanguard Information Technology ETF", basis: "US technology stocks (MSCI index)", basisKey: "vgt" },
  VHT: { name: "Vanguard Health Care ETF", basis: "US health care stocks (MSCI index)", basisKey: "vht" },
  VNQ: { name: "Vanguard Real Estate ETF", basis: "US real estate stocks (MSCI index)", basisKey: "vnq" },
  VFH: { name: "Vanguard Financials ETF", basis: "US financial stocks (MSCI index)", basisKey: "vfh" },
  VDE: { name: "Vanguard Energy ETF", basis: "US energy stocks (MSCI index)", basisKey: "vde" },
  VCR: { name: "Vanguard Consumer Discretionary ETF", basis: "US consumer discretionary stocks (MSCI index)", basisKey: "vcr" },
  VDC: { name: "Vanguard Consumer Staples ETF", basis: "US consumer staples stocks (MSCI index)", basisKey: "vdc" },
  VIS: { name: "Vanguard Industrials ETF", basis: "US industrial stocks (MSCI index)", basisKey: "vis" },
  VAW: { name: "Vanguard Materials ETF", basis: "US materials stocks (MSCI index)", basisKey: "vaw" },
  VPU: { name: "Vanguard Utilities ETF", basis: "US utility stocks (MSCI index)", basisKey: "vpu" },
  VOX: { name: "Vanguard Communication Services ETF", basis: "US communication services stocks (MSCI index)", basisKey: "vox" },
  SMH: { name: "VanEck Semiconductor ETF", basis: "the 25 largest US-listed chip companies", basisKey: "smh" },
  SOXX: { name: "iShares Semiconductor ETF", basis: "US-listed semiconductor stocks (NYSE index)", basisKey: "soxx" },
  IBB: { name: "iShares Biotechnology ETF", basis: "US-listed biotech stocks (Nasdaq index)", basisKey: "ibb" },
  IYW: { name: "iShares U.S. Technology ETF", basis: "US technology stocks (Dow Jones index)", basisKey: "iyw" },
  IHI: { name: "iShares U.S. Medical Devices ETF", basis: "US medical device stocks", basisKey: "ihi" },
  ITA: { name: "iShares U.S. Aerospace & Defense ETF", basis: "US aerospace and defense stocks (Dow Jones index)", basisKey: "ita" },
  ITB: { name: "iShares U.S. Home Construction ETF", basis: "US homebuilder stocks (Dow Jones index)", basisKey: "itb" },
  PPA: { name: "Invesco Aerospace & Defense ETF", basis: "US aerospace and defense stocks (SPADE index)", basisKey: "ppa" },
  JETS: { name: "U.S. Global Jets ETF", basis: "airline stocks", basisKey: "jets" },
  USMV: { name: "iShares MSCI USA Min Vol Factor ETF", basis: "lower-volatility US stocks (MSCI index)", basisKey: "usmv" },
  QUAL: { name: "iShares MSCI USA Quality Factor ETF", basis: "US quality stocks (MSCI index)", basisKey: "qual" },
  MTUM: { name: "iShares MSCI USA Momentum Factor ETF", basis: "US momentum stocks (MSCI index)", basisKey: "mtum" },
  SPLV: { name: "Invesco S&P 500 Low Volatility ETF", basis: "the 100 least volatile S&P 500 stocks", basisKey: "splv" },
  JEPI: { name: "JPMorgan Equity Premium Income ETF", basis: "an actively managed portfolio of US stocks", basisKey: "jepi" },
  JEPQ: { name: "JPMorgan Nasdaq Equity Premium Income ETF", basis: "an actively managed portfolio of Nasdaq-100 stocks", basisKey: "jepq" },
  COWZ: { name: "Pacer US Cash Cows 100 ETF", basis: "100 US stocks with high free cash flow", basisKey: "cowz" },
  MOAT: { name: "VanEck Morningstar Wide Moat ETF", basis: "US stocks Morningstar rates as having a wide moat", basisKey: "moat" },
  ARKK: { name: "ARK Innovation ETF", basis: "ARK's actively managed innovation picks", basisKey: "arkk" },
  ARKG: { name: "ARK Genomic Revolution ETF", basis: "ARK's actively managed genomics picks", basisKey: "arkg" },
  ARKW: { name: "ARK Next Generation Internet ETF", basis: "ARK's actively managed internet picks", basisKey: "arkw" },
  ARKQ: { name: "ARK Autonomous Technology & Robotics ETF", basis: "ARK's actively managed robotics picks", basisKey: "arkq" },
  ARKF: { name: "ARK Fintech Innovation ETF", basis: "ARK's actively managed fintech picks", basisKey: "arkf" },
  ESGU: { name: "iShares ESG Aware MSCI USA ETF", basis: "US stocks weighted toward higher ESG ratings (MSCI index)", basisKey: "esgu" },
  ESGV: { name: "Vanguard ESG U.S. Stock ETF", basis: "US stocks after ESG exclusions (FTSE US All Cap Choice Index)", basisKey: "esgv" },
  SUSA: { name: "iShares MSCI USA ESG Select ETF", basis: "US stocks with high ESG ratings (MSCI ESG Select Index)", basisKey: "susa" },
  DSI: { name: "iShares MSCI KLD 400 Social ETF", basis: "400 US stocks picked on ESG ratings (MSCI KLD 400 Social Index)", basisKey: "dsi" },
  VFTAX: { name: "Vanguard FTSE Social Index Fund", basis: "US stocks after social screens (FTSE4Good US Select Index)", basisKey: "vftax" },
};

// Which funds count as alternatives to each other. A broad S&P 500 fund is set against
// other broad funds and a tech fund against tech funds: a 25-stock chip fund held in place
// of the whole market is a different investment, not an alternative to it. Every fund in
// the catalogue is in exactly one group (server/test/alternatives.test.mjs checks).
export const FUND_GROUPS = [
  { key: "broad", label: "Broad US market", tickers: "VOO SPY IVV SPLG FXAIX VFIAX SWPPX RSP VTI ITOT VTSAX SCHB SPTM FSKAX FZROX SWTSX IWB VONE IWV VTHR VV SCHX DIA EFIV SPYX ESGU ESGV SUSA DSI VFTAX USMV QUAL MTUM SPLV MOAT".split(" ") },
  { key: "growth", label: "Growth", tickers: "QQQ QQQM VUG VIGAX IWF VONG SCHG SPYG IVW VOOG MGK".split(" ") },
  { key: "value", label: "Value", tickers: "VTV VVIAX IWD VONV SCHV SPYV IVE VOOV COWZ".split(" ") },
  { key: "dividend", label: "Dividends and income", tickers: "SCHD VIG VYM DGRO DVY HDV NOBL DGRW SDY SPYD JEPI JEPQ".split(" ") },
  { key: "midsmall", label: "Mid and small caps", tickers: "SPMD IJH MDY SPSM IJR IWM VTWO IWR VO VB VXF SCHM SCHA".split(" ") },
  { key: "tech", label: "Technology", tickers: "XLK VGT IYW XNTK XSW SMH SOXX XSD".split(" ") },
  { key: "health", label: "Health care", tickers: "XLV VHT XBI IBB XPH XHE XHS IHI".split(" ") },
  { key: "financials", label: "Financials", tickers: "XLF VFH KRE KBE KIE KCE".split(" ") },
  { key: "energy", label: "Energy", tickers: "XLE VDE XOP XES".split(" ") },
  { key: "consumer", label: "Consumer", tickers: "XLY VCR XLP VDC XRT".split(" ") },
  { key: "industrials", label: "Industrials and defense", tickers: "XLI VIS XAR ITA PPA XTN JETS".split(" ") },
  { key: "materials", label: "Materials and mining", tickers: "XLB VAW XME".split(" ") },
  { key: "realestate", label: "Real estate and homebuilders", tickers: "XLRE VNQ XHB ITB".split(" ") },
  { key: "utilities", label: "Utilities", tickers: "XLU VPU".split(" ") },
  { key: "communication", label: "Communication", tickers: "XLC VOX XTL".split(" ") },
  { key: "ark", label: "ARK active funds", tickers: "ARKK ARKG ARKW ARKQ ARKF".split(" ") },
];
const GROUP_OF = Object.fromEntries(FUND_GROUPS.flatMap((g) => g.tickers.map((t) => [t, g.key])));

/** ticker -> { name, basis (plain-English index), holds (screened constituents), group }. */
export const FUNDS = Object.fromEntries(
  Object.entries(CATALOGUE)
    .map(([t, f]) => [t, { name: f.name, basis: f.basis, basisKey: f.basisKey, holds: holdsFor(f.basisKey), group: GROUP_OF[t] || null, equalWeight: !!f.equalWeight }])
    .filter(([, f]) => Array.isArray(f.holds)),
);

/** Every ticker in the catalogue, whether or not its holdings loaded (for tests). */
export const catalogueTickers = () => Object.keys(CATALOGUE);

/** The fund record for a ticker we can see inside, or null. */
export const knownFund = (t) => FUNDS[String(t || "").toUpperCase()] || null;

// Widely-held funds we RECOGNIZE but deliberately don't analyze — our screens cover
// US-listed companies by line of business, which doesn't fit foreign equities, bonds, or
// commodities. Naming them explicitly lets the UI say "not analyzed" honestly, instead of
// letting a popular international/bond fund read as "clean" just because we track nothing
// inside it. (HONESTY RULE #1: not analyzed ≠ clean.)
const NOT_ANALYZED = {
  VEA:  { name: "Vanguard FTSE Developed Markets ETF",        kind: "international" },
  IEFA: { name: "iShares Core MSCI EAFE ETF",                 kind: "international" },
  VXUS: { name: "Vanguard Total International Stock ETF",      kind: "international" },
  VWO:  { name: "Vanguard FTSE Emerging Markets ETF",         kind: "international" },
  IEMG: { name: "iShares Core MSCI Emerging Markets ETF",     kind: "international" },
  BND:  { name: "Vanguard Total Bond Market ETF",             kind: "bond" },
  AGG:  { name: "iShares Core U.S. Aggregate Bond ETF",       kind: "bond" },
  BNDX: { name: "Vanguard Total International Bond ETF",       kind: "bond" },
  GLD:  { name: "SPDR Gold Shares",                           kind: "commodity" },
  VT:   { name: "Vanguard Total World Stock ETF",             kind: "international" },
  // Popular ESG / "socially responsible" funds whose issuers don't publish holdings in a
  // form we can fetch for free. Listing them keeps a search from reading as "clean" —
  // and points the visitor at the one ESG index fund we CAN see inside.
  ESGD: { name: "iShares ESG Aware MSCI EAFE ETF",            kind: "international" },
  // Commodity funds people ask about. Several are commodity pools rather than registered
  // funds, so the SEC's fund list doesn't include them.
  PDBC: { name: "Invesco Optimum Yield Diversified Commodity Strategy No K-1 ETF", kind: "commodity" },
  DBC:  { name: "Invesco DB Commodity Index Tracking Fund",   kind: "commodity" },
  GSG:  { name: "iShares S&P GSCI Commodity-Indexed Trust",   kind: "commodity" },
  DBA:  { name: "Invesco DB Agriculture Fund",                kind: "commodity" },
  USO:  { name: "United States Oil Fund",                     kind: "commodity" },
  UNG:  { name: "United States Natural Gas Fund",             kind: "commodity" },
  IAU:  { name: "iShares Gold Trust",                         kind: "commodity" },
  GLDM: { name: "SPDR Gold MiniShares Trust",                 kind: "commodity" },
  SLV:  { name: "iShares Silver Trust",                       kind: "commodity" },
};
const NOT_ANALYZED_REASON = {
  international: "An international fund. Our screens cover US-listed companies, so we don't look inside this one yet.",
  bond: "A bond fund. Our screens flag companies by their line of business, which doesn't apply to bond holdings.",
  commodity: "A commodity fund. It holds an asset rather than companies, so there's nothing to screen.",
  esg: "An ESG-labeled fund. Its issuer doesn't publish holdings in a form we can read yet, so we can't check whether the label holds up. Try EFIV, the S&P 500 ESG ETF, to see what an ESG index fund still holds.",
  active: "An actively managed fund. We only look inside index funds whose issuer publishes daily holdings, so this one isn't analyzed yet.",
};
const otherFundReason = () => `A fund we don't look inside yet. We read the holdings of ${Object.keys(FUNDS).length} index, sector, dividend and ESG funds, and this isn't one of them.`;

/** A widely-held fund we recognize but don't analyze, or null. */
export function unanalyzedFund(t) {
  const sym = String(t || "").toUpperCase();
  const f = NOT_ANALYZED[sym];
  if (f) return { name: f.name, reason: NOT_ANALYZED_REASON[f.kind] };
  // Any other registered fund: we know it's a fund, not what's in it.
  return REGISTERED_FUNDS.has(sym) ? { name: null, reason: otherFundReason() } : null;
}

/** [ticker, name] for every fund we recognize — for search autocomplete. */
export const fundNames = () => [
  ...Object.entries(FUNDS).map(([s, f]) => [s, f.name]),
  ...Object.entries(NOT_ANALYZED).map(([s, f]) => [s, f.name]),
];
