// Shared domain types for Hereby. These describe the API contract that both
// the mock data source and the future Supabase data source must implement.
//
// Backend handoff notes:
//   • Every type here is the wire format the frontend expects. Anything
//     marked "server-computed" or "set by backend" is read-only from the
//     client's POV.
//   • Optional fields are tolerated as null/undefined; required fields must
//     always be present.
//   • IDs are opaque strings (uuid on Supabase, "u_*", "p_*", "o_*" patterns
//     in mock). Don't write client-side logic that parses them.
//   • Money is integer cents. Display layer formats; transport never carries
//     floats or strings like "Free".
//   • Viewer-relative fields (`Order.counterpart`, `Order.isMyPost`,
//     `CheckIn.self`, `Order.noShowSide`, `lastNudgeFrom`) are computed by
//     the backend per request, based on `auth.uid()`. Clients must not
//     cache these across users.
//
// See API_CONTRACT.md for the full per-endpoint spec.

/** Pinned policy version for the fee-attribution scaffolding (spec 0.4).
 *  When fees turn on in Phase 2 the server bumps this and orders placed
 *  after the bump settle under the new policy; older orders settle under
 *  the version they were stamped with. */
export const FEE_POLICY_VERSION = "0.mvp";

/** Window the no-show'd party has to file an appeal before the no_show
 *  classification (and any future fee) becomes final. Counts from
 *  `endAt + 30min` (i.e. from when the order finalized). Spec 0.6. */
export const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LatLng = { lat: number; lng: number };

export type InterestCategory =
  | "Sports"
  | "Skills & Hobby Sharing"
  | "Language Exchange"
  | "Academic & Career";

export type InterestTag = {
  id: string;
  label: string;
  category: InterestCategory;
  /** Tailwind background color class for the chip (e.g. "bg-accent-blue") */
  colorClass?: string;
};

export type User = {
  id: string;
  name: string;
  avatarUrl: string;
  /** Self-reported skill/level shown on cards, e.g. "Level 2.5" */
  level?: string;
  /** Avg rating 0-5 across completed jobs */
  rating: number;
  ratingCount: number;
  bio?: string;
  /** Whether the user verified with a .edu email (spec 0.5). Email itself
   *  is NEVER part of the public User shape — see AuthUser in stores/auth.ts
   *  for the self-view that contains email. */
  eduVerified: boolean;
  interests: string[]; // InterestTag.id[]
};

export type PostStatus = "open" | "matched" | "completed" | "cancelled";

/**
 * Who's initiating the activity (spec 0.1, dual-role accounts):
 *   • offer — "I'm hosting / providing this" (the author runs the activity,
 *     others sign up). Tennis coach offering lessons, gym buddy offering
 *     to spot, host running a workshop.
 *   • seek  — "I'm looking for someone to do this WITH me" (the author is
 *     the customer / participant, others provide). Looking for a hitting
 *     partner, looking for an EECS 281 tutor, looking for someone to share
 *     a Costco run with.
 *
 * Drives:
 *   - Who can place orders (you can't take your own offer; you can't take
 *     a seek you can't fulfill — but that's a soft signal, no hard block).
 *   - UI copy ("I'll take that!" on offers vs "I can help" on seeks).
 *   - Default seats (offers can host many; seeks usually have seats=1).
 */
export type PostKind = "offer" | "seek";

/**
 * Structural format of a post — INDEPENDENT of headcount. The previous design
 * inferred "group event" from `seats >= 2`, which was wrong: a pickup
 * basketball game has many players but isn't an organized "event". Now the
 * author picks this explicitly.
 *
 *   • one_on_one — exactly you + one other person (seats is forced to 1).
 *   • activity   — a casual, peer multi-person thing (pickup game, study group,
 *                  Costco run). seats >= 2, author participates.
 *   • event      — an organized / hosted group thing (workshop, volunteer day,
 *                  tournament). seats >= 2, author is the host.
 *
 * Both `activity` and `event` surface in the Events tab and let people contact
 * the host/organizer. The split is a user-facing label + future moderation
 * hook (events may need org verification later), not a headcount rule.
 */
export type PostFormat = "one_on_one" | "activity" | "event";

/**
 * How a post's skill-level requirement is matched against a candidate's level
 * for that activity (tag levels — see users.tag_levels, 1..4):
 *   • any   — no requirement (default). Everyone qualifies.
 *   • exact — candidate must be exactly `skillLevel`.
 *   • min   — candidate must be `skillLevel` OR HIGHER (向上兼容).
 *   • max   — candidate must be `skillLevel` OR LOWER (向下兼容).
 */
