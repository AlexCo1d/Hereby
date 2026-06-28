# Hereby API contract (Phase 1 → Phase 2 handoff)

This document is the **single source of truth** for what the frontend expects from the backend. Every API method below is exposed via `services/api.ts` and called from the screens / hooks listed under "Callers". Backend implementation lives behind the same interface — swap `mockApi` for `supabaseApi` in `services/api.ts` and nothing in the UI changes.

All types are in `services/types.ts`. Money is integer cents. Timestamps are ISO 8601 strings. IDs are opaque (uuid in prod, `u_*`/`p_*`/`o_*` in mock).

---

## Session

### `getCurrentUser(): Promise<User>`
Returns the public view of the signed-in user (no email).
- **Callers**: none currently — the auth store owns the signed-in user. Reserved for Phase 2 when the server profile needs to be refreshed (e.g. after another device updates `interestIds`).
- **Supabase**: `select * from public.users where id = auth.uid()`. RLS: self-read only.

---

## Posts

### `listPosts(filter?: DiscoverFilter): Promise<Post[]>`
Returns posts visible to the viewer (campus-scoped). Order is **server-controlled**: when `filter.useMatchScore=true`, returns by `matchScore desc`; otherwise by `postedAt desc`.

- **Filter fields**:
  - `tags?: string[]` — categories to keep (any-match).
  - `center, radiusMiles` — geofence.
  - `query?: string` — full-text against title/description/category.
  - `excludeAuthorId?: string` — hides own posts on Discover.
  - `onlyEvents?: boolean` — `seats >= 2` only (Events tab).
  - `kind?: PostKind` — narrow to "seek" or "offer".
  - `viewerInterestIds?: string[]` — feeds the match-score tag term.
  - `useMatchScore?: boolean` — opt into server ranking + score attachment.
- **Server-computed fields attached per Post**: `seatsTaken`, optionally `matchScore`.
- **Callers**: `app/(tabs)/discover.tsx` (with `useMatchScore`), `app/(tabs)/events.tsx` (with `onlyEvents`).
- **Supabase**: RPC `list_posts_for_viewer(filter jsonb)` because we need score + seatsTaken without raw rating leak. RLS on `posts` table; RPC runs as SECURITY DEFINER with viewer's id baked in.

### `getPost(id: string): Promise<Post | null>`
Single post, with `seatsTaken` attached.
- **Callers**: `app/provider/[id].tsx`.
- **Supabase**: `select * from posts where id = $1` + seatsTaken from `seats_taken_view` join.

### `createPost(input: Omit<Post, "id"|"postedAt">): Promise<Post>`
Creates a post owned by the signed-in user. Backend stamps `id`, `postedAt`, sets `seatsTaken=0`.
- **Required input**: `authorId`, `kind`, `format`, `title`, `category`, `priceCentsPerHour`, `seats`, `startAt`, `endAt`, `location`.
- **Optional**: `tags` (≤ `MAX_POST_TAGS`=10 free-form), `description`, `cancellationFeeCents`, `locationName`, `badges`, `coverImageUrl`.
- **Callers**: `app/post/new.tsx`.
- **Supabase**: standard insert. Trigger validates `authorId == auth.uid()`. Store `tags` as `text[]` with a GIN index for search.

### `listMyPosts(): Promise<Post[]>`
Posts the signed-in user authored, newest first, each with `seatsTaken`. Drives the "My Post" tab (Waiting when `seatsTaken===0`, else matched/joined).
- **Callers**: `app/(tabs)/my.tsx`.
- **Supabase**: `select * from posts where author_id = auth.uid()` + seatsTaken join.

---

## Orders

### `listMyOrders(): Promise<Order[]>`
All orders involving the signed-in user (as customer OR provider). `isMyPost` is computed per row.
- **Callers**: `app/(tabs)/my.tsx`, `app/(tabs)/events.tsx` (to compute `joinedPostIds`), `app/provider/[id].tsx` (to detect existing orders).
- **Supabase**: `select * from orders where customer_id = auth.uid() or provider_id = auth.uid()` + view that decorates `is_my_post = (provider_id == auth.uid())`.

### `getOrder(id: string): Promise<Order | null>`
Single order. Returns `null` if the viewer isn't a participant (do NOT 404 to avoid leaking existence).
- **Callers**: `app/order/[id].tsx`.

### `createOrder({ post, takerUser }): Promise<Order>`
Place an order on a post. Backend MUST:
1. Reject if `post.seatsTaken >= post.seats`.
2. Reject if `post.authorId == auth.uid()` (no self-orders).
3. Reject if the viewer is `browse_only`.
4. For paid posts, create a Stripe PaymentIntent in `authorized` state and stamp `paymentIntentId` + `paymentStatus="authorized"`.
5. Snapshot the post title into `postTitleSnapshot`.
6. Initialize `checkIn` to all pending.
7. Set `feePolicyVersion` to current `FEE_POLICY_VERSION`.

