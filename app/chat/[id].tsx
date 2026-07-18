import { useEffect, useState } from "react";
import { View, Text, ScrollView, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";

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
  // Sender lookup for group chats — resolves an incoming message's author to
  // their avatar/name. Empty for 1-on-1 threads.
  const senderById = new Map((thread?.members ?? []).map((u) => [u.id, u]));

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

  // Shared optimistic-send path for both text and image messages. Emoji need no
  // special handling — RN <Text> renders the system emoji font directly.
  const pushMessage = async (opts: { text?: string; imageUrl?: string }) => {
    const text = opts.text ?? "";
    const optimistic: Message = {
      id: `local_${Date.now()}`,
      threadId: id,
      fromUserId: myId,
      text,
      imageUrl: opts.imageUrl,
      sentAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    try {
      const saved = await api.sendMessage(id, text, opts.imageUrl);
      // Swap the optimistic row for the persisted one (real id / uploaded url).
      setMessages((m) => m.map((msg) => (msg.id === optimistic.id ? saved : msg)));
    } catch {
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      if (opts.text) setInput(opts.text);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await pushMessage({ text });
  };

  const pickAndSendImage = async () => {
    // Ask once; on web/Android the picker opens without a blocking dialog.
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;
    const localUri = result.assets[0].uri;
    // Upload to storage (mock echoes the uri), then send with the returned url.
    const url = await api.uploadChatImage(localUri);
    await pushMessage({ imageUrl: url });
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
          thread.isGroup ? (
            <>
              {/* Stacked member avatars for the group. */}
              <View className="flex-row ml-1" style={{ width: 52, height: 36 }}>
                {(thread.members ?? []).slice(0, 3).map((u, i) => (
                  <View
                    key={u.id}
                    style={{
                      position: "absolute",
                      left: i * 14,
                      borderWidth: 1.5,
                      borderColor: colors.surface,
                      borderRadius: 18,
                    }}
                  >
                    <Avatar uri={u.avatarUrl} size={32} />
                  </View>
                ))}
              </View>
              <View className="ml-2 flex-1">
                <Text className="text-base font-bold text-ink" numberOfLines={1}>
                  {thread.title ?? "Group chat"}
                </Text>
                <Text className="text-[11px] text-ink-muted">
                  {(thread.members?.length ?? 0) + 1} members
                </Text>
              </View>
            </>
          ) : (
            <>
              <Avatar uri={thread.counterpart.avatarUrl} size={36} />
              <Text className="text-base font-bold text-ink ml-2">{thread.counterpart.name}</Text>
            </>
          )
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView className="flex-1 px-4 py-3">
          {messages.map((m) => {
            const mine = m.fromUserId === myId;
            const sender = thread?.isGroup && !mine ? senderById.get(m.fromUserId) : undefined;
            return (
              <View
                key={m.id}
                className={mine ? "self-end" : "self-start"}
                style={{ maxWidth: "80%", marginBottom: 8, flexDirection: "row" }}
              >
                {sender ? (
                  <View style={{ marginRight: 6, alignSelf: "flex-end" }}>
                    <Avatar uri={sender.avatarUrl} size={24} />
                  </View>
                ) : null}
                <View style={{ flexShrink: 1 }}>
                  {sender ? (
                    <Text className="text-[11px] text-ink-muted mb-0.5 ml-1">{sender.name}</Text>
                  ) : null}
                  {m.imageUrl ? (
                    // Image message — rounded thumbnail, sized to the bubble
                    // column. Any caption text renders below it.
                    <View className={mine ? "self-end" : "self-start"}>
                      <Image
                        source={{ uri: m.imageUrl }}
                        style={{ width: 200, height: 200, borderRadius: 14 }}
                        contentFit="cover"
                      />
                      {m.text ? (
                        <View
                          className={`px-3 py-2 rounded-2xl mt-1 ${
                            mine ? "bg-brand self-end" : "bg-surface-soft self-start"
                          }`}
                        >
                          <Text className={mine ? "text-white" : "text-ink"}>{m.text}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : (
                    <View
                      className={`px-3 py-2 rounded-2xl ${
                        mine ? "bg-brand self-end" : "bg-surface-soft self-start"
                      }`}
                    >
                      <Text className={mine ? "text-white" : "text-ink"}>{m.text}</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <View
          className="flex-row items-center px-3 pt-2 border-t border-ink-line"
          style={{ paddingBottom: bottomPad }}
        >
          <Pressable
            onPress={pickAndSendImage}
            className="mr-2 w-11 h-11 rounded-full items-center justify-center"
            hitSlop={4}
          >
            <Ionicons name="image-outline" size={24} color={colors.inkMuted} />
          </Pressable>
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