export type PostSkillMode = "any" | "exact" | "min" | "max";

export type Post = {
  id: string;
  authorId: string;
  /** "offer" (default) or "seek". Distinguishes who's hosting vs participating. */
  kind: PostKind;
  /** Structural format — drives the Events tab, the seats stepper, and chat
   *  affordances. NOT inferred from `seats`. */
  format: PostFormat;
  title: string;
  /** Category shown in top filter chips (Tennis / Gym / UX/UI etc.).
   *  Kept as a coarse label / detail-header title. Search is NOT limited to
   *  this — see `tags`. */
  category: string;
  /** Free-form tags (max 10) the author attaches to a post. This is the
   *  PRIMARY search surface — Discover fuzzy-matches the user's query against
   *  these (plus category, badges, title). e.g. ["Tennis", "2.5 level",
   *  "doubles", "evenings"]. */
  tags?: string[];
  description?: string;
  /** Hourly rate in integer cents. 0 = free. Single representation across
   *  the entire app — display code is responsible for formatting (e.g.
   *  "$7/hr" or "Free"). Replaces the old `pricePerHour: number | "Free"`
   *  union, which didn't survive a SQL schema. */
  priceCentsPerHour: number;
  /** Cancellation fee in integer cents. 0 in MVP (see FEE_POLICY_VERSION). */
  cancellationFeeCents?: number;
  /** Skill-level requirement for joining (1..4, keyed to the activity). When
   *  `skillMode` is "any" (or undefined) this is ignored. Used to match against
   *  a candidate's tag level for the post's category/activity. */
  skillLevel?: number;
  /** How `skillLevel` is compared. Default "any" = no requirement. */
  skillMode?: PostSkillMode;
  /** How many people total can join. 1 = solo / 1v1 service; >1 = group event
   *  (shows in the Events tab as well as on the Discover map). */
  seats: number;
  /** Number of active (non-cancelled) orders placed against this post.
   *  Computed server-side; mock derives it from the ORDERS array at fetch
   *  time. When seatsTaken >= seats the post is "Full" and the I'll-take-
   *  that CTA is disabled. */
  seatsTaken?: number;
  startAt: string; // ISO
  endAt: string; // ISO
  location: LatLng;
  locationName?: string;
  /** Optional tags shown on the card (e.g. "Student", "Competition", "StayActive") */
  badges?: string[];
  /** Phase-2 scaffolding — there's no comments table yet. Optional so we
   *  can render a count placeholder ("Comment (0)") without depending on
   *  the data existing. */
  commentsCount?: number;
  postedAt: string; // ISO
  /** Hero image for the post (shown in Events list / large detail). Optional. */
  coverImageUrl?: string;
  /** Server-computed match score for the viewing user (spec 0.8).
   *  Formula: tagMatch (0|1) × distanceDecay × normalizedRating, in [0, 1].
   *  Higher = better match. Always computed server-side so the algorithm can
   *  evolve without an app release and so we don't ship raw rating data to
   *  the client. Undefined means "viewer didn't pass a center / radius" or
   *  "no preferences set". */
  matchScore?: number;
};

// Order lifecycle (see spec 0.4 + 0.6):
//   upcoming     — scheduled, > 15 min from startAt
//   checking_in  — within the check-in window (~15 min before start to a bit
//                  after start). 3-channel cascade is active.
//   in_progress  — both parties present (≥ 1 channel each).
//   completed    — past endAt + 30min, both were present.
//   no_show      — past endAt + 30min, exactly one party was present.
//   cancelled    — either party cancelled before start, OR auto-cancelled
//                  when neither party showed up (cancelReason = mutual_no_show).
export type OrderStatus =
  | "upcoming"
  | "checking_in"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled";

export type CheckInChannel = "location" | "qr" | "peer";
export type CheckInStatus = "pending" | "confirmed";

/**
 * One party's per-channel check-in state. Each party (you & counterpart)
 * has their own slot. Channels:
 *   • location — that party's own device GPS hits the geofence. Sampled
 *     silently in background — NEVER requires the user to tap.
 *   • qr       — mutual: when one party scans the other's QR, both sides'
 *     `qr` flip to confirmed in one shot. Proof of in-person meet.
 *   • peer     — that party tapped "I'm here" in the app.
 *
 * A party is considered "present" if ≥ 1 of their 3 channels is confirmed.
 * `location` alone is sufficient for presence (it's the objective fallback
 * when the absent party can't / won't interact) — but it's not used alone
 * to mark someone as no_show, only to mark someone as present.
 */
