import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// On Vercel, api/[...path].mjs only receives requests with one segment after /api/, so a
// route like /api/auth/google answered 404 on the live site while working locally. Every
// multi-segment route needs a one-segment alias, and the page must call the alias.

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const api = readFileSync(join(ROOT, "server", "api.mjs"), "utf8");
const page = readFileSync(join(ROOT, "src", "Analyzer.jsx"), "utf8");

const routes = [...new Set([...api.matchAll(/path === "(\/api\/[^"]+)"/g)].map((m) => m[1]))];
const multi = routes.filter((r) => r.split("/").length > 3);
const aliasBlock = api.slice(api.indexOf("const ROUTE_ALIASES"), api.indexOf("};", api.indexOf("const ROUTE_ALIASES")));
const aliases = Object.fromEntries([...aliasBlock.matchAll(/"(\/api\/[^"]+)":\s*"(\/api\/[^"]+)"/g)].map((m) => [m[2], m[1]]));

console.log("API routes on Vercel");

test("every multi-segment route has a one-segment alias", () => {
  const missing = multi.filter((r) => !aliases[r]);
  assert.deepEqual(missing, [], `no alias for: ${missing.join(", ")}`);
  for (const r of multi) assert.equal(aliases[r].split("/").length, 3, `${aliases[r]} is not one segment`);
});

test("the page never calls a multi-segment API route", () => {
  const called = [...page.matchAll(/["`](\/api\/[a-z-]+\/[a-z-]+)/g)].map((m) => m[1]);
  assert.deepEqual(called, [], `the page calls ${called.join(", ")}, which 404s on Vercel`);
});

console.log(`\n${passed} route tests passed ✓`);
