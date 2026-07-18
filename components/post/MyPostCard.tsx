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
import type { Order, Post, User } from "../../services/types";
import { moneyBadge } from "../../services/types";
import { Avatar } from "../common/Avatar";
import { AvatarStack } from "../common/AvatarStack";

function fmtWhen(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const today = new Date();
  const sameDay = s.toDateString() === today.toDateString();
  const dateLabel = sameDay
    ? "Today"
    : s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${t(s)} – ${t(e)}`;
}

export function MyPostCard({
  post,
  order,
  members,
  onPress,
}: {
  post: Post;
  /** The host-side active order for this post, when one exists. Supplies the
   *  counterpart (taker) avatar for a matched 1-on-1 post. */
  order?: Order;
  /** Author-first roster ([host, …joiners]) for a group activity's avatar
   *  stack. Derived by the caller from the host's active orders (so it works on
   *  the real backend too). Falls back to `post.participants`. */
  members?: User[];
  onPress?: () => void;
}) {
  const taken = post.seatsTaken ?? 0;
  const is1v1 = post.format === "one_on_one";
  // A post whose agreed end time lapsed with nobody joined is retired as
  // `cancelled` — it renders here only inside the History tab.
  const cancelled = post.status === "cancelled";
  // Prefer the real post lifecycle (0012): a single-seat post with an
  // outstanding request is `pending` (awaiting the author's accept), NOT
  // matched — so it must read "Pending", not "Matched". Fall back to the
  // seat count for older rows without a status.
  const pending = !cancelled && post.status === "pending";
  const waiting = pending || cancelled ? false : post.status ? post.status === "open" : taken === 0;
  // Once the author has accepted, the host and the taker must read the SAME
  // status. The taker's OrderCard labels the accepted state "Upcoming", so the
  // host says "Upcoming" too (previously it read "Matched", which looked out of
  // sync with the joiner's side).
  const statusLabel = cancelled
    ? "Cancelled"
    : pending
      ? "Pending"
      : waiting
        ? "Open"
        : is1v1
          ? "Upcoming"
          : `${taken}/${post.seats} joined`;
  // Amber for the two "awaiting" states (waiting / pending); green once matched;
  // grey once cancelled.
  const amber = waiting || pending;

  // Leading visual (spec):
  //   • 1-on-1 → hourglass while awaiting (open / pending); once a taker is
  //     accepted, ALWAYS the counterpart (taker) avatar.
  //   • group  → hourglass while nobody's joined; once takers exist, a
  //     left-to-right avatar stack (self/host first, then joiners by order),
  //     trailing grey placeholders for the seats still open.
  const isGroup = !is1v1;
  const hourglass = (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(255,203,31,0.18)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="hourglass-outline" size={20} color="#B98800" />
    </View>
  );
  const cancelledIcon = (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "rgba(120,120,120,0.14)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="close-circle-outline" size={22} color="#8A8A8A" />
    </View>
  );
  let leading = hourglass;
  if (cancelled) {
    leading = cancelledIcon;
  } else if (isGroup) {
    if (taken > 0) {
      leading = (
        <AvatarStack
          users={members ?? post.participants ?? []}
          size={44}
          max={4}
          overlap={16}
          placeholders={Math.max(0, post.seats - taken)}
        />
      );
    }
  } else if (!waiting && !pending && order) {
    // Matched 1-on-1 → the taker's face.
    leading = <Avatar uri={order.counterpart.avatarUrl} size={44} />;
  }

  return (
    <Pressable onPress={onPress} className="flex-row py-3 border-b border-ink-line">
      {leading}

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
              backgroundColor: cancelled
                ? "rgba(120,120,120,0.18)"
                : amber
                  ? "rgba(255,203,31,0.18)"
                  : "rgba(62,194,143,0.18)",
            }}
          >
            <Text
              style={{
                color: cancelled ? "#555" : amber ? "#B98800" : "#138C5E",
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text className="text-xs text-ink-muted mt-0.5">{fmtWhen(post.startAt, post.endAt)}</Text>

        <View className="flex-row items-center mt-1">
          {(() => {
            const money = moneyBadge(post);
            return (
              <View className="flex-row items-center">
                <Ionicons name={money.icon as any} size={12} color={money.color} />
                <Text className="text-xs font-semibold ml-1" style={{ color: money.color }}>
                  {money.label}
                </Text>
              </View>
            );
          })()}
          {waiting ? (
            <Text className="text-xs text-ink-muted ml-2">· We'll notify you when someone joins</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