export type PartyCheckIn = Record<CheckInChannel, CheckInStatus>;

/**
 * Order check-in state, two slots from the current viewer's POV.
 * In the real backend the API serves a per-viewer view so `self` always
 * means "the user reading this order".
 */
export type CheckIn = {
  self: PartyCheckIn;
  counterpart: PartyCheckIn;
};

export type CancelReason =
  | "weather"
  | "personal"
  | "other"
  /** Both parties failed to check in — order auto-cancelled, refund issued,
   *  no fee, no rating impact (spec: shouldn't penalize a meetup that simply
   *  didn't happen for both sides). */
  | "mutual_no_show";

/**
 * Dispute scaffold (spec 0.6 — "either party may upload a photo / witness
 * statement within 24h"). Lives on the Order itself rather than a separate
 * `disputes` table for MVP simplicity. Phase 3 can move it out once we have
 * an actual moderation queue.
 *
 * Timing rule: an appeal is only acceptable while
 *   now < new Date(endAt).getTime() + 30min + DISPUTE_WINDOW_MS
 * The frontend computes this via `canStillAppeal(order)` to avoid clock skew
 * between client and server (server clock is authoritative on the actual
 * accept/reject decision).
 */
export type DisputeResolution =
  /** Moderator agreed with the appellant — order reclassified to completed. */
  | "reversed_to_completed"
  /** Moderator confirmed the no-show; classification stands. */
  | "upheld_no_show"
  /** Insufficient evidence either way; classification stands but no fee. */
  | "dismissed";

