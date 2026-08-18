# Deploy — Vercel + Supabase

The frontend is a static Vite build; the API is one serverless function
(`api/[...path].mjs`) that reuses the same handler as local dev; state lives in Supabase
Postgres. Everything is same-origin on Vercel, so the app's `/api/...` calls just work.

## Architecture on Vercel

- **Static frontend** — `npm run build` → `dist/`, served by Vercel's CDN.
- **`/api/*`** — routed to the serverless function, which imports `server/api.mjs`.
- **State** — the function creates a Supabase pool once per warm instance, reloads state
  at the start of each request, and flushes at the end. Correct for low-to-moderate
  traffic; see *Scaling* below.

## One-time setup

### 1. Supabase (the database)
1. Create a project at https://supabase.com.
2. Project Settings → Database → **Connection string** → **URI**. Use the
   **connection pooler** string (port 6543, "Transaction" mode) — serverless functions
   open many short connections, and the pooler is built for that.
3. That string is your `DATABASE_URL`. It already contains the password.

The app creates its own table (`steward_state`) on first run — no SQL to run by hand.

### 2. GitHub
```bash
# from this repo
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

### 3. Vercel
1. https://vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Other**. Build command `npm run build`, output dir `dist`
   (already set in `vercel.json`).
3. **Environment Variables** (Project Settings → Environment Variables):

   | Key | Value | Needed for |
   |---|---|---|
   | `DATABASE_URL` | the Supabase pooler URI | accounts, sessions, connections |
   | `SNAPTRADE_CLIENT_ID` | from dashboard.snaptrade.com | connecting a brokerage |
   | `SNAPTRADE_CONSUMER_KEY` | from dashboard.snaptrade.com | connecting a brokerage |
   | `APP_URL` | your final URL, e.g. `https://steward.vercel.app` | email links, CSRF |
   | `RESEND_API_KEY` | from resend.com (optional) | verification / reset email |
   | `MAIL_FROM` | e.g. `Steward <hello@yourdomain>` (optional) | email sender |

   `VERCEL_URL` is set automatically; the app falls back to it for links if `APP_URL`
   isn't set, but set `APP_URL` once you know the domain.
4. **Deploy.** The public landing + ticker lookup work immediately (they need no DB). The
   account/connect flow works once `DATABASE_URL` is set.

## What works without any env vars
The landing page and the `/api/lookup` + `/api/screens` endpoints are stateless — they
compute from the bundled data. So the hero analyzer is live even before Supabase/SnapTrade
are wired.

## Scaling
State is stored as a single JSONB blob and read-modify-written per request. That's simple
and correct at low concurrency, but two simultaneous writes can race (last-writer-wins).
When traffic grows, move `server/lib/db.js` from the single-blob model to real tables
(users, sessions) with row-level operations. See `NEXT.md`.

## Local dev is unchanged
`npm start` still runs the long-lived Node server (`server/api.mjs`); the Vercel function
is only used in the cloud. With no `DATABASE_URL`, local state is a JSON file under
`server/data/`.
