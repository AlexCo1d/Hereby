import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Swipeable } from "react-native-gesture-handler";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
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

export default function ChatListScreen() {
  const [threads, setThreads] = useState<ChatThread[]>([]);

  // Re-fetch on every focus so a thread that just unlocked (= user placed an
  // order in this session) shows up without a manual refresh.
  const refresh = useCallback(() => {
    api.listThreads().then(setThreads);
  }, []);
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
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="px-5 pt-2 pb-3 border-b border-ink-line">
        <Text className="text-2xl font-bold text-ink">Chat</Text>
      </View>
      <ScrollView className="flex-1">
        {threads.length === 0 ? (
          // Empty state — explains the gate so the user isn't confused why
          // their old DMs aren't here. Matches spec 0.9 wording.
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
    </SafeAreaView>
  );
}

/**
 * One swipeable conversation row.
 *   • Swipe right → "Read" action (clears the unread badge).
 *   • Swipe left  → "Delete" action (soft-hides the thread).
 * Wrapped in react-native-gesture-handler's <Swipeable>; needs the
 * GestureHandlerRootView mounted at the app root (see app/_layout.tsx).
 */
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

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={() =>
        thread.unread > 0 ? (
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
        <Avatar uri={thread.counterpart.avatarUrl} size={48} />
        <View className="flex-1 ml-3">
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold text-ink">{thread.counterpart.name}</Text>
            <Text className="text-xs text-ink-muted">{timeAgo(thread.lastMessageAt)}</Text>
          </View>
          <View className="flex-row justify-between items-center mt-0.5">
            <Text className="text-sm text-ink-muted flex-1" numberOfLines={1}>
              {thread.lastMessage}
            </Text>
            {thread.unread > 0 ? (
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