export type Order = {
  id: string;
  postId: string;
  /** When the order was placed (ISO). Server-stamped at creation. Drives the
   *  free-cancellation clock (spec 0.4 — free until 12h before start, but the
   *  placement time is what audit/settlement reference) and any future
   *  "ordered N hours ago" UI. */
  placedAt: string;
  /** Snapshot of the post's title at the moment the order was placed.
   *  Denormalized so editing the original post doesn't retroactively
   *  rename historical orders. Frontend treats this as immutable. */
  postTitleSnapshot: string;
  /**
   * Counterpart user object — viewer-relative. The backend joins on the
   * orders table per request: if the viewer is the post author, this is
   * the customer; if the viewer is the customer, this is the post author.
   *
   * Embedded (not just `counterpartUserId`) because the My-tab list needs
   * avatar + name + rating without an N+1 lookup. Treat as read-only and
   * do NOT cache across viewers.
   */
  counterpart: User;
  startAt: string;
  endAt: string;
  status: OrderStatus;
  /** Viewer-relative: true when the viewer is the post author. Drives the
   *  "My Post" / "My Job" tab split on the My screen. Computed server-side
   *  per request — do not infer from `counterpart` alone. */
  isMyPost: boolean;
  reviewed?: boolean;

  /** Per-party check-in cascade (spec 0.6). Viewer-relative — `self` always
   *  refers to the user reading the order. */
  checkIn: CheckIn;

  // -------------------------------------------------------------
  // Cancellation attribution
  // -------------------------------------------------------------
  /** User who initiated the cancellation. Null when the order was
   *  auto-cancelled by the system (see `autoCancelled`). */
  cancelledByUserId?: string;
  /** True when the cancellation was system-initiated (currently only the
   *  mutual-no-show branch). Separate from `cancelledByUserId` so we never
   *  have to encode "system" as a magic user id string. */
  autoCancelled?: boolean;
  cancelReason?: CancelReason;

  /** Set when status === "no_show" — which side failed to show. Viewer-
   *  relative. Used to drive the fee + rating-hit attribution (spec 0.4:
   *  whoever no-shows pays). */
  noShowSide?: "self" | "counterpart";

  // -------------------------------------------------------------
  // Fee scaffolding (spec 0.4 — MVP rates are $0 but the columns
  // exist so the settlement worker has somewhere to write when fees
  // turn on in Phase 2). Backend owns these — frontend reads only.
  // -------------------------------------------------------------
  /** Money actually charged, in integer cents. 0 in MVP. */
  feeAmountCents?: number;
  /** User who paid the fee (canceller for `cancelled`, no-shower for
   *  `no_show`). Undefined for mutual-no-show / weather. */
  feeChargedToUserId?: string;
  /** Why the fee was assessed — mirrors the order-resolution branch. */
  feeKind?: "cancellation" | "no_show";
  /** True when a payment refund has been issued for this order (used for
   *  weather cancels and mutual-no-show auto-cancels). */
  refundIssued?: boolean;
  /** Refund amount in integer cents. */
  refundAmountCents?: number;
  /** Snapshot of the policy version this order's fees were computed under,
   *  so historical orders settle under the rules they were placed against
   *  even after the platform raises fees. */
  feePolicyVersion?: string;

  // -------------------------------------------------------------
  // Payment gateway scaffolding (Phase 2 — Stripe). Reserved here so the
  // frontend doesn't need to add fields when payments turn on. Mock leaves
  // these undefined; production fills them at createOrder / settlement.
  // -------------------------------------------------------------
  /** Stripe PaymentIntent id (`pi_*`) authorizing the order. Captured when
   *  the order completes; refunded on weather / mutual-no-show. */
  paymentIntentId?: string;
  paymentStatus?:
    | "not_required"   // free post — no auth needed
    | "authorized"     // hold placed, not yet captured
    | "captured"       // funds moved at settlement
    | "refunded"       // refund issued (auto or manual)
    | "failed";        // auth or capture failed
  /** Final amount captured at settlement, in integer cents. */
  chargedAmountCents?: number;

  // -------------------------------------------------------------
  // Notification scaffolding — wired in MVP via the local UI; in
  // Phase 2 a push goes through APNs/FCM. Backend reads `nudges`,
  // the client only triggers `pingCounterpart`.
  // -------------------------------------------------------------
  /** Timestamp of the most recent "I'm here, where are you?" ping sent
   *  from one party to the other. Used to throttle (≤ 1 ping per 5 min)
   *  and to surface the incoming-nudge banner on the receiver side. */
  lastNudgeAt?: string;
  /** Which side fired the most recent nudge. The receiver sees the banner. */
  lastNudgeFrom?: "self" | "counterpart";

  // -------------------------------------------------------------
  // Dispute scaffold (spec 0.6 — 24h appeal window)
  // -------------------------------------------------------------
  /** Set when the no-show'd party opens an appeal. Once set, the order's
   *  fee/rating side-effects are HELD pending moderation. */
  disputeOpenedAt?: string;
  disputeOpenedByUserId?: string;
  /** Free-text reason supplied by the appellant. */
  disputeReason?: string;
  /** Storage urls of evidence the appellant uploaded (photos, screenshots
   *  of texts proving the counterpart agreed to a no-show etc.). Each url
   *  points at a private bucket; only the two parties + moderators read. */
  disputeEvidenceUrls?: string[];
  /** Set when a moderator decides. */
  disputeResolvedAt?: string;
  disputeResolvedByUserId?: string;
  disputeResolution?: DisputeResolution;
};

/** A party is "present" if at least one of their channels confirmed. */
export function isPartyPresent(p: PartyCheckIn): boolean {
  return (Object.values(p) as CheckInStatus[]).some((v) => v === "confirmed");
}
export function partyConfirmedCount(p: PartyCheckIn): number {
  return (Object.values(p) as CheckInStatus[]).filter((v) => v === "confirmed").length;
}

/** Frontend gate for the appeal button. Server is still authoritative when
 *  the request lands; this is purely a UX affordance. Returns true while
 *  the user is still inside the 24h window from finalization. */
export function canStillAppeal(o: Pick<Order, "status" | "endAt" | "disputeOpenedAt">): boolean {
  if (o.status !== "no_show") return false;
  if (o.disputeOpenedAt) return false; // already appealed
  const finalizedAt = new Date(o.endAt).getTime() + 30 * 60 * 1000;
  return Date.now() < finalizedAt + DISPUTE_WINDOW_MS;
}

export type Rating = {
  orderId: string;
  fromUserId: string;
  toUserId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  counterpart: User;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
  /** Orders that unlock this thread (spec 0.9 — must place / accept an
   *  order first → chat unlocks). When the array is empty, the thread is
   *  not accessible. Backend will filter at the query level; the client
   *  receives only threads it is allowed to see. */
  linkedOrderIds: string[];
};

export type Message = {
  id: string;
  threadId: string;
  fromUserId: string;
  text: string;
  sentAt: string;
};

