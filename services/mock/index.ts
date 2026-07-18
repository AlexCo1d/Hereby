import type { HerebyApi } from "../api";
import {
  ME,
  MESSAGES,
  NOTIFICATIONS,
  ORDERS,
  POSTS,
  PUBLIC_NOTES,
  THREADS,
  UCF_CENTER,
  USERS,
} from "./data";
import type {
  CancelReason,
  ChatThread,
  DiscoverFilter,
  Notification,
  Order,
  PartyCheckIn,
  Post,
  PublicNote,
  PublicNoteReplyTo,
  Rating,
  RosterEntry,
  User,
} from "../types";
import {
  FEE_POLICY_VERSION,
  MAX_PENDING_ROUNDS,
  NO_SHOW_AFTER_START_MS,
  PENDING_DECISION_MS,
  RATING_NO_RESPONSE_PENALTY,
  everyonePresent,
  isOrderTerminal,
  isPartyPresent,
  postSearchSurface,
} from "../types";

// Haversine distance between two coords in miles.
function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function applyFilter<
  T extends {
    location: { lat: number; lng: number };
    category: string;
    authorId?: string;
    seats?: number;
    kind?: string;
    format?: string;
    skillLevel?: number;
    skillMode?: string;
    startAt?: string;
    endAt?: string;
    status?: string;
  },
>(list: T[], f?: DiscoverFilter): T[] {
  if (!f) return list;
  // Closed posts (author-cancelled or abandoned "no-response" posts) never
  // surface on Discover / Events. `listMyPosts` bypasses this filter so the
  // author still sees their own closed posts.
  let out = list.filter((p) => p.status !== "cancelled" && p.status !== "completed");
  // Discover/Events never show a post whose start time has already passed — it's
  // in progress or over, so it comes off the map. Upcoming posts stay, whether
  // still `open` or already agreed ("in-coming"); the UI greys the latter.
  const nowMs = Date.now();
  out = out.filter((p) => !p.startAt || new Date(p.startAt).getTime() > nowMs);
  if (f.tags && f.tags.length > 0) {
    // Multi-tag fuzzy match (spec: search isn't limited to a single
    // category). A post is kept if ANY selected term appears anywhere in its
    // search surface (category + tags + badges + title + description). This
    // is forgiving by design — users type many loosely-related terms and
    // expect a broad, relevant set back; matchScore handles fine ranking.
    const terms = f.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    out = out.filter((p) => {
      const surface = postSearchSurface(p as any); // joined lowercase string
      const surfaceWords = surface.split(/[^a-z0-9]+/).filter(Boolean);
      return terms.some((term) => {
        // 1) whole-term substring: query "badminton" hits tag "badminton player".
        if (surface.includes(term)) return true;
        // 2) word-level subset both ways: query "badminton player" hits a post
        //    tagged just "badminton", and a 1-word query hits any word prefix.
        const termWords = term.split(/[^a-z0-9]+/).filter(Boolean);
        return termWords.some((tw) =>
          surfaceWords.some((sw) => sw.includes(tw) || tw.includes(sw)),
        );
      });
    });
  }
  if (f.center && f.radiusMiles) {
    out = out.filter((p) => distanceMiles(p.location, f.center!) <= f.radiusMiles!);
  }
  if (f.query) {
    const q = f.query.toLowerCase();
    out = out.filter((p) => JSON.stringify(p).toLowerCase().includes(q));
  }
  if (f.excludeAuthorId) {
    out = out.filter((p) => p.authorId !== f.excludeAuthorId);
  }
  // Format filtering. Explicit `formats` wins; otherwise `onlyEvents` means
  // "any group format" (activity + event), i.e. not one_on_one.
  if (f.formats && f.formats.length > 0) {
    out = out.filter((p) => p.format != null && f.formats!.includes(p.format as any));
  } else if (f.onlyEvents) {
    out = out.filter((p) => p.format !== "one_on_one");
  }
  if (f.kind) {
    out = out.filter((p) => p.kind === f.kind);
  }
  if (f.kinds && f.kinds.length > 0) {
    out = out.filter((p) => f.kinds!.some((k) => k === p.kind));
  }
  // Skill-level facet — forgiving: a post with no requirement (skillMode
  // "any"/undefined) always passes; otherwise its level must be in the set.
  if (f.skillLevels && f.skillLevels.length > 0) {
    out = out.filter(
      (p) =>
        p.skillMode == null ||
        p.skillMode === "any" ||
        (p.skillLevel != null && f.skillLevels!.includes(p.skillLevel)),
    );
  }
  // Group-size facet, via inclusive seat bounds.
  if (f.minSeats != null) {
    out = out.filter((p) => (p.seats ?? 1) >= f.minSeats!);
  }
  if (f.maxSeats != null) {
    out = out.filter((p) => (p.seats ?? 1) <= f.maxSeats!);
  }
  // Time-window facet — keep posts whose [startAt, endAt] overlaps the window.
  // Standard interval overlap: start < windowEnd AND end > windowStart.
  if (f.windowStart && f.windowEnd) {
    const ws = new Date(f.windowStart).getTime();
    const we = new Date(f.windowEnd).getTime();
    out = out.filter((p) => {
      if (!p.startAt) return false;
      const s = new Date(p.startAt).getTime();
      const e = p.endAt ? new Date(p.endAt).getTime() : s;
      return s < we && e > ws;
    });
  }
  return out;
}

// Tiny artificial latency so the UI shows loading states realistically.
const wait = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));

const mockRatings: Rating[] = [];

// ---- Order-number sequence ----
// Every post carries a unique, never-reused sequential order number. Seeded
// rows are backfilled once at module load (and get their default lifecycle
// fields); new posts pull the next value via nextOrderNo().
let orderNoSeq = 1000;
(function seedPostLifecycle() {
  for (const p of POSTS) {
    if (p.orderNo == null) p.orderNo = orderNoSeq++;
    p.status = p.status ?? "open";
    p.pendingRounds = p.pendingRounds ?? 0;
  }
})();
function nextOrderNo(): number {
  return orderNoSeq++;
}

