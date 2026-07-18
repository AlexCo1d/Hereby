// Visual card for one of the two check-in methods on the Order screen.
//
// Two of these sit side-by-side: "Location" (your own GPS check-in) and
// "Manual" (vouch for others once you're present). The card is purely
// presentational — it renders one of three tones from `status` and fires
// `onPress`; the screen owns the real GPS watch / manual-picker logic.
//
//   pending   → grey  ("tap to…")
//   locating  → orange (background GPS match in progress)
//   confirmed → green  (done)
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";
import type { CheckInStatus } from "../../services/types";

/** Per-status CTA copy. Falls back to sensible defaults per status. */
export type CheckInCardLabels = Partial<Record<CheckInStatus, string>>;

export type CheckInCardSpec = {
  /** Stable method id used by the screen ("location" | "manual"). */
  method: string;
  title: string;
  /** Subtitle: how this method works, one line of plain-language copy. */
  subtitle: string;
  /** Ionicons name for the resting icon. */
  icon: keyof typeof Ionicons.glyphMap;
  status: CheckInStatus;
  /** Optional CTA overrides per status. */
  labels?: CheckInCardLabels;
  /** Tap action. */
  onPress?: () => void;
  /** When true, render a disabled (non-tappable, dimmed) state. */
  disabled?: boolean;
};

const DEFAULT_LABELS: Record<CheckInStatus, string> = {
  pending: "TAP TO CHECK IN",
  locating: "LOCATING…",
  confirmed: "CHECKED IN",
};

/** Tone (accent color) for each status. */
function toneFor(status: CheckInStatus): string {
  if (status === "confirmed") return colors.accentGreen;
  if (status === "locating") return colors.brand;
  return colors.line; // pending → neutral
}

export function CheckInCard({
  title,
  subtitle,
  icon,
  status,
  labels,
  onPress,
  disabled,
}: CheckInCardSpec) {
  const active = status === "locating" || status === "confirmed";
  const tone = toneFor(status);
  const label = labels?.[status] ?? DEFAULT_LABELS[status];
  // Icon: checkmark once confirmed, spinning-ish locate glyph while locating,
  // otherwise the method's resting icon.
  const glyph: keyof typeof Ionicons.glyphMap =
    status === "confirmed" ? "checkmark" : status === "locating" ? "navigate" : icon;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      // Equal-width siblings: parent wraps each in <View style={{ flex: 1 }}>.
      style={{
        flex: 1,
        backgroundColor: active ? `${tone}1A` : colors.surface, // ~10% tint
        borderWidth: 1.5,
        borderColor: active ? tone : colors.line,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 10,
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: active ? tone : colors.surfaceSoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={glyph} size={22} color={active ? "white" : colors.ink} />
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
          backgroundColor: active ? tone : colors.surfaceSoft,
        }}
      >
        <Text
          style={{
            color: active ? "white" : colors.inkMuted,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.3,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
