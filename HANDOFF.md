# Hereby — Engineering Handoff

> Single source of truth for picking this project up cold. Read this top-to-bottom
> before touching code. Companion docs: **`API_CONTRACT.md`** (every API method ↔
> backend mapping) and **`supabase/RUNBOOK.md`** (how to run the DB locally/cloud).

---

## 1. What this is

**Hereby** is a hyperlocal campus marketplace (Expo / React Native, iOS + Android +
Web). Students post things they want to do — 1-on-1 (tennis partner, tutoring),
casual group activities (pickup basketball), or organized events (workshops) — and
others join. Money is supported but **all fees are $0 in the MVP** (scaffolding
exists for when they turn on).

**Goal:** ship a trustworthy, low-friction "find someone to do X near me, right now"
app for one campus (UCF first), then expand.

The locked product decisions live in the founder spec (kept in the assistant's
memory file `hereby_product_spec.md`). The 0.x section numbers below refer to it.

---

## 2. Tech stack & keys

| Layer | Choice |
|---|---|
| App | Expo SDK 54, React Native 0.81, expo-router v6, React 19 |
| Styling | NativeWind (Tailwind) + `constants/theme.ts` color tokens |
| State | Zustand (`stores/auth.ts`), persisted to AsyncStorage |
| Maps | OSM tiles. Native: `react-native-maps`. Web: Leaflet. Geocoding: Nominatim (OSM) — **no key needed** |
| Backend | Supabase (Postgres + Auth + Storage). Client: `@supabase/supabase-js` |
| Photos | `expo-image-picker` (avatar upload) → Supabase Storage `avatars` bucket. Lazy-required — the app falls back to generated avatars if it's not installed |
| Data source switch | `EXPO_PUBLIC_DATA_SOURCE` = `mock` (default) or `supabase` |

> **After any `git pull` or machine switch: `npm install` first.** New native deps
> (e.g. `expo-image-picker`) live in `package.json` + `app.json` plugins; if they're
> not installed you get `PluginError: Failed to resolve plugin for module "…"`.
> `npx expo install <pkg>` picks the SDK-correct version.

### Environment variables (`.env`, gitignored — copy from `.env.example`)
```
EXPO_PUBLIC_DATA_SOURCE=mock | supabase
EXPO_PUBLIC_SUPABASE_URL=<project URL>           # supabase mode only
EXPO_PUBLIC_SUPABASE_ANON_KEY=<sb_publishable_…> # the PUBLISHABLE key (safe, RLS-gated)
EXPO_PUBLIC_ALLOW_ANY_EMAIL=true                 # DEV ONLY — see §6
```
- **Supabase project ref:** `qpjazycnhnqtgmqcsxgj` (cloud). Values live in the
  Supabase dashboard → Settings → API. Put them in `.env`, never in git.
- **NEVER commit / ship the `sb_secret_…` key.** It's server-only (bypasses RLS).
  If it ever leaks, rotate it in the dashboard. The app only uses the publishable key.
- No keys are needed for OSM tiles or Nominatim geocoding (free, rate-limited).

---

## 3. Repo structure

