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

// Post lifecycle (drives the Discover CTA + Events visibility):
//   open      — accepting takers; CTA is live.
//   pending   — a single-seat post that has a taker awaiting the author's
//               accept/decline. CTA is LOCKED (greyed) so nobody else can take
//               it while the author decides. Returns to `open` on decline /
//               timeout, or advances to `matched` on accept.
//   matched   — the author accepted; the seat(s) are committed.
//   completed — the activity happened.
//   cancelled — closed. Either the author cancelled, or the post was abandoned
//               (two pending requests timed out with no author response) — a
//               "no-response" post. Hidden from Discover/Events.
export type PostStatus = "open" | "pending" | "matched" | "completed" | "cancelled";

/**
 * Who's initiating the activity and how money flows (spec 0.1, dual-role
 * accounts — extended to three intents so the Discover map isn't ambiguous):
 *   • offer   — "I'm providing a service / skill" (the author earns). Tennis
 *     coach offering lessons, gym buddy offering to spot, host running a paid
 *     workshop.
 *   • seek    — "I need a service" (the author is the customer / pays). Looking
 *     for a tutor, a hitting partner to coach me, someone to fix my bike.
 *   • partner — "Let's do this together" (peers, no one is the service
 *     provider — free or split costs). Find a study buddy, a doubles partner,
 *     someone to split a Costco run.
 *
 * Drives:
 *   - UI copy / CTA ("I'll take that!" vs "I can help" vs "I'm in").
 *   - The kind chip + colour on cards and the detail sheet.
 *   - Default money mode in the composer (offer→paid, seek→budget,
 *     partner→free) — see `postKindMeta`.
 */
export type PostKind = "offer" | "seek" | "partner";

/**
 * The author's structured money expectation, chosen upfront in the composer
 * instead of buried in free-text. Shown as an at-a-glance badge on the map
 * cards so a viewer instantly knows the cost shape:
 *   • paid   — a set hourly rate (`priceCentsPerHour`). "$20/hr".
 *   • budget — the author is willing to pay up to a total (`budgetCents`).
 *              Used by "seek" posts. "Up to $50".
 *   • free   — free / mutual exchange. No money changes hands.
 *   • split  — costs are shared AA-style (court fee, gas, groceries).
 */
export type PriceMode = "paid" | "budget" | "free" | "split";

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
  /** Unique sequential order number for this post. Assigned once at creation
   *  and never reused — every new post gets the next number. Human-facing
   *  reference ("#1042") independent of the opaque `id`. */
  orderNo?: number;
  /** Lifecycle state. Defaults to "open" for rows written before this field
   *  existed. Drives the Discover/Events CTA lock and visibility. */
  status?: PostStatus;
  /** How many pending take-requests have timed out on this post (author never
   *  responded). At MAX_PENDING_ROUNDS the post is closed. */
  pendingRounds?: number;
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
  /** Structured money expectation chosen at post time. Optional for back-compat
   *  with rows written before this field existed — `resolvePriceMode` derives a
   *  value (paid when priceCentsPerHour>0, else free) when it's missing. */
  priceMode?: PriceMode;
  /** Total budget in integer cents for a `budget` money mode ("willing to pay
   *  up to $X"). Only meaningful when priceMode === "budget". */
  budgetCents?: number;
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
  /** Author-first roster of the group's committed members, used to render
   *  multiple avatars + multiple names on the order screen and on Discover
   *  (activities / events only). `participants[0]` is ALWAYS the post author /
   *  host. Undefined or empty for `one_on_one` posts. In production this is a
   *  join on the orders table; the mock seeds it directly. */
  participants?: User[];
};

/**
 * One entry in a post's PUBLIC note — an open, per-post Q&A that replaces
 * private DMs on the Discover surface (so nobody can cold-message / harass the
 * author). Anyone may leave a message; the post author's replies are rendered
 * on the right, everyone else on the left. Saved with the post (`postId`).
 */
