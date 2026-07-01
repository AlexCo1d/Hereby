import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { Stars } from "../../components/common/Stars";
import { Button } from "../../components/common/Button";
import { OSMMap } from "../../components/map/OSMMap";
import { api } from "../../services/api";
import type { Post, User } from "../../services/types";
import {
  formatHourlyPrice,
  describeSkillRequirement,
  levelSatisfies,
  skillLevelLabel,
} from "../../services/types";
import { useAuth } from "../../stores/auth";
import { INTERESTS } from "../../services/mock/data";
import { colors } from "../../constants/theme";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The viewer's skill level for a post's activity. Maps the post `category`
 *  (e.g. "Tennis") to a preset interest id ("tennis") or a matching custom
 *  tag, then reads the level. Undefined ⇒ treated as Beginner by the matcher. */
function viewerLevelForPost(
  tagLevels: Record<string, number> | undefined,
  category: string,
): number | undefined {
  if (!tagLevels) return undefined;
  const preset = INTERESTS.find((t) => t.label.toLowerCase() === category.toLowerCase());
  if (preset && tagLevels[preset.id] != null) return tagLevels[preset.id];
  // fall back to a custom tag matching the category label
  const customKey = Object.keys(tagLevels).find((k) => k.toLowerCase() === category.toLowerCase());
  return customKey ? tagLevels[customKey] : undefined;
}