- **Callers**: `app/provider/[id].tsx`.
- **Supabase**: transactional RPC `place_order(post_id)`. Stripe call in Edge Function before the insert.

### `advanceCheckIn(orderId, channel: "location"|"qr"|"peer"): Promise<Order>`
Marks one of the viewer's three channels as `confirmed`. **`qr` is mutual** — flipping it also flips the counterpart's qr (proof of physical meet). Also auto-bumps status: `upcoming → checking_in` on any progress, `→ in_progress` when both parties have ≥ 1 channel confirmed.
- **Callers**: `app/order/[id].tsx` (via `CheckInCard.onPress`).
- **Supabase**: writes `check_in_attempts` then runs a trigger that recomputes order status.

### `resetCheckIn(orderId, channel): Promise<Order>`
Demo-only undo; doesn't bump status. Keep in API for dev/testing.

### `cancelOrder(orderId, by: string, reason: CancelReason): Promise<Order>`
Marks `cancelled`. Backend:
- Sets `cancelledByUserId = by`, `autoCancelled = false`, `cancelReason`.
- If `< 12h` to start AND reason ≠ `"weather"`: stamps `feeKind="cancellation"`, `feeChargedToUserId=by`, `feeAmountCents` per policy.
- Else: stamps `refundIssued=true`, sets `paymentStatus="refunded"`.

- **Callers**: `app/order/[id].tsx`.

### `completeOrder(orderId): Promise<Order>`
Manual "Mark done" path. Decision tree:

| self present | other present | result |
|---|---|---|
| ✓ | ✓ | `completed`; captures payment |
| ✓ | ✗ | `no_show`, `noShowSide="counterpart"`, `feeChargedToUserId=counterpart` |
| ✗ | ✓ | `no_show`, `noShowSide="self"`, `feeChargedToUserId=self` |
| ✗ | ✗ | `cancelled`, `autoCancelled=true`, `cancelReason="mutual_no_show"`, refund |

Spec 0.4. Always also sets `feePolicyVersion`.
- **Callers**: `app/order/[id].tsx`.

### `sweepAutoComplete(): Promise<Order[]>`
**MVP-only.** Iterates active orders whose `endAt + 30min` has passed and runs the same finalize logic as `completeOrder`. Phase 2 replaces this with a `pg_cron` job calling `finalize_overdue_orders()` — **delete the client-side calls** in `_layout.tsx` and `(tabs)/my.tsx` at that point.

### `openDispute({ orderId, reason, evidenceUrls }): Promise<Order>`
Spec 0.6, 24h appeal window from `endAt + 30min`. Backend MUST:
1. Reject if order is not `no_show`.
2. Reject if `disputeOpenedAt` already set.
3. Reject if window has closed (server clock authoritative).
4. Reject if reason is empty.
5. Set `disputeOpenedAt`, `disputeOpenedByUserId=auth.uid()`, `disputeReason`, `disputeEvidenceUrls`.
6. **Hold** fee + rating side effects until a moderator resolves (the field exists, but the worker that applies fees should check `disputeOpenedAt is null OR disputeResolvedAt is not null AND disputeResolution != 'reversed_to_completed'`).
7. Notify moderators.

- **Callers**: `app/order/[id].tsx`.

### `rateOrder(orderId, rating: Omit<Rating,"orderId"|"createdAt">): Promise<void>`
Insert a rating. Triggers:
- Recipient's `users.rating / ratingCount` aggregate update.
- Rater's `users.ratingGiven / ratingGivenCount` aggregate update (spec 0.7 public score).
- Set `order.reviewed = true`.

Frontend ALSO calls `useAuth.getState().recordRatingGiven(stars)` locally so the rater's own profile reflects it immediately.
- **Callers**: `app/order/[id].tsx`, `app/(tabs)/my.tsx`.

### `pingCounterpart(orderId): Promise<Order>`
"I'm here, where are you?" nudge. Backend:
- Throttle ≤ 1 per 5 min per order. Return 429 outside window.
- Stamps `lastNudgeAt`, `lastNudgeFrom`.
- Phase 2: fires APNs/FCM push to the receiving device.

- **Callers**: `app/order/[id].tsx`.

---

## Chat (spec 0.9 — order-gated)

### `listThreads(): Promise<ChatThread[]>`
Returns ONLY threads the viewer has a non-cancelled order with. Empty list when the user hasn't transacted yet → empty state copy lives client-side.
- **Callers**: `app/(tabs)/chat.tsx`.
- **Supabase**: view that joins `orders` and ensures EXISTS clause. RLS prevents querying a thread without a matching order.

### `getThread(threadId): Promise<ChatThread | null>`
Same gate as listThreads. Used by the deep-link path so opening a stale thread URL renders a "Chat locked" screen instead of leaking data.
- **Callers**: `app/chat/[id].tsx`.

### `listMessages(threadId): Promise<Message[]>`
Backend MUST verify the viewer has an order linked to this thread before returning messages.