/** When a public note is a reply to another note (long-press → reply, like
 *  WeChat/Feishu), this carries just enough of the quoted parent to render the
 *  quote inline without a second fetch. */
export type PublicNoteReplyTo = {
  noteId: string;
  authorId: string;
  authorName: string;
  excerpt: string;
};

export type PublicNote = {
  id: string;
  postId: string;
  /** Who wrote it. Compare `author.id === post.authorId` to decide side. */
  author: User;
  text: string;
  sentAt: string; // ISO
  /** Set when this note replies to (quotes) an earlier note. The quoted
   *  note's author gets a `public_note_reply` notification. */
  replyTo?: PublicNoteReplyTo;
};

// Order lifecycle (see spec 0.4 + 0.6):
//   pending      — taker tapped the CTA (I'll take that / I can help / I'm in);
//                  waiting for the POST AUTHOR to accept. Seat is reserved.
//   upcoming     — author accepted; scheduled, > 15 min from startAt.
//   checking_in  — within the check-in window (opens 15 min before start).
//                  3-channel cascade is active.
//   in_progress  — both parties present (≥ 1 channel each) — the session is on.
//   completed    — past endAt, both were present. Rateable.
//   no_show      — 15 min past startAt (or past endAt) with exactly one party
//                  present. The absent side pays the no-show fee.
//   cancelled    — a party cancelled / declined, OR auto-cancelled when neither
//                  party showed up (cancelReason = mutual_no_show). Not rateable.
export type OrderStatus =
  | "pending"
  | "upcoming"
  | "checking_in"
  | "in_progress"
  | "completed"
  | "no_show"
  | "cancelled";

// ---- Lifecycle timing (spec 0.6) ----
/** The check-in cascade unlocks this long BEFORE startAt. Before that the
 *  order screen shows a countdown instead of tappable channels. */
export const CHECK_IN_LEAD_MS = 15 * 60 * 1000;
/** A party is called a no-show this long AFTER startAt if they still haven't
 *  checked in. */
export const NO_SHOW_AFTER_START_MS = 15 * 60 * 1000;

/** How long the post author has to accept or decline a pending take-request
 *  before it auto-rejects (default reject) and the post re-opens. NOTE: the
 *  spec text was ambiguous (mentioned both "3 hours" and "1 hour"); this single
 *  constant is the source of truth — change it here to switch the window. */
export const PENDING_DECISION_MS = 3 * 60 * 60 * 1000;
/** How many pending take-requests may time out on a post before it is closed
 *  as a "no-response" post (author never responded across this many rounds). */
export const MAX_PENDING_ROUNDS = 2;
/** Rating deducted from an author whose post is closed for repeated
 *  non-response. Kept as a small tunable constant (spec: "保持为一个变量值"). */
export const RATING_NO_RESPONSE_PENALTY = 0.001;

/** Unfinished orders — surface under the "My Post" tab. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  "pending",
  "upcoming",
  "checking_in",
  "in_progress",
];
/** Finished orders — surface under the "History" tab. */
export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  "completed",
  "no_show",
  "cancelled",
];
export function isOrderActive(s: OrderStatus): boolean {
  return ACTIVE_ORDER_STATUSES.includes(s);
}
export function isOrderTerminal(s: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(s);
}
/** Only completed orders are rateable, and only until they're reviewed.
 *  no-show / cancelled orders are never rateable. Drives the History
 *  "unrated" count + marker. */
export function isRateable(o: Pick<Order, "status" | "reviewed">): boolean {
  return o.status === "completed" && !o.reviewed;
}

/** A post whose start time has already passed — it's in progress or over, so
 *  Discover pulls it off the map entirely (you can't join something that's
 *  already begun). */
export function isPostStarted(
  p: Pick<Post, "startAt">,
  now: number = Date.now(),
): boolean {
  return now >= new Date(p.startAt).getTime();
}

