// Visual card for one of the three check-in cascade channels (spec 0.6).
//
// Three of these sit side-by-side in the Order detail screen, forming the
// "any 2 of 3 = checked in" cascade. Designed so we can later swap the
// onPress callback for real GPS geofencing / camera-based QR / peer push
// notification without touching the UI.
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import type { CheckInStatus } from "../../services/types";

export type CheckInCardSpec = {
  /** Stable channel id used by the api ("location" | "qr" | "peer"). */
  channel: string;
  title: string;
  /** Subtitle: how this confirmation works in production. */
  subtitle: string;
  /** Ionicons name for the channel icon. */
  icon: keyof typeof Ionicons.glyphMap;
  status: CheckInStatus;
  /** Tap action — in dev this just flips the local state; in prod it kicks
   *  off the real verification (open camera / start geofence watch / ping
   *  peer / etc.). */
  onPress?: () => void;
  /** When true, render a disabled state (e.g. order already completed). */
  disabled?: boolean;
};

export function CheckInCard({
  title,
  subtitle,
  icon,
  status,
  onPress,
  disabled,
}: CheckInCardSpec) {
  const confirmed = status === "confirmed";
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      // Equal-width siblings: parent wraps in <View style={{ flex: 1 }}>.
      style={{
        flex: 1,
        backgroundColor: confirmed ? "rgba(255,107,53,0.10)" : colors.surface,
        borderWidth: 1.5,
        borderColor: confirmed ? colors.brand : colors.line,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 10,
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {/* Top: icon + status pill in corner */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: confirmed ? colors.brand : colors.surfaceSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons
          name={confirmed ? "checkmark" : icon}
          size={22}
          color={confirmed ? "white" : colors.ink}
        />
      </View>

      <Text className="text-sm font-bold text-ink text-center" numberOfLines={1}>
        {title}
      </Text>
      <Text
        className="text-[10px] text-ink-muted mt-1 text-center leading-[13px]"
        numberOfLines={3}
      >
        {subtitle}
      </Text>

      <View
        style={{
          marginTop: 10,
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: confirmed ? colors.brand : colors.surfaceSoft,
        }}
      >
        <Text
          style={{
            color: confirmed ? "white" : colors.inkMuted,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.3,
          }}
        >
          {confirmed ? "CONFIRMED" : "TAP TO CONFIRM"}
        </Text>
      </View>
    </Pressable>
  );
}
