// Public note — a per-post OPEN Q&A that replaces private DMs on Discover.
// Anyone may leave a message (rendered LEFT with a colour-ringed avatar);
// the post author's answers render RIGHT. Saved with the post (api.addPublicNote).
//
// Reply: tap the "Reply" button under someone else's note (or long-press it) to
// quote-reply them (WeChat/Feishu style). The quoted author gets a "you were
// replied to" notification, and the reply bubble shows the quoted excerpt above
// its text. Opening from a notification passes `highlightNoteId` so we scroll to
// + flash that reply.
//
// Responsive: the card is clamped to a fraction of the current window so it
// never overflows the screen — width min(92%, 460), height min(80%, ...).
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";

import { api } from "../../services/api";
import type { PublicNote, PublicNoteReplyTo, User } from "../../services/types";
import { avatarRingColor } from "../../services/types";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string;
  /** Author of the post — their notes render on the right as "answers". */
  authorId: string;
  /** Shown in the sheet header (usually the post title). */
  title?: string;
  /** When opened from a notification: scroll to + flash this note. */
  highlightNoteId?: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function PublicNoteSheet({
  visible,
  onClose,
  postId,
  authorId,
  title,
  highlightNoteId,
}: Props) {
  const { width, height } = useWindowDimensions();
  const cardW = Math.min(width * 0.92, 460);
  const cardH = Math.min(height * 0.8, 640);

  // The signed-in viewer — so a note we post carries the user's real name and
  // the avatar they set in onboarding, not a static mock identity.
  const authUser = useAuth((s) => s.user);
  const meId = authUser?.id;

  const [notes, setNotes] = useState<PublicNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // The note we're quote-replying to (null = plain note). Set via long-press.
  const [replyTarget, setReplyTarget] = useState<PublicNote | null>(null);
  // Note id currently flashing (from a notification jump); clears after a beat.
  const [flashId, setFlashId] = useState<string | undefined>(undefined);
  const listRef = useRef<FlatList<PublicNote>>(null);
  const inputRef = useRef<TextInput>(null);
  // Guards the one-shot "scroll to highlighted note" after the list lays out.
  const didJumpRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await api.listPublicNotes(postId));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (visible) {
      didJumpRef.current = false;
      setReplyTarget(null);
      load();
    }
  }, [visible, load]);

  // Kick off the flash once the highlighted note exists in the loaded list.
  useEffect(() => {
    if (!visible || !highlightNoteId || notes.length === 0) return;
    if (!notes.some((n) => n.id === highlightNoteId)) return;
    setFlashId(highlightNoteId);
    const t = setTimeout(() => setFlashId(undefined), 2200);
    return () => clearTimeout(t);
  }, [visible, highlightNoteId, notes]);

  const scrollToHighlight = useCallback(() => {
    if (didJumpRef.current || !highlightNoteId) return;
    const idx = notes.findIndex((n) => n.id === highlightNoteId);
    if (idx < 0) return;
    didJumpRef.current = true;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
  }, [highlightNoteId, notes]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      // Map the auth-store viewer into the public User shape the note carries.
      const me: User | undefined = authUser
        ? {
            id: authUser.id,
            name: authUser.name,
            avatarUrl: authUser.avatarUrl,
            rating: authUser.ratingReceived,
            ratingCount: authUser.ratingReceivedCount,
            interests: authUser.interestIds,
            eduVerified: authUser.mode === "verified",
          }
        : undefined;
      // Build the quote payload from the long-pressed target (if any).
      const replyTo: PublicNoteReplyTo | undefined = replyTarget
        ? {
            noteId: replyTarget.id,
            authorId: replyTarget.author.id,
            authorName: replyTarget.author.name,
            excerpt: replyTarget.text.slice(0, 80),
          }
        : undefined;
      const note = await api.addPublicNote(postId, text, me, replyTo);
      setNotes((prev) => [...prev, note]);
      setDraft("");
      setReplyTarget(null);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } finally {
      setSending(false);
    }
  };

  const startReply = (item: PublicNote) => {
    // Can't reply to your own note; that's just a self-quote with no recipient.
    if (item.author.id === meId) return;
    setReplyTarget(item);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const renderItem = ({ item }: { item: PublicNote }) => {
    const isAuthor = item.author.id === authorId;
    const ring = avatarRingColor(item.author.id);
    const flashing = item.id === flashId;
    const avatar = (
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          borderWidth: 2,
          borderColor: isAuthor ? colors.brand : ring,
          overflow: "hidden",
          backgroundColor: colors.surfaceSoft,
        }}
      >
        <Image
          source={{ uri: item.author.avatarUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>
    );
    const bubble = (
      <View
        style={{
          maxWidth: cardW * 0.66,
          backgroundColor: isAuthor ? colors.brand : colors.surfaceSoft,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 8,
          // Flash outline when jumped-to from a notification.
          borderWidth: flashing ? 2 : 0,
          borderColor: flashing ? colors.accentBlue : "transparent",
        }}
      >
        <Text
          style={{ fontSize: 11, fontWeight: "700", marginBottom: 2, color: isAuthor ? "#FFE7DC" : colors.inkMuted }}
        >
          {item.author.name}
          {isAuthor ? " · Host" : ""}
        </Text>
        {/* Quoted reply header — the note this one is answering. */}
        {item.replyTo ? (
          <View
            style={{
              borderLeftWidth: 2,
              borderLeftColor: isAuthor ? "#FFD9C8" : colors.line,
              paddingLeft: 6,
              marginBottom: 4,
              opacity: 0.9,
            }}
          >
            <Text
              style={{ fontSize: 10, fontWeight: "700", color: isAuthor ? "#FFE7DC" : colors.inkMuted }}
              numberOfLines={1}
            >
              {item.replyTo.authorName}
            </Text>
            <Text
              style={{ fontSize: 11, color: isAuthor ? "#FFE7DC" : colors.inkMuted }}
              numberOfLines={2}
            >
              {item.replyTo.excerpt}
            </Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 13, lineHeight: 18, color: isAuthor ? "#FFFFFF" : colors.ink }}>
          {item.text}
        </Text>
        <Text
          style={{ fontSize: 9, marginTop: 3, color: isAuthor ? "#FFD9C8" : colors.inkMuted, alignSelf: "flex-end" }}
        >
          {fmtTime(item.sentAt)}
        </Text>
      </View>
    );

    // A visible reply affordance under every note that isn't the viewer's own.
    // Long-press still works, but on web (mouse) there's no long-press, so this
    // explicit "Reply" is how people quote-reply a specific person.
    const canReply = item.author.id !== meId;
    const bubbleCol = (
      <View style={{ maxWidth: cardW * 0.66 }}>
        {bubble}
        {canReply ? (
          <Pressable
            onPress={() => startReply(item)}
            hitSlop={6}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 3,
              alignSelf: isAuthor ? "flex-end" : "flex-start",
            }}
          >
            <Ionicons name="arrow-undo-outline" size={12} color={colors.inkMuted} />
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.inkMuted, marginLeft: 3 }}>
              Reply
            </Text>
          </Pressable>
        ) : null}
      </View>
    );

    return (
      <Pressable
        onLongPress={() => startReply(item)}
        delayLongPress={300}
        style={{
          flexDirection: "row",
          justifyContent: isAuthor ? "flex-end" : "flex-start",
          alignItems: "flex-end",
          marginBottom: 10,
          gap: 6,
        }}
      >
        {isAuthor ? (
          <>
            {bubbleCol}
            {avatar}
          </>
        ) : (
          <>
            {avatar}
            {bubbleCol}
          </>
        )}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.4)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Stop propagation so taps inside the card don't dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            width: cardW,
            height: cardH,
            backgroundColor: colors.surface,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.ink }}>
                  Public note
                </Text>
                <Text style={{ fontSize: 11, color: colors.inkMuted, marginTop: 1 }} numberOfLines={1}>
                  {title ? `${title} · ` : ""}Tap Reply to answer someone
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.inkMuted} />
              </Pressable>
            </View>

            {/* Q&A list */}
            {loading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={notes}
                keyExtractor={(n) => n.id}
                renderItem={renderItem}
                contentContainerStyle={{ padding: 14, paddingBottom: 8, flexGrow: 1 }}
                // Virtualize so a very long Q&A doesn't render every bubble.
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={7}
                removeClippedSubviews
                onContentSizeChange={() => {
                  if (notes.length === 0) return;
                  // Prefer jumping to the highlighted note; otherwise stick to end.
                  if (highlightNoteId && !didJumpRef.current) scrollToHighlight();
                  else listRef.current?.scrollToEnd({ animated: false });
                }}
                onScrollToIndexFailed={({ averageItemLength, index }) => {
                  // Variable-height bubbles can miss on first pass — retry via offset.
                  listRef.current?.scrollToOffset({
                    offset: averageItemLength * index,
                    animated: true,
                  });
                }}
                ListEmptyComponent={
                  <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
                    <Ionicons name="chatbubbles-outline" size={30} color={colors.line} />
                    <Text style={{ color: colors.inkMuted, fontSize: 12, marginTop: 8 }}>
                      No notes yet. Be the first to ask.
                    </Text>
                  </View>
                }
              />
            )}

            {/* Reply preview bar — the note we're quoting, with a cancel X. */}
            {replyTarget ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  backgroundColor: colors.surfaceSoft,
                  gap: 8,
                }}
              >
                <View
                  style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: colors.brand }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.ink }}>
                    Replying to {replyTarget.author.name}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.inkMuted }} numberOfLines={1}>
                    {replyTarget.text}
                  </Text>
                </View>
                <Pressable onPress={() => setReplyTarget(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
                </Pressable>
              </View>
            ) : null}

            {/* Composer — anyone may leave a message. */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                gap: 8,
              }}
            >
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTarget ? `Reply to ${replyTarget.author.name}…` : "Leave a public note…"}
                placeholderTextColor={colors.inkMuted}
                multiline
                style={{
                  flex: 1,
                  maxHeight: 90,
                  minHeight: 38,
                  backgroundColor: colors.surfaceSoft,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingTop: 9,
                  paddingBottom: 9,
                  fontSize: 14,
                  color: colors.ink,
                }}
              />
              <Pressable
                onPress={onSend}
                disabled={!draft.trim() || sending}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: draft.trim() ? colors.brand : colors.line,
                }}
              >
                <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