/** A 1-on-1 post that's already spoken-for (a booking is agreed or awaiting the
 *  author) but hasn't started yet. Discover still shows these — greyed and
 *  non-takeable ("Upcoming") — so people can see an upcoming booking without
 *  being able to join it, distinct from an `open` post anyone can still take.
 *
 *  GROUP activities/events are NEVER "incoming": they keep filling seats up to
 *  their cap, so a single joiner must not grey them out or lock the map pin —
 *  they stay joinable (showing "N/M joined") until full or started. */
export function isPostIncoming(p: Pick<Post, "status" | "format" | "seats">): boolean {
  if (isGroupPost(p)) return false;
  return p.status === "matched" || p.status === "pending";
}

/** The status an ACTIVE order should DISPLAY as once the wall clock crosses a
 *  lifecycle boundary — even if the server-side sweep hasn't persisted it yet.
 *  Mirrors sweepAutoComplete + finalizeOrder exactly so the My tab categorises
 *  identically in every data source (the mock finalises inline; supabase leans
 *  on a cron that can lag). Pending and already-terminal orders pass through
 *  unchanged: pending waits on the author, not the clock. */
export function effectiveOrderStatus(o: Order, now: number = Date.now()): OrderStatus {
  if (o.status === "pending" || isOrderTerminal(o.status)) return o.status;
  const start = new Date(o.startAt).getTime();
  const end = new Date(o.endAt).getTime();
  const pastEnd = now >= end;
  const noShowDeadline = now >= start + NO_SHOW_AFTER_START_MS && !everyonePresent(o);
  if (!pastEnd && !noShowDeadline) return o.status;
  // Same outcome rules as finalizeOrder: both present → completed, exactly one
  // present → no_show, neither → cancelled (mutual no-show).
  const self = isPartyPresent(o.checkIn.self);
  const other = isPartyPresent(o.checkIn.counterpart);
  if (self && other) return "completed";
  if (self || other) return "no_show";
  return "cancelled";
}
/** Absolute time (ms) the check-in window opens for an order. */
export function checkInOpensAt(o: Pick<Order, "startAt">): number {
  return new Date(o.startAt).getTime() - CHECK_IN_LEAD_MS;
}
/** True once the check-in window is open (15 min before start, onward). */
export function isCheckInOpen(o: Pick<Order, "startAt">, now: number = Date.now()): boolean {
  return now >= checkInOpensAt(o);
}
/** ms remaining until check-in opens; ≤ 0 means it's already open. */
export function msUntilCheckIn(o: Pick<Order, "startAt">, now: number = Date.now()): number {
  return checkInOpensAt(o) - now;
}

/** How a party got checked in.
 *   • location — their own device GPS matched the venue geofence (~100 m).
 *   • manual   — an already-checked-in participant vouched them in by hand
 *     (offline / no-signal fallback, or for someone whose GPS won't lock). */
export type CheckInMethod = "location" | "manual";
/** Party check-in lifecycle:
 *   • pending  — not checked in yet (grey).
 *   • locating — location auto check-in is running, matching GPS (orange).
 *   • confirmed— present (green). */
export type CheckInStatus = "pending" | "locating" | "confirmed";

/**
 * One party's check-in state. A party is "present" only when `status` is
 * "confirmed"; `method` records how, and `byUserId` who vouched them in when
 * the method is manual.
 */
export type PartyCheckIn = {
  status: CheckInStatus;
  method?: CheckInMethod;
  /** Set when method === "manual": the participant who checked them in. */
  byUserId?: string;
};

/** An extra group participant beyond self + counterpart (group activities). */
export type RosterEntry = { user: User; checkIn: PartyCheckIn };

/**
 * Order check-in state from the current viewer's POV. `self` is always the
 * user reading the order; `counterpart` is the 1-on-1 other side (for a group
 * activity it's the host). `others` holds any further participants so the
 * roster supports arbitrary group sizes. In the real backend the API serves a
 * per-viewer view.
 */
export type CheckIn = {
  self: PartyCheckIn;
  counterpart: PartyCheckIn;
  /** Group activities only — empty/undefined for 1-on-1. */
  others?: RosterEntry[];
};

