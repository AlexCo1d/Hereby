import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { AvatarStack } from "../../components/common/AvatarStack";
import { Stars } from "../../components/common/Stars";
import { Button } from "../../components/common/Button";
import { OSMMap } from "../../components/map/OSMMap";
import { PublicNoteSheet } from "../../components/post/PublicNoteSheet";
import { api } from "../../services/api";
import type { Post, User } from "../../services/types";
import {
  moneyBadge,
  moneyExpectationLabel,
  postKindMeta,
  describeSkillRequirement,
  levelSatisfies,
  skillLevelLabel,
  dayPrefix,
  groupAverageRating,
  isGroupPost,
  isPostIncoming,
} from "../../services/types";
import { useAuth } from "../../stores/auth";
import { INTERESTS } from "../../services/mock/data";
import { colors } from "../../constants/theme";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  const { id, note } = useLocalSearchParams<{ id: string; note?: string }>();
  const me = useAuth((s) => s.user);
  const [post, setPost] = useState<Post | null>(null);
  const [author, setAuthor] = useState<User | null>(null);
  const [placing, setPlacing] = useState(false);
  /** The viewer's existing non-cancelled order for this post, if any.
   *  Drives the "already going" CTA + prevents double-orders. */
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  // Deep-link from a notification: /provider/[id]?note=<noteId> auto-opens the
  // public-note sheet and highlights the reply we were notified about.
  useEffect(() => {
    if (note) setNoteOpen(true);
  }, [note]);

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

  if (!post || !author) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <Text className="text-ink-muted text-center mt-12">Loading…</Text>
      </SafeAreaView>
    );
  }

  const group = isGroupPost(post) && (post.participants?.length ?? 0) > 1;
  const members = post.participants ?? [author];
  // Group headline rating = average across joined members; 1-on-1 uses the
  // single author's rating.
  const ratingInfo = group
    ? groupAverageRating(members)
    : { rating: author.rating, count: author.ratingCount };

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
            {group ? (
              <AvatarStack users={members} size={48} max={4} />
            ) : (
              <Avatar uri={author.avatarUrl} size={56} />
            )}
            <View className="flex-1 ml-3">
              <View className="flex-row items-start justify-between">
                {/* Headline is the activity title (shown in full) — the avatars
                    already convey who's involved. */}
                <Text className="text-lg font-bold text-ink flex-1 mr-2">
                  {post.title}
                </Text>
                <Pressable className="flex-row items-center mt-1">
                  <Ionicons name="share-outline" size={16} color={colors.brand} />
                  <Text className="text-sm font-semibold ml-1" style={{ color: colors.brand }}>
                    Share
                  </Text>
                </Pressable>
              </View>
              <Text className="text-sm text-ink-muted mt-0.5">
                {dayPrefix(post.startAt)} {fmtTime(post.startAt)} - {fmtTime(post.endAt)}
              </Text>
              <View className="flex-row items-center mt-1">
                <Stars value={ratingInfo.rating} size={14} />
                <Text className="ml-2 text-sm font-semibold text-ink">{ratingInfo.rating.toFixed(2)}</Text>
                {group ? (
                  <Text className="ml-1.5 text-xs text-ink-muted">group avg</Text>
                ) : null}
              </View>
              {(() => {
                const money = moneyBadge(post);
                return (
                  <View className="flex-row items-center mt-1">
                    <Ionicons name={money.icon as any} size={15} color={money.color} />
                    <Text
                      className="text-base font-semibold ml-1"
                      style={{ color: money.color }}
                    >
                      {moneyExpectationLabel(post)}
                    </Text>
                  </View>
                );
              })()}
              {/* Kind chip — Offering / Looking for / Partnering. */}
              {(() => {
                const km = postKindMeta(post.kind);
                return (
                  <View
                    className="flex-row items-center self-start mt-1.5 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: km.color + "22" }}
                  >
                    <Ionicons name={km.icon as any} size={11} color={km.color} />
                    <Text
                      style={{
                        color: km.color,
                        fontSize: 10,
                        fontWeight: "700",
                        marginLeft: 4,
                        letterSpacing: 0.3,
                      }}
                    >
                      {km.short}
                    </Text>
                  </View>
                );
              })()}
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
            const pending = post.status === "pending";
            const closed = post.status === "cancelled" || post.status === "completed";
            // Already agreed by someone else (1-on-1 booking confirmed) →
            // "Upcoming": locked to new joiners until it starts / frees up.
            // Group activities are never incoming — they keep filling seats.
            const incoming = isPostIncoming(post);
            // Right-hand button states (first match wins):
            //   1. isOwn   → "Your post" disabled (Events tab doesn't filter
            //               own posts; Discover does, but we still defend here)
            //   2. joined  → "View my order" jumps to the order detail
            //   3. closed  → "Closed" disabled (author cancelled / no-response)
            //   4. pending → "Pending" disabled — someone's take-request is
            //               awaiting the author, so it's locked for others
            //   5. full    → "Full" disabled secondary
            //   6. open    → "I'll take that!" primary
            return (
              <View className="flex-row mt-4">
                <Button
                  label="Public note"
                  variant="primary"
                  className="flex-1 mr-2"
                  onPress={() => setNoteOpen(true)}
                />
                {isOwn ? (
                  <Button
                    // Own post: this now appears on Discover too. Tapping "My
                    // Post" jumps straight into its order/check-in screen when
                    // someone's already taken it; otherwise into the editor.
                    label="My Post"
                    variant="secondary"
                    className="flex-1 ml-2"
                    onPress={() =>
                      existingOrderId
                        ? router.push(`/order/${existingOrderId}` as any)
                        : router.push(`/post/new?editPostId=${post.id}` as any)
                    }
                  />
                ) : joined ? (
                  <Button
                    label="View my order"
                    variant="secondary"
                    className="flex-1 ml-2"
                    onPress={() => router.push(`/order/${existingOrderId}` as any)}
                  />
                ) : closed ? (
                  <Button
                    label="Closed"
                    variant="secondary"
                    className="flex-1 ml-2"
                    disabled
                    onPress={() => {}}
                  />
                ) : incoming ? (
                  <Button
                    label="Upcoming"
                    variant="secondary"
                    className="flex-1 ml-2"
                    disabled
                    onPress={() => {}}
                  />
                ) : pending ? (
                  <Button
                    label="Pending"
                    variant="secondary"
                    className="flex-1 ml-2"
                    disabled
                    onPress={() => {}}
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
                          : postKindMeta(post.kind).cta
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
      <PublicNoteSheet
        visible={noteOpen}
        onClose={() => setNoteOpen(false)}
        postId={post.id}
        authorId={post.authorId}
        title={post.title}
        highlightNoteId={note}
      />
    </SafeAreaView>
  );
}