---

## Users

### `getUser(id): Promise<User | null>`
Public profile shape (no email, no payment info). Email lives only in the self-view (`AuthUser`).
- **Callers**: `app/provider/[id].tsx`, `app/(tabs)/discover.tsx`, `app/(tabs)/events.tsx`.

---

## Auth (out of `HerebyApi` — lives in `stores/auth.ts`)

| Method | Phase 2 mapping |
|---|---|
| `login(email)` | `supabase.auth.signInWithOtp({ email })` |
| `verifyOtp(code)` | `supabase.auth.verifyOtp({ token: code })`. Replace the hardcoded `id: "me"` with `data.user.id`. |
| `logout()` | `supabase.auth.signOut()` |
| `recordRatingGiven(stars)` | Phase 2: trigger handles this server-side; remove from client. |
| `setAreaSettings(...)`, `addCustomTag(...)`, `updateProfile(...)` | Persist to `public.users` via direct `update` (RLS self-write). |

---

## Cross-cutting backend obligations

These are NOT individual endpoints — they're invariants the backend must uphold.

### Viewer-relative fields
- `Order.counterpart` — join (post.authorId vs viewer) per row.
- `Order.isMyPost` — `provider_id == auth.uid()`.
- `Order.noShowSide` — flip based on whether `noShowUserId == auth.uid()`.
- `Order.checkIn.{self, counterpart}` — swap based on viewer.
- `Order.lastNudgeFrom` — `"self"` if `last_nudge_user_id == auth.uid()`, else `"counterpart"`.

The simplest implementation is a Postgres view `orders_for_viewer` parameterized by `auth.uid()`.

### Money
- **Always integer cents** in transport.
- **Display formatting lives in `formatHourlyPrice(cents)`** (`services/types.ts`). UI never multiplies/divides by 100 except in that helper and at form input/output.

### Fee policy versioning
- `FEE_POLICY_VERSION = "0.mvp"` is the const in `types.ts`.
- Every order writes its current `feePolicyVersion` at creation time. Bump the const when fees turn on; older orders settle under their stamped version. The settlement worker reads the policy from `fee_policy(version)` table.

### Stripe payment scaffold
- Reserved on `Order`: `paymentIntentId`, `paymentStatus`, `chargedAmountCents`.
- Currently MVP sets `paymentStatus="not_required"` for free posts, `"authorized"` for paid (mock skips Stripe). Phase 2 wires the real flow:
  1. `createOrder` → Edge Function calls Stripe `paymentIntents.create({ capture_method: "manual" })`.
  2. `completeOrder` (both-present branch) → `paymentIntents.capture()`.
  3. Refund branches → `refunds.create()`.

### Dispute side-effect hold
When `disputeOpenedAt` is set, the settlement worker must:
- Defer charging `feeAmountCents` until `disputeResolvedAt` is set.
- Skip the rating impact entirely if `disputeResolution === "reversed_to_completed"`.
- Apply the fee + rating impact as planned if `disputeResolution === "upheld_no_show"` or `dismissed`.

### Notifications (Phase 2)
- `pingCounterpart` → APNs/FCM push with deep link to the order.
- New thread message → push if recipient inactive > 60s.
- Dispute filed → moderator email.
- Dispute resolved → push to appellant + counterpart.

---

## Frontend → backend file map (for the per-feature audit)

Find every place a screen / hook reaches the API:

| Feature | Frontend file | API methods called |
|---|---|---|
| Login / OTP | `app/(auth)/login.tsx`, `app/(auth)/verify.tsx` | (auth store) `login`, `verifyOtp` |
| Onboarding area + interests | `app/(onboarding)/area.tsx`, `interests.tsx` | (auth store) `setAreaSettings`, `finishOnboarding` |
| Discover | `app/(tabs)/discover.tsx` | `listPosts`, `getUser` |
| Events | `app/(tabs)/events.tsx` | `listPosts({onlyEvents})`, `listMyOrders`, `getUser` |
| Post detail | `app/provider/[id].tsx` | `getPost`, `getUser`, `listMyOrders`, `createOrder` |
| Create post | `app/post/new.tsx` | `createPost` |
| My orders list | `app/(tabs)/my.tsx` | `sweepAutoComplete`, `listMyOrders`, `rateOrder` |
| Order detail | `app/order/[id].tsx` | `sweepAutoComplete`, `getOrder`, `advanceCheckIn`, `resetCheckIn`, `cancelOrder`, `completeOrder`, `pingCounterpart`, `openDispute`, `rateOrder` |
| Chat list | `app/(tabs)/chat.tsx` | `listThreads` |
| Chat thread | `app/chat/[id].tsx` | `getThread`, `listMessages` |
| Profile | `app/profile/index.tsx` | (auth store only) |
| Area editor | `app/settings/area.tsx` | (auth store only) |
| Background heartbeat | `app/_layout.tsx` | `sweepAutoComplete` (delete in Phase 2) |
