// The "Notification" sub-tab of the Message screen. Currently surfaces
// public-note replies: "<name> replied to your note". Tapping a row marks it
// read and jumps to that post's public-note thread, highlighting the reply.
//   • Swipe left → "Delete" (removes the notification).
//   • Header "Clear read" → one-tap removal of every already-read row.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../common/Avatar";
import { api } from "../../services/api";
import type { Notification } from "../../services/types";
import { colors } from "../../constants/theme";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function NotificationList({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);

  const refresh = useCallback(() => {
    api.listNotifications().then(setItems);
    onChanged?.();
  }, [onChanged]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onOpen = useCallback(
    async (n: Notification) => {
      // Mark read first so the dot clears immediately, then jump to the post's
      // public note, highlighting the reply we were notified about.
      if (!n.read) {
        await api.markNotificationRead(n.id);
        refresh();
      }
      // Order requests jump to the order detail (accept/decline); note replies
      // jump to the post's public-note thread, highlighting the reply.
      if (n.kind === "order_request" && n.orderId) {
        router.push(`/order/${n.orderId}` as any);
      } else {
        router.push(`/provider/${n.postId}?note=${n.noteId}` as any);
      }
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (id: string) => {
      await api.deleteNotification(id);
      refresh();
    },
    [refresh],
  );

  const onClearRead = useCallback(async () => {
    await api.clearReadNotifications();
    refresh();
  }, [refresh]);

  if (items.length === 0) {
    return (
      <View className="items-center px-8 pt-16">
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.surfaceSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="notifications-outline" size={28} color={colors.inkMuted} />
        </View>
        <Text className="text-base font-bold text-ink mt-4">No notifications</Text>
        <Text className="text-xs text-ink-muted mt-1.5 text-center leading-4">
          When someone replies to a note you left on a post, it shows up here.
        </Text>
      </View>
    );
  }

  const hasRead = items.some((n) => n.read);

  return (
    <ScrollView className="flex-1">
      {/* Header affordance — only meaningful once something's been read. */}
      {hasRead ? (
        <View className="flex-row justify-end px-5 py-2 border-b border-ink-line">
          <Pressable onPress={onClearRead} hitSlop={8} className="flex-row items-center">
            <Ionicons name="checkmark-done-outline" size={15} color={colors.brand} />
            <Text className="text-xs font-semibold ml-1" style={{ color: colors.brand }}>
              Clear read
            </Text>
          </Pressable>
        </View>
      ) : null}
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          n={n}
          onPress={() => onOpen(n)}
          onDelete={() => onDelete(n.id)}
        />
      ))}
    </ScrollView>
  );
}

function NotificationRow({
  n,
  onPress,
  onDelete,
}: {
  n: Notification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const unread = !n.read;
  const isOrder = n.kind === "order_request";
  const isReply = n.kind === "public_note_reply";
  // Row copy per kind: a take-request, a reply to your note, or a fresh
  // top-level note left on your post.
  const line = isOrder
    ? "wants to join your post"
    : isReply
      ? "replied to your note"
      : "left a note on your post";
  // Corner glyph mirrors the kind: person-add / reply arrow / chat bubble.
  const badgeIcon = isOrder ? "person-add" : isReply ? "arrow-undo" : "chatbubble-ellipses";
  const swipeRef = useRef<Swipeable>(null);
  const close = () => swipeRef.current?.close();
  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          onPress={() => {
            onDelete();
            close();
          }}
          style={{
            backgroundColor: "#E5484D",
            justifyContent: "center",
            alignItems: "center",
            width: 88,
          }}
        >
          <Ionicons name="trash-outline" size={20} color="white" />
          <Text style={{ color: "white", fontSize: 11, fontWeight: "700", marginTop: 2 }}>
            Delete
          </Text>
        </Pressable>
      )}
    >
      <Pressable
        onPress={onPress}
        className="flex-row px-5 py-3 border-b border-ink-line items-center bg-surface"
      >
        {/* Leading unread dot. */}
        <View style={{ width: 10, alignItems: "center", marginRight: 4 }}>
          {unread ? (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }} />
          ) : null}
        </View>
        <View style={{ position: "relative" }}>
          <Avatar uri={n.actor.avatarUrl ?? ""} size={44} />
          {/* Small glyph badge so the row's kind reads at a glance:
              a reply arrow for note replies, a person-add for take-requests. */}
          <View
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1.5,
              borderColor: colors.surface,
            }}
          >
            <Ionicons name={badgeIcon} size={9} color="white" />
          </View>
        </View>
        <View className="flex-1 ml-3">
          <View className="flex-row justify-between items-center">
            <Text
              className={`text-sm ${unread ? "font-bold text-ink" : "font-semibold text-ink"} flex-1`}
              numberOfLines={1}
            >
              <Text className="font-bold">{n.actor.name}</Text>{" "}
              {line}
            </Text>
            <Text className="text-xs text-ink-muted ml-2">{timeAgo(n.createdAt)}</Text>
          </View>
          <Text className="text-xs text-ink-muted mt-0.5" numberOfLines={1}>
            {n.postTitle ? `${n.postTitle} · ` : ""}
            {n.excerpt}
          </Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}