export type CancelReason =
  | "weather"
  | "personal"
  | "other"
  /** Both parties failed to check in — order auto-cancelled, refund issued,
   *  no fee, no rating impact (spec: shouldn't penalize a meetup that simply
   *  didn't happen for both sides). */
  | "mutual_no_show"
  /** The post author never accepted/declined a pending take-request within
   *  PENDING_DECISION_MS, so it defaulted to reject. The taker sees the order
   *  as cancelled; the post re-opens (or closes after MAX_PENDING_ROUNDS). */
  | "author_no_response";

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

/** A party is "present" once their check-in is confirmed. */
export function isPartyPresent(p: PartyCheckIn): boolean {
  return p.status === "confirmed";
}

/** Fresh not-checked-in party. */
export const pendingParty = (): PartyCheckIn => ({ status: "pending" });
/** A confirmed party (default via location). */
export const confirmedParty = (method: CheckInMethod = "location"): PartyCheckIn => ({
  status: "confirmed",
  method,
});

/** One row of the viewer-relative check-in roster. */
export type RosterMember = { user: User; checkIn: PartyCheckIn; isSelf: boolean };

/** Flatten an order's check-in into a single roster: self, counterpart, then
 *  any extra group participants. `selfUser` is supplied by the caller (the
 *  order only embeds the counterpart). */
export function checkInRoster(
  o: Pick<Order, "checkIn" | "counterpart">,
  selfUser: User,
): RosterMember[] {
  return [
    { user: selfUser, checkIn: o.checkIn.self, isSelf: true },
    { user: o.counterpart, checkIn: o.checkIn.counterpart, isSelf: false },
    ...(o.checkIn.others ?? []).map((e) => ({ user: e.user, checkIn: e.checkIn, isSelf: false })),
  ];
}

/** Total number of parties expected to check in (self + counterpart + others). */
export function rosterSize(o: Pick<Order, "checkIn">): number {
  return 2 + (o.checkIn.others?.length ?? 0);
}
/** How many parties are confirmed present. */
export function presentCount(o: Pick<Order, "checkIn">): number {
  let n = 0;
  if (isPartyPresent(o.checkIn.self)) n++;
  if (isPartyPresent(o.checkIn.counterpart)) n++;
  for (const e of o.checkIn.others ?? []) if (isPartyPresent(e.checkIn)) n++;
  return n;
}
/** Everyone in the roster is present — the gate into `in_progress`. */
export function everyonePresent(o: Pick<Order, "checkIn">): boolean {
  return presentCount(o) === rosterSize(o);
}

/** True when a post is a multi-person activity/event (not a 1-on-1 service). */
export function isGroupPost(p: Pick<Post, "format" | "seats">): boolean {
  return p.format !== "one_on_one" && (p.seats ?? 1) > 1;
}

/** First name (word) of a user — used in the compact multi-member label. */
function firstName(u: User): string {
  return u.name.split(/\s+/)[0] || u.name;
}

/**
 * One-line "who's going" label for a group activity, e.g.
 *   "Liam, Ava, Noah · 6 members".
 * `members` is author-first (index 0 = host); `total` is the full headcount,
 * which may exceed the number of names shown. Shows up to 3 first names.
 */
export function groupMemberLabel(members: User[], total: number): string {
  const names = members.slice(0, 3).map(firstName).join(", ");
  const count = Math.max(total, members.length);
  return names ? `${names} · ${count} members` : `${count} members`;
}

/** Average rating across a group activity's joined members. A group's headline
 *  rating is the mean of everyone who's in it (host + participants), not just
 *  the host — so a highly-rated host can't mask weaker teammates and vice
 *  versa. Members with no ratings yet are skipped; if nobody is rated we fall
 *  back to the plain mean (which is 0), so the caller can hide it. */
