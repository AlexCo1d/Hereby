# Hereby backend runbook

Two ways to run the backend. Both apply the **same** migrations
(`migrations/0001_init.sql`, `migrations/0002_rpcs.sql`), which have been
tested end-to-end on Postgres 18.

The app chooses backend via `EXPO_PUBLIC_DATA_SOURCE` in `.env`:
`mock` (default, in-memory) or `supabase`.

---

## Option A — Cloud project (no Docker) ✅ lowest friction

1. Create a free project at https://supabase.com (note the **project ref**).
2. Apply the schema:
   ```bash
   cd App
   npm i -g supabase
   supabase login
   supabase link --project-ref <your-ref>
   supabase db push          # runs 0001 + 0002 on the cloud DB
   ```
3. Copy `.env.example` → `.env` and fill from the dashboard (Settings → API):
   ```
   EXPO_PUBLIC_DATA_SOURCE=supabase
   EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
   ```
4. Enable email OTP: Dashboard → Authentication → Providers → Email → enable,
   and edit **Email Templates → Magic Link** to include `{{ .Token }}` so a
   6-digit code is emailed (our verify screen wants a code, not a link).
5. Full reload the app (`r` in Metro, or restart `npx expo start`).

**Observe the DB:** dashboard → Table Editor (browse rows) / SQL Editor (run
queries). OTP emails are sent for real.

---

## Option B — Local stack (needs Docker)

Requires Docker Desktop (machine install: admin + reboot + WSL2 on Win11 Home).

1. Install Docker Desktop (docker.com installer, or an **elevated** terminal:
   `winget install Docker.DockerDesktop`), reboot, launch it once, wait for the
   engine to go green.
2. Start the local stack + apply schema:
   ```bash
   cd App
   npm i -g supabase
   supabase init             # first time only — generates config.toml
   supabase start            # prints URLs + keys (Studio, Inbucket, anon key)
   supabase db push          # runs 0001 + 0002 locally
   ```
3. `.env`:
   ```
   EXPO_PUBLIC_DATA_SOURCE=supabase
   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key printed by `supabase start`>
   ```
4. Enable email OTP the same way (local Studio, usually
   `http://127.0.0.1:54323`).
5. Full reload the app.

**Observe the DB:**
- Studio (`http://127.0.0.1:54323`) — table browser + SQL editor.
- Inbucket (`http://127.0.0.1:54324`) — catches OTP emails (grab the code here).
- `supabase db reset` — wipe + re-run all migrations (seconds).

---

## Testing multi-user (mouse-driven)

One backend, multiple clients:
- `npx expo start --web`, open **two browser windows** (one normal, one
  incognito so sessions don't collide).
- Window A logs in as `alice@ucf.edu`, window B as `bob@gmail.com` (grab codes
  from Inbucket locally, or your inbox on cloud).
- A posts → B sees it on Discover → B taps "I'll take that" → both check in →
  complete → rate → chat. Watch rows appear live in Studio.
- RLS check: confirm B cannot see orders/threads that aren't theirs.

## How Postgres stores data (FYI)

Postgres does **not** keep a human-readable file you can open. Data lives as
binary heap files in a data directory (Docker volume locally, managed disk on
cloud), named by table OID, plus a write-ahead log. Never read these directly —
always observe through SQL (Studio / SQL editor / `psql`).

## Switch back to mock
Set `EXPO_PUBLIC_DATA_SOURCE=mock` (or delete it) and reload. No backend needed.
