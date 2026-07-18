// The "Message" tab (nav bar). Hosts two sub-tabs in a segmented header:
//   • Notification — replies to your public notes (NotificationList)
//   • Chat         — the swipeable conversation inbox (ChatInbox)
// Each sub-tab label carries an orange unread dot driven by the shared unread
// store; the nav-bar Message icon uses the same store (see (tabs)/_layout.tsx).
import { useCallback, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import { ChatInbox } from "../../components/message/ChatInbox";
import { NotificationList } from "../../components/message/NotificationList";
import { useUnread } from "../../stores/unread";
import { colors } from "../../constants/theme";

type SubTab = "notification" | "chat";

export default function MessageScreen() {
  const [tab, setTab] = useState<SubTab>("notification");

  // Pull unread counts so each sub-tab label can show its own orange dot.
  const refresh = useUnread((s) => s.refresh);
  const chatUnread = useUnread((s) => s.chat > 0);
  const notifUnread = useUnread((s) => s.notifications > 0);
  // Refresh whenever the Message screen regains focus.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      <View className="px-5 pt-2 pb-3">
        <Text className="text-2xl font-bold text-ink">Message</Text>
      </View>
      {/* Segmented sub-tab header. */}
      <View className="flex-row px-5 border-b border-ink-line">
        <SegTab
          label="Notification"
          active={tab === "notification"}
          showDot={notifUnread}
          onPress={() => setTab("notification")}
        />
        <SegTab
          label="Chat"
          active={tab === "chat"}
          showDot={chatUnread}
          onPress={() => setTab("chat")}
        />
      </View>
      {/* Keep both mounted? No — remount on switch is fine and cheaper here;
          each list re-fetches on focus/mount and calls refresh() via onChanged. */}
      {tab === "notification" ? (
        <NotificationList onChanged={refresh} />
      ) : (
        <ChatInbox onChanged={refresh} />
      )}
    </SafeAreaView>
  );
}

function SegTab({
  label,
  active,
  showDot,
  onPress,
}: {
  label: string;
  active: boolean;
  showDot: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="mr-6 pb-2.5" style={{ paddingTop: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text
          className={`text-base ${active ? "font-bold text-ink" : "font-semibold text-ink-muted"}`}
        >
          {label}
        </Text>
        {showDot ? (
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: colors.brand,
              marginLeft: 5,
            }}
          />
        ) : null}
      </View>
      {/* Active underline. */}
      <View
        style={{
          height: 2.5,
          borderRadius: 2,
          marginTop: 6,
          backgroundColor: active ? colors.brand : "transparent",
        }}
      />
    </Pressable>
  );
}