// ---- Viewer identity (mock multi-user) ------------------------------------
// The mock is normally single-viewer ("me"), but the local login backdoor can
// switch identity so post state-transitions can be exercised across several
// accounts on one device. Everything the UI reads orients around VIEWER_ID.
//
// Design contract (keeps the seeded "me" demo byte-for-byte unchanged):
//   • Every order records `selfId` = the participant/creator whose side is
//     stored as `checkIn.self`. Seeds default to "me", so when VIEWER_ID is
//     "me" the projection is a no-op and behaviour is identical to before.
//   • An order is visible to a viewer if they ARE that participant, OR they
//     authored the post it sits on (host view → we flip the two sides so the
//     host sees themselves as `self`). Anything else is hidden.
const USER_REGISTRY = new Map<string, User>();
USER_REGISTRY.set(ME.id, ME);
for (const u of USERS) USER_REGISTRY.set(u.id, u);

let VIEWER_ID = ME.id;

/** Per-order absolute ownership so orders project correctly for any viewer.
 *  `selfId` — the user whose side is stored under `checkIn.self` (the taker /
 *  joiner who placed it). `hostId` — the post author. `taker` — the joiner's
 *  User (needed to show the host who joined). Seeds carry no entry and fall
 *  back to selfId "me" / the order's own counterpart. */
const orderSelfId = new Map<string, string>();
const orderHostId = new Map<string, string>();
const orderTaker = new Map<string, User>();

function selfIdOf(o: Order): string {
  return orderSelfId.get(o.id) ?? ME.id;
}
function hostIdOf(o: Order): string {
  return orderHostId.get(o.id) ?? o.counterpart.id;
}

/** Register/refresh a user in the mock directory so lookups resolve a freshly
 *  logged-in account. Non-"me" users are also appended to USERS so seeded
 *  helpers that scan the array see them. */
function registerUser(u: User): void {
  USER_REGISTRY.set(u.id, u);
  if (u.id !== ME.id && !USERS.some((x) => x.id === u.id)) USERS.push(u);
}

/** Switch the signed-in viewer (called by the auth store's mock login). */
export function setViewer(u: User): void {
  registerUser(u);
  VIEWER_ID = u.id;
}

/** Point the viewer at an already-known id (used on app restore, when the mock
 *  module memory has reset but a persisted account id survives). Unknown ids
 *  fall back to the default demo viewer "me". */
export function setViewerById(id: string): void {
  VIEWER_ID = USER_REGISTRY.has(id) ? id : ME.id;
}

// Ids that map to a concrete seeded person. Logging in with one of their names
// (e.g. "marcus@ucf.edu" or "u_marcus@…") impersonates that account so the
// HOST side of a flow — accepting a 1-on-1 request, seeing who joined a group —
// can be exercised on a single device. Every OTHER email is the demo viewer
// "me", so a normal login is unchanged (still sees the seeded "me" data).
const SEEDED_IDS = new Set<string>([ME.id, ...USERS.map((u) => u.id)]);

/** Resolve a login email to a mock viewer. Seeded aliases impersonate that
 *  user; anything else is the default demo viewer "me". */
export function resolveMockViewer(email: string): User {
  const local = (email.toLowerCase().split("@")[0] ?? "").trim();
  const asId = local.startsWith("u_") ? local : `u_${local}`;
  if (SEEDED_IDS.has(asId)) return USER_REGISTRY.get(asId) ?? ME;
  return ME;
}

/** Mock login: resolve the email to a viewer, make it current, return the
 *  User so the auth store can fill the session profile. */
export function mockLogin(email: string): User {
  const u = resolveMockViewer(email);
  setViewer(u);
  return u;
}

/** The signed-in viewer's full profile. */
function currentUser(): User {
  return USER_REGISTRY.get(VIEWER_ID) ?? ME;
}

/** Which stored check-in side the current viewer occupies on an order, or null
 *  if the order isn't theirs to act on. Participant → "self"; post author →
 *  "counterpart" (the host is stored on the counterpart side of a placed
 *  order). Used so check-in mutations write the correct side per viewer. */
function viewerSide(o: Order): "self" | "counterpart" | null {
  if (selfIdOf(o) === VIEWER_ID) return "self";
  if (hostIdOf(o) === VIEWER_ID) return "counterpart";
  return null;
}

/** Flip a stored (taker-relative) order into the host's point of view: the
 *  host becomes `self`, the joiner becomes `counterpart`, and `isMyPost` reads
 *  true. Group rosters (`others`) carry across unchanged. */
function projectForHost(o: Order): Order {
  const taker = orderTaker.get(o.id) ?? o.counterpart;
  return {
    ...o,
    isMyPost: true,
    counterpart: taker,
    checkIn: {
      self: o.checkIn.counterpart,
      counterpart: o.checkIn.self,
      ...(o.checkIn.others ? { others: o.checkIn.others } : {}),
    },
  };
}

/** Project a stored order into the current viewer's frame, or null if it isn't
 *  visible to them. Participant sees it as-stored; post author sees the flip. */
function orderForViewer(o: Order): Order | null {
  if (selfIdOf(o) === VIEWER_ID) return o;
  const post = POSTS.find((p) => p.id === o.postId);
  if (post && post.authorId === VIEWER_ID) return projectForHost(o);
  return null;
}

// ---- Runtime chat state layered on top of the order-derived threads ----
// Production reads all of this from the messages / threads tables; the mock
// keeps it in module memory so it survives within a session.
/** Threads opened via `openThreadWith` that aren't backed by an order yet
 *  (event / activity host contact). */
const manualThreads: ChatThread[] = [];
/** Per-thread last-message override so sent messages update the preview even
 *  for order-derived threads (which are rebuilt on every listThreads call). */
