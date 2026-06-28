// Card for a post the current user authored (the "My Post" tab).
//
// Shows a status that reflects matching progress:
//   • Waiting   — no one has joined yet (seatsTaken === 0). This is the
//     state a freshly-created post lands in. Auto-matching (Phase 4) will
//     move it forward without the author doing anything.
//   • N joined  — at least one person took the post (seatsTaken > 0). For a
//     1v1 post that means "Matched"; for activity/event it's a running count.
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import type { Post } from "../../services/types";
import { formatHourlyPrice } from "../../services/types";

function fmtWhen(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const today = new Date();
  const sameDay = s.toDateString() === today.toDateString();
  const dateLabel = sameDay
    ? "Today"
    : s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${t(s)} – ${t(e)}`;
}

export function MyPostCard({ post, onPress }: { post: Post; onPress?: () => void }) {
  const taken = post.seatsTaken ?? 0;
  const waiting = taken === 0;
  const is1v1 = post.format === "one_on_one";
  const statusLabel = waiting
    ? "Waiting"
    : is1v1
      ? "Matched"
      : `${taken}/${post.seats} joined`;

  return (
    <Pressable onPress={onPress} className="flex-row py-3 border-b border-ink-line">
      {/* Leading status dot */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: waiting ? "rgba(255,203,31,0.18)" : "rgba(62,194,143,0.15)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={waiting ? "hourglass-outline" : "checkmark-circle-outline"}
          size={20}
          color={waiting ? "#B98800" : "#138C5E"}
        />
      </View>

      <View className="flex-1 ml-3">
        <View className="flex-row justify-between items-center">
          <Text className="text-base font-bold text-ink flex-1" numberOfLines={1}>
            {post.title}
          </Text>
          <View
            style={{
              marginLeft: 8,
              paddingHorizontal: 10,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: waiting ? "rgba(255,203,31,0.18)" : "rgba(62,194,143,0.18)",
            }}
          >
            <Text style={{ color: waiting ? "#B98800" : "#138C5E", fontSize: 11, fontWeight: "700" }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text className="text-xs text-ink-muted mt-0.5">{fmtWhen(post.startAt, post.endAt)}</Text>

        <View className="flex-row items-center mt-1">
          <Text className="text-xs text-ink-muted">{formatHourlyPrice(post.priceCentsPerHour)}</Text>
          {waiting ? (
            <Text className="text-xs text-ink-muted ml-2">· We'll notify you when someone joins</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
