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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, Alert, Modal, Platform, TextInput, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { AvatarStack } from "../../components/common/AvatarStack";
import { Button } from "../../components/common/Button";
import { Stars } from "../../components/common/Stars";
import { CheckInCard } from "../../components/post/CheckInCard";
import { RatingModal } from "../../components/post/RatingModal";
import { OSMMap } from "../../components/map/OSMMap";

import { api } from "../../services/api";
import {
  canStillAppeal,
  everyonePresent,
  groupAverageRating,
  groupMemberLabel,
  isCheckInOpen,
  isOrderTerminal,
  isPartyPresent,
  msUntilCheckIn,
  NO_SHOW_AFTER_START_MS,
  presentCount,
  rosterSize,
} from "../../services/types";
import type {
  CancelReason,
  Order,
  OrderStatus,
  Post,
  User,
} from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

/** Human countdown like "2h 14m" or "09:58" (under an hour). */
function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_STYLES: Record<
  OrderStatus,
  { bg: string; fg: string; label: string }
> = {
  pending: { bg: "rgba(255,203,31,0.20)", fg: "#B98800", label: "Pending" },
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
    : s.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
  // The order carries no location itself; we fetch the underlying Post to show
  // the agreed check-in spot (map + street address + navigation jump).
  const [post, setPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [recentlyPinged, setRecentlyPinged] = useState(false);
  const [responding, setResponding] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);
  // Manual check-in picker (vouch for others once you're present).
  const [manualOpen, setManualOpen] = useState(false);
  // Wall clock that ticks every second while the order is live, so the
  // check-in countdown updates and the screen can flip state at the exact
  // moment a lifecycle boundary passes.
  const [now, setNow] = useState(Date.now());
  const sweepingRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    // Sweep before reading so an order whose endAt+30min just passed is
    // already finalized by the time we render it (same rule the server
    // cron will apply). Without this, opening an overdue order would show
    // "Upcoming" until the user did something.
    await api.sweepAutoComplete();
    const o = await api.getOrder(id);
    setOrder(o);
    // Fetch the Post lazily for its location; a missing/deleted post simply
    // hides the location section rather than blocking the order view.
    if (o) {
      try {
        setPost(await api.getPost(o.postId));
      } catch {
        setPost(null);
      }
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Tick the wall clock every second while the order is live (accepted but
  // not terminal). Pending orders don't need it (they wait on the author),
  // and terminal orders are frozen. This drives the check-in countdown and
  // the live status flips below.
  useEffect(() => {
    if (!order) return;
    if (order.status === "pending" || isOrderTerminal(order.status)) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [order]);

  // When the clock crosses a lifecycle boundary (endAt, or 15 min past start
  // with a party still absent), re-run the sweep so the stored status flips
  // to completed / no_show / cancelled while the user is watching. Guarded so
  // the async sweep isn't fired on every tick.
  useEffect(() => {
    if (!order) return;
    if (order.status === "pending" || isOrderTerminal(order.status)) return;
    const start = new Date(order.startAt).getTime();
    const end = new Date(order.endAt).getTime();
    const allPresent = everyonePresent(order);
    const shouldFinalize =
      now >= end || (now >= start + NO_SHOW_AFTER_START_MS && !allPresent);
    if (shouldFinalize && !sweepingRef.current) {
      sweepingRef.current = true;
      load().finally(() => {
        sweepingRef.current = false;
      });
    }
  }, [now, order, load]);

  const selfPresent = order ? isPartyPresent(order.checkIn.self) : false;
  const selfStatus = order?.checkIn.self.status ?? "pending";
  const counterpartPresent = order ? isPartyPresent(order.checkIn.counterpart) : false;
  // Everyone on the roster except the viewer (host + any group participants),
  // paired with their current presence — drives the manual-check-in picker
  // and the progress line.
  const otherMembers = useMemo(
    () =>
      order
        ? [
            { user: order.counterpart, checkIn: order.checkIn.counterpart },
            ...(order.checkIn.others ?? []).map((e) => ({
              user: e.user,
              checkIn: e.checkIn,
            })),
          ]
        : [],
    [order],
  );
  const isGroup = (order?.checkIn.others?.length ?? 0) > 0;
  // Author-first display roster (host + group participants) for the multi-
  // avatar / multi-name header. Excludes the viewer; `rosterSize` counts them.
  const groupUsers = useMemo(() => otherMembers.map((m) => m.user), [otherMembers]);

  // Chat: group order → the post's shared group room (one per activity, keyed
  // server-side by post); 1-on-1 → the thread with the counterpart. An order
  // always exists here, so the gate opens. openGroupThread returns the real
  // thread id (a UUID on supabase), so we never hard-code the id format.
  const onChat = useCallback(async () => {
    if (!order) return;
    try {
      const thread = isGroup
        ? await api.openGroupThread(order.postId)
        : await api.openThreadWith({ withUserId: order.counterpart.id });
      router.push(`/chat/${thread.id}` as any);
    } catch (e: any) {
      Alert.alert("Chat unavailable", e?.message ?? "Please try again.");
    }
  }, [order, isGroup]);

  if (!order) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <Header onBack={() => router.back()} title="Order" />
        <Text className="text-ink-muted text-center mt-12">Loading…</Text>
      </SafeAreaView>
    );
  }

  const terminal = isOrderTerminal(order.status);
  const isPending = order.status === "pending";
  // Check-in only unlocks 15 min before start (spec 0.6). Before that we show
  // a countdown; the cascade cards stay disabled.
  const checkInOpen = isCheckInOpen(order, now);
  const checkInWait = msUntilCheckIn(order, now);
  const checkInLocked = isPending || !checkInOpen;

  const onAccept = async () => {
    setResponding(true);
    try {
      const next = await api.acceptOrder(order.id);
      setOrder({ ...next });
    } catch (e: any) {
      Alert.alert("Couldn't accept", e?.message ?? "Try again in a moment.");
    } finally {
      setResponding(false);
    }
  };

  const onDecline = async () => {
    const confirmMsg = order.isMyPost
      ? "Decline this request? The seat will be freed."
      : "Withdraw your request?";
    Alert.alert("Are you sure?", confirmMsg, [
      { text: "Keep", style: "cancel" },
      {
        text: order.isMyPost ? "Decline" : "Withdraw",
        style: "destructive",
        onPress: async () => {
          setResponding(true);
          try {
            const next = await api.declineOrder(order.id);
            setOrder({ ...next });
          } catch (e: any) {
            Alert.alert("Couldn't update", e?.message ?? "Try again.");
          } finally {
            setResponding(false);
          }
        },
      },
    ]);
  };

  // Location check-in: tap → button turns orange ("locating") while the
  // device matches GPS against the venue in the background → on a match
  // (~100m) it auto-confirms and turns green. Once present, the viewer can
  // manually check others in.
  const onLocationCheckIn = async () => {
    if (terminal || checkInLocked) return;
    if (order.checkIn.self.status !== "pending") return; // already locating/done
    const locating = await api.startLocationCheckIn(order.id);
    setOrder({ ...locating });
    // Simulate the background GPS geofence resolving after a short delay.
    setTimeout(async () => {
      const done = await api.resolveLocationCheckIn(order.id);
      setOrder({ ...done });
    }, 1600);
  };

  // Manual check-in: vouch for a roster member who hasn't arrived. Second
  // confirmation before it commits (native Alert; window.confirm on web
  // since RN's Alert is a no-op there). Only reachable once self is present.
  const onManualCheckIn = (target: User) => {
    const commit = async () => {
      setManualOpen(false);
      const next = await api.manualCheckIn(order.id, target.id);
      setOrder({ ...next });
    };
    const message = `Confirm that ${target.name} is here at the venue with you.`;
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (typeof window !== "undefined" && window.confirm(message)) commit();
      return;
    }
    Alert.alert("Check them in?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: commit },
    ]);
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

  // Hand the agreed spot off to the OS map app for turn-by-turn navigation.
  // web → Google Maps in a new tab; iOS → Apple Maps; Android → a geo: intent
  // (any installed map app handles it). Falls back to Google Maps if the
  // native scheme can't be opened.
  const openInMaps = () => {
    if (!post) return;
    const { lat, lng } = post.location;
    const label = encodeURIComponent(post.locationName ?? order.postTitleSnapshot);
    const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    if (Platform.OS === "web") {
      window.open(gmaps, "_blank");
      return;
    }
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${lat},${lng}&q=${label}`
        : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
    Linking.openURL(url).catch(() => Linking.openURL(gmaps));
  };

  // The human address to show + copy. Falls back to the raw coordinates when
  // the pin was never reverse-geocoded, so "Copy" always yields something a
  // teammate can paste into a map app.
  const addressText =
    post && post.locationName && post.locationName !== "Pinned on map"
      ? post.locationName
      : post
        ? `${post.location.lat.toFixed(5)}, ${post.location.lng.toFixed(5)}`
        : "";

  // Copy the address to the clipboard. Web-first (navigator.clipboard);
  // native falls back to an alert so the text is at least visible to copy.
  const copyAddress = async () => {
    if (!addressText) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(addressText);
      } else {
        Alert.alert("Address", addressText);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      Alert.alert("Address", addressText);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <Header onBack={() => router.back()} title="Order" onChat={onChat} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header card */}
        <View className="mx-4 mt-3 bg-surface rounded-2xl p-4 border border-ink-line">
          {isGroup ? (
            // Group activity — stacked avatars + multi-name so it never reads
            // like a 1-on-1. First name is the host (post author).
            <View className="flex-row items-center">
              <AvatarStack users={groupUsers} size={48} max={4} />
              <View className="flex-1 ml-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-bold text-ink flex-1 mr-2" numberOfLines={1}>
                    {order.postTitleSnapshot}
                  </Text>
                  <StatusPill status={order.status} />
                </View>
                <Text className="text-sm text-ink-muted mt-0.5" numberOfLines={1}>
                  {groupMemberLabel(groupUsers, rosterSize(order))}
                </Text>
                {(() => {
                  const g = groupAverageRating(groupUsers);
                  return g.count > 0 ? (
                    <View className="flex-row items-center mt-1">
                      <Stars value={g.rating} size={12} />
                      <Text className="text-xs text-ink-muted ml-1.5">
                        {g.rating.toFixed(2)} · group avg
                      </Text>
                    </View>
                  ) : null;
                })()}
              </View>
            </View>
          ) : (
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
          )}

          <View className="mt-3 flex-row items-center">
            <Ionicons name="time-outline" size={14} color={colors.inkMuted} />
            <Text className="text-xs text-ink ml-1.5">
              {fmtDateRange(order.startAt, order.endAt)}
            </Text>
          </View>
        </View>

        {/* Where — the agreed check-in spot. A mini-map anchors the pin, the
            street address spells it out, and "Open in Maps" hands off to the
            OS navigator so a joiner can actually get there. Hidden if the post
            couldn't be loaded. */}
        {post ? (
          <View className="mx-4 mt-4 bg-surface rounded-2xl border border-ink-line overflow-hidden">
            <View style={{ height: 150 }} pointerEvents="none">
              <OSMMap
                center={post.location}
                spanDeg={0.01}
                markers={[
                  {
                    id: "spot",
                    coordinate: post.location,
                    color: colors.brand,
                  },
                ]}
              />
            </View>
            <View className="p-4 items-center">
              {/* Centered address — wraps to any length so a long street line
                  never overflows the card. */}
              <View className="flex-row items-start justify-center">
                <Ionicons name="location" size={16} color={colors.brand} style={{ marginTop: 1 }} />
                <Text className="text-sm text-ink ml-1.5 flex-shrink text-center">
                  {addressText}
                </Text>
              </View>
              {/* Copy button — lets a teammate grab the address to paste
                  elsewhere. Flips to "Copied" briefly on tap. */}
              <Pressable
                onPress={copyAddress}
                className="flex-row items-center justify-center mt-2 py-1"
                hitSlop={8}
              >
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={14}
                  color={colors.brand}
                />
                <Text className="text-xs font-semibold ml-1" style={{ color: colors.brand }}>
                  {copied ? "Copied" : "Copy address"}
                </Text>
              </Pressable>
              <Pressable
                onPress={openInMaps}
                className="flex-row items-center justify-center mt-3 py-2.5 rounded-full self-stretch"
                style={{ backgroundColor: colors.brand }}
              >
                <Ionicons name="navigate" size={16} color="white" />
                <Text className="text-sm font-bold text-white ml-1.5">Open in Maps</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Pending request — the order is waiting on the post author to
            accept. Host POV gets Accept / Decline; taker POV waits (with a
            demo "simulate accept" so the flow is exercisable single-device). */}
        {isPending ? (
          <View
            className="mx-4 mt-5 p-4 rounded-2xl"
            style={{ backgroundColor: "rgba(255,203,31,0.14)" }}
          >
            <View className="flex-row items-center mb-1">
              <Ionicons name="hourglass-outline" size={16} color="#B98800" />
              <Text className="text-base font-bold text-ink ml-1.5">
                {order.isMyPost
                  ? `${order.counterpart.name} wants to join`
                  : "Request sent"}
              </Text>
            </View>
            <Text className="text-xs text-ink-muted leading-4 mb-3">
              {order.isMyPost
                ? "Accept to confirm the booking — it'll move to Upcoming and check-in opens 15 minutes before the start time."
                : `Waiting for ${order.counterpart.name} to accept your request. We'll notify you the moment they do.`}
            </Text>
            <View className="flex-row" style={{ gap: 10 }}>
              {/* Host decides (Accept/Decline). The taker can only withdraw —
                  acceptance is the author's action, delivered for real via the
                  backend, so no single-device "simulate" shortcut here. */}
              {order.isMyPost ? (
                <Button
                  label={responding ? "…" : "Accept request"}
                  variant="primary"
                  className="flex-1"
                  disabled={responding}
                  onPress={onAccept}
                />
              ) : null}
              <Button
                label={order.isMyPost ? "Decline" : "Withdraw"}
                variant="secondary"
                className="flex-1"
                disabled={responding}
                onPress={onDecline}
              />
            </View>
          </View>
        ) : null}

        {/* Roster check-in — hidden until the request is accepted. */}
        {!isPending ? (
        <View className="mx-4 mt-5">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-base font-bold text-ink">Check-in</Text>
            <Text className="text-xs text-ink-muted">
              {presentCount(order)} / {rosterSize(order)} checked in
            </Text>
          </View>
          <Text className="text-xs text-ink-muted leading-4 mb-3">
            Tap Location to check yourself in — your phone confirms you're at the venue in the
            background. Once you're in, Manual unlocks so you can check in anyone who's arrived but
            hasn't tapped yet.
          </Text>

          {/* Check-in opens 15 min before start. Until then both methods are
              locked and we show a live countdown. */}
          {checkInLocked && !terminal ? (
            <View
              className="flex-row items-center mb-3 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: "rgba(76,158,235,0.12)" }}
            >
              <Ionicons name="lock-closed-outline" size={16} color={colors.accentBlue} />
              <Text className="text-xs text-ink ml-2 flex-1">
                Check-in opens 15 min before start —{" "}
                <Text className="font-bold" style={{ color: colors.accentBlue }}>
                  in {formatCountdown(checkInWait)}
                </Text>
              </Text>
            </View>
          ) : null}

          <View className="flex-row" style={{ gap: 8 }}>
            <CheckInCard
              method="location"
              title="Location"
              subtitle="Confirms you're at the venue in the background"
              icon="location-outline"
              status={selfStatus}
              labels={{
                pending: "TAP TO CHECK IN",
                locating: "LOCATING…",
                confirmed: "CHECKED IN",
              }}
              disabled={terminal || checkInLocked || selfStatus === "locating"}
              onPress={onLocationCheckIn}
            />
            <CheckInCard
              method="manual"
              title="Manual"
              subtitle={
                selfPresent
                  ? "Check in someone who's here but hasn't tapped"
                  : "Unlocks after your own check-in"
              }
              icon="people-outline"
              status="pending"
              labels={{ pending: selfPresent ? "CHECK OTHERS IN" : "LOCKED" }}
              disabled={terminal || checkInLocked || !selfPresent}
              onPress={() => setManualOpen(true)}
            />
          </View>

          {/* Roster presence. For a group we list every member; for 1-on-1
              we show a single line about the counterpart. The absent side
              can't fake their presence from this screen. */}
          {isGroup ? (
            <View className="mt-3 rounded-xl overflow-hidden" style={{ borderWidth: 1, borderColor: colors.line }}>
              {otherMembers.map((m, i) => {
                const present = isPartyPresent(m.checkIn);
                const via = m.checkIn.method === "manual" ? "checked in by a teammate" : "checked in";
                return (
                  <View
                    key={m.user.id}
                    className="flex-row items-center px-3 py-2"
                    style={{
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.line,
                      backgroundColor: present ? "rgba(62,194,143,0.08)" : colors.surface,
                    }}
                  >
                    <Avatar uri={m.user.avatarUrl} size={26} />
                    <Text className="text-sm text-ink ml-2 flex-1" numberOfLines={1}>
                      {m.user.name}
                    </Text>
                    <Ionicons
                      name={present ? "checkmark-circle" : "ellipse-outline"}
                      size={16}
                      color={present ? "#138C5E" : colors.inkMuted}
                    />
                    <Text
                      className="text-[11px] ml-1"
                      style={{ color: present ? "#138C5E" : colors.inkMuted }}
                    >
                      {present ? via : "not yet"}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
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
                  throttles to ≤1 ping / 5 min. */}
              {!terminal && selfPresent && !counterpartPresent ? (
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
          )}

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
                {order.counterpart.name} is waiting for you. Tap Location above when you arrive.
              </Text>
            </View>
          ) : null}

          {selfPresent && !terminal ? (
            <View className="flex-row items-center mt-2 bg-brand/10 rounded-xl px-3 py-2">
              <Ionicons name="shield-checkmark" size={16} color={colors.accentGreen} />
              <Text className="text-xs text-ink ml-2 flex-1">
                You're checked in.{" "}
                {everyonePresent(order)
                  ? "Everyone's here — have a good session!"
                  : "Tap Manual to check in anyone who's arrived."}
              </Text>
            </View>
          ) : null}
        </View>
        ) : null}

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
                  Filed {new Date(order.disputeOpenedAt).toLocaleString("en-US")}. Fee and rating impact
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
          {!terminal && !isPending && !pastEnd ? (
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

      {/* Manual check-in picker — floating list of roster members who haven't
          checked in yet. Only reachable once the viewer is present. Tapping a
          name asks for a second confirmation before vouching for them. */}
      <Modal
        visible={manualOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setManualOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
          onPress={() => setManualOpen(false)}
        >
          <Pressable
            className="bg-surface rounded-2xl mx-8 p-5"
            style={{ width: "86%" }}
            onPress={() => {}}
          >
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-base font-bold text-ink">Check someone in</Text>
              <Pressable onPress={() => setManualOpen(false)}>
                <Ionicons name="close" size={20} color={colors.inkMuted} />
              </Pressable>
            </View>
            <Text className="text-xs text-ink-muted leading-4 mb-3">
              Tap a name to confirm they're here with you. Only do this for people you can
              actually see at the venue.
            </Text>
            {otherMembers.filter((m) => !isPartyPresent(m.checkIn)).length === 0 ? (
              <Text className="text-sm text-ink-muted text-center py-4">
                Everyone's already checked in.
              </Text>
            ) : (
              otherMembers
                .filter((m) => !isPartyPresent(m.checkIn))
                .map((m) => (
                  <Pressable
                    key={m.user.id}
                    className="flex-row items-center py-2.5"
                    onPress={() => onManualCheckIn(m.user)}
                  >
                    <Avatar uri={m.user.avatarUrl} size={34} />
                    <Text className="text-sm font-semibold text-ink ml-3 flex-1">
                      {m.user.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
                  </Pressable>
                ))
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Header({
  onBack,
  title,
  onChat,
}: {
  onBack: () => void;
  title: string;
  onChat?: () => void;
}) {
  return (
    <View className="px-3 pt-2 pb-2 flex-row items-center border-b border-ink-line">
      <Pressable onPress={onBack} className="p-1 mr-1">
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </Pressable>
      <Text className="text-lg font-bold text-ink">{title}</Text>
      {onChat ? (
        <Pressable
          onPress={onChat}
          hitSlop={8}
          className="ml-auto flex-row items-center rounded-full px-3 py-1.5"
          style={{ backgroundColor: colors.brandSoft }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brand} />
          <Text className="text-sm font-semibold ml-1.5" style={{ color: colors.brand }}>
            Chat
          </Text>
        </Pressable>
      ) : null}
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
