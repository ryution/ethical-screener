// secretBox.js reads ENCRYPTION_KEY at module load, so the two behaviors (no key vs a
// configured key) need separate process environments — this file tests the "no key"
// fallback in-process, and spawns a child process with ENCRYPTION_KEY set for the rest.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let passed = 0;
const test = (name, fn) => { fn(); console.log(`  ✓ ${name}`); passed++; };

console.log("secretBox:");

test("no ENCRYPTION_KEY configured -> plaintext passthrough (dev/demo fallback)", async () => {
  const { encryptSecret, decryptSecret } = await import("../lib/secretBox.js");
  assert.equal(encryptSecret("plain-value"), "plain-value");
  assert.equal(decryptSecret("plain-value"), "plain-value");
});

const secretBoxPath = fileURLToPath(new URL("../lib/secretBox.js", import.meta.url));
function runWithKey(key, script) {
  return execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `import { encryptSecret, decryptSecret } from "${secretBoxPath}";\n${script}`],
    { env: { ...process.env, ENCRYPTION_KEY: key }, encoding: "utf8" }
  ).trim();
}

test("with a valid key: round-trips a secret", () => {
  const out = runWithKey("a".repeat(64), `
    const enc = encryptSecret("hunter2-secret");
    console.log(decryptSecret(enc) === "hunter2-secret" ? "OK" : "FAIL");
  `);
  assert.equal(out, "OK");
});
test("with a valid key: ciphertext never contains the plaintext", () => {
  const out = runWithKey("a".repeat(64), `console.log(encryptSecret("hunter2-secret").includes("hunter2-secret") ? "LEAKED" : "OK");`);
  assert.equal(out, "OK");
});
test("with a valid key: two encryptions of the same value differ (random IV)", () => {
  const out = runWithKey("a".repeat(64), `console.log(encryptSecret("same") === encryptSecret("same") ? "SAME" : "OK");`);
  assert.equal(out, "OK");
});
test("malformed key (not 64 hex chars) falls back to plaintext, doesn't crash", () => {
  const out = runWithKey("not-a-valid-key", `console.log(encryptSecret("plain-value"));`);
  assert.equal(out, "plain-value");
});

console.log(`\n${passed} secretBox tests passed ✓`);