// ---- Filters / query params used by the API layer ----
export type DiscoverFilter = {
  /** Multi-select category/tag filter. Empty/undefined = no filter. */
  tags?: string[];
  /** Center of the local-radius circle */
  center?: LatLng;
  /** Radius in miles */
  radiusMiles?: number;
  query?: string;
  /** When set, hide posts authored by this user (used to keep your own
   *  posts out of the "discover" feed — you see them in My Post instead). */
  excludeAuthorId?: string;
  /** When true, return only group-format posts (activity + event) — i.e.
   *  everything that isn't one_on_one. Drives the Events tab. (Name kept for
   *  back-compat; semantics are now format-based, not seat-count-based.) */
  onlyEvents?: boolean;
  /** Explicit format filter. Takes precedence over `onlyEvents` when set. */
  formats?: PostFormat[];
  /** Skill-level facet. Empty/undefined = no filter. A post matches if it has
   *  no skill requirement (skillMode "any"/undefined) OR its level is in the set. */
  skillLevels?: number[];
  /** Group-size facet, expressed as seat bounds (inclusive). */
  minSeats?: number;
  maxSeats?: number;
  /** Filter by `Post.kind`. Undefined returns both seeks and offers. */
  kind?: PostKind;
  /** Spec 0.8 — the viewer's interest tag ids. When provided, the backend
   *  computes `matchScore` on each returned post and sorts descending.
   *  Without this the result is post-time descending. */
  viewerInterestIds?: string[];
  /** Pass through to feed the rating term of the match score. The backend
   *  derives this from `viewerInterestIds` weight, but we keep it explicit
   *  to allow callers to disable rating influence in tests. */
  useMatchScore?: boolean;
};

/** Max free-form tags a post may carry. */
export const MAX_POST_TAGS = 10;

/** The full lowercase text surface a search query is fuzzy-matched against.
 *  Centralised so the mock filter and any future client-side highlight use
 *  the same definition. */
export function postSearchSurface(p: {
  category?: string;
  tags?: string[];
  badges?: string[];
  title?: string;
  description?: string;
}): string {
  return [p.category, ...(p.tags ?? []), ...(p.badges ?? []), p.title, p.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// ---- Skill level helpers (shared UI + matching) ----
export const SKILL_LEVELS = [
  { level: 1, label: "Beginner" },
  { level: 2, label: "Intermediate" },
  { level: 3, label: "Advanced" },
  { level: 4, label: "Expert" },
] as const;

export function skillLevelLabel(level?: number): string {
  const l = Math.min(4, Math.max(1, level ?? 1));
  return SKILL_LEVELS[l - 1].label;
}

/** Human sentence for a post's skill requirement (for cards / detail). Returns
 *  null when there's no requirement. */
export function describeSkillRequirement(
  p: Pick<Post, "skillLevel" | "skillMode">,
): string | null {
  const mode = p.skillMode ?? "any";
  if (mode === "any" || p.skillLevel == null) return null;
  const label = skillLevelLabel(p.skillLevel);
  switch (mode) {
    case "exact":
      return `${label} only`;
    case "min":
      return `${label} or higher`;
    case "max":
      return `${label} or lower`;
  }
}

/** Does a candidate's level satisfy a post's requirement? `any`/undefined ⇒
 *  always true. Used for the "you qualify" hint and (future) match filtering. */
export function levelSatisfies(
  p: Pick<Post, "skillLevel" | "skillMode">,
  candidateLevel: number | undefined,
): boolean {
  const mode = p.skillMode ?? "any";
  if (mode === "any" || p.skillLevel == null) return true;
  const c = candidateLevel ?? 1;
  if (mode === "exact") return c === p.skillLevel;
  if (mode === "min") return c >= p.skillLevel;
  return c <= p.skillLevel; // max
}

// ---- Display helpers shared across screens ----
/** Format an integer-cents hourly rate for display.
 *  0 → "Free". Otherwise "$X/hour" (no fractional dollars in MVP — pricing
 *  is whole-dollar). Centralised so currency formatting only lives here. */
export function formatHourlyPrice(cents: number): string {
  if (cents <= 0) return "Free";
  const dollars = cents / 100;
  // Whole-dollar prices look better without trailing ".00"
  return Number.isInteger(dollars) ? `$${dollars}/hour` : `$${dollars.toFixed(2)}/hour`;
}
