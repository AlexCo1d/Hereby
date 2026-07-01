// Supabase implementation of HerebyApi. Mirrors the mock's behaviour but
// against the schema in supabase/migrations/0001_init.sql. Activated by
// EXPO_PUBLIC_DATA_SOURCE=supabase (see services/api.ts).
//
// Status: FRAMEWORK. Read paths and the order/post RPCs are wired; a few
// methods are marked TODO where they depend on Edge Functions (Stripe,
// nudges) or tables not yet exercised. Each TODO names exactly what's left.
import { supabase } from "./client";
import type { HerebyApi } from "../api";
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
} from "../types";

// ── row → domain mappers ──────────────────────────────────────────────────
function rowToUser(r: any): User {
  return {
    id: r.id,
    name: r.name,
    avatarUrl: r.avatar_url ?? "",
    level: r.level ?? undefined,
    rating: Number(r.rating_received ?? 0),
    ratingCount: r.rating_received_count ?? 0,
    bio: r.bio ?? undefined,
    eduVerified: !!r.edu_verified,
    interests: r.interest_ids ?? [],
  };
}

function rowToPost(r: any): Post {
  return {
    id: r.id,
    authorId: r.author_id,
    kind: r.kind,
    format: r.format,
    title: r.title,
    category: r.category,
    description: r.description ?? undefined,
    tags: r.tags ?? [],
    priceCentsPerHour: r.price_cents_per_hour ?? 0,
    cancellationFeeCents: r.cancellation_fee_cents ?? 0,
    skillLevel: r.skill_level ?? undefined,
    skillMode: r.skill_mode ?? undefined,
    seats: r.seats,
    seatsTaken: r.seats_taken ?? 0,
    startAt: r.start_at,
    endAt: r.end_at,
    location: { lat: r.lat, lng: r.lng },
    locationName: r.location_name ?? undefined,
    badges: r.badges ?? [],
    commentsCount: r.comments_count ?? 0,
    postedAt: r.posted_at,
    coverImageUrl: r.cover_image_url ?? undefined,
    matchScore: r.match_score ?? undefined,
  };
}

// The orders_for_viewer() RPC already returns camelCase JSON matching `Order`,
// so order rows pass through unchanged.
const rowToOrder = (r: any): Order => r as Order;

function postToInsert(input: Omit<Post, "id" | "postedAt">) {
  return {
    author_id: input.authorId,
    kind: input.kind,
    format: input.format,
    title: input.title,
    category: input.category,
    description: input.description ?? null,
    tags: input.tags ?? [],
    price_cents_per_hour: input.priceCentsPerHour,
    cancellation_fee_cents: input.cancellationFeeCents ?? 0,
    skill_level: input.skillLevel ?? null,
    skill_mode: input.skillMode ?? "any",
    seats: input.seats,
    start_at: input.startAt,
    end_at: input.endAt,
    lat: input.location.lat,
    lng: input.location.lng,
    location_name: input.locationName ?? null,
    badges: input.badges ?? [],
    cover_image_url: input.coverImageUrl ?? null,
  };
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");
  return data.user.id;
}

