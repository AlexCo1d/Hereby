// Order detail screen.
//
// Showcases the full order lifecycle for an MVP:
//   • Header: counterpart + when + where + status pill
//   • 3-channel check-in cascade (spec 0.6) — the headline feature
//   • Cancellation (12h free-cancel policy enforced at the UI layer)
//   • Rating CTA once completed
//   • "Mark done" once past endAt (real backend would do this with a cron)
//
// Backend interface is fully wired through the api/mock layer, so when
// Supabase comes in we only swap the impl.
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { Button } from "../../components/common/Button";
import { Stars } from "../../components/common/Stars";
import { CheckInCard } from "../../components/post/CheckInCard";
import { RatingModal } from "../../components/post/RatingModal";

import { api } from "../../services/api";
import { canStillAppeal, isPartyPresent, partyConfirmedCount } from "../../services/types";
import type {
  CancelReason,
  CheckInChannel,
  Order,
  OrderStatus,
} from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

const STATUS_STYLES: Record<
  OrderStatus,
  { bg: string; fg: string; label: string }
> = {
  upcoming: { bg: "rgba(255,107,53,0.16)", fg: "#D2541C", label: "Upcoming" },
  checking_in: { bg: "rgba(62,150,255,0.18)", fg: "#0F62D6", label: "Checking In" },
  in_progress: { bg: "rgba(62,194,143,0.18)", fg: "#138C5E", label: "In Progress" },
  completed: { bg: "rgba(62,194,143,0.18)", fg: "#138C5E", label: "Completed" },
  no_show: { bg: "rgba(229,77,77,0.18)", fg: "#B83232", label: "No Show" },
  cancelled: { bg: "rgba(120,120,120,0.18)", fg: "#555", label: "Cancelled" },
};

function fmtDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const today = new Date();
  const sameDay = s.toDateString() === today.toDateString();
  const dateLabel = sameDay
    ? "Today"
    : s.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  const t = (d: Date) =>
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${dateLabel} · ${t(s)} – ${t(e)}`;
}

/** Returns true when current time is within 12h of order start (no free cancel). */
function isInsideCancelFee(order: Order) {
  return new Date(order.startAt).getTime() - Date.now() < 12 * 3600 * 1000;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useAuth((s) => s.user?.id ?? "");

  const [order, setOrder] = useState<Order | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [recentlyPinged, setRecentlyPinged] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    // Sweep before reading so an order whose endAt+30min just passed is
    // already finalized by the time we render it (same rule the server
    // cron will apply). Without this, opening an overdue order would show
    // "Upcoming" until the user did something.
    await api.sweepAutoComplete();
    setOrder(await api.getOrder(id));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // While this screen is open, schedule a single timer to fire at exactly
  // endAt + 30min so the user watching the page sees the state flip live.
  // Skipped if we're already past the deadline (load() handles that case)
  // or in a terminal state.
  useEffect(() => {
    if (!order) return;
    const isActive =
      order.status === "upcoming" ||
      order.status === "checking_in" ||
      order.status === "in_progress";
    if (!isActive) return;
    const fireAt = new Date(order.endAt).getTime() + 30 * 60 * 1000;
    const delay = fireAt - Date.now();
    if (delay <= 0) {
      load();
      return;
    }
    const t = setTimeout(load, delay);
    return () => clearTimeout(t);
  }, [order, load]);

  const selfConfirmed = useMemo(
    () => (order ? partyConfirmedCount(order.checkIn.self) : 0),
    [order],
  );
  const counterpartPresent = useMemo(
    () => (order ? isPartyPresent(order.checkIn.counterpart) : false),
    [order],
  );

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <Header onBack={() => router.back()} title="Order" />
        <Text className="text-ink-muted text-center mt-12">Loading…</Text>
      </SafeAreaView>
    );
  }

  const terminal =
    order.status === "completed" ||
    order.status === "cancelled" ||
    order.status === "no_show";

  const onToggleChannel = async (channel: CheckInChannel) => {
    if (terminal) return;
    const next =
      order.checkIn.self[channel] === "confirmed"
        ? await api.resetCheckIn(order.id, channel)
        : await api.advanceCheckIn(order.id, channel);
    setOrder({ ...next });
  };

  const onCancel = () => {
    const insideFee = isInsideCancelFee(order);
    const choose = (reason: CancelReason) => async () => {
      const next = await api.cancelOrder(order.id, myId, reason);
      setOrder({ ...next });
    };
    Alert.alert(
      "Cancel this order?",
      insideFee
        ? "It's within 12 hours of start — a cancellation fee may apply unless the reason is weather."
        : "Free cancellation window — no fee.",
      [
        { text: "Keep it", style: "cancel" },
        { text: "Weather", onPress: choose("weather") },
        { text: "Personal", onPress: choose("personal") },
      ],
    );
  };

  const onSubmitDispute = async () => {
    if (!order) return;
    if (!disputeReason.trim()) {
      Alert.alert("Tell us what happened", "A short description helps the moderator decide.");
      return;
    }
    setSubmittingDispute(true);
    try {
      const next = await api.openDispute({
        orderId: order.id,
        reason: disputeReason,
        // MVP: no upload UI yet. Phase 2 wires a file picker that uploads
        // to a private Supabase Storage bucket and passes the urls here.
        evidenceUrls: [],
      });
      setOrder({ ...next });
      setDisputeOpen(false);
      setDisputeReason("");
      Alert.alert(
        "Appeal filed",
        "A moderator will review within 24 hours. The fee and rating impact are held until then.",
      );
    } catch (e: any) {
      Alert.alert("Couldn't file", e?.message ?? "Try again in a moment.");
    } finally {
      setSubmittingDispute(false);
    }
  };
  const onPingCounterpart = async () => {
    if (!order) return;
    setPinging(true);
    try {
      const next = await api.pingCounterpart(order.id);
      setOrder({ ...next });
      setRecentlyPinged(true);
      // Reset the cool-down hint after the 5-min throttle window. This is
      // purely UX — the server is the source of truth for the throttle.
      setTimeout(() => setRecentlyPinged(false), 5 * 60 * 1000);
    } catch (e: any) {
      Alert.alert("Couldn't send", e?.message ?? "Try again in a moment.");
    } finally {
      setPinging(false);
    }
  };

  const onMarkDone = async () => {
    const next = await api.completeOrder(order.id);
    setOrder({ ...next });
    // Surface the outcome — different message per branch so the user
    // immediately sees how the no-show / mutual-cancel rules played out.
    if (next.status === "completed") {
      Alert.alert("All set", "Both parties were present. You can rate now.");
    } else if (next.status === "no_show") {
      const youAbsent = next.noShowSide === "self";
      Alert.alert(
        youAbsent ? "Marked as no-show" : "Counterpart no-show",
        youAbsent
          ? "Our records show you weren't at the venue. A no-show fee and rating impact will apply. Open a dispute if you believe this is wrong."
          : `${next.counterpart.name} didn't show up. A no-show fee will be credited to you and their rating will be adjusted.`,
      );
    } else if (next.status === "cancelled" && next.cancelReason === "mutual_no_show") {
      Alert.alert(
        "Auto-cancelled",
        "Neither party checked in. The order has been cancelled — no fee, no rating impact, and your payment will be refunded.",
      );
    }
  };

  const pastEnd = Date.now() > new Date(order.endAt).getTime();

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <Header onBack={() => router.back()} title="Order" />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header card */}
        <View className="mx-4 mt-3 bg-surface rounded-2xl p-4 border border-ink-line">
          <View className="flex-row items-center">
            <Avatar uri={order.counterpart.avatarUrl} size={56} />
            <View className="flex-1 ml-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-bold text-ink">{order.counterpart.name}</Text>
                <StatusPill status={order.status} />
              </View>
              <Text className="text-sm text-ink mt-0.5">{order.postTitleSnapshot}</Text>
              <View className="flex-row items-center mt-1">
                <Stars value={order.counterpart.rating} size={12} />
                <Text className="text-xs text-ink-muted ml-1.5">
                  {order.counterpart.rating.toFixed(2)} · {order.counterpart.ratingCount} reviews
                </Text>
              </View>
            </View>
          </View>

          <View className="mt-3 flex-row items-center">
            <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
            <Text className="text-xs text-ink ml-1.5">
              {fmtDateRange(order.startAt, order.endAt)}
            </Text>
          </View>
        </View>

        {/* Per-party check-in cascade */}
        <View className="mx-4 mt-5">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-base font-bold text-ink">Check-in</Text>
            <Text className="text-xs text-ink-muted">{selfConfirmed} / 3 confirmed</Text>
          </View>
          <Text className="text-xs text-ink-muted leading-4 mb-3">
            Any one of these is enough to prove you arrived. Location runs in the background — you
            don't need to tap. QR and Mutual are extra layers when the meetup is interactive.
          </Text>

          <View className="flex-row" style={{ gap: 8 }}>
            <CheckInCard
              channel="location"
              title="Location"
              subtitle="Auto-confirms when your phone reaches the venue"
              icon="location-outline"
              status={order.checkIn.self.location}
              disabled={terminal}
              onPress={() => onToggleChannel("location")}
            />
            <CheckInCard
              channel="qr"
              title="QR scan"
              subtitle="Scan the other person's QR — confirms both sides at once"
              icon="qr-code-outline"
              status={order.checkIn.self.qr}
              disabled={terminal}
              onPress={() => onToggleChannel("qr")}
            />
            <CheckInCard
              channel="peer"
              title="Mutual"
              subtitle="Tap 'I'm here' once you're at the venue"
              icon="people-outline"
              status={order.checkIn.self.peer}
              disabled={terminal}
              onPress={() => onToggleChannel("peer")}
            />
          </View>

          {/* Counterpart presence — purely informational; the absent side
              can't fake their presence from this screen. */}
          <View
            className="flex-row items-center mt-3 rounded-xl px-3 py-2"
            style={{
              backgroundColor: counterpartPresent
                ? "rgba(62,194,143,0.12)"
                : "rgba(120,120,120,0.10)",
            }}
          >
            <Ionicons
              name={counterpartPresent ? "person" : "person-outline"}
              size={16}
              color={counterpartPresent ? "#138C5E" : colors.inkMuted}
            />
            <Text className="text-xs text-ink ml-2 flex-1">
              {counterpartPresent
                ? `${order.counterpart.name} has arrived at the venue.`
                : `Waiting for ${order.counterpart.name}. We'll keep watching their location in the background.`}
            </Text>
            {/* "Remind them" — surfaces only when self is present but
                counterpart isn't, AND the order isn't terminal. The mock api
                throttles to ≤1 ping / 5 min; on success we just leave the
                button labeled "Sent ✓" until the cooldown resets. */}
            {!terminal && selfConfirmed >= 1 && !counterpartPresent ? (
              <Pressable
                onPress={onPingCounterpart}
                hitSlop={6}
                style={{
                  marginLeft: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: pinging || recentlyPinged ? colors.surfaceSoft : colors.brand,
                }}
                disabled={pinging || recentlyPinged}
              >
                <Text
                  style={{
                    color: pinging || recentlyPinged ? colors.inkMuted : "white",
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  {pinging ? "…" : recentlyPinged ? "Pinged" : "Remind them"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Incoming nudge banner: when the counterpart pinged us. Mock
              flags it via `lastNudgeFrom === "counterpart"`; production fires
              a push so this banner is the in-app echo for users who already
              had the screen open. */}
          {!terminal && order.lastNudgeFrom === "counterpart" && order.lastNudgeAt ? (
            <View
              className="flex-row items-center mt-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "rgba(255,203,31,0.20)" }}
            >
              <Ionicons name="notifications" size={16} color="#B98800" />
              <Text className="text-xs text-ink ml-2 flex-1">
                {order.counterpart.name} is waiting for you. Tap a check-in option above when you
                arrive.
              </Text>
            </View>
          ) : null}

          {selfConfirmed >= 1 && !terminal ? (
            <View className="flex-row items-center mt-2 bg-brand/10 rounded-xl px-3 py-2">
              <Ionicons name="shield-checkmark" size={16} color={colors.brand} />
              <Text className="text-xs text-ink ml-2 flex-1">
                You're checked in. {counterpartPresent ? "Have a good session!" : "If they don't show, you won't be charged."}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Terminal-state context — explains the outcome, who pays, etc. */}
        {order.status === "cancelled" ? (
          <View className="mx-4 mt-5 p-3 bg-surface-soft rounded-xl">
            {order.cancelReason === "mutual_no_show" ? (
              <Text className="text-xs text-ink-muted leading-4">
                Auto-cancelled — neither party checked in. Your payment has been refunded. No
                fee, no rating impact.
              </Text>
            ) : (
              <Text className="text-xs text-ink-muted">
                Cancelled by{" "}
                <Text className="font-semibold text-ink">
                  {order.autoCancelled
                    ? "system"
                    : order.cancelledByUserId === myId
                      ? "you"
                      : order.counterpart.name}
                </Text>
                {order.cancelReason ? ` · ${order.cancelReason}` : ""}.
              </Text>
            )}
          </View>
        ) : null}

        {order.status === "no_show" ? (
          <View className="mx-4 mt-5 p-3 rounded-xl" style={{ backgroundColor: "rgba(229,77,77,0.10)" }}>
            <Text className="text-xs font-semibold text-ink mb-1">
              {order.noShowSide === "self" ? "You were marked no-show" : `${order.counterpart.name} didn't show up`}
            </Text>
            <Text className="text-xs text-ink-muted leading-4">
              {order.noShowSide === "self"
                ? "Our records show your phone never reached the venue. A no-show fee and a rating impact apply. If this looks wrong, you can appeal within 24 hours."
                : "Their phone never reached the venue. The no-show fee has been credited to you and their rating adjusted."}
            </Text>

            {/* Dispute / appeal — only the no-show'd party can open one,
                and only inside the 24h window (spec 0.6). */}
            {order.disputeOpenedAt ? (
              <View className="mt-3 p-2.5 rounded-lg" style={{ backgroundColor: "rgba(255,203,31,0.18)" }}>
                <View className="flex-row items-center">
                  <Ionicons name="hourglass-outline" size={14} color="#B98800" />
                  <Text className="text-xs font-bold ml-1.5" style={{ color: "#B98800" }}>
                    Appeal under review
                  </Text>
                </View>
                <Text className="text-[11px] text-ink-muted mt-1 leading-4">
                  Filed {new Date(order.disputeOpenedAt).toLocaleString()}. Fee and rating impact
                  are held until a moderator reviews. We'll notify you here.
                </Text>
                {order.disputeResolution ? (
                  <Text className="text-[11px] font-semibold mt-1.5" style={{ color: colors.ink }}>
                    Decision: {order.disputeResolution.replace(/_/g, " ")}
                  </Text>
                ) : null}
              </View>
            ) : order.noShowSide === "self" && canStillAppeal(order) ? (
              <Pressable
                onPress={() => setDisputeOpen(true)}
                className="mt-3 self-start px-3 py-1.5 rounded-full"
                style={{ backgroundColor: colors.brand }}
              >
                <Text className="text-xs font-bold text-white">Appeal this</Text>
              </Pressable>
            ) : order.noShowSide === "self" ? (
              <Text className="text-[11px] text-ink-muted mt-2 italic">
                The 24-hour appeal window has closed.
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        <View className="mx-4 mt-6" style={{ gap: 10 }}>
          {!terminal && !pastEnd ? (
            <Button label="Cancel order" variant="secondary" onPress={onCancel} />
          ) : null}
          {!terminal && pastEnd ? (
            <Button label="Mark as done" variant="primary" onPress={onMarkDone} />
          ) : null}
          {order.status === "completed" && !order.reviewed ? (
            <Button
              label="Rate this session"
              variant="primary"
              onPress={() => setReviewing(true)}
            />
          ) : null}
          {order.status === "completed" && order.reviewed ? (
            <View className="items-center py-2">
              <Text className="text-xs text-ink-muted">Already rated · thanks!</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <RatingModal
        visible={reviewing}
        title={`Rate your ${order.postTitleSnapshot} buddy`}
        onClose={() => setReviewing(false)}
        onSubmit={async (stars, comment) => {
          await api.rateOrder(order.id, {
            fromUserId: myId,
            toUserId: order.counterpart.id,
            stars,
            comment,
          });
          // Spec 0.7: rater's own public "ratingGiven" aggregate updates too.
          useAuth.getState().recordRatingGiven(stars);
          setReviewing(false);
          load();
        }}
      />

      {/* Dispute modal — spec 0.6. Production also lets the user attach a
          photo / witness statement; MVP collects free-text only. */}
      <Modal
        visible={disputeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDisputeOpen(false)}
      >
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <View className="bg-surface rounded-2xl mx-8 p-5" style={{ width: "86%" }}>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-bold text-ink">Appeal no-show</Text>
              <Pressable onPress={() => setDisputeOpen(false)}>
                <Ionicons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>
            <Text className="text-xs text-ink-muted leading-4 mb-3">
              A moderator will review within 24 hours. Be specific — mention the venue, timing,
              and anything that proves you were there (a friend, a receipt, a photo).
            </Text>
            <TextInput
              value={disputeReason}
              onChangeText={setDisputeReason}
              multiline
              placeholder="I was at the venue from 4:00 to 5:30, but my phone had no service…"
              placeholderTextColor={colors.inkMuted}
              style={{
                minHeight: 100,
                textAlignVertical: "top",
                backgroundColor: colors.surfaceSoft,
                borderRadius: 12,
                padding: 12,
                color: colors.ink,
                fontSize: 14,
              }}
            />
            <View className="flex-row mt-4">
              <Button
                label="Cancel"
                variant="secondary"
                className="flex-1 mr-2"
                onPress={() => setDisputeOpen(false)}
              />
              <Button
                label={submittingDispute ? "Filing…" : "File appeal"}
                variant="primary"
                className="flex-1 ml-2"
                disabled={submittingDispute}
                onPress={onSubmitDispute}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View className="px-3 pt-2 pb-2 flex-row items-center border-b border-ink-line">
      <Pressable onPress={onBack} className="p-1 mr-1">
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </Pressable>
      <Text className="text-lg font-bold text-ink">{title}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <View
      style={{
        backgroundColor: s.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 2,
      }}
    >
      <Text style={{ color: s.fg, fontSize: 11, fontWeight: "700" }}>{s.label}</Text>
    </View>
  );
}