const lastMsgOverride = new Map<string, { text: string; at: string }>();
/** Per-thread unread override (markThreadRead writes 0 here). */
const unreadOverride = new Map<string, number>();
/** Soft-deleted thread ids (hidden from the inbox until re-activated). */
const deletedThreadIds = new Set<string>();

/** Build the full, access-checked thread list: order-derived + manual,
 *  with overrides applied and soft-deleted threads removed. Shared by
 *  listThreads / getThread so the gate logic lives in one place. */
function buildThreads(): ChatThread[] {
  const byKey = new Map<string, ChatThread>();
  for (const o of ORDERS) {
    // Scope the inbox to threads this viewer is part of (their own placed
    // orders + orders on posts they host). For the seeded "me" demo every
    // order qualifies, so the thread set is unchanged.
    if (!orderForViewer(o)) continue;
    // A group activity (roster has `others`) becomes a single group chat,
    // keyed by its POST so every participant shares one room (and it never
    // collapses into the host's 1-on-1 thread). `t_g_<postId>` is stable
    // regardless of which member's order we're iterating.
    const others = o.checkIn.others ?? [];
    if (others.length > 0) {
      const key = `g_${o.postId}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.linkedOrderIds.push(o.id);
        // Union in any roster members this order contributes that the room
        // doesn't already list (host + fellow joiners across all orders).
        const seen = new Set(existing.members?.map((m) => m.id) ?? []);
        for (const m of [o.counterpart, ...others.map((e) => e.user)]) {
          if (!seen.has(m.id)) {
            existing.members = [...(existing.members ?? []), m];
            seen.add(m.id);
          }
        }
        continue;
      }
      const seed = THREADS.find((t) => t.id === `t_g_${o.postId}`);
      byKey.set(key, {
        id: `t_g_${o.postId}`,
        counterpart: o.counterpart,
        isGroup: true,
        title: o.postTitleSnapshot,
        members: [o.counterpart, ...others.map((e) => e.user)],
        lastMessage: seed?.lastMessage ?? "Tap to start the conversation",
        lastMessageAt: seed?.lastMessageAt ?? o.startAt,
        unread: seed?.unread ?? 0,
        linkedOrderIds: [o.id],
      });
      continue;
    }
    const cpId = o.counterpart.id;
    const existing = byKey.get(cpId);
    if (existing) {
      existing.linkedOrderIds.push(o.id);
    } else {
      const seed = THREADS.find((t) => t.counterpart.id === cpId);
      byKey.set(cpId, {
        id: seed?.id ?? `t_${cpId}`,
        counterpart: o.counterpart,
        lastMessage: seed?.lastMessage ?? "Tap to start the conversation",
        lastMessageAt: seed?.lastMessageAt ?? o.startAt,
        unread: seed?.unread ?? 0,
        linkedOrderIds: [o.id],
      });
    }
  }
  // Merge manual (pre-order, event/activity) threads — skip if an order
  // thread for the same counterpart already exists.
  for (const mt of manualThreads) {
    if (!byKey.has(mt.counterpart.id)) {
      byKey.set(mt.counterpart.id, { ...mt });
    }
  }
  const out: ChatThread[] = [];
  for (const t of byKey.values()) {
    if (deletedThreadIds.has(t.id)) continue;
    const lm = lastMsgOverride.get(t.id);
    if (lm) {
      t.lastMessage = lm.text;
      t.lastMessageAt = lm.at;
    }
    const u = unreadOverride.get(t.id);
    if (u != null) t.unread = u;
    out.push(t);
  }
  // Newest conversation first.
  out.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  return out;
}

/** Derived: how many active (non-cancelled) orders are bound to this post.
 *  Same definition the server will eventually use — only `cancelled` orders
 *  free up seats. `no_show` and `completed` still count toward the cap so
 *  a finished session doesn't make a new sign-up race in. */
function seatsTakenFor(postId: string): number {
  return ORDERS.filter((o) => o.postId === postId && o.status !== "cancelled").length;
}

/** Decorate a post with the live seatsTaken count. */
function withSeats(p: Post): Post {
  return { ...p, seatsTaken: seatsTakenFor(p.id) };
}

/** The live pending take-request on a post, if one is awaiting the author's
 *  accept/decline. Used to lock a single-seat post's CTA. */
function pendingOrderFor(postId: string): Order | undefined {
  return ORDERS.find((o) => o.postId === postId && o.status === "pending");
}

/** Small rating hit for an author who abandons a post (never responds to
 *  take-requests across MAX_PENDING_ROUNDS). Clamped at 0. */
function deductAuthorRating(authorId: string): void {
  const author = USERS.find((u) => u.id === authorId);
  if (author) author.rating = Math.max(0, author.rating - RATING_NO_RESPONSE_PENALTY);
}

/** Default-reject a timed-out pending request: cancel the order (the taker
 *  then sees it as cancelled in History), then either re-open the post for
 *  another round or — once MAX_PENDING_ROUNDS is reached — close it as a
 *  no-response post and ding the author's rating. */
function autoRejectPending(o: Order): void {
  o.status = "cancelled";
  o.autoCancelled = true;
  o.cancelReason = "author_no_response";
  o.feeAmountCents = 0;
  o.feeChargedToUserId = undefined;
  o.feeKind = undefined;
  o.refundIssued = true;
  o.refundAmountCents = 0;
  if (o.paymentStatus === "authorized") o.paymentStatus = "refunded";
  const post = POSTS.find((p) => p.id === o.postId);
  if (!post) return;
  post.pendingRounds = (post.pendingRounds ?? 0) + 1;
  if (post.pendingRounds >= MAX_PENDING_ROUNDS) {
    post.status = "cancelled"; // closed — abandoned "no-response" post
    deductAuthorRating(post.authorId);
  } else {
    post.status = "open"; // re-opens for a second round
  }
}

/**
 * Spec 0.8 — rule-based match scoring, server-computed.
 *
 *     matchScore = tagMatch × distanceDecay × ratingTerm    ∈ [0, 1]
 *
 *   tagMatch     — boolean (1 if any of viewer's interest tags overlap with
 *                  the post's category or badges, 0 otherwise). Spec 0.8
 *                  explicitly says it's boolean, NOT overlap count.
 *   distanceDecay — exp(-d / r) clipped to [0, 1]; d = miles from viewer
 *                   center to post, r = viewer's radius. Stays > 0 even at
 *                   the edge so far posts are penalized but not vanished.
 *   ratingTerm   — author's avg rating normalized to [0, 1] = rating / 5.
 *                  New users (count = 0) get the neutral floor 0.6 so they
 *                  aren't unrankable.
 *
 * Returned undefined when we don't have the inputs (no viewer center).
 */
function computeMatchScore(
  p: Post,
  author: User | undefined,
  filter: DiscoverFilter,
): number | undefined {
  if (!filter.useMatchScore) return undefined;
  if (!filter.center || !filter.radiusMiles) return undefined;

  const viewerTags = filter.viewerInterestIds ?? [];
  const postTagSurface = [p.category, ...(p.tags ?? []), ...(p.badges ?? [])].map((t) =>
    t.toLowerCase(),
  );
  const tagMatch =
    viewerTags.length === 0
      ? 1 // no preferences set → treat everything as a match
      : viewerTags.some((t) => postTagSurface.includes(t.toLowerCase()))
        ? 1
        : 0;

  const d = distanceMiles(p.location, filter.center);
  const distanceDecay = Math.min(1, Math.max(0, Math.exp(-d / filter.radiusMiles)));

  const ratingTerm = author
    ? author.ratingCount === 0
      ? 0.6
      : Math.max(0, Math.min(1, author.rating / 5))
    : 0.6;

  return tagMatch * distanceDecay * ratingTerm;
}

/** Look up the absolute user id on each side of an order. `self` is the
 *  participant/joiner who placed it (stored on the `checkIn.self` side);
 *  `counterpart` is the post author/host. Returned as a typed pair so callers
 *  can be explicit about which side they're attributing a fee to. */
function userIdsForOrder(o: Order): { self: string; counterpart: string } {
  return { self: selfIdOf(o), counterpart: hostIdOf(o) };
}

/** During the check-in window, keep the live status in sync with the roster:
 *  the order is only `in_progress` once EVERY member (self + counterpart +
 *  any group `others`) is present; otherwise it sits at `checking_in`. */
function recomputeCheckInStatus(o: Order): void {
  if (o.status === "upcoming" || o.status === "checking_in") {
    o.status = everyonePresent(o) ? "in_progress" : "checking_in";
  }
}

/**
 * Single source of truth for the "what does this order resolve to" decision.
 * Used both by the manual "Mark done" CTA (`completeOrder`) and the server-
 * cron simulation (`sweepAutoComplete`) so the rules never drift between
 * paths. Mutates the order in place.
 *
 * Also stamps the fee scaffold (spec 0.4 — rates are $0 in MVP but the
 * columns get populated so the settlement worker has somewhere to read).
 */
function finalizeOrder(o: Order): void {
  const selfThere = isPartyPresent(o.checkIn.self);
  const otherThere = isPartyPresent(o.checkIn.counterpart);
  const ids = userIdsForOrder(o);
  // MVP rate = $0. Phase 2 reads the policy table for the rate at this
  // order's feePolicyVersion.
  const NO_SHOW_FEE = 0;

  o.feePolicyVersion = o.feePolicyVersion ?? FEE_POLICY_VERSION;

  if (selfThere && otherThere) {
    o.status = "completed";
    o.noShowSide = undefined;
    o.feeAmountCents = 0;
    o.feeChargedToUserId = undefined;
    o.feeKind = undefined;
    // Phase 2: capture the authorization. Mock just flips the marker.
    if (o.paymentStatus === "authorized") o.paymentStatus = "captured";
  } else if (selfThere && !otherThere) {
    o.status = "no_show";
    o.noShowSide = "counterpart";
    o.feeAmountCents = NO_SHOW_FEE;
    o.feeChargedToUserId = ids.counterpart;
    o.feeKind = "no_show";
  } else if (!selfThere && otherThere) {
    o.status = "no_show";
    o.noShowSide = "self";
    o.feeAmountCents = NO_SHOW_FEE;
    o.feeChargedToUserId = ids.self;
    o.feeKind = "no_show";
  } else {
    // Neither side showed up — auto-cancel, refund, no fee, no rating impact.
    o.status = "cancelled";
    o.cancelledByUserId = undefined;
    o.autoCancelled = true;
    o.cancelReason = "mutual_no_show";
    o.feeAmountCents = 0;
    o.feeChargedToUserId = undefined;
    o.feeKind = undefined;
    o.refundIssued = true;
    o.refundAmountCents = 0; // MVP: no money actually moved. Phase 2: original amount.
    if (o.paymentStatus === "authorized") o.paymentStatus = "refunded";
  }
}

/** Apply cancellation-fee policy when a party manually cancels. Spec 0.4 —
 *  within 12h → fee charged to canceller, unless reason is "weather". */
function stampCancelFee(o: Order, by: string, reason: CancelReason): void {
  o.feePolicyVersion = o.feePolicyVersion ?? FEE_POLICY_VERSION;
  const insideFee =
    new Date(o.startAt).getTime() - Date.now() < 12 * 3600 * 1000;
  const exempt = reason === "weather" || reason === "mutual_no_show";
  const CANCEL_FEE_CENTS = 0; // MVP rate. Phase 2 reads from policy table.
  if (insideFee && !exempt) {
    o.feeAmountCents = CANCEL_FEE_CENTS;
    o.feeChargedToUserId = by;
    o.feeKind = "cancellation";
    o.refundIssued = false;
  } else {
    o.feeAmountCents = 0;
    o.feeChargedToUserId = undefined;
    o.feeKind = undefined;
    o.refundIssued = true;
    o.refundAmountCents = 0;
    if (o.paymentStatus === "authorized") o.paymentStatus = "refunded";
  }
}

export const mockApi: HerebyApi = {
  async getCurrentUser() {
    return wait(currentUser());
  },
  async listPosts(filter) {
    const filtered = applyFilter(POSTS, filter).map(withSeats);
    if (!filter?.useMatchScore) return wait(filtered);
    // Spec 0.8 — server-computed match score + ranking. Frontend just
    // renders the order it receives. Authors are fetched here (in prod a
    // single JOIN on auth.users.id == posts.author_id).
    const scored = filtered.map((p) => {
      const author = USERS.find((u) => u.id === p.authorId);
      return { ...p, matchScore: computeMatchScore(p, author, filter) };
    });
    scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    return wait(scored);
  },
  async getPost(id) {
    const p = POSTS.find((x) => x.id === id);
    return wait(p ? withSeats(p) : null);
  },
  async createPost(input) {
    const post: Post = {
      ...input,
      id: `p_${Date.now()}`,
      postedAt: new Date().toISOString(),
      orderNo: nextOrderNo(),
      status: "open",
      pendingRounds: 0,
    };
    // Prepend so the newest post shows up first in discovery.
    POSTS.unshift(post);
    return wait(post);
  },
  async updatePost(id, patch) {
    const p = POSTS.find((x) => x.id === id);
    if (!p) throw new Error("Post not found");
    // Author check (prod enforces via RLS / auth.uid()). In the mock, only
    // posts authored by the viewer are editable.
    if (p.authorId !== VIEWER_ID) throw new Error("You can only edit your own posts.");
    Object.assign(p, patch);
    return wait(withSeats(p));
  },
  async listMyPosts() {
    // Posts the current user authored, newest first, decorated with the live
    // seatsTaken count. Drives the "My Post" tab's waiting/matched cards.
    return wait(
      POSTS.filter((p) => p.authorId === VIEWER_ID)
        .map(withSeats)
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()),
    );
  },
  async listMyOrders() {
    // Project every order into the current viewer's frame and drop the ones
    // that aren't theirs (neither placed by them nor on a post they authored).
    return wait(
      ORDERS.map((o) => orderForViewer(o)).filter((o): o is Order => o != null),
    );
  },
  async getOrder(id) {
    const o = ORDERS.find((x) => x.id === id);
    return wait(o ? orderForViewer(o) : null);
  },
  async createOrder({ post, takerUser }) {
    // Work against the live post row (the passed `post` may be a stale copy) so
    // status transitions stick.
    const livePost = POSTS.find((p) => p.id === post.id) ?? post;
    // A closed post (author-cancelled or an abandoned no-response post) can't
    // be taken.
    if (livePost.status === "cancelled" || livePost.status === "completed") {
      throw new Error("This post is closed.");
    }
    // Single-seat pending lock: while one taker awaits the author's decision,
    // nobody else may take it. (Multi-seat activities aren't globally locked —
    // they fill up to the seat cap instead.)
    if (post.seats === 1 && pendingOrderFor(post.id)) {
      throw new Error("Someone already requested this — waiting on the author.");
    }
    // Enforce seat cap. Without this an event with seats=2 could be ordered
    // 50 times. The server will eventually do this under a transaction; the
    // mock does it inline.
    if (seatsTakenFor(post.id) >= post.seats) {
      throw new Error("This post is already full.");
    }
    // The three CTAs (I'll take that / I can help / I'm in) all land here.
    // The taker is the customer from the post-author's POV; from the taker's
    // POV isMyPost = false. The order starts as "pending" — it's a REQUEST
    // that the post author must accept (acceptOrder) before it becomes a
    // confirmed "upcoming" booking. Until then it sits in the taker's My Post
    // list as "Pending".
    // For a multi-person activity/event, seed the check-in roster with the
    // other committed participants (post.participants, author-first) minus the
    // host (who becomes `counterpart`) and minus the viewer — so the order
    // screen shows several faces + names instead of only the host.
    const isGroup = post.format !== "one_on_one" && post.seats > 1;
    const others: RosterEntry[] | undefined = isGroup
      ? (post.participants ?? [])
          .filter((u) => u.id !== post.authorId && u.id !== takerUser.id)
          .map((u) => ({ user: u, checkIn: { status: "pending" as const } }))
      : undefined;
    const order: Order = {
      id: `o_${Date.now()}`,
      postId: post.id,
      placedAt: new Date().toISOString(),
      postTitleSnapshot: post.title,
      counterpart: USERS.find((u) => u.id === post.authorId) ?? takerUser,
      startAt: post.startAt,
      endAt: post.endAt,
      // GROUP activities/events join DIRECTLY — anyone can grab an open seat
      // without the host's approval, so the order is confirmed ("upcoming")
      // straight away. Only a 1-on-1 booking is a REQUEST the author must
      // accept (starts "pending").
      status: isGroup ? "upcoming" : "pending",
      isMyPost: false,
      checkIn: {
        self: { status: "pending" },
        counterpart: { status: "pending" },
        ...(others && others.length > 0 ? { others } : {}),
      },
      // Payment scaffold: free post → no Stripe auth needed. Paid posts in
      // Phase 2 hit Stripe here and store the resulting `pi_*` on the
      // order. Refunds reverse it; capture happens at settlement.
      paymentStatus: post.priceCentsPerHour > 0 ? "authorized" : "not_required",
      feePolicyVersion: FEE_POLICY_VERSION,
    };
    ORDERS.unshift(order);
    // Record absolute ownership so the order projects correctly for whichever
    // account reads it later (the joiner sees `self`; the host sees the flip).
    registerUser(takerUser);
    orderSelfId.set(order.id, takerUser.id);
    orderHostId.set(order.id, livePost.authorId);
    orderTaker.set(order.id, takerUser);
    // Lock a single-seat post while the author decides. Group posts stay `open`
    // and keep filling seats up to their cap.
    if (post.seats === 1) livePost.status = "pending";
    // Notify the post author (in-app). A 1-on-1 take is a REQUEST the author
    // must accept/decline; a group join is already confirmed, so it's just an
    // FYI that a seat filled. In production a parallel EMAIL goes out via a
    // Supabase edge function; the mock only records the in-app notification.
    NOTIFICATIONS.unshift({
      id: `ntf_${Date.now()}`,
      userId: livePost.authorId,
      kind: "order_request",
      read: false,
      createdAt: order.placedAt,
      actor: { id: takerUser.id, name: takerUser.name, avatarUrl: takerUser.avatarUrl },
      postId: livePost.id,
      postTitle: livePost.title,
      orderId: order.id,
      excerpt: isGroup
        ? `${takerUser.name} joined your activity`
        : `${takerUser.name} wants to join · tap to accept or decline`,
    });
    return wait(order);
  },
  async acceptOrder(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Only a pending request can be accepted; accepting confirms the booking.
    // A single-seat (1-on-1) post becomes `matched` (spoken-for). A group post
    // must stay `open` so remaining seats can still fill.
    if (o.status === "pending") {
      o.status = "upcoming";
      const post = POSTS.find((p) => p.id === o.postId);
      if (post && post.seats === 1) post.status = "matched";
    }
    return wait(orderForViewer(o) ?? o);
  },
  async declineOrder(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Declining a request (or the taker withdrawing before acceptance) simply
    // cancels the order and frees the seat — no fee, full refund. A manual
    // decline re-opens the post (it does NOT count as a no-response round).
    if (o.status === "pending") {
      o.status = "cancelled";
      o.autoCancelled = false;
      o.cancelReason = "other";
      o.feeAmountCents = 0;
      o.feeChargedToUserId = undefined;
      o.feeKind = undefined;
      o.refundIssued = true;
      o.refundAmountCents = 0;
      if (o.paymentStatus === "authorized") o.paymentStatus = "refunded";
      const post = POSTS.find((p) => p.id === o.postId);
      if (post && post.status === "pending") post.status = "open";
    }
    return wait(orderForViewer(o) ?? o);
  },
  async startLocationCheckIn(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // The viewer tapped "Location check-in". We flip their side into the
    // transient `locating` state (orange button) while the device queries
    // GPS in the background. `resolveLocationCheckIn` finishes the match.
    const side = viewerSide(o) ?? "self";
    o.checkIn = {
      ...o.checkIn,
      [side]: { status: "locating", method: "location" },
    };
    if (o.status === "upcoming") o.status = "checking_in";
    return wait(orderForViewer(o) ?? o);
  },
  async resolveLocationCheckIn(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Background GPS matched the viewer within ~100m of the venue → confirm
    // their own presence (green button). Once present, they earn the right
    // to manually check others in.
    const side = viewerSide(o) ?? "self";
    o.checkIn = {
      ...o.checkIn,
      [side]: { status: "confirmed", method: "location" },
    };
    recomputeCheckInStatus(o);
    return wait(orderForViewer(o) ?? o);
  },
  async manualCheckIn(orderId, targetUserId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Only someone who has completed their OWN check-in may vouch for others.
    const mySide = viewerSide(o) ?? "self";
    if (!isPartyPresent(o.checkIn[mySide])) {
      throw new Error("Check yourself in first before helping others.");
    }
    const confirmed: PartyCheckIn = {
      status: "confirmed",
      method: "manual",
      byUserId: VIEWER_ID,
    };
    // Resolve the target against the ABSOLUTE roster (self participant, host,
    // or a group `others` member) so it works no matter whose frame we're in.
    if (selfIdOf(o) === targetUserId) {
      o.checkIn = { ...o.checkIn, self: confirmed };
    } else if (hostIdOf(o) === targetUserId || o.counterpart.id === targetUserId) {
      o.checkIn = { ...o.checkIn, counterpart: confirmed };
    } else {
      const others = (o.checkIn.others ?? []).map((e) =>
        e.user.id === targetUserId ? { ...e, checkIn: confirmed } : e,
      );
      o.checkIn = { ...o.checkIn, others };
    }
    recomputeCheckInStatus(o);
    return wait(orderForViewer(o) ?? o);
  },
  async cancelOrder(orderId, by, reason) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    o.status = "cancelled";
    o.cancelledByUserId = by;
    o.autoCancelled = false;
    o.cancelReason = reason;
    stampCancelFee(o, by, reason);
    return wait(orderForViewer(o) ?? o);
  },
  async completeOrder(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    finalizeOrder(o);
    return wait(orderForViewer(o) ?? o);
  },
  async openDispute({ orderId, reason, evidenceUrls }) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    if (o.status !== "no_show") {
      throw new Error("Only no-show orders can be disputed.");
    }
    if (o.disputeOpenedAt) {
      throw new Error("This order already has an open appeal.");
    }
    // Window check matches the client-side `canStillAppeal` helper. Server
    // is authoritative — if the client clock is wrong, we reject here.
    const finalizedAt = new Date(o.endAt).getTime() + 30 * 60 * 1000;
    if (Date.now() >= finalizedAt + 24 * 60 * 60 * 1000) {
      throw new Error("The 24-hour appeal window has closed.");
    }
    if (!reason.trim()) throw new Error("Please describe what happened.");

    o.disputeOpenedAt = new Date().toISOString();
    o.disputeOpenedByUserId = VIEWER_ID;
    o.disputeReason = reason.trim();
    o.disputeEvidenceUrls = evidenceUrls ?? [];
    // Fee / rating impact is now HELD pending moderation. Mock doesn't
    // queue notifications — production would email moderators here.
    return wait(o);
  },
  async sweepAutoComplete() {
    // The server-side cron equivalent. Same decision rules as the manual
    // "Mark done" path (finalizeOrder), so behavior is identical whether the
    // user waits or taps. Two triggers:
    //   1. Past endAt  → finalize (both present → completed, one → no_show,
    //      neither → cancelled/mutual-no-show).
    //   2. 15 min past startAt and NOT both present → finalize early. This is
    //      the "nobody showed up 15 min after start → no_show" rule (spec):
    //      the absent side is called immediately rather than waiting for endAt.
    //   3. A pending take-request the author left unanswered for longer than
    //      PENDING_DECISION_MS → default-reject (autoRejectPending): cancel it,
    //      re-open the post, and after MAX_PENDING_ROUNDS close it + ding the
    //      author's rating.
    const now = Date.now();
    const transitioned: Order[] = [];
    for (const o of ORDERS) {
      if (o.status === "pending") {
        const placed = new Date(o.placedAt).getTime();
        if (now - placed >= PENDING_DECISION_MS) {
          autoRejectPending(o);
          transitioned.push(o);
        }
        continue;
      }
      if (isOrderTerminal(o.status)) continue;
      const start = new Date(o.startAt).getTime();
      const end = new Date(o.endAt).getTime();
      const allPresent = everyonePresent(o);
      const pastEnd = now >= end;
      const noShowDeadlinePassed = now >= start + NO_SHOW_AFTER_START_MS && !allPresent;
      if (pastEnd || noShowDeadlinePassed) {
        finalizeOrder(o);
        transitioned.push(o);
      }
    }
    // Expired orderless posts: an authored post whose agreed end time has
    // passed WITHOUT ever producing an order (nobody joined) auto-closes as
    // `cancelled`, so the My-Post tab retires it from "active" into History.
    // Posts that did produce an order are already represented by that order's
    // terminal state (completed / no_show / cancelled), so we leave them alone
    // to avoid double-counting.
    for (const p of POSTS) {
      if (p.status === "cancelled" || p.status === "completed") continue;
      if (now < new Date(p.endAt).getTime()) continue;
      const hasAnyOrder = ORDERS.some((o) => o.postId === p.id);
      if (!hasAnyOrder) p.status = "cancelled";
    }
    return wait(transitioned, 0);
  },
  async rateOrder(orderId, rating) {
    mockRatings.push({ ...rating, orderId, createdAt: new Date().toISOString() });
    const order = ORDERS.find((o) => o.id === orderId);
    if (order) order.reviewed = true;
    // Spec 0.7: update both aggregate scores. Mock only updates the
    // recipient if they're in USERS; the rater's `ratingGiven` is the
    // current viewer and lives in the auth store — the calling screen
    // owns that update because mock can't reach into the store.
    const recipient = USERS.find((u) => u.id === rating.toUserId);
    if (recipient) {
      const newCount = recipient.ratingCount + 1;
      recipient.rating =
        (recipient.rating * recipient.ratingCount + rating.stars) / newCount;
      recipient.ratingCount = newCount;
    }
    return wait(undefined);
  },
  async listThreads() {
    // Spec 0.9 — chat only unlocks once you've placed/accepted an order (or,
    // for events/activities, opened a host thread via openThreadWith). All
    // gating + override logic lives in buildThreads().
    return wait(buildThreads());
  },
  async getThread(threadId) {
    return wait(buildThreads().find((t) => t.id === threadId) ?? null);
  },
  async listMessages(threadId) {
    return wait(MESSAGES[threadId] ?? []);
  },
  async openThreadWith({ withUserId, postId }) {
    const counterpart = USERS.find((u) => u.id === withUserId);
    if (!counterpart) throw new Error("User not found");
    const threadId = `t_${withUserId}`;

    // Re-opening a soft-deleted thread just un-hides it.
    deletedThreadIds.delete(threadId);

    // Already unlocked (order-derived or previously opened)? Return it.
    const existing = buildThreads().find(
      (t) => t.id === threadId || t.counterpart.id === withUserId,
    );
    if (existing) return wait(existing);

    // GATE (2026-07-11): chat is now accessible ONLY after you've taken the
    // order (I can help / I'll take that / I'm in). This reverses the earlier
    // "fully open" behaviour — on Discover the author is contacted via the
    // public note instead, so nobody can cold-DM / harass them. If the viewer
    // has no non-cancelled order with this counterpart, refuse.
    void postId;
    const hasOrder = ORDERS.some(
      (o) => o.counterpart.id === withUserId && o.status !== "cancelled",
    );
    if (!hasOrder) {
      throw new Error("Chat unlocks once you've joined — leave a public note instead.");
    }

    const thread: ChatThread = {
      id: threadId,
      counterpart,
      lastMessage: "Tap to start the conversation",
      lastMessageAt: new Date().toISOString(),
      unread: 0,
      linkedOrderIds: [],
    };
    manualThreads.push(thread);
    return wait(thread);
  },
  async openGroupThread(postId) {
    // One shared room per POST, keyed `t_g_<postId>` in buildThreads. Mirrors
    // the supabase RPC, which get-or-creates a single room per post and adds
    // the caller as a member. The room materializes from any group order on
    // the post (its roster has `others`).
    const hasGroupOrder = ORDERS.some(
      (o) => o.postId === postId && (o.checkIn.others?.length ?? 0) > 0,
    );
    if (!hasGroupOrder) throw new Error("Join the activity to open its chat.");
    const thread = buildThreads().find((t) => t.id === `t_g_${postId}`);
    if (!thread) throw new Error("Group thread not found");
    return wait(thread);
  },
  async sendMessage(threadId, text, imageUrl) {
    const trimmed = text.trim();
    // Allow an image-only message (no text), but not a wholly empty one.
    if (!trimmed && !imageUrl) throw new Error("Empty message");
    // Access check: only allow writing to a thread the viewer can see.
    const thread = buildThreads().find((t) => t.id === threadId);
    if (!thread) throw new Error("This chat isn't unlocked.");
    const msg = {
      id: `local_${Date.now()}`,
      threadId,
      fromUserId: VIEWER_ID,
      text: trimmed,
      sentAt: new Date().toISOString(),
      ...(imageUrl ? { imageUrl } : {}),
    };
    MESSAGES[threadId] = [...(MESSAGES[threadId] ?? []), msg];
    // The inbox preview shows a camera glyph for image-only messages.
    lastMsgOverride.set(threadId, { text: trimmed || "📷 Photo", at: msg.sentAt });
    return wait(msg);
  },
  async uploadChatImage(localUri) {
    // Mock: the picked local uri already renders in <Image>, so hand it back.
    return wait(localUri);
  },
  async markThreadRead(threadId) {
    unreadOverride.set(threadId, 0);
    return wait(undefined);
  },
  async deleteThread(threadId) {
    deletedThreadIds.add(threadId);
    // Drop any manual thread record so it doesn't resurrect on next build.
    const idx = manualThreads.findIndex((t) => t.id === threadId);
    if (idx >= 0) manualThreads.splice(idx, 1);
    return wait(undefined);
  },
  async pingCounterpart(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Throttle: at most one ping per 5 min per order (server enforces in
    // prod; here we surface the same error). The receiver-side timeline is
    // captured in `lastNudgeAt` / `lastNudgeFrom` — production also fires
    // an APNs/FCM push to the receiving device.
    const last = o.lastNudgeAt ? new Date(o.lastNudgeAt).getTime() : 0;
    if (Date.now() - last < 5 * 60 * 1000) {
      throw new Error("You can ping again in a few minutes.");
    }
    o.lastNudgeAt = new Date().toISOString();
    o.lastNudgeFrom = "self";
    return wait(orderForViewer(o) ?? o);
  },
  async listPublicNotes(postId) {
    const notes = PUBLIC_NOTES[postId] ?? [];
    // Oldest-first so the Q&A reads top-to-bottom like a thread.
    return wait(
      [...notes].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()),
    );
  },
  async addPublicNote(postId, text, author, replyTo) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Empty note");
    // Prefer the viewer passed in from the auth store (real name/avatar the
    // user set in onboarding). Fall back to the static mock ME only when no
    // author is supplied, so seeded/demo callers still work.
    const me: User = author ?? {
      id: ME.id,
      name: ME.name,
      avatarUrl: ME.avatarUrl,
      rating: ME.rating,
      ratingCount: ME.ratingCount,
      interests: ME.interests,
      eduVerified: ME.eduVerified,
    };
    const note: PublicNote = {
      id: `pn_${Date.now()}`,
      postId,
      author: me,
      text: trimmed,
      sentAt: new Date().toISOString(),
      ...(replyTo ? { replyTo } : {}),
    };
    PUBLIC_NOTES[postId] = [...(PUBLIC_NOTES[postId] ?? []), note];
    const post = POSTS.find((p) => p.id === postId);
    const postTitle = post?.title ?? "";
    if (replyTo && replyTo.authorId !== me.id) {
      // A reply to someone else's note notifies that author (cross-user). In the
      // single-viewer mock the recipient is usually not ME, so it won't surface
      // in ME's list — supabase handles the real cross-user delivery. We still
      // record it for consistency.
      NOTIFICATIONS.unshift({
        id: `ntf_${Date.now()}`,
        userId: replyTo.authorId,
        kind: "public_note_reply",
        read: false,
        createdAt: note.sentAt,
        actor: { id: me.id, name: me.name, avatarUrl: me.avatarUrl },
        postId,
        postTitle,
        noteId: note.id,
        parentNoteId: replyTo.noteId,
        excerpt: trimmed.slice(0, 140),
      });
    } else if (!replyTo && post && post.authorId !== me.id) {
      // A fresh top-level note notifies the POST AUTHOR — previously nothing
      // fired here, so authors never learned someone left a note on their post.
      NOTIFICATIONS.unshift({
        id: `ntf_${Date.now()}`,
        userId: post.authorId,
        kind: "public_note_posted",
        read: false,
        createdAt: note.sentAt,
        actor: { id: me.id, name: me.name, avatarUrl: me.avatarUrl },
        postId,
        postTitle,
        noteId: note.id,
        excerpt: trimmed.slice(0, 140),
      });
    }
    return wait(note);
  },
  async listNotifications() {
    return wait(
      NOTIFICATIONS.filter((n) => n.userId === VIEWER_ID).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
  },
  async markNotificationRead(id) {
    const n = NOTIFICATIONS.find((x) => x.id === id);
    if (n) n.read = true;
    return wait(undefined);
  },
  async markAllNotificationsRead() {
    for (const n of NOTIFICATIONS) if (n.userId === VIEWER_ID) n.read = true;
    return wait(undefined);
  },
  async deleteNotification(id) {
    const idx = NOTIFICATIONS.findIndex((n) => n.id === id && n.userId === VIEWER_ID);
    if (idx >= 0) NOTIFICATIONS.splice(idx, 1);
    return wait(undefined);
  },
  async clearReadNotifications() {
    // Remove all already-read notifications for the viewer (walk backwards so
    // splices don't shift indices we haven't visited yet).
    for (let i = NOTIFICATIONS.length - 1; i >= 0; i--) {
      if (NOTIFICATIONS[i].userId === VIEWER_ID && NOTIFICATIONS[i].read) {
        NOTIFICATIONS.splice(i, 1);
      }
    }
    return wait(undefined);
  },
  async getUnreadCounts() {
    const chat = buildThreads().reduce((sum, t) => sum + (t.unread > 0 ? 1 : 0), 0);
    const notifications = NOTIFICATIONS.filter(
      (n) => n.userId === VIEWER_ID && !n.read,
    ).length;
    return wait({ chat, notifications });
  },
  async getUser(id) {
    return wait(USER_REGISTRY.get(id) ?? USERS.find((u) => u.id === id) ?? null);
  },
};

export { UCF_CENTER };
