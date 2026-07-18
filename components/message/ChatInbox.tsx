// The "Chat" sub-tab of the Message screen: the swipeable conversation inbox.
//   • Swipe right → "Read" (clears the unread badge).
//   • Swipe left  → "Delete" (soft-hides the thread).
// Extracted from the old (tabs)/chat.tsx so the Message screen can host it
// alongside the Notification list.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../common/Avatar";
import { api } from "../../services/api";
import type { ChatThread } from "../../services/types";
import { colors } from "../../constants/theme";

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function ChatInbox({ onChanged }: { onChanged?: () => void }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  const refresh = useCallback(() => {
    api.listThreads().then(setThreads);
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

  const onMarkRead = useCallback(
    async (threadId: string) => {
      await api.markThreadRead(threadId);
      refresh();
    },
    [refresh],
  );
  const onDelete = useCallback(
    async (threadId: string) => {
      await api.deleteThread(threadId);
      refresh();
    },
    [refresh],
  );

  return (
    <ScrollView className="flex-1">
      {threads.length === 0 ? (
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
            <Ionicons name="chatbubbles-outline" size={28} color={colors.inkMuted} />
          </View>
          <Text className="text-base font-bold text-ink mt-4">No chats yet</Text>
          <Text className="text-xs text-ink-muted mt-1.5 text-center leading-4">
            Chat unlocks once you place an order or someone takes yours. This keeps the inbox
            free of cold messages.
          </Text>
        </View>
      ) : null}
      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          onPress={() => router.push(`/chat/${t.id}` as any)}
          onMarkRead={() => onMarkRead(t.id)}
          onDelete={() => onDelete(t.id)}
        />
      ))}
    </ScrollView>
  );
}

function ThreadRow({
  thread,
  onPress,
  onMarkRead,
  onDelete,
}: {
  thread: ChatThread;
  onPress: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const close = () => swipeRef.current?.close();
  const unread = thread.unread > 0;

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={() =>
        unread ? (
          <Pressable
            onPress={() => {
              onMarkRead();
              close();
            }}
            style={{
              backgroundColor: colors.accentBlue,
              justifyContent: "center",
              alignItems: "center",
              width: 88,
            }}
          >
            <Ionicons name="checkmark-done" size={20} color="white" />
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700", marginTop: 2 }}>
              Read
            </Text>
          </Pressable>
        ) : null
      }
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
        {/* Leading unread dot — the per-item orange marker. Occupies fixed
            width whether or not it's shown so avatars stay aligned. */}
        <View style={{ width: 10, alignItems: "center", marginRight: 4 }}>
          {unread ? (
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }}
            />
          ) : null}
        </View>
        {thread.isGroup ? (
          <View style={{ width: 48, height: 48 }}>
            {(thread.members ?? []).slice(0, 3).map((u, i) => (
              <View
                key={u.id}
                style={{
                  position: "absolute",
                  left: i === 0 ? 0 : undefined,
                  right: i === 2 ? 0 : undefined,
                  top: i === 0 ? 0 : i === 1 ? 18 : undefined,
                  bottom: i === 2 ? 0 : undefined,
                  borderWidth: 1.5,
                  borderColor: colors.surface,
                  borderRadius: 16,
                }}
              >
                <Avatar uri={u.avatarUrl} size={28} />
              </View>
            ))}
          </View>
        ) : (
          <Avatar uri={thread.counterpart.avatarUrl} size={48} />
        )}
        <View className="flex-1 ml-3">
          <View className="flex-row justify-between items-center">
            <Text
              className={`text-base ${unread ? "font-bold text-ink" : "font-semibold text-ink"}`}
              numberOfLines={1}
            >
              {thread.isGroup ? (thread.title ?? "Group chat") : thread.counterpart.name}
            </Text>
            <Text className="text-xs text-ink-muted">{timeAgo(thread.lastMessageAt)}</Text>
          </View>
          <View className="flex-row justify-between items-center mt-0.5">
            <Text className="text-sm text-ink-muted flex-1" numberOfLines={1}>
              {thread.lastMessage}
            </Text>
            {unread ? (
              <View
                style={{
                  backgroundColor: colors.brand,
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  marginLeft: 8,
                }}
              >
                <Text className="text-white text-[10px] font-bold">{thread.unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Swipeable>
  );
}