```
App/
├─ app/                      # expo-router screens (file = route)
│  ├─ _layout.tsx            # root: auth gate + supabase session restore + mock auto-complete heartbeat
│  ├─ index.tsx              # entry redirect (login / onboarding / tabs)
│  ├─ (auth)/                # login.tsx (email), verify.tsx (OTP; password path for supabase)
│  ├─ (onboarding)/          # profile.tsx (avatar + name) → area.tsx (life-circle) → interests.tsx
│  ├─ (tabs)/                # events, discover, chat, my  (+ _layout tab bar, in that order)
│  ├─ provider/[id].tsx      # post detail ("I'll take that" / "I can help") + skill-req display
│  ├─ order/[id].tsx         # order lifecycle: check-in cascade, cancel, no-show, dispute, rating
│  ├─ post/new.tsx           # compose (kind/format/tags/skill-req/time/seats/price/location + locate)
│  ├─ chat/[id].tsx          # message thread
│  ├─ profile/index.tsx      # profile: avatar+name editor, interest/tag manager, ratings
│  └─ settings/area.tsx      # edit local area (life-circle map)
├─ components/
│  ├─ common/                # Button, Avatar, AvatarNameEditor, Tag, Stars, NumberStepper,
│  │                         #   DateTimePickerField, FloatingPostButton, SearchableTagBar,
│  │                         #   AddressAutocomplete, LocateButton, InterestPicker (w/ skill levels)
│  ├─ map/                   # OSMMap.tsx (types+stub) / .web.tsx (Leaflet) / .native.tsx (RN Maps)
│  └─ post/                  # ProviderCard, EventCard, OrderCard, MyPostCard, CheckInCard, RatingModal
├─ services/
│  ├─ types.ts               # ALL domain types + helpers (formatHourlyPrice, canStillAppeal, …)
│  ├─ api.ts                 # HerebyApi interface + data-source switch (mock vs supabase)
│  ├─ avatar.ts              # generated-avatar + expo-image-picker→Storage upload helpers
│  ├─ mock/                  # data.ts (seed) + index.ts (in-memory impl = the "reference backend")
│  └─ supabase/              # client.ts + api.ts (HerebyApi against the SQL backend)
├─ stores/auth.ts            # auth + profile state (mock + supabase branches; tagLevels, name, avatar)
├─ supabase/
│  ├─ migrations/0001_init.sql       # schema, RLS, views, triggers (place_order, orders_for_viewer, …)
│  ├─ migrations/0002_rpcs.sql       # RPCs (check-in, cancel, complete, dispute, chat, match score)
│  ├─ migrations/0003_onboarding.sql # users.onboarded flag (durable per-user onboarding)
│  ├─ migrations/0004_tag_levels.sql # users.tag_levels jsonb (per-tag skill level 1-4)
│  ├─ migrations/0005_skill_match.sql# posts.skill_level + skill_mode (matching requirement)
│  ├─ migrations/0006_avatars.sql    # avatars Storage bucket + policies; new-user trigger update
│  ├─ README.md / RUNBOOK.md
├─ constants/theme.ts
├─ API_CONTRACT.md           # per-endpoint contract + backend obligations
├─ HANDOFF.md                # this file
└─ .env.example
```

**Golden rule:** `services/mock/index.ts` is the *reference implementation*. When in
doubt about intended behavior, read the mock — the supabase RPCs in `0002_rpcs.sql`
are a 1:1 port of it. `api.ts` is the seam; UI never imports mock or supabase directly.

---

## 4. Features implemented (Phase 1 — DONE)

