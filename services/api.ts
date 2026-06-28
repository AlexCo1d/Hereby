// Single import point for data access. Swap the implementation here
// (or via EXPO_PUBLIC_DATA_SOURCE) when the Supabase backend is ready.
import { mockApi } from "./mock";
import type {
  CancelReason,
  CheckInChannel,
  ChatThread,
  DiscoverFilter,
  Message,
  Order,
  Post,
  Rating,
  User,
} from "./types";

export type HerebyApi = {
  // session
  getCurrentUser(): Promise<User>;

  // discover
  listPosts(filter?: DiscoverFilter): Promise<Post[]>;
  getPost(id: string): Promise<Post | null>;
  createPost(input: Omit<Post, "id" | "postedAt">): Promise<Post>;
  /** Edit a post the signed-in user authored. Only mutable content fields are
   *  accepted (not id/authorId/postedAt/seatsTaken). Backend must reject if
   *  the caller isn't the author. */
  updatePost(
    id: string,
    patch: Partial<
      Pick<
        Post,
        | "kind"
        | "format"
        | "title"
        | "category"
        | "description"
        | "tags"
        | "priceCentsPerHour"
        | "cancellationFeeCents"
        | "seats"
        | "startAt"
        | "endAt"
        | "location"
        | "locationName"
        | "coverImageUrl"
      >
    >,
  ): Promise<Post>;

  // posts I authored ("My Post" tab). Each carries `seatsTaken` so the UI can
  // show "Waiting" (0 joined) vs "N joined". Auto-matching (Phase 4) will fill
  // these without the author doing anything.
  listMyPosts(): Promise<Post[]>;

  // orders ("My" tab)
  listMyOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  /** Place an order on a post — used by the "I'll take that!" button. */
  createOrder(input: { post: Post; takerUser: User }): Promise<Order>;
  /** Flip one of the 3 check-in channels to confirmed for the given order. */
  advanceCheckIn(orderId: string, channel: CheckInChannel): Promise<Order>;
  /** Reset a channel back to pending (mostly for the demo UI). */
  resetCheckIn(orderId: string, channel: CheckInChannel): Promise<Order>;
  /** Cancel an order before it starts (respects the 12-h policy at UI layer). */
  cancelOrder(orderId: string, by: string, reason: CancelReason): Promise<Order>;
  /** Manually mark an order completed (used when "Done" is tapped after the end time). */
  completeOrder(orderId: string): Promise<Order>;
  /** Auto-finalize any order whose `endAt + 30min` has passed and which is
   *  still in upcoming/checking_in/in_progress. Returns the list of orders
   *  that were transitioned this run. Production replaces this with a server
   *  cron; in MVP we call it on app launch + My-tab focus + order screen
   *  open so the state stays fresh without a backend. */
  sweepAutoComplete(): Promise<Order[]>;
  /** Spec 0.6 — file a no-show appeal inside the 24h window. Server checks
   *  the window again on receive (don't trust client clock); rejects with
   *  a clear error after the window has closed. `evidenceUrls` is whatever
   *  the caller already uploaded to Supabase Storage (private bucket, RLS
   *  limits read to the two participants + moderators). MVP can pass []. */
  openDispute(input: {
    orderId: string;
    reason: string;
    evidenceUrls?: string[];
  }): Promise<Order>;
  rateOrder(orderId: string, rating: Omit<Rating, "createdAt" | "orderId">): Promise<void>;

  // chat — gated by orders (spec 0.9). Backend enforces; client only sees
  // threads it is allowed to see and can't open a thread it hasn't unlocked.
  listThreads(): Promise<ChatThread[]>;
  getThread(threadId: string): Promise<ChatThread | null>;
  listMessages(threadId: string): Promise<Message[]>;
  /** Open (or fetch existing) a 1:1 thread with another user, anchored to a
   *  post. Spec 0.9: for one_on_one posts the viewer must already have an
   *  order — otherwise this throws "place an order first". For activity /
   *  event posts, contacting the host pre-order IS allowed (asking about a
   *  public event isn't cold-DMing a stranger), so the thread opens. */
  openThreadWith(input: { withUserId: string; postId?: string }): Promise<ChatThread>;
  /** Persist a message. Backend re-checks thread access before writing. */
  sendMessage(threadId: string, text: string): Promise<Message>;
  /** Mark a thread's unread count to 0 (swipe action on the chat list). */
  markThreadRead(threadId: string): Promise<void>;
  /** Soft-delete a thread from the viewer's inbox (swipe action). The
   *  underlying messages persist server-side; this just hides it for the
   *  viewer, and it reappears if a new message / order arrives. */
  deleteThread(threadId: string): Promise<void>;

  /** "I'm here, where are you?" nudge. The receiver gets a push (Phase 2);
   *  in MVP they see an in-app banner next time they open the order. The
   *  server throttles to ≤ 1 ping per 5 min per order — the client should
   *  surface a polite "Already pinged recently" if a 429 comes back. */
  pingCounterpart(orderId: string): Promise<Order>;

  // user lookup
  getUser(id: string): Promise<User | null>;
};

// Data-source switch. Default is the in-memory mock. Set
// EXPO_PUBLIC_DATA_SOURCE=supabase (and the SUPABASE_URL / ANON_KEY env vars)
// to run against the real backend defined in supabase/migrations.
//
// The supabase module is `require`d lazily so its createClient() call only
// evaluates when actually selected — in mock mode (the default) the supabase
// client is never instantiated, so missing env vars can't break the app.
function pickApi(): HerebyApi {
  if (process.env.EXPO_PUBLIC_DATA_SOURCE === "supabase") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("./supabase/api").supabaseApi as HerebyApi;
  }
  return mockApi;
}

export const api: HerebyApi = pickApi();
