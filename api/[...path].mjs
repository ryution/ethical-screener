// Vercel serverless entry — all /api/* requests route here.
//
// We reuse the exact same request handler as local dev (server/api.mjs). Because a
// serverless process can be fresh or frozen between requests, we create the DB pool
// once per warm instance, reload state at the start of each request, and flush at the
// end (see server/lib/db.js). For local dev this file isn't used — `npm start` runs the
// long-lived server instead.

import { handler } from "../server/api.mjs";
import { initPool, reload, flushNow } from "../server/lib/db.js";

let poolReady = null;

export default async function vercelHandler(req, res) {
  try {
    if (!poolReady) poolReady = initPool();
    await poolReady;
    await reload();              // see writes from other instances
  } catch (e) {
    // If storage is unreachable we still serve public routes (lookup/screens) from the
    // in-memory defaults rather than 500-ing the whole site.
    console.error("db init/reload failed:", e.message);
  }
  await handler(req, res);       // ends the response
  try { await flushNow(); } catch (e) { console.error("db flush failed:", e.message); }
}