export function groupAverageRating(members: User[]): { rating: number; count: number } {
  const rated = members.filter((m) => (m.ratingCount ?? 0) > 0);
  const pool = rated.length > 0 ? rated : members;
  if (pool.length === 0) return { rating: 0, count: 0 };
  const sum = pool.reduce((s, m) => s + (m.rating ?? 0), 0);
  return { rating: sum / pool.length, count: rated.length };
}

/** Deterministic accent color for a user's avatar ring (public-note asker
 *  differentiation). Stable per user id so the same person always reads the
 *  same colour. */
const AVATAR_RING_PALETTE = [
  "#4C9EEB", // accentBlue
  "#7C6CF0", // accentPurple
  "#3EC28F", // accentGreen
  "#FF6B35", // brand
  "#E0A32E", // amber
  "#E0567A", // rose
  "#2FB5C4", // teal
  "#8E7CC3", // lilac
];
export function avatarRingColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_RING_PALETTE[h % AVATAR_RING_PALETTE.length];
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
  /** True for multi-person activity chats. When set, `title` names the
   *  activity and `members` holds every participant (excluding the viewer);
   *  `counterpart` still points at the host so 1-on-1 code keeps working. */
  isGroup?: boolean;
  /** Group display name (usually the activity/post title). */
  title?: string;
  /** All other participants in a group chat (host + joiners, minus the
   *  viewer). Used for the stacked avatars and sender-name lookup. */
  members?: User[];
};

export type Message = {
  id: string;
  threadId: string;
  fromUserId: string;
  text: string;
  sentAt: string;
  /** Attached image (chat photo). Text may be empty when a message is
   *  image-only. */
  imageUrl?: string;
};

// ---- In-app notifications ----
/** Notification kinds. The shape stays general (kind + jump target) so
 *  different events can reuse it:
 *   • public_note_posted — someone left a top-level public note on YOUR post
 *                         (you're the author). Jump target is that note.
 *   • public_note_reply — someone replied to your public note.
 *   • order_request     — someone tapped a CTA to take your post; you (the
 *                         author) must accept/decline. Jump target is the order. */
export type NotificationKind = "public_note_posted" | "public_note_reply" | "order_request";

export type Notification = {
  id: string;
  /** Recipient (the viewer who owns this notification). */
  userId: string;
  kind: NotificationKind;
  read: boolean;
  createdAt: string; // ISO
  /** Who triggered it — the replier, or the person taking the order. */
  actor: { id: string; name: string; avatarUrl?: string };
  /** Jump target: the post the notification concerns. */
  postId: string;
  postTitle: string;
  /** public_note_reply only — the reply note to scroll to / highlight. */
  noteId?: string;
  /** public_note_reply only — the viewer's original note that was replied to. */
  parentNoteId?: string;
  /** order_request only — the order the author should accept/decline. */
  orderId?: string;
  /** Short preview (reply text, or the take-request line). */
  excerpt: string;
};

/** Unread badge counts driving the orange dots on the Message tab and the
 *  Notification / Chat sub-tabs. */
