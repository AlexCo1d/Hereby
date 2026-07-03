import type { HerebyApi } from "../api";
import {
  ME,
  MESSAGES,
  ORDERS,
  POSTS,
  THREADS,
  UCF_CENTER,
  USERS,
} from "./data";
import type {
  CancelReason,
  ChatThread,
  CheckInChannel,
  DiscoverFilter,
  Order,
  Post,
  Rating,
  User,
} from "../types";
import { FEE_POLICY_VERSION, isPartyPresent, postSearchSurface } from "../types";

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
  },
>(list: T[], f?: DiscoverFilter): T[] {
  if (!f) return list;
  let out = list;
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
  return out;
}

// Tiny artificial latency so the UI shows loading states realistically.
const wait = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), ms));

const mockRatings: Rating[] = [];

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
  const byCounterpart = new Map<string, ChatThread>();
  for (const o of ORDERS) {
    const cpId = o.counterpart.id;
    const existing = byCounterpart.get(cpId);
    if (existing) {
      existing.linkedOrderIds.push(o.id);
    } else {
      const seed = THREADS.find((t) => t.counterpart.id === cpId);
      byCounterpart.set(cpId, {
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
    if (!byCounterpart.has(mt.counterpart.id)) {
      byCounterpart.set(mt.counterpart.id, { ...mt });
    }
  }
  const out: ChatThread[] = [];
  for (const t of byCounterpart.values()) {
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

/** Look up the user id on each side of an order. `self` corresponds to ME
 *  in the mock (= the signed-in viewer); the counterpart's id lives on
 *  `order.counterpart.id`. Returned as a typed pair so callers can be
 *  explicit about which side they're attributing a fee to. */
function userIdsForOrder(o: Order): { self: string; counterpart: string } {
  return { self: ME.id, counterpart: o.counterpart.id };
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
    return wait(ME);
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
    if (p.authorId !== ME.id) throw new Error("You can only edit your own posts.");
    Object.assign(p, patch);
    return wait(withSeats(p));
  },
  async listMyPosts() {
    // Posts the current user authored, newest first, decorated with the live
    // seatsTaken count. Drives the "My Post" tab's waiting/matched cards.
    return wait(
      POSTS.filter((p) => p.authorId === ME.id)
        .map(withSeats)
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()),
    );
  },
  async listMyOrders() {
    return wait(ORDERS);
  },
  async getOrder(id) {
    return wait(ORDERS.find((o) => o.id === id) ?? null);
  },
  async createOrder({ post, takerUser }) {
    // Enforce seat cap. Without this an event with seats=2 could be ordered
    // 50 times. The server will eventually do this under a transaction; the
    // mock does it inline.
    if (seatsTakenFor(post.id) >= post.seats) {
      throw new Error("This post is already full.");
    }
    // Mock doesn't know which side of the post the taker is on — for the
    // current user "I'll take that" flow we treat them as the customer
    // (isMyPost = false from the post-author's POV, but for the taker it
    // shows up under My → "My Job" since they're doing the job).
    const order: Order = {
      id: `o_${Date.now()}`,
      postId: post.id,
      placedAt: new Date().toISOString(),
      postTitleSnapshot: post.title,
      counterpart: USERS.find((u) => u.id === post.authorId) ?? takerUser,
      startAt: post.startAt,
      endAt: post.endAt,
      status: "upcoming",
      isMyPost: false,
      checkIn: {
        self: { location: "pending", qr: "pending", peer: "pending" },
        counterpart: { location: "pending", qr: "pending", peer: "pending" },
      },
      // Payment scaffold: free post → no Stripe auth needed. Paid posts in
      // Phase 2 hit Stripe here and store the resulting `pi_*` on the
      // order. Refunds reverse it; capture happens at settlement.
      paymentStatus: post.priceCentsPerHour > 0 ? "authorized" : "not_required",
      feePolicyVersion: FEE_POLICY_VERSION,
    };
    ORDERS.unshift(order);
    return wait(order);
  },
  async advanceCheckIn(orderId, channel) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    // Flip the current viewer's channel. QR is mutual (scan event proves
    // both parties were physically together), so it also flips the
    // counterpart side in one shot.
    o.checkIn = {
      ...o.checkIn,
      self: { ...o.checkIn.self, [channel]: "confirmed" },
      counterpart:
        channel === "qr"
          ? { ...o.checkIn.counterpart, qr: "confirmed" }
          : o.checkIn.counterpart,
    };
    // Status during check-in window: any self-side activity moves us to
    // checking_in; in_progress only once both sides are present (≥1 channel
    // each) so the order is meaningfully "happening".
    if (o.status === "upcoming" || o.status === "checking_in") {
      const bothPresent =
        isPartyPresent(o.checkIn.self) && isPartyPresent(o.checkIn.counterpart);
      o.status = bothPresent ? "in_progress" : "checking_in";
    }
    return wait(o);
  },
  async resetCheckIn(orderId, channel) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    o.checkIn = {
      ...o.checkIn,
      self: { ...o.checkIn.self, [channel]: "pending" },
      counterpart:
        channel === "qr"
          ? { ...o.checkIn.counterpart, qr: "pending" }
          : o.checkIn.counterpart,
    };
    return wait(o);
  },
  async cancelOrder(orderId, by, reason) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    o.status = "cancelled";
    o.cancelledByUserId = by;
    o.autoCancelled = false;
    o.cancelReason = reason;
    stampCancelFee(o, by, reason);
    return wait(o);
  },
  async completeOrder(orderId) {
    const o = ORDERS.find((x) => x.id === orderId);
    if (!o) throw new Error("Order not found");
    finalizeOrder(o);
    return wait(o);
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
    o.disputeOpenedByUserId = ME.id;
    o.disputeReason = reason.trim();
    o.disputeEvidenceUrls = evidenceUrls ?? [];
    // Fee / rating impact is now HELD pending moderation. Mock doesn't
    // queue notifications — production would email moderators here.
    return wait(o);
  },
  async sweepAutoComplete() {
    // The server-side cron equivalent: anything past endAt + 30min that
    // is still active gets finalized. Same decision rules as the manual
    // path — keeps behavior identical whether the user taps "Mark done"
    // or just waits.
    const grace = 30 * 60 * 1000;
    const now = Date.now();
    const transitioned: Order[] = [];
    for (const o of ORDERS) {
      const stillActive =
        o.status === "upcoming" ||
        o.status === "checking_in" ||
        o.status === "in_progress";
      if (!stillActive) continue;
      if (now < new Date(o.endAt).getTime() + grace) continue;
      finalizeOrder(o);
      transitioned.push(o);
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
    const existing = buildThreads().find((t) => t.id === threadId);
    if (existing) return wait(existing);

    // NOTE (2026-05-31): chat is fully open for now — anyone can start a
    // thread with anyone (stranger chat allowed). The spec 0.9 order-gate is
    // intentionally OFF; the planned safeguard is server-side content
    // moderation, not a pre-chat permission wall. To re-enable the gate
    // later, reject here when there's no order and post.format === "one_on_one".
    void postId;

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
  async sendMessage(threadId, text) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Empty message");
    // Access check: only allow writing to a thread the viewer can see.
    const thread = buildThreads().find((t) => t.id === threadId);
    if (!thread) throw new Error("This chat isn't unlocked.");
    const msg = {
      id: `local_${Date.now()}`,
      threadId,
      fromUserId: ME.id,
      text: trimmed,
      sentAt: new Date().toISOString(),
    };
    MESSAGES[threadId] = [...(MESSAGES[threadId] ?? []), msg];
    lastMsgOverride.set(threadId, { text: trimmed, at: msg.sentAt });
    return wait(msg);
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
    return wait(o);
  },
  async getUser(id) {
    if (id === ME.id) return wait(ME);
    return wait(USERS.find((u) => u.id === id) ?? null);
  },
};

export { UCF_CENTER };