export default function ProviderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user);
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<User | null>(null);
  const [placing, setPlacing] = useState(false);
  /** The viewer's existing non-cancelled order for this post, if any.
   *  Drives the "already going" CTA + prevents double-orders. */
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await api.getPost(id);
      setPost(p);
      if (p) {
        setAuthor(await api.getUser(p.authorId));
        const mine = await api.listMyOrders();
        const found = mine.find((o) => o.postId === p.id && o.status !== "cancelled");
        setExistingOrderId(found?.id ?? null);
      }
    })();
  }, [id]);

  const onTakeOrder = async () => {
    if (!post || !me) return;
    // Don't let the user place an order on their own post (the Events tab
    // doesn't pre-filter by authorId the way Discover does).
    if (post.authorId === me.id) {
      Alert.alert(
        "That's your post",
        "You can't take an order on something you posted yourself.",
      );
      return;
    }
    // Browse-only users can't place orders (spec 0.5).
    if (me.mode === "browse_only") {
      Alert.alert(
        "Verification required",
        "Sign up with your .edu email to place orders.",
      );
      return;
    }
    setPlacing(true);
    try {
      const takerUser: User = {
        id: me.id,
        name: me.name,
        avatarUrl: me.avatarUrl,
        rating: me.ratingReceived,
        ratingCount: me.ratingReceivedCount,
        interests: me.interestIds,
        eduVerified: me.mode === "verified",
      };
      const order = await api.createOrder({ post, takerUser });
      // Replace this screen with the order detail so the back button still
      // returns to discovery rather than this stale provider page.
      router.replace(`/order/${order.id}` as any);
    } catch (e: any) {
      Alert.alert("Couldn't place order", e?.message ?? "Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const onChat = async () => {
    if (!post) return;
    try {
      // Open (or fetch) the 1:1 thread with the author/host and go straight
      // into the conversation — not the chat list. For 1v1 posts without an
      // order this throws (spec 0.9) and we explain why.
      const thread = await api.openThreadWith({ withUserId: post.authorId, postId: post.id });
      router.push(`/chat/${thread.id}` as any);
    } catch (e: any) {
      Alert.alert(
        "Chat locked",
        e?.message ?? "Place an order first to start chatting.",
      );
    }
  };

  if (!post || !author) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <Text className="text-ink-muted text-center mt-12">Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-2 flex-row items-center border-b border-ink-line">
        <Pressable onPress={() => router.back()} className="p-1 mr-2">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text className="text-lg font-bold text-ink">{post.category}</Text>
      </View>

      {/* Map background */}
      <View style={{ height: 220 }}>
        <OSMMap
          center={post.location}
          spanDeg={0.01}
          markers={[
            {
              id: post.id,
              coordinate: post.location,
              render: () => (
                <View
                  style={{
                    backgroundColor: "white",
                    padding: 3,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: colors.brand,
                  }}
                >
                  <Avatar uri={author.avatarUrl} size={28} />
                </View>
              ),
            },
          ]}
        />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mx-4 -mt-10 bg-surface rounded-2xl p-4"
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 5,
          }}
        >
          <View className="flex-row items-center">
            <Avatar uri={author.avatarUrl} size={56} />
            <View className="flex-1 ml-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-lg font-bold text-ink">{author.name}</Text>
                <Pressable className="flex-row items-center">
                  <Ionicons name="share-outline" size={16} color={colors.brand} />
                  <Text className="text-sm font-semibold ml-1" style={{ color: colors.brand }}>
                    Share
                  </Text>
                </Pressable>
              </View>
              <Text className="text-sm text-ink-muted mt-0.5">
                {fmtTime(post.startAt)} - {fmtTime(post.endAt)}
              </Text>
              <View className="flex-row items-center mt-1">
                <Stars value={author.rating} size={14} />
                <Text className="ml-2 text-sm font-semibold text-ink">{author.rating.toFixed(2)}</Text>
              </View>
              <Text className="text-base font-semibold mt-1" style={{ color: colors.accentBlue }}>
                {formatHourlyPrice(post.priceCentsPerHour)}
              </Text>
              {/* Kind chip — clarifies whether author is hosting or looking. */}
              <View
                className="flex-row items-center self-start mt-1.5 px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor:
                    post.kind === "seek"
                      ? "rgba(124,108,240,0.15)"
                      : "rgba(255,107,53,0.12)",
                }}
              >
                <Ionicons
                  name={post.kind === "seek" ? "hand-right-outline" : "megaphone-outline"}
                  size={11}
                  color={post.kind === "seek" ? colors.accentPurple : colors.brand}
                />
                <Text
                  style={{
                    color: post.kind === "seek" ? colors.accentPurple : colors.brand,
                    fontSize: 10,
                    fontWeight: "700",
                    marginLeft: 4,
                    letterSpacing: 0.3,
                  }}
                >
                  {post.kind === "seek" ? "LOOKING FOR" : "OFFERING"}
                </Text>
              </View>
            </View>
          </View>

          {post.description ? (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-ink mb-1">Intro:</Text>
              <Text className="text-sm text-ink leading-5">{post.description}</Text>
            </View>
          ) : null}

          {/* Tags the author attached — also what search matches against. */}
          {post.tags && post.tags.length > 0 ? (
            <View className="mt-4">
              <Text className="text-sm font-semibold text-ink mb-2">Tags:</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {post.tags.map((t) => (
                  <View
                    key={t}
                    className="flex-row items-center rounded-full px-3 py-1"
                    style={{ backgroundColor: colors.surfaceSoft }}
                  >
                    <Ionicons name="pricetag-outline" size={12} color={colors.brand} />
                    <Text className="text-xs text-ink ml-1.5">{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Skill-level requirement + whether the viewer qualifies. */}
          {(() => {
            const req = describeSkillRequirement(post);
            if (!req) return null;
            const myLevel = viewerLevelForPost(me?.tagLevels, post.category);
            const qualifies = levelSatisfies(post, myLevel);
            return (
              <View className="mt-4">
                <Text className="text-sm font-semibold text-ink mb-2">Skill level:</Text>
                <View className="flex-row items-center flex-wrap" style={{ gap: 8 }}>
                  <View
                    className="flex-row items-center rounded-full px-3 py-1"
                    style={{ backgroundColor: "rgba(76,158,235,0.14)" }}
                  >
                    <Ionicons name="ribbon-outline" size={13} color={colors.accentBlue} />
                    <Text className="text-xs font-semibold ml-1.5" style={{ color: colors.accentBlue }}>
                      {req}
                    </Text>
                  </View>
                  <View
                    className="flex-row items-center rounded-full px-3 py-1"
                    style={{
                      backgroundColor: qualifies ? "rgba(62,194,143,0.15)" : "rgba(229,77,77,0.12)",
                    }}
                  >
                    <Ionicons
                      name={qualifies ? "checkmark-circle" : "alert-circle-outline"}
                      size={13}
                      color={qualifies ? "#138C5E" : "#B83232"}
                    />
                    <Text
                      className="text-xs font-semibold ml-1.5"
                      style={{ color: qualifies ? "#138C5E" : "#B83232" }}
                    >
                      {qualifies
                        ? "You qualify"
                        : `You're ${skillLevelLabel(myLevel)} — may not fit`}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {post.cancellationFeeCents && post.cancellationFeeCents > 0 ? (
            <Text className="text-sm text-ink mt-3">
              <Text className="font-semibold">Cancellation Fee:</Text> ${post.cancellationFeeCents / 100}
            </Text>
          ) : null}

          {/* Seats — only meaningful for posts with seats > 1. Surfaces both
              the cap and the live availability so users see "12 / 20 spots
              filled" before committing. */}
          {post.seats > 1 ? (() => {
            const taken = post.seatsTaken ?? 0;
            const full = taken >= post.seats;
            const remaining = Math.max(post.seats - taken, 0);
            return (
              <View className="flex-row items-center mt-3">
                <Ionicons
                  name="people-outline"
                  size={16}
                  color={full ? "#B83232" : colors.ink}
                />
                <Text className="text-sm text-ink ml-1.5">
                  <Text className="font-semibold">Seats:</Text>{" "}
                  {taken} / {post.seats}{" "}
                  <Text style={{ color: full ? "#B83232" : colors.inkMuted }}>
                    {full ? "(Full)" : `· ${remaining} left`}
                  </Text>
                </Text>
              </View>
            );
          })() : null}

          <Text className="text-sm text-ink mt-2">
            <Text className="font-semibold">Comment</Text> ({post.commentsCount ?? 0})
          </Text>

          {/* CTA row */}
          {(() => {
            const full = (post.seatsTaken ?? 0) >= post.seats;
            const joined = !!existingOrderId;
            const isOwn = !!me && post.authorId === me.id;
            // Four states for the right-hand button:
            //   1. isOwn  → "Your post" disabled (Events tab doesn't filter
            //              own posts; Discover does, but we still defend here)
            //   2. joined → "View my order" jumps to the order detail
            //   3. full   → "Full" disabled secondary
            //   4. open   → "I'll take that!" primary
            return (
              <View className="flex-row mt-4">
                <Button
                  label="Chat"
                  variant="primary"
                  className="flex-1 mr-2"
                  onPress={onChat}
                />
                {isOwn ? (
                  <Button
                    label="Your post"
                    variant="secondary"
                    className="flex-1 ml-2"
                    disabled
                    onPress={() => {}}
                  />
                ) : joined ? (
                  <Button
                    label="View my order"
                    variant="secondary"
                    className="flex-1 ml-2"
                    onPress={() => router.push(`/order/${existingOrderId}` as any)}
                  />
                ) : (
                  <Button
                    // Copy depends on which side the viewer is on (spec 0.1):
                    //   • "seek" post → viewer is the provider → "I can help"
                    //   • "offer" post → viewer is the customer → "I'll take that!"
                    label={
                      full
                        ? "Full"
                        : placing
                          ? "Placing…"
                          : post.kind === "seek"
                            ? "I can help"
                            : "I'll take that!"
                    }
                    variant={full ? "secondary" : "primary"}
                    className="flex-1 ml-2"
                    disabled={full || placing}
                    onPress={onTakeOrder}
                  />
                )}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
