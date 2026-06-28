import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { api } from "../../services/api";
import type { ChatThread, Message } from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const myId = useAuth((s) => s.user?.id ?? "");
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  // null = still loading; "blocked" = no access (gate); ChatThread = OK.
  const [accessState, setAccessState] = useState<"loading" | "blocked" | "ok">("loading");
  const insets = useSafeAreaInsets();
  // Keep the input bar above the iOS home indicator / Android nav bar.
  const bottomPad = Math.max(insets.bottom, 12);

  // Spec 0.9: fetch through `getThread`, which returns null when the viewer
  // has no order linking them to this counterpart. Render a polite
  // explanation rather than silently failing.
  useEffect(() => {
    (async () => {
      const t = await api.getThread(id);
      if (!t) {
        setAccessState("blocked");
        return;
      }
      setThread(t);
      setMessages(await api.listMessages(id));
      setAccessState("ok");
      // Opening the thread = reading it. Clear the unread badge so the bubble
      // is gone when the user swipes back to the list.
      if (t.unread > 0) api.markThreadRead(id).catch(() => {});
    })();
  }, [id]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    // Optimistic append, then persist. On failure, surface and roll back.
    const optimistic: Message = {
      id: `local_${Date.now()}`,
      threadId: id,
      fromUserId: myId,
      text,
      sentAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      await api.sendMessage(id, text);
    } catch {
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      setInput(text);
    }
  };

  if (accessState === "blocked") {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
        <View className="px-3 pt-2 pb-2 flex-row items-center border-b border-ink-line">
          <Pressable onPress={() => router.back()} className="p-1">
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text className="text-base font-bold text-ink ml-2">Chat</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
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
            <Ionicons name="lock-closed-outline" size={28} color={colors.inkMuted} />
          </View>
          <Text className="text-base font-bold text-ink mt-4">Chat locked</Text>
          <Text className="text-xs text-ink-muted mt-1.5 text-center leading-4">
            You don't have an order with this person, so the chat isn't unlocked. Place an order
            (or have them take yours) to start the conversation.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="px-3 pt-2 pb-2 flex-row items-center border-b border-ink-line">
        <Pressable onPress={() => router.back()} className="p-1">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        {thread ? (
          <>
            <Avatar uri={thread.counterpart.avatarUrl} size={36} />
            <Text className="text-base font-bold text-ink ml-2">{thread.counterpart.name}</Text>
          </>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="flex-1 px-4 py-3">
          {messages.map((m) => {
            const mine = m.fromUserId === myId;
            return (
              <View
                key={m.id}
                className={`max-w-[80%] mb-2 px-3 py-2 rounded-2xl ${
                  mine ? "self-end bg-brand" : "self-start bg-surface-soft"
                }`}
              >
                <Text className={mine ? "text-white" : "text-ink"}>{m.text}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View
          className="flex-row items-center px-3 pt-2 border-t border-ink-line"
          style={{ paddingBottom: bottomPad }}
        >
          <View className="flex-1 bg-surface-soft rounded-full px-4 h-11 justify-center">
            <TextInput
              placeholder="Message"
              placeholderTextColor={colors.inkMuted}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              className="text-ink"
            />
          </View>
          <Pressable
            onPress={send}
            className="ml-2 w-11 h-11 rounded-full bg-brand items-center justify-center"
          >
            <Ionicons name="send" size={18} color="white" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
