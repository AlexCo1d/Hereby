import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { colors } from "../../constants/theme";
import { useUnread } from "../../stores/unread";

/** An Ionicon with a small orange unread dot in the top-right corner. */
function IconWithDot({
  name,
  size,
  color,
  showDot,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  showDot: boolean;
}) {
  return (
    <View>
      <Ionicons name={name} size={size} color={color} />
      {showDot ? (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -3,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.brand,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Lift the tab bar above the iOS home indicator / Android nav bar.
  // Minimum 12px gap even on devices without an inset, to avoid edge mis-taps.
  const bottomPad = Math.max(insets.bottom, 12);

  // Poll unread counts so the Message-tab dot lights up when a cross-user event
  // (e.g. someone replies to your note) lands, without needing a manual reload.
  const refresh = useUnread((s) => s.refresh);
  const messageUnread = useUnread((s) => s.chat > 0 || s.notifications > 0);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        // Force below-icon labels on every viewport (react-navigation would
        // otherwise switch to beside-icon on very wide screens).
        tabBarLabelPosition: "below-icon",
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          // Enough vertical room for the 28px icon + label to sit ABOVE the
          // bar's bottom edge. If too short, the below-icon label overflows
          // off-screen and disappears (the mobile-web "no labels" bug).
          height: 70 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
          // soft shadow above the bar so it visually floats
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
            },
            android: { elevation: 8 },
            default: {},
          }),
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500", marginTop: 0 },
      }}
    >
      <Tabs.Screen
        name="events"
        options={{
          title: "Events",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Discover",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Message",
          tabBarIcon: ({ color, size }) => (
            <IconWithDot
              name="chatbubble-outline"
              size={size}
              color={color}
              showDot={messageUnread}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="my"
        options={{
          title: "My",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
