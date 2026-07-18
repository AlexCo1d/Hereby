import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { OrderCard } from "../../components/post/OrderCard";
import { MyPostCard } from "../../components/post/MyPostCard";
import { RatingModal } from "../../components/post/RatingModal";
import { Avatar } from "../../components/common/Avatar";
import { api } from "../../services/api";
import type { Order, Post, User } from "../../services/types";
import { isOrderActive, isOrderTerminal, isRateable, effectiveOrderStatus } from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

type Tab = "post" | "history";

export default function MyScreen() {
  const [tab, setTab] = useState<Tab>("post");
  const [orders, setOrders] = useState<Order[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [reviewing, setReviewing] = useState<Order | null>(null);

  const refresh = useCallback(async () => {
    // Sweep first so any order past a lifecycle boundary (endAt, or 15 min
    // after start with a no-show) is finalized before we render it — that's
    // what moves it from My Post into History automatically.
    await api.sweepAutoComplete();
    const [orderList, postList] = await Promise.all([
      api.listMyOrders(),
      api.listMyPosts(),
    ]);
    setOrders(orderList);
    setMyPosts(postList);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const user = useAuth((s) => s.user);

  // The viewer as a public `User` — the taker's own face in a group activity's
  // avatar stack ([host, self, …joiners]) on the order cards.
  const selfUser = useMemo<User | undefined>(
    () =>
      user
        ? {
            id: user.id,
            name: user.name,
            avatarUrl: user.avatarUrl ?? "",
            rating: user.ratingReceived,
            ratingCount: user.ratingReceivedCount,
            eduVerified: user.mode === "verified",
            interests: user.interestIds ?? [],
          }
        : undefined,
    [user],
  );

  const startMs = (iso: string) => new Date(iso).getTime();

  // My Post = everything UNFINISHED — ONE card per post (no duplicates).
  //   • Authored posts render as a single MyPostCard (a status icon, never a
  //     participant's avatar). If the post has a live request/booking, tapping
  //     it routes INTO that order (accept / check-in); otherwise into the editor.
  //   • The viewer's own bookings on OTHER people's posts render as OrderCards
  //     (there's no post card for those). One order per post naturally.
  // Previously the host saw their post AND the order for it → the same post
  // showed twice, the second card wearing the joiner's avatar. Deduped here.
  const postItems = useMemo(() => {
    const nowMs = Date.now();
    // Host-side active order per post (viewer is the provider). Its presence is
    // what turns the post card into an order entry point and suppresses a
    // separate order card. We use the EFFECTIVE status (clock-aware) so an order
    // whose end time passed is treated as finished even before the server sweep
    // persists it — otherwise a past session would keep a post pinned to My Post.
    const hostActiveByPost = new Map<string, Order>();
    // Author-first roster of takers per post (viewer is the host, so each of
    // their active orders' counterpart is a joiner). Lets a group post render
    // the [host, …joiners] avatar stack straight from data the real backend
    // already returns — no extra roster RPC needed.
    const takersByPost = new Map<string, User[]>();
    for (const o of orders) {
      if (o.isMyPost && isOrderActive(effectiveOrderStatus(o, nowMs))) {
        const prev = hostActiveByPost.get(o.postId);
        if (!prev || startMs(o.startAt) < startMs(prev.startAt)) {
          hostActiveByPost.set(o.postId, o);
        }
        const arr = takersByPost.get(o.postId) ?? [];
        arr.push(o.counterpart);
        takersByPost.set(o.postId, arr);
      }
    }
    const items: (
      | { key: string; kind: "post"; start: number; post: Post; order?: Order; members?: User[] }
      | { key: string; kind: "order"; start: number; order: Order }
    )[] = [];
    for (const p of myPosts) {
      const active = hostActiveByPost.get(p.id);
      // Retire a post from "active" once it's explicitly closed (cancelled /
      // completed) OR its agreed end time has lapsed. After end time a post is
      // terminal by definition — its outcome (completed / no_show / cancelled)
      // lives in History, either as its order or as a synthesized entry — so it
      // never lingers in My Post regardless of check-in state.
      const closed = p.status === "cancelled" || p.status === "completed";
      const expired = startMs(p.endAt) <= nowMs;
      if (closed || expired) continue;
      const takers = takersByPost.get(p.id) ?? [];
      items.push({
        key: `p_${p.id}`,
        kind: "post",
        start: startMs(p.startAt),
        post: p,
        order: active,
        // Host-first roster for the group avatar stack: the host, then joiners.
        members: selfUser ? [selfUser, ...takers] : takers,
      });
    }
    for (const o of orders) {
      // A taker's order stays in My Post only while it's genuinely still active
      // by the clock; once end time passes it moves to History finalized.
      if (!o.isMyPost && isOrderActive(effectiveOrderStatus(o, nowMs))) {
        items.push({ key: `o_${o.id}`, kind: "order", start: startMs(o.startAt), order: o });
      }
    }
    // Soonest first — upcoming sessions bubble to the top.
    items.sort((a, b) => a.start - b.start);
    return items;
  }, [myPosts, orders, selfUser]);

  // History = finished orders (completed / no_show / cancelled), ONE per post.
  // A post may spawn several terminal orders (e.g. a declined request + the
  // accepted session); we keep the most meaningful outcome (completed > no_show
  // > cancelled) so history doesn't repeat the same post. Unrated (completed &
  // !reviewed) float to the top ("优先显示"); then most recent start first.
  const historyItems = useMemo(() => {
    const nowMs = Date.now();
    const rank = (s: Order["status"]) =>
      s === "completed" ? 0 : s === "no_show" ? 1 : 2;
    // Each order is keyed by post, displayed under its EFFECTIVE (clock-aware)
    // status — so an order past its end time reads completed / no_show /
    // cancelled here even before the server sweep persists it.
    const byPost = new Map<string, Order>();
    // Every post that produced an order (any status) is represented by that
    // order here, so we don't also synthesize a post entry for it below.
    const orderedPostIds = new Set<string>();
    for (const o of orders) {
      orderedPostIds.add(o.postId);
      const eff = effectiveOrderStatus(o, nowMs);
      if (!isOrderTerminal(eff)) continue;
      const shown: Order = { ...o, status: eff };
      const prev = byPost.get(o.postId);
      if (
        !prev ||
        rank(eff) < rank(prev.status) ||
        (rank(eff) === rank(prev.status) && startMs(o.startAt) > startMs(prev.startAt))
      ) {
        byPost.set(o.postId, shown);
      }
    }
    const items: (
      | { kind: "order"; order: Order; sort: number }
      | { kind: "post"; post: Post; sort: number }
    )[] = [...byPost.values()].map((o) => ({
      kind: "order" as const,
      order: o,
      sort: startMs(o.startAt),
    }));
    // Retired authored posts that never produced an order (nobody joined and
    // the time passed): synthesize a Cancelled History entry so they don't just
    // vanish. Force the display status to `cancelled` so an expired `open` post
    // reads "Cancelled" here, never a stale "Open/Waiting".
    for (const p of myPosts) {
      if (orderedPostIds.has(p.id)) continue;
      const closed = p.status === "cancelled" || p.status === "completed";
      const expired = startMs(p.endAt) <= nowMs;
      if (!closed && !expired) continue;
      const displayStatus = p.status === "completed" ? "completed" : "cancelled";
      items.push({ kind: "post", post: { ...p, status: displayStatus }, sort: startMs(p.startAt) });
    }
    // Unrated completed orders float to the top; then most recent first.
    return items.sort((a, b) => {
      const ra = a.kind === "order" && isRateable(a.order) ? 0 : 1;
      const rb = b.kind === "order" && isRateable(b.order) ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return b.sort - a.sort;
    });
  }, [orders, myPosts]);

  const unratedCount = useMemo(
    () =>
      historyItems.filter((it) => it.kind === "order" && isRateable(it.order))
        .length,
    [historyItems],
  );

  const postTabEmpty = tab === "post" && postItems.length === 0;
  const historyTabEmpty = tab === "history" && historyItems.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Profile entry header */}
      <Pressable
        onPress={() => router.push("/profile" as any)}
        className="flex-row items-center px-5 pt-2 pb-3"
      >
        <Avatar uri={user?.avatarUrl ?? "https://i.pravatar.cc/150?img=12"} size={42} ring />
        <View className="flex-1 ml-3">
          <Text className="text-base font-bold text-ink">{user?.name ?? "Guest"}</Text>
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {user?.email ?? "Tap to view profile"}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
      </Pressable>

      <View className="flex-row px-5 pt-2 pb-2 border-b border-ink-line">
        {(["post", "history"] as Tab[]).map((t) => {
          const active = t === tab;
          const label =
            t === "post"
              ? "My Post"
              : unratedCount > 0
                ? `History (${unratedCount})`
                : "History";
          return (
            <Pressable key={t} onPress={() => setTab(t)} className="mr-6">
              <Text className={`text-lg ${active ? "text-ink font-bold" : "text-ink-muted font-semibold"}`}>
                {label}
              </Text>
              {active ? <View className="h-0.5 bg-ink mt-1 rounded-full" /> : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
        {tab === "post"
          ? postItems.map((it) =>
              it.kind === "post" ? (
                <MyPostCard
                  key={it.key}
                  post={it.post}
                  order={it.order}
                  members={it.members}
                  // With a live request/booking, tap → into the order (accept /
                  // check-in). Otherwise → the composer in edit mode.
                  onPress={() =>
                    it.order
                      ? router.push(`/order/${it.order.id}` as any)
                      : router.push(`/post/new?editPostId=${it.post.id}` as any)
                  }
                />
              ) : (
                <OrderCard
                  key={it.key}
                  order={it.order}
                  selfUser={selfUser}
                  onReview={() => setReviewing(it.order)}
                  onScheduleAgain={() => {}}
                />
              ),
            )
          : historyItems.map((it) =>
              it.kind === "order" ? (
                <OrderCard
                  key={it.order.id}
                  order={it.order}
                  selfUser={selfUser}
                  onReview={() => setReviewing(it.order)}
                  onScheduleAgain={() => {}}
                />
              ) : (
                // Cancelled authored post nobody joined — tap re-opens the
                // composer so the host can re-post it.
                <MyPostCard
                  key={`hp_${it.post.id}`}
                  post={it.post}
                  onPress={() => router.push(`/post/new?editPostId=${it.post.id}` as any)}
                />
              ),
            )}
        {postTabEmpty || historyTabEmpty ? (
          <Text className="text-ink-muted text-center mt-12">
            {tab === "post"
              ? "Nothing active. Tap + to post, or take an order from Discover."
              : "No history yet. Finished sessions will show up here."}
          </Text>
        ) : null}
      </ScrollView>

      <RatingModal
        visible={!!reviewing}
        title={reviewing ? `Rate your ${reviewing.postTitleSnapshot} Buddy` : ""}
        onClose={() => setReviewing(null)}
        onSubmit={async (stars, comment) => {
          if (!reviewing) return;
          await api.rateOrder(reviewing.id, {
            fromUserId: user?.id ?? "me",
            toUserId: reviewing.counterpart.id,
            stars,
            comment,
          });
          // Spec 0.7: update the rater's own public ratingGiven aggregate.
          useAuth.getState().recordRatingGiven(stars);
          setReviewing(null);
          refresh();
        }}
      />
    </SafeAreaView>
  );
}