- **Auth** (`stores/auth.ts`): email OTP (supabase) or any-6-digits (mock); session
  restore; `.edu` → `verified` vs non-edu → `browse_only` (spec 0.5). Password
  sign-in path also exists for supabase (when OTP email isn't configured).
- **Onboarding**: 3 steps — **profile** (avatar + display name) → local-area picker
  (fixed "life-circle" ring: the radius circle stays a constant on-screen size and
  the map pans/zooms under it, driven by the radius slider; + GPS locate + address
  autocomplete) → interest/tag selection. Skippable with sane defaults. The display
  name is user-entered — **no more email-prefix usernames.**
- **Avatar & name**: `AvatarNameEditor` (used in onboarding + profile). Photo upload
  via `expo-image-picker` → Supabase Storage `avatars` bucket, plus a zero-dep
  "Shuffle" generated avatar so identity always works even without the picker.
- **Discover**: map + card feed, multi-tag fuzzy search with local history,
  **server-computed match score** (spec 0.8: tagMatch × distanceDecay × rating).
- **Interest/tag skill levels**: every interest/custom tag carries a level
  (1 Beginner / 2 Intermediate / 3 Advanced / 4 Expert), color-coded (orange /
  yellow / blue / purple). Tap a selected tag → a level picker slides open; new
  custom tags auto-open it. Persisted to `users.tag_levels` (jsonb). Default = 1.
- **Posts**: `kind` = offer/seek (spec 0.1) × `format` = one_on_one/activity/event
  (spec 0.2.a — **NOT** inferred from seat count). Free-form `tags` (≤10), seats,
  price (integer cents), time, map location (with a "use current location" button).
  **Skill requirement**: `skillLevel` (1-4) + `skillMode` (`any` / `exact` / `min` =
  this-or-higher / `max` = this-or-lower) — the up/down-compatible matching filter,
  shown on the post detail. Create + edit.
- **Events tab**: `format != one_on_one`. "You're going" badge for joined posts.
- **Orders** (`order/[id].tsx`): full lifecycle
  `upcoming → checking_in → in_progress → completed / no_show / cancelled`.
  - **3-channel check-in cascade** (spec 0.6): location (GPS) / qr (mutual) / peer
    tap, tracked **per party** (`self` / `counterpart`).
  - **No-show decision tree** (spec 0.4): both present → completed; one present →
    no_show (absent party pays); neither → auto-cancel + refund, no fee.
  - **Dispute**: 24h appeal window, `openDispute` holds fee/rating until moderated.
  - **Fee scaffold**: all rates $0, columns exist, `feePolicyVersion` stamped.
  - **Payment scaffold**: `paymentStatus`/`paymentIntentId` reserved for Stripe.
  - **"Remind them" nudge** (throttled 5 min).
  - Auto-finalize at `endAt + 30min` (mock: client heartbeat; supabase: `pg_cron`).
- **Ratings** (spec 0.7): two-way; recipient `rating_received` + rater public
  `rating_given` both roll up via DB trigger.
- **Chat** (spec 0.9): threads, history, send, swipe-right = read / swipe-left =
  delete (soft, per-viewer). **Currently fully open** (see §6).
- **Profile**: editable bio, two rating scores, selected-only interest/tag manager
  with recommend+custom autocomplete.

Backend: migrations `0001`/`0002` were **executed end-to-end on a real Postgres**
(signup→post→order→checkin→complete→rate→chat→no-show). `0003`–`0006` add the
onboarding flag, tag levels, post skill-match columns, and the avatars bucket.
`supabaseApi` implements **every** `HerebyApi` method; every RPC it calls exists.
When you switch to supabase, run `supabase db push` so all six migrations apply.

---

## 5. Roadmap (phases)

- **Phase 0 — Spec (done):** founder decisions locked (roles, Post/Event/Order, fees,
  .edu, check-in robustness, ratings, matching, chat gate).
- **Phase 1 — MVP app + backend framework (done):** everything in §4. Runs fully on
  mock; supabase backend written + locally verified.
- **Phase 2 — Real backend integration (NEXT):**
  - Switch production auth to supabase; configure OTP email (SMTP) or keep password.
  - Stripe payments: PaymentIntent create/capture/refund in Edge Functions.
  - Push notifications (nudge, new message, dispute resolution) via APNs/FCM.
  - `pg_cron` schedule `finalize_overdue_orders()`; delete the client heartbeat.
  - Dispute moderation queue + admin view.
  - Multi-user testing on device + RLS audit.
- **Phase 3 — Robust check-in & hardening:** real `expo-location` background GPS
  sampling, PostGIS geofence (re-add — removed for now, see §6), BLE proximity
  (layer 3 — `react-native-ble-plx`), offline check-in sync.
- **Phase 4 — Smarter matching:** replace rule-based score with embedding similarity.

---

## 6. Gotchas, decisions & mistakes made (READ THIS to avoid repeats)

**Architecture invariants**
- **Mock viewer is always `id: "me"`.** Seed ORDERS/POSTS/MESSAGES use it. Never write
  logic that depends on a *specific* id value — always read `useAuth(s => s.user.id)`.
  Supabase users get real UUIDs; `handle_new_user` trigger auto-creates their
  `public.users` row on signup.
- **Money is integer cents everywhere** (`priceCentsPerHour`, `feeAmountCents`, …).
  Format ONLY via `formatHourlyPrice()` in `types.ts`. The old `pricePerHour:
  number|"Free"` union was removed — don't reintroduce string/float money.
- **Viewer-relative fields are server-computed**: `Order.counterpart`, `isMyPost`,
  `checkIn.{self,counterpart}`, `noShowSide`, `lastNudgeFrom`. Supabase does this in
  the `orders_for_viewer()` view keyed on `auth.uid()`. Don't cache across users.
- **React hooks:** ALL hooks must run before any early `return`. We hit
  "rendered more hooks than previous render" in `order/[id].tsx` because dispute
  `useState`s sat after the `if (!order) return`. Keep state declarations at the top.

**Product-decision corrections (don't redo the old way)**
- **Event vs activity is `Post.format`, NOT `seats >= 2`** (spec 0.2.a). A pickup game
  has many players but isn't an "event". Never gate event behavior on seat count.
- **.edu does NOT gate posting at the DB layer.** RLS only checks `author_id =
  auth.uid()`. The `.edu` rule is a client-side capability mode (`browse_only`).
  `EXPO_PUBLIC_ALLOW_ANY_EMAIL=true` flips any verified email to full access for
  testing — **remove it before launch** and re-enable the .edu rule.
- **Chat is currently FULLY OPEN** (anyone can start a thread). Spec 0.9 originally
  required an order first; 0.9.a relaxed it for event/activity hosts; we then opened
  it entirely with the plan to add **server-side content moderation** instead of a
  pre-chat wall. The order-gate code path is documented in `mock/index.ts`
  (`openThreadWith`) if you want to re-enable it.

**Supabase / SQL lessons (found by actually running Postgres, not just writing SQL)**
- Enum columns need explicit casts in `INSERT ... VALUES (CASE … END)::enum_type`
  (bit us on `payment_status` in `place_order`).
- `both` is a reserved word in plpgsql — renamed to `both_present`.
- **PostGIS was removed** from the core schema (haversine in `fn_distance_miles`
  instead) so it runs on vanilla Postgres and is one less ops dependency. Phase 3
  can re-add it for an indexed geofence at scale.
- Always test SQL on a real PG instance before trusting it.

**Email / auth onboarding gotcha**
- New vs existing users get DIFFERENT Supabase email templates: existing → "Magic
  Link/OTP" (customizable to show `{{ .Token }}`); brand-new + "Confirm email" ON →
  "Confirm signup" (a link, not a code). Fix: **disable "Confirm email"** in Supabase
  so all users get the uniform 6-digit OTP. Editing templates needs custom SMTP on
  the free tier.

**Dependencies / machine switches**
- New native deps (currently `expo-image-picker`, `expo-location`) are declared in
  `package.json` AND referenced as `app.json` plugins. After a `git pull` or moving
  machines you MUST `npm install` before `npx expo start`, else Expo throws
  `PluginError: Failed to resolve plugin for module "…"`. Use `npx expo install <pkg>`
  to add native deps so the version matches the SDK. Run `npx expo start -c` once
  after an `app.json` plugin change to clear the config cache.

**Security**
- A `sb_secret_…` key was pasted into chat during setup → it MUST be rotated in the
  dashboard. Only the publishable key belongs in the app.

**Codebase hygiene**
- No unused component files (every one is imported). Dead exports were pruned. If you
  add a helper "for later", either wire it up or leave it unexported.

---

## 7. TODO (prioritized)

1. **Configure supabase auth for real use**: disable "Confirm email" (or set up SMTP
   for OTP), then test signup/login with two real emails. Remove `ALLOW_ANY_EMAIL`.
2. **RLS audit**: log in as two users, confirm A cannot read B's orders/chats.
3. **`pg_cron`**: schedule `select finalize_overdue_orders();` every ~5 min; then
   delete the client-side `sweepAutoComplete` calls in `_layout.tsx` / `(tabs)/my.tsx`.
4. **Stripe** (Phase 2): Edge Functions for PaymentIntent create on `createOrder`,
   capture on completion, refund on weather/mutual-no-show. Fee rates still $0.
5. **Push notifications**: nudge, new chat message, dispute resolved.
6. **Dispute moderation**: admin queue + `disputeResolution` write-back.
7. **iOS simulator pass** (do this first thing on the Mac): verify the native maps
   path (`OSMMap.native.tsx`), the GPS locate button, and DateTimePicker.
8. **Optional**: `supabase/seed.sql` with a few demo users/posts so a fresh DB isn't empty.
9. **Phase 3**: real background GPS, PostGIS geofence, BLE proximity.

---

## 8. Running it

- **Mock (no backend):** `npm install && npx expo start`. Press `w`/`i`/`a`. Data is
  in-memory and resets on reload; you play both sides by tapping.
- **Supabase:** set `.env` to supabase mode + keys, `supabase db push` (applies all
  six migrations — see `supabase/RUNBOOK.md`), then `npx expo start -c`. Cloud project
  already provisioned. Disable "Confirm email" in the dashboard for uniform 6-digit OTP.
- **After `git pull` / new machine:** `npm install` → (supabase) `supabase db push` →
  `npx expo start -c`.
- **Always full-reload after changing `.env`** — Fast Refresh doesn't re-read env.

> Legacy note: the parent folder `../Web/` is an **old standalone web prototype**,
> separate from this app and outside this git repo. It is not used by the app and can
> be archived/deleted independently. The `../*.png` / `*.pptx` are design assets, also
> outside the repo.
