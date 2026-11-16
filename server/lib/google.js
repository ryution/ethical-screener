// Sign in with Google: checks the ID token Google's button hands the browser.
//
// The browser gets a signed token (a JWT) from Google and posts it here. We accept it only
// if Google's own key signed it, it was issued for PlainStreet's client ID, it hasn't
// expired, and Google says the email is verified. Nothing else from the browser is trusted.
//
// The client ID is public by design (it is in the page's code), so it has a default here;
// GOOGLE_CLIENT_ID overrides it. The client secret is not used: this flow doesn't need it.

import { createPublicKey, verify } from "node:crypto";

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  || "1085970294005-t3oohllhj901iprj8dgrogsqlf6r78so.apps.googleusercontent.com";

const CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

// Google rotates its signing keys every few days; keep them for an hour.
let cached = null;
let cachedAt = 0;
async function googleKeys(force = false) {
  if (!force && cached && Date.now() - cachedAt < 60 * 60 * 1000) return cached;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`could not fetch Google's signing keys (${res.status})`);
  cached = (await res.json()).keys || [];
  cachedAt = Date.now();
  return cached;
}

const fromB64url = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verify a Google ID token. Returns { email, sub, name } or throws.
 * `opts` exists for tests: { keys, clientId, now }.
 */
export async function verifyGoogleIdToken(token, opts = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  let header, payload;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString("utf8"));
    payload = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  } catch { throw new Error("malformed token"); }
  if (header.alg !== "RS256" || !header.kid) throw new Error("unexpected token algorithm");

  const findKey = (keys) => keys.find((k) => k.kid === header.kid);
  let jwk = findKey(opts.keys || await googleKeys());
  // A key we haven't seen may be a fresh rotation; refetch once before giving up.
  if (!jwk && !opts.keys) jwk = findKey(await googleKeys(true));
  if (!jwk) throw new Error("unknown signing key");

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const ok = verify("RSA-SHA256", signed, createPublicKey({ key: jwk, format: "jwk" }), fromB64url(parts[2]));
  if (!ok) throw new Error("bad signature");

  const now = opts.now ?? Date.now();
  if (!ISSUERS.has(payload.iss)) throw new Error("wrong issuer");
  if (payload.aud !== (opts.clientId || GOOGLE_CLIENT_ID)) throw new Error("token is for a different app");
  if (!payload.exp || payload.exp * 1000 < now - 60_000) throw new Error("token expired");
  if (!payload.email || payload.email_verified !== true) throw new Error("Google hasn't verified this email");
  return { email: String(payload.email).toLowerCase(), sub: String(payload.sub), name: payload.name || null };
}
