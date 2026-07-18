// Card used by the Events tab (group activities — Posts whose format is not one_on_one).
// Renders a hero image, title, host, time, location, and a seats badge.
// Tapping the card opens the same provider/[id] detail screen as a 1v1
// post — same data model, so one detail screen handles both.
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../common/Avatar";
import { KindCorner } from "./KindCorner";
import { colors } from "../../constants/theme";
import { categoryVisual } from "../../services/categoryVisuals";
import type { Post, User } from "../../services/types";
import { moneyBadge } from "../../services/types";

type Props = {
  post: Post;
  host?: User;
  onPress?: () => void;
  /** When true, render a "You're going" badge — set by the parent if the
   *  viewer already has an active order against this post. */
  joined?: boolean;
};

function fmtWhen(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const today = new Date();
  const sameDay = s.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const isTomorrow = s.toDateString() === tomorrow.toDateString();
  const dateLabel = sameDay
    ? "Today"
    : isTomorrow
      ? "Tomorrow"
      : s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${t(s)} – ${t(e)}`;
}

export function EventCard({ post, host, onPress, joined }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className="mb-4 rounded-2xl overflow-hidden border border-ink-line bg-surface"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      {/* Post kind — folded top-left corner, the only kind-coloured element. */}
      <KindCorner kind={post.kind} size={44} iconSize={15} />
      <View style={{ position: "relative" }}>
        {/* Every post gets a picture: its own cover if set, otherwise a
            category-appropriate stock photo (basketball → hoops, tennis →
            court, …) so the Events list is never a wall of gray placeholders. */}
        <Image
          source={{ uri: post.coverImageUrl || categoryVisual(post).image }}
          style={{ width: "100%", height: 140 }}
          contentFit="cover"
        />
        {/* Format chip — distinguishes a casual Activity from an organized
            Event at a glance. Sits top-right so the kind corner owns top-left. */}
        {post.format === "activity" || post.format === "event" ? (
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "rgba(0,0,0,0.55)",
            }}
          >
            <Ionicons
              name={post.format === "event" ? "calendar" : "people"}
              size={11}
              color="white"
            />
            <Text style={{ color: "white", fontSize: 10, fontWeight: "700", marginLeft: 4, letterSpacing: 0.3 }}>
              {post.format === "event" ? "EVENT" : "ACTIVITY"}
            </Text>
          </View>
        ) : null}

        {/* "You're going" overlay — bottom-left of the cover, clear of the
            kind corner (top-left) and the format chip (top-right). */}
        {joined ? (
          <View
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: "rgba(62,194,143,0.95)",
            }}
          >
            <Ionicons name="checkmark-circle" size={14} color="white" />
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700", marginLeft: 4 }}>
              You're going
            </Text>
          </View>
        ) : null}
      </View>

      <View className="p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink flex-1" numberOfLines={1}>
            {post.title}
          </Text>
          {(() => {
            const taken = post.seatsTaken ?? 0;
            const full = taken >= post.seats;
            return (
              <View
                style={{
                  backgroundColor: full
                    ? "rgba(120,120,120,0.20)"
                    : "rgba(62,150,255,0.15)",
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 999,
                  marginLeft: 8,
                }}
              >
                <Text
                  style={{
                    color: full ? "#555" : colors.accentBlue,
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {full ? "Full" : `${taken} / ${post.seats} seats`}
                </Text>
              </View>
            );
          })()}
        </View>

        <View className="flex-row items-center mt-1.5">
          <Ionicons name="time-outline" size={13} color={colors.inkMuted} />
          <Text className="text-xs text-ink-muted ml-1">{fmtWhen(post.startAt, post.endAt)}</Text>
        </View>

        {post.locationName ? (
          <View className="flex-row items-center mt-1">
            <Ionicons name="location-outline" size={13} color={colors.inkMuted} />
            <Text className="text-xs text-ink-muted ml-1" numberOfLines={1}>
              {post.locationName}
            </Text>
          </View>
        ) : null}

        {host ? (
          <View className="flex-row items-center mt-2.5">
            <Avatar uri={host.avatarUrl} size={22} />
            <Text className="text-xs text-ink ml-2 font-semibold">{host.name}</Text>
            {(() => {
              const money = moneyBadge(post);
              return (
                <View
                  className="flex-row items-center ml-auto rounded-full px-2 py-0.5"
                  style={{ backgroundColor: money.color + "1F" }}
                >
                  <Ionicons name={money.icon as any} size={12} color={money.color} />
                  <Text className="text-xs font-bold ml-1" style={{ color: money.color }}>
                    {money.label}
                  </Text>
                </View>
              );
            })()}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
