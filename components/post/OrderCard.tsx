import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Avatar } from "../common/Avatar";
import { AvatarStack } from "../common/AvatarStack";
import { colors } from "../../constants/theme";
import type { Order, OrderStatus, User } from "../../services/types";
import { isCheckInOpen, isRateable, rosterSize } from "../../services/types";

/** Check-in window: 15 min before start through end. While inside this
 *  window the My Orders list should prompt the user with "Check in now". */
function isInCheckInWindow(order: { startAt: string; endAt: string }) {
  const now = Date.now();
  const end = new Date(order.endAt).getTime();
  return isCheckInOpen(order, now) && now <= end;
}

type Props = {
  order: Order;
  /** The viewer's own User — the taker's face in a group activity's avatar
   *  stack ([host, self, …other joiners]). Omitted for a 1-on-1 order. */
  selfUser?: User;
  onScheduleAgain?: () => void;
  onReview?: () => void;
};

function fmtDateRange(start: string, end: string) {
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
      : s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} ${t(s)}-${t(e)}`;
}

export function OrderCard({ order, selfUser, onScheduleAgain, onReview }: Props) {
  const isCompleted = order.status === "completed";
  const unrated = isRateable(order);
  // "Check in now" prompt: only for active orders inside the check-in window.
  const showCheckInPrompt =
    (order.status === "upcoming" || order.status === "checking_in") &&
    isInCheckInWindow(order);
  // Pending prompt: the request hasn't been accepted yet.
  const showPendingPrompt = order.status === "pending";

  // Leading visual (spec, taker POV):
  //   • group activity → an avatar stack [host, self, …other joiners], mirroring
  //     the Discover list view.
  //   • 1-on-1 → hourglass while the request is pending; the host's face once
  //     it's been accepted (and for terminal history rows).
  const others = order.checkIn.others ?? [];
  const isGroup = others.length > 0;
  let leading;
  if (isGroup) {
    const members: User[] = [
      order.counterpart,
      ...(selfUser ? [selfUser] : []),
      ...others.map((e) => e.user),
    ];
    leading = <AvatarStack users={members} size={44} max={4} overlap={16} />;
  } else if (showPendingPrompt) {
    leading = (
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
  } else {
    leading = <Avatar uri={order.counterpart.avatarUrl} size={44} />;
  }

  return (
    <Pressable
      onPress={() => router.push(`/order/${order.id}` as any)}
      className="flex-row py-3 border-b border-ink-line"
    >
      {leading}
      <View className="flex-1 ml-3">
        {/* Unrated marker — top-left flag on finished sessions that still need
            a rating, so History surfaces them first. */}
        {unrated ? (
          <View
            className="flex-row items-center self-start mb-1 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(255,107,53,0.14)" }}
          >
            <Ionicons name="star" size={10} color={colors.brand} />
            <Text className="text-[10px] font-bold ml-1" style={{ color: colors.brand, letterSpacing: 0.3 }}>
              UNRATED
            </Text>
          </View>
        ) : null}
        <View className="flex-row justify-between items-center">
          <Text className="text-base font-bold text-ink">{order.postTitleSnapshot}</Text>
          <StatusPill status={order.status} />
        </View>
        <Text className="text-xs text-ink-muted mt-0.5">{fmtDateRange(order.startAt, order.endAt)}</Text>
        {isGroup ? (
          // Group activity — show how many people are in it (host + joiners) so
          // a participant's My Post card reads like a group, not a 1-on-1. The
          // host's name still anchors who's running it.
          <View className="flex-row items-center mt-0.5">
            <Ionicons name="people" size={13} color={colors.inkMuted} />
            <Text className="text-sm text-ink ml-1">
              {rosterSize(order)} going · {order.counterpart.name}
            </Text>
          </View>
        ) : (
          <Text className="text-sm text-ink mt-0.5">{order.counterpart.name}</Text>
        )}

        {showPendingPrompt ? (
          <View
            className="flex-row items-center self-start mt-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "rgba(255,203,31,0.18)" }}
          >
            <Ionicons name="hourglass-outline" size={14} color="#B98800" />
            <Text className="text-xs font-bold ml-1.5" style={{ color: "#B98800" }}>
              {order.isMyPost ? "Respond to request" : "Waiting for host"}
            </Text>
          </View>
        ) : null}

        {showCheckInPrompt ? (
          <View
            className="flex-row items-center self-start mt-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "rgba(255,107,53,0.12)" }}
          >
            <Ionicons name="navigate-circle" size={14} color={colors.brand} />
            <Text className="text-xs font-bold ml-1.5" style={{ color: colors.brand }}>
              Check in now
            </Text>
          </View>
        ) : null}

        {isCompleted ? (
          <View className="flex-row mt-2">
            {!order.reviewed ? (
              <Pressable
                onPress={onReview}
                className="px-3 py-1 rounded-full bg-brand-100 mr-2"
              >
                <Text className="text-xs font-semibold" style={{ color: colors.brand }}>
                  Review
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onScheduleAgain}
              className="px-3 py-1 rounded-full bg-surface-soft"
            >
              <Text className="text-xs font-semibold text-ink">Schedule Again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const STATUS_STYLES: Record<OrderStatus, { bg: string; color: string; label: string }> = {
  pending: { bg: "rgba(255,203,31,0.20)", color: "#B98800", label: "Pending" },
  // Orange — deliberately distinct from My-Post "Waiting" (yellow) so the two
  // pre-event states read differently at a glance.
  upcoming: { bg: "rgba(255,107,53,0.16)", color: "#D2541C", label: "Upcoming" },
  checking_in: { bg: "rgba(62,150,255,0.18)", color: "#0F62D6", label: "Checking In" },
  in_progress: { bg: "rgba(62,194,143,0.18)", color: "#138C5E", label: "In Progress" },
  completed: { bg: "rgba(62,194,143,0.18)", color: "#138C5E", label: "Completed" },
  no_show: { bg: "rgba(229,77,77,0.18)", color: "#B83232", label: "No Show" },
  cancelled: { bg: "rgba(120,120,120,0.18)", color: "#555", label: "Cancelled" },
};

function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <View style={{ backgroundColor: s.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
      <Text style={{ color: s.color, fontSize: 11, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}