export const supabaseApi: HerebyApi = {
  async getCurrentUser() {
    const id = await uid();
    const { data, error } = await supabase.from("users").select("*").eq("id", id).single();
    if (error) throw error;
    return rowToUser(data);
  },

  async listPosts(filter?: DiscoverFilter) {
    // Server-side ranking + seatsTaken via RPC (see list_posts_for_viewer in a
    // follow-up migration). Until that RPC exists, fall back to a table query.
    const { data, error } = await supabase.rpc("list_posts_for_viewer", {
      p_filter: filter ?? {},
    });
    if (error) throw error;
    return (data as any[]).map(rowToPost);
  },
  async getPost(id) {
    const { data, error } = await supabase
      .from("posts")
      .select("*, post_seats_taken(seats_taken)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToPost({ ...data, seats_taken: data.post_seats_taken?.seats_taken ?? 0 });
  },
  async createPost(input) {
    const { data, error } = await supabase.from("posts").insert(postToInsert(input)).select().single();
    if (error) throw error;
    return rowToPost(data);
  },
  async updatePost(id, patch) {
    const row: Record<string, any> = {};
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.format !== undefined) row.format = patch.format;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.category !== undefined) row.category = patch.category;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.tags !== undefined) row.tags = patch.tags;
    if (patch.priceCentsPerHour !== undefined) row.price_cents_per_hour = patch.priceCentsPerHour;
    if (patch.cancellationFeeCents !== undefined) row.cancellation_fee_cents = patch.cancellationFeeCents;
    if (patch.skillLevel !== undefined) row.skill_level = patch.skillLevel;
    if (patch.skillMode !== undefined) row.skill_mode = patch.skillMode;
    if (patch.seats !== undefined) row.seats = patch.seats;
    if (patch.startAt !== undefined) row.start_at = patch.startAt;
    if (patch.endAt !== undefined) row.end_at = patch.endAt;
    if (patch.location !== undefined) {
      row.lat = patch.location.lat;
      row.lng = patch.location.lng;
    }
    if (patch.locationName !== undefined) row.location_name = patch.locationName;
    if (patch.coverImageUrl !== undefined) row.cover_image_url = patch.coverImageUrl;
    const { data, error } = await supabase.from("posts").update(row).eq("id", id).select().single();
    if (error) throw error;
    return rowToPost(data);
  },
  async listMyPosts() {
    const id = await uid();
    const { data, error } = await supabase
      .from("posts")
      .select("*, post_seats_taken(seats_taken)")
      .eq("author_id", id)
      .order("posted_at", { ascending: false });
    if (error) throw error;
    return (data as any[]).map((d) =>
      rowToPost({ ...d, seats_taken: d.post_seats_taken?.seats_taken ?? 0 }),
    );
  },

  async listMyOrders() {
    const { data, error } = await supabase.rpc("orders_for_viewer");
    if (error) throw error;
    return (data as any[]).map(rowToOrder);
  },
  async getOrder(id) {
    const { data, error } = await supabase.rpc("orders_for_viewer");
    if (error) throw error;
    return (data as any[]).map(rowToOrder).find((o) => o.id === id) ?? null;
  },
  async createOrder({ post }) {
    const { data: orderId, error } = await supabase.rpc("place_order", { p_post_id: post.id });
    if (error) throw error;
    const created = await this.getOrder(orderId as string);
    if (!created) throw new Error("Order created but not retrievable");
    return created;
  },
  async advanceCheckIn(orderId, channel: CheckInChannel) {
    // Writes the viewer's side; qr is mutual. RPC keeps the role-swap logic
    // server-side so the client doesn't need to know provider vs customer.
    const { error } = await supabase.rpc("advance_check_in", {
      p_order_id: orderId,
      p_channel: channel,
    });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },
  async resetCheckIn(orderId, channel: CheckInChannel) {
    const { error } = await supabase.rpc("reset_check_in", {
      p_order_id: orderId,
      p_channel: channel,
    });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },
  async cancelOrder(orderId, _by, reason: CancelReason) {
    const { error } = await supabase.rpc("cancel_order", {
      p_order_id: orderId,
      p_reason: reason,
    });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },
  async completeOrder(orderId) {
    const { error } = await supabase.rpc("complete_order", { p_order_id: orderId });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },
  async sweepAutoComplete() {
    // No-op on the server data source — pg_cron runs finalize_overdue_orders().
    // Kept so the client's heartbeat calls are harmless after the switch.
    return [];
  },
  async openDispute({ orderId, reason, evidenceUrls }) {
    const { error } = await supabase.rpc("open_dispute", {
      p_order_id: orderId,
      p_reason: reason,
      p_evidence_urls: evidenceUrls ?? [],
    });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },
  async rateOrder(orderId, rating: Omit<Rating, "createdAt" | "orderId">) {
    const { error } = await supabase.from("ratings").insert({
      order_id: orderId,
      from_user_id: rating.fromUserId,
      to_user_id: rating.toUserId,
      stars: rating.stars,
      comment: rating.comment ?? null,
    });
    if (error) throw error;
  },
  async pingCounterpart(orderId) {
    // TODO(Phase 2): Edge Function stamps last_nudge_* + sends APNs/FCM push.
    const { error } = await supabase.rpc("ping_counterpart", { p_order_id: orderId });
    if (error) throw error;
    const o = await this.getOrder(orderId);
    if (!o) throw new Error("Order not found");
    return o;
  },

  // ── chat ────────────────────────────────────────────────────────────────
  async listThreads() {
    const { data, error } = await supabase.rpc("threads_for_viewer");
    if (error) throw error;
    return data as ChatThread[];
  },
  async getThread(threadId) {
    const threads = await this.listThreads();
    return threads.find((t) => t.id === threadId) ?? null;
  },
  async openThreadWith({ withUserId }) {
    const { data, error } = await supabase.rpc("open_thread_with", { p_with: withUserId });
    if (error) throw error;
    const t = await this.getThread(data as string);
    if (!t) throw new Error("Thread not found");
    return t;
  },
  async listMessages(threadId) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("sent_at", { ascending: true });
    if (error) throw error;
    return (data as any[]).map((m) => ({
      id: m.id,
      threadId: m.thread_id,
      fromUserId: m.from_user_id,
      text: m.text,
      sentAt: m.sent_at,
    })) as Message[];
  },
  async sendMessage(threadId, text) {
    const id = await uid();
    const { data, error } = await supabase
      .from("messages")
      .insert({ thread_id: threadId, from_user_id: id, text })
      .select()
      .single();
    if (error) throw error;
    await supabase
      .from("threads")
      .update({ last_message: text, last_message_at: new Date().toISOString() })
      .eq("id", threadId);
    return {
      id: data.id,
      threadId: data.thread_id,
      fromUserId: data.from_user_id,
      text: data.text,
      sentAt: data.sent_at,
    };
  },
  async markThreadRead(threadId) {
    const id = await uid();
    const { error } = await supabase
      .from("thread_reads")
      .upsert({ thread_id: threadId, user_id: id, last_read_at: new Date().toISOString() });
    if (error) throw error;
  },
  async deleteThread(threadId) {
    const id = await uid();
    const { error } = await supabase
      .from("thread_reads")
      .upsert({ thread_id: threadId, user_id: id, deleted: true });
    if (error) throw error;
  },

  async getUser(id) {
    const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToUser(data) : null;
  },
};
