# Hereby backend (Phase 2 scaffold)

Framework for swapping the in-memory mock for a real Supabase backend. **No
cloud resources are provisioned by this code** — you create the project and run
the migration yourself.

## What's here
- `migrations/0001_init.sql` — full schema: tables, enums, RLS, the
  `orders_for_viewer()` viewer-relative mapping, and RPCs (`place_order`,
  `finalize_overdue_orders`, rating-aggregate trigger, new-user trigger).
- `../services/supabase/client.ts` — the configured Supabase JS client.
- `../services/supabase/api.ts` — `supabaseApi: HerebyApi`, the drop-in for the
  mock. Read paths + order/post RPCs wired; Stripe/nudge/push pieces are TODO.

## Go-live steps
1. Create a Supabase project (dashboard or `supabase init && supabase start`).
2. Apply the schema: `supabase db push` (or paste `0001_init.sql` into the SQL
   editor).
3. Copy `.env.example` → `.env`, set `EXPO_PUBLIC_DATA_SOURCE=supabase` and the
   project URL + anon key.
4. Reload the app. `services/api.ts` now resolves to `supabaseApi`; no screen
   changes needed.

## Still TODO before parity (each maps to a row in `API_CONTRACT.md`)
- RPCs referenced by `supabaseApi` but not yet in the migration:
  `list_posts_for_viewer` (match score + seatsTaken + ranking),
  `advance_check_in` / `reset_check_in` (role-aware qr-mutual write),
  `cancel_order`, `complete_order` (finalize decision tree),
  `open_dispute`, `ping_counterpart`, `threads_for_viewer`, `open_thread_with`.
  These mirror logic already in `services/mock/index.ts` — port them as
  plpgsql.
- Edge Functions: Stripe PaymentIntent create/capture/refund; APNs/FCM push for
  nudges + new messages; moderator notification on dispute filed.
- `pg_cron`: schedule `finalize_overdue_orders()` every ~5 min (replaces the
  client `sweepAutoComplete` heartbeat — delete those calls once live).
- Storage bucket `dispute-evidence` (private, RLS: 2 participants + moderators).

## Auth mapping
Replace the mock's pinned `id: "me"` in `stores/auth.ts` with the real
`supabase.auth` session: `signInWithOtp` / `verifyOtp` / `signOut`. The
`handle_new_user` trigger auto-creates the `public.users` row from
`auth.users` on first sign-in.
