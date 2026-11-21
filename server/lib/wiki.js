// Wikipedia summaries for the "Learn more" pop-up, built by scripts/fetch-wiki.mjs: one
// explaining each category, one per company (matched by ticker through Wikidata).
// Missing file or entry means no summary, never a guessed one.

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "generated", "wiki.json");
let _data = { issues: {}, companies: {} };
try { if (existsSync(FILE)) _data = JSON.parse(readFileSync(FILE, "utf8")); } catch { /* no summaries */ }

export const wikiIssue = (key) => _data.issues?.[key] || null;
export const wikiCompany = (ticker) => _data.companies?.[String(ticker || "").toUpperCase()] || null;
export const wikiLicense = () => _data.license || "https://creativecommons.org/licenses/by-sa/4.0/";
