import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { Avatar } from "../common/Avatar";
import { colors } from "../../constants/theme";
import type { Order, OrderStatus } from "../../services/types";

/** Check-in window: 15 min before start through end. While inside this
 *  window the My Orders list should prompt the user with "Check in now". */
function isInCheckInWindow(order: { startAt: string; endAt: string }) {
  const now = Date.now();
  const start = new Date(order.startAt).getTime();
  const end = new Date(order.endAt).getTime();
  return now >= start - 15 * 60 * 1000 && now <= end;
}

type Props = {
  order: Order;
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
      : s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} ${t(s)}-${t(e)}`;
}

export function OrderCard({ order, onScheduleAgain, onReview }: Props) {
  const isCompleted = order.status === "completed";
  // "Check in now" prompt: only for active orders inside the check-in window.
  const showCheckInPrompt =
    (order.status === "upcoming" || order.status === "checking_in") &&
    isInCheckInWindow(order);

  return (
    <Pressable
      onPress={() => router.push(`/order/${order.id}` as any)}
      className="flex-row py-3 border-b border-ink-line"
    >
      <Avatar uri={order.counterpart.avatarUrl} size={44} />
      <View className="flex-1 ml-3">
        <View className="flex-row justify-between items-center">
          <Text className="text-base font-bold text-ink">{order.postTitleSnapshot}</Text>
          <StatusPill status={order.status} />
        </View>
        <Text className="text-xs text-ink-muted mt-0.5">{fmtDateRange(order.startAt, order.endAt)}</Text>
        <Text className="text-sm text-ink mt-0.5">{order.counterpart.name}</Text>

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
