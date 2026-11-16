import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyGoogleIdToken } from "../lib/google.js";

let passed = 0;
const test = async (name, fn) => { await fn(); console.log(`  ✓ ${name}`); passed++; };

// A stand-in for Google's signing key, so tokens can be made and checked offline.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };
const CLIENT = "test-client.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 10, 15);
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");

function token(claims = {}, { key = privateKey, kid = "test-key", alg = "RS256" } = {}) {
  const head = b64({ alg, kid, typ: "JWT" });
  const body = b64({
    iss: "https://accounts.google.com", aud: CLIENT, sub: "1234567890",
    email: "Someone@Example.com", email_verified: true, name: "Someone",
    iat: NOW / 1000, exp: NOW / 1000 + 3600, ...claims,
  });
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${sig}`;
}
const opts = { keys: [jwk], clientId: CLIENT, now: NOW };
const rejects = (t, re) => assert.rejects(verifyGoogleIdToken(t, opts), re);

console.log("Sign in with Google: token checks");

await test("a token Google signed for PlainStreet is accepted", async () => {
  const g = await verifyGoogleIdToken(token(), opts);
  assert.deepEqual(g, { email: "someone@example.com", sub: "1234567890", name: "Someone" });
});
await test("a token signed with some other key is rejected", () => rejects(token({}, { key: other.privateKey }), /bad signature/));
await test("a token for a different app is rejected", () => rejects(token({ aud: "someone-else.apps.googleusercontent.com" }), /different app/));
await test("a token not issued by Google is rejected", () => rejects(token({ iss: "https://evil.example" }), /wrong issuer/));
await test("an expired token is rejected", () => rejects(token({ exp: NOW / 1000 - 600 }), /expired/));
await test("an unverified Google email is rejected", () => rejects(token({ email_verified: false }), /verified/));
await test("a token naming an unknown key is rejected", () => rejects(token({}, { kid: "nope" }), /unknown signing key/));
await test("a token using another algorithm is rejected", () => rejects(token({}, { alg: "HS256" }), /algorithm/));
await test("garbage is rejected", () => rejects("not.a.token", /malformed/));

console.log(`\n${passed} Google sign-in tests passed ✓`);
