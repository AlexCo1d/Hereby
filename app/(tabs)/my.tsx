import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { OrderCard } from "../../components/post/OrderCard";
import { MyPostCard } from "../../components/post/MyPostCard";
import { RatingModal } from "../../components/post/RatingModal";
import { Avatar } from "../../components/common/Avatar";
import { api } from "../../services/api";
import type { Order, Post } from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

type Tab = "post" | "job";

export default function MyScreen() {
  const [tab, setTab] = useState<Tab>("post");
  const [orders, setOrders] = useState<Order[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [reviewing, setReviewing] = useState<Order | null>(null);

  const refresh = useCallback(async () => {
    // Sweep first so any order whose endAt+30min just passed is finalized
    // before we render it. Keeps the "Upcoming" pill from sticking around on
    // orders the cron should have already auto-completed.
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

  const visibleOrders = orders.filter((o) => (tab === "post" ? o.isMyPost : !o.isMyPost));

  const user = useAuth((s) => s.user);

  // My Post tab combines authored posts (waiting / matched) with the matched
  // orders. My Job tab is just the orders where the viewer is the taker.
  const postTabEmpty = tab === "post" && myPosts.length === 0 && visibleOrders.length === 0;
  const jobTabEmpty = tab === "job" && visibleOrders.length === 0;

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
        {(["post", "job"] as Tab[]).map((t) => {
          const active = t === tab;
          return (
            <Pressable key={t} onPress={() => setTab(t)} className="mr-6">
              <Text className={`text-lg ${active ? "text-ink font-bold" : "text-ink-muted font-semibold"}`}>
                {t === "post" ? "My Post" : "My Job"}
              </Text>
              {active ? <View className="h-0.5 bg-ink mt-1 rounded-full" /> : null}
            </Pressable>
          );
        })}
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 100 }}>
        {/* My Post: authored posts first (waiting / matched), then matched
            orders. My Job: just the orders where you're the taker. */}
        {tab === "post"
          ? myPosts.map((p) => (
              <MyPostCard
                key={p.id}
                post={p}
                // Tapping your own post opens the composer in edit mode.
                onPress={() => router.push(`/post/new?editPostId=${p.id}` as any)}
              />
            ))
          : null}
        {visibleOrders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onReview={() => setReviewing(o)}
            onScheduleAgain={() => {}}
          />
        ))}
        {postTabEmpty || jobTabEmpty ? (
          <Text className="text-ink-muted text-center mt-12">
            {tab === "post"
              ? "No posts yet. Tap + to post something."
              : "No jobs yet. Take an order from Discover."}
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