export type UnreadCounts = {
  chat: number;
  notifications: number;
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
  /** Time-window facet (ISO). A post matches when its [startAt, endAt] interval
   *  overlaps [windowStart, windowEnd]. Both must be set to take effect. The UI
   *  builds a same-day window, but the API only cares about the interval. */
  windowStart?: string;
  windowEnd?: string;
  /** Filter by `Post.kind`. Undefined returns both seeks and offers. */
  kind?: PostKind;
  /** Multi-select kind facet (Offer / Seek / Partner). Empty/undefined = no
   *  filter. A post matches if its kind is in the set. Drives the "Post type"
   *  section of the filter sheet. */
  kinds?: PostKind[];
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

/** Whole-dollar when integral, else 2dp. Shared by the money badges. */
function fmtDollars(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}

// ---- Post kind (offer / seek / partner) presentation ----
export type PostKindMeta = {
  /** Selector / chip label, e.g. "Offering". */
  label: string;
  /** Uppercase short chip text, e.g. "OFFERING". */
  short: string;
  /** Ionicons glyph name. */
  icon: string;
  /** Accent colour (hex) for the chip / icon. */
  color: string;
  /** Primary CTA copy shown to a viewer who can take the post. */
  cta: string;
  /** One-line helper shown under the option in the composer. */
  blurb: string;
  /** Default money mode when the author first picks this kind. */
  defaultPriceMode: PriceMode;
};

/** Single source of truth for how each post kind reads across the app. */
export function postKindMeta(kind: PostKind): PostKindMeta {
  switch (kind) {
    case "seek":
      return {
        label: "Looking for",
        short: "LOOKING FOR",
        icon: "hand-right-outline",
        color: "#7C6CF0",
        cta: "I can help",
        blurb: "I need a service — someone else provides it (I pay).",
        defaultPriceMode: "budget",
      };
    case "partner":
      return {
        label: "Partnering",
        short: "PARTNERING",
        icon: "people-outline",
        color: "#3EC28F",
        cta: "I'm in",
        blurb: "Let's do it together — peers, no one's the pro (free / split).",
        defaultPriceMode: "free",
      };
    case "offer":
    default:
      return {
        label: "Offering",
        short: "OFFERING",
        icon: "megaphone-outline",
        color: "#FF6B35",
        cta: "I'll take that!",
        blurb: "I provide a service or skill — others sign up (I earn).",
        defaultPriceMode: "paid",
      };
  }
}

// ---- Money expectation presentation ----
/** Derive the effective money mode, tolerating rows written before the field
 *  existed: a positive hourly rate ⇒ paid, otherwise free. */
export function resolvePriceMode(
  p: Pick<Post, "priceMode" | "priceCentsPerHour">,
): PriceMode {
  if (p.priceMode) return p.priceMode;
  return p.priceCentsPerHour > 0 ? "paid" : "free";
}

export type MoneyBadge = {
  /** Compact label for map cards, e.g. "$20/hr", "Up to $50", "Free", "Split". */
  label: string;
  /** Ionicons glyph name. */
  icon: string;
  /** Accent colour (hex). */
  color: string;
};

/** At-a-glance money badge for Discover cards / bubbles. */
export function moneyBadge(
  p: Pick<Post, "priceMode" | "priceCentsPerHour" | "budgetCents">,
): MoneyBadge {
  switch (resolvePriceMode(p)) {
    case "paid":
      return {
        label: p.priceCentsPerHour > 0 ? `$${fmtDollars(p.priceCentsPerHour)}/hr` : "Free",
        icon: "cash-outline",
        color: "#4C9EEB",
      };
    case "budget":
      return {
        label: p.budgetCents ? `Up to $${fmtDollars(p.budgetCents)}` : "Budget",
        icon: "wallet-outline",
        color: "#7C6CF0",
      };
    case "split":
      return { label: "Split cost", icon: "swap-horizontal-outline", color: "#FF6B35" };
    case "free":
    default:
      return { label: "Free", icon: "gift-outline", color: "#138C5E" };
  }
}

/** Longer money label for the detail sheet (spells out the intent). */
export function moneyExpectationLabel(
  p: Pick<Post, "priceMode" | "priceCentsPerHour" | "budgetCents">,
): string {
  switch (resolvePriceMode(p)) {
    case "paid":
      return p.priceCentsPerHour > 0 ? `$${fmtDollars(p.priceCentsPerHour)}/hour` : "Free";
    case "budget":
      return p.budgetCents ? `Budget: up to $${fmtDollars(p.budgetCents)}` : "Open budget";
    case "split":
      return "Split costs";
    case "free":
    default:
      return "Free / mutual exchange";
  }
}

/** A day label for an activity's date, so a bare "17:00 - 18:30" isn't
 *  ambiguous. "Today" / "Tomorrow" for the near days, otherwise "MM/DD". */
export function dayPrefix(iso: string): string {
  const d = new Date(iso);
  const startOfDay = (x: Date) => {
    const c = new Date(x);
    c.setHours(0, 0, 0, 0);
    return c.getTime();
  };
  const diffDays = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}
