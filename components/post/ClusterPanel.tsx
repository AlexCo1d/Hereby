// Floating map popup with two in-place views (no navigation):
//   1. List view — "N posts here" header + per-activity-type filter chips
//      (e.g. Tennis (2), Pickleball (1)) + a vertical scroll of ProviderCards.
//      N is always the total post count; selecting a chip narrows the list to
//      that activity only.
//   2. Detail view — a compact provider detail opened in-place when a card (or
//      a single map pin) is tapped. Its top-left arrow returns to the list.
import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Avatar } from "../common/Avatar";
import { AvatarStack } from "../common/AvatarStack";
import { Stars } from "../common/Stars";
import { Button } from "../common/Button";
import { ProviderCard } from "./ProviderCard";
import { PublicNoteSheet } from "./PublicNoteSheet";
import { api } from "../../services/api";
import { categoryVisual } from "../../services/categoryVisuals";
import { INTERESTS } from "../../services/mock/data";
import type { Post, User } from "../../services/types";
import {
  moneyBadge,
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
import { colors } from "../../constants/theme";

type Props = {
  posts: Post[];
  users: Record<string, User>;
  onClose: () => void;
  /** When set (single-pin tap), open straight into that post's detail view. */
  initialDetailId?: string | null;
  /** Fired when the in-panel detail view opens/closes so the parent map can
   *  zoom to (or away from) that post's location. Null ⇒ back to the list. */
  onFocusPost?: (post: Post | null) => void;
  /** Max panel height, supplied by the parent so it can scale with the device's
   *  map area instead of a fixed cap. Defaults to a sensible phone-friendly value. */
  maxHeight?: number;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** The viewer's skill level for a post's activity (mirrors provider detail). */
function viewerLevelForPost(
  tagLevels: Record<string, number> | undefined,
  category: string,
): number | undefined {
  if (!tagLevels) return undefined;
  const preset = INTERESTS.find((t) => t.label.toLowerCase() === category.toLowerCase());
  if (preset && tagLevels[preset.id] != null) return tagLevels[preset.id];
  const customKey = Object.keys(tagLevels).find((k) => k.toLowerCase() === category.toLowerCase());
  return customKey ? tagLevels[customKey] : undefined;
}

export function ClusterPanel({
  posts,
  users,
  onClose,
  initialDetailId,
  onFocusPost,
  maxHeight = 420,
}: Props) {
  const me = useAuth((s) => s.user);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(initialDetailId ?? null);
  const [noteOpen, setNoteOpen] = useState(false);

  // Activity-type groups for the filter chips: label + colour + icon + count.
  // Ordered by count (desc) then label (A→Z) so the list is stable and the most
  // common activities lead — never insertion/random order.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { label: string; color: string; icon: any; count: number }
    >();
    for (const p of posts) {
      const key = p.category || "Other";
      const v = categoryVisual(p);
      const g = map.get(key) ?? { label: key, color: v.color, icon: v.icon, count: 0 };
      g.count += 1;
      map.set(key, g);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  }, [posts]);

  const listPosts = useMemo(
    () => (typeFilter ? posts.filter((p) => (p.category || "Other") === typeFilter) : posts),
    [posts, typeFilter],
  );

  const detailPost = detailId ? posts.find((p) => p.id === detailId) ?? null : null;
  const detailAuthor = detailPost ? users[detailPost.authorId] : undefined;

  // Tell the parent which post is in focus so the map can zoom to it (and zoom
  // back out when the detail closes). Reset on unmount so a dismissed panel
  // never leaves the map stuck zoomed in.
  useEffect(() => {
    onFocusPost?.(detailPost);
  }, [detailPost, onFocusPost]);
  useEffect(() => () => onFocusPost?.(null), [onFocusPost]);

  // Existing (non-cancelled) order for the open detail post, if any.
  const [existingOrderId, setExistingOrderId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!detailPost) {
        setExistingOrderId(null);
        return;
      }
      const mine = await api.listMyOrders();
      if (!alive) return;
      const found = mine.find((o) => o.postId === detailPost.id && o.status !== "cancelled");
      setExistingOrderId(found?.id ?? null);
    })();
    return () => {
      alive = false;
    };
  }, [detailPost]);

  const onTakeOrder = async () => {
    if (!detailPost || !me) return;
    if (detailPost.authorId === me.id) {
      Alert.alert("That's your post", "You can't take an order on something you posted yourself.");
      return;
    }
    if (me.mode === "browse_only") {
      Alert.alert("Verification required", "Sign up with your .edu email to place orders.");
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
      const order = await api.createOrder({ post: detailPost, takerUser });
      router.push(`/order/${order.id}` as any);
    } catch (e: any) {
      Alert.alert("Couldn't place order", e?.message ?? "Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  // ---- Detail view -------------------------------------------------------
  if (detailPost && detailAuthor) {
    const visual = categoryVisual(detailPost);
    const req = describeSkillRequirement(detailPost);
    const myLevel = viewerLevelForPost(me?.tagLevels, detailPost.category);
    const qualifies = levelSatisfies(detailPost, myLevel);
    const full = (detailPost.seatsTaken ?? 0) >= detailPost.seats;
    const joined = !!existingOrderId;
    const isOwn = !!me && detailPost.authorId === me.id;
    // Agreed by someone else, not yet started → locked "Upcoming" (1-on-1 only;
    // group activities keep filling seats and are never incoming).
    const incoming = isPostIncoming(detailPost);
    const group = isGroupPost(detailPost) && (detailPost.participants?.length ?? 0) > 1;
    const members = detailPost.participants ?? [detailAuthor];
    // Group headline rating = average across the joined members; a 1-on-1 uses
    // the single author's rating.
    const ratingInfo = group
      ? groupAverageRating(members)
      : { rating: detailAuthor.rating, count: detailAuthor.ratingCount };

    return (
      <View style={[panelShell, { maxHeight }]}>
        <View style={headerRow}>
          <Pressable
            onPress={() => setDetailId(null)}
            hitSlop={8}
            className="flex-row items-center"
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
            <Text className="text-xs font-semibold text-ink ml-0.5">Back</Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={18} color={colors.inkMuted} />
          </Pressable>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}
        >
          <View className="flex-row items-center">
            {group ? (
              <AvatarStack users={members} size={40} max={3} />
            ) : (
              <Avatar uri={detailAuthor.avatarUrl} size={48} />
            )}
            <View className="flex-1 ml-3">
              {/* Headline is the activity title (full, up to 2 lines) — not the
                  member names, which the stacked avatars already convey. */}
              <Text className="text-base font-bold text-ink" numberOfLines={2}>
                {detailPost.title}
              </Text>
              <Text className="text-xs text-ink-muted mt-0.5">
                {dayPrefix(detailPost.startAt)} {fmtTime(detailPost.startAt)} - {fmtTime(detailPost.endAt)}
              </Text>
              <View className="flex-row items-center mt-0.5">
                <Stars value={ratingInfo.rating} size={12} />
                <Text className="ml-1.5 text-xs font-semibold text-ink">
                  {ratingInfo.rating.toFixed(2)}
                </Text>
                {group ? (
                  <Text className="ml-1 text-[10px] text-ink-muted">group avg</Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* Activity + kind + money chips. Money lives here (not in the header)
              so the title above can use the full width and never truncates. */}
          <View className="flex-row flex-wrap items-center mt-2" style={{ gap: 6 }}>
            <View
              className="flex-row items-center rounded-full px-2.5 py-1"
              style={{ backgroundColor: visual.color + "22" }}
            >
              <Ionicons name={visual.icon} size={12} color={visual.color} />
              <Text className="text-xs font-semibold ml-1" style={{ color: visual.color }}>
                {detailPost.category}
              </Text>
            </View>
            {(() => {
              const money = moneyBadge(detailPost);
              return (
                <View
                  className="flex-row items-center rounded-full px-2.5 py-1"
                  style={{ backgroundColor: money.color + "1F" }}
                >
                  <Ionicons name={money.icon as any} size={12} color={money.color} />
                  <Text className="text-xs font-bold ml-1" style={{ color: money.color }}>
                    {money.label}
                  </Text>
                </View>
              );
            })()}
            {(() => {
              const km = postKindMeta(detailPost.kind);
              return (
                <View
                  className="flex-row items-center rounded-full px-2.5 py-1"
                  style={{ backgroundColor: km.color + "26" }}
                >
                  <Ionicons name={km.icon as any} size={11} color={km.color} />
                  <Text
                    className="text-[10px] font-bold ml-1"
                    style={{ color: km.color, letterSpacing: 0.3 }}
                  >
                    {km.short}
                  </Text>
                </View>
              );
            })()}
          </View>

          {detailPost.description ? (
            <Text className="text-xs text-ink leading-5 mt-2">{detailPost.description}</Text>
          ) : null}

          {detailPost.tags && detailPost.tags.length > 0 ? (
            <View className="flex-row flex-wrap mt-2" style={{ gap: 6 }}>
              {detailPost.tags.map((t) => (
                <View
                  key={t}
                  className="flex-row items-center rounded-full px-2.5 py-1"
                  style={{ backgroundColor: colors.surfaceSoft }}
                >
                  <Ionicons name="pricetag-outline" size={11} color={colors.brand} />
                  <Text className="text-[11px] text-ink ml-1">{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {req ? (
            <View className="flex-row items-center flex-wrap mt-2" style={{ gap: 6 }}>
              <View
                className="flex-row items-center rounded-full px-2.5 py-1"
                style={{ backgroundColor: "rgba(76,158,235,0.14)" }}
              >
                <Ionicons name="ribbon-outline" size={12} color={colors.accentBlue} />
                <Text className="text-[11px] font-semibold ml-1" style={{ color: colors.accentBlue }}>
                  {req}
                </Text>
              </View>
              <View
                className="flex-row items-center rounded-full px-2.5 py-1"
                style={{
                  backgroundColor: qualifies ? "rgba(62,194,143,0.15)" : "rgba(229,77,77,0.12)",
                }}
              >
                <Ionicons
                  name={qualifies ? "checkmark-circle" : "alert-circle-outline"}
                  size={12}
                  color={qualifies ? "#138C5E" : "#B83232"}
                />
                <Text
                  className="text-[11px] font-semibold ml-1"
                  style={{ color: qualifies ? "#138C5E" : "#B83232" }}
                >
                  {qualifies ? "You qualify" : `You're ${skillLevelLabel(myLevel)}`}
                </Text>
              </View>
            </View>
          ) : null}

          <View className="flex-row mt-3">
            <Button
              label="Public note"
              variant="primary"
              size="sm"
              className="flex-1 mr-2"
              onPress={() => setNoteOpen(true)}
            />
            {isOwn ? (
              <Button
                label="Your post"
                variant="secondary"
                size="sm"
                className="flex-1 ml-2"
                disabled
                onPress={() => {}}
              />
            ) : joined ? (
              <Button
                label="My order"
                variant="secondary"
                size="sm"
                className="flex-1 ml-2"
                onPress={() => router.push(`/order/${existingOrderId}` as any)}
              />
            ) : incoming ? (
              <Button
                label="Upcoming"
                variant="secondary"
                size="sm"
                className="flex-1 ml-2"
                disabled
                onPress={() => {}}
              />
            ) : (
              <Button
                label={
                  full
                    ? "Full"
                    : placing
                      ? "Placing…"
                      : postKindMeta(detailPost.kind).cta
                }
                variant={full ? "secondary" : "primary"}
                size="sm"
                className="flex-1 ml-2"
                disabled={full || placing}
                onPress={onTakeOrder}
              />
            )}
          </View>
        </ScrollView>
        <PublicNoteSheet
          visible={noteOpen}
          onClose={() => setNoteOpen(false)}
          postId={detailPost.id}
          authorId={detailPost.authorId}
          title={detailPost.title}
        />
      </View>
    );
  }

  // ---- List view ---------------------------------------------------------
  return (
    <View style={panelShell}>
      <View style={headerRow}>
        <Text className="text-xs font-bold text-ink">{posts.length} posts here</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={18} color={colors.inkMuted} />
        </Pressable>
      </View>

      {/* Activity-type filter chips (only when there's more than one type).
          flexShrink:0 keeps this row at its natural height so the vertical card
          list below can never squeeze it out of view. */}
      {groups.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6, alignItems: "center" }}
        >
          {groups.map((g) => {
            const active = typeFilter === g.label;
            return (
              <Pressable
                key={g.label}
                onPress={() => setTypeFilter(active ? null : g.label)}
                className="flex-row items-center rounded-lg px-2 py-1"
                style={{
                  // White chips with a light shadow; the colour lives only in the
                  // small category icon. Active state = the category-coloured
                  // border, so selection reads without tinting the whole chip.
                  backgroundColor: colors.surface,
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? g.color : colors.line,
                  shadowColor: "#000",
                  shadowOpacity: 0.1,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: 2,
                }}
              >
                <Ionicons name={g.icon} size={12} color={g.color} />
                <Text className="text-[11px] font-semibold ml-1" style={{ color: colors.ink }}>
                  {g.label} ({g.count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Virtualized so a dense cluster (many posts at one spot) only mounts the
          cards actually on screen — no unbounded .map over hundreds of rows. */}
      <FlatList
        data={listPosts}
        keyExtractor={(p) => p.id}
        showsVerticalScrollIndicator={false}
        style={{ flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 10 }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
        renderItem={({ item: p }) => {
          const u = users[p.authorId];
          if (!u) return null;
          return (
            <View style={{ marginBottom: 8 }}>
              <ProviderCard post={p} author={u} onPress={() => setDetailId(p.id)} />
            </View>
          );
        }}
      />
    </View>
  );
}

const panelShell = {
  // maxHeight is supplied per-instance (device-relative) — see the [panelShell,
  // { maxHeight }] usages — so it's not fixed here.
  backgroundColor: "rgba(255,255,255,0.98)",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.line,
  shadowColor: "#000",
  shadowOpacity: 0.18,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 6,
  overflow: "hidden" as const,
};

const headerRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: 12,
  paddingTop: 10,
  paddingBottom: 8,
};
