import { Image } from "expo-image";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { User } from "../../services/types";
import { colors } from "../../constants/theme";

type Props = {
  users: User[];
  /** Diameter of each avatar. */
  size?: number;
  /** Max faces to render before collapsing into a "+N" chip. */
  max?: number;
  /** How far each avatar overlaps the previous one (px). */
  overlap?: number;
  /** Grey "not-yet-arrived" seats drawn AFTER the real faces (left-to-right
   *  fill). Used by the My tab: a group post shows its committed members first,
   *  then one grey placeholder per open seat. */
  placeholders?: number;
};

/**
 * Overlapping row of avatars for a group activity (host first). Anything beyond
 * `max` collapses into a "+N" counter so the row never grows unbounded. Each
 * face gets a white ring so overlapping avatars stay visually separated.
 * Empty seats trail the real faces as grey person-outline placeholders.
 */
export function AvatarStack({ users, size = 40, max = 4, overlap = 12, placeholders = 0 }: Props) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const ring = 2;
  // Only draw grey seats when the real faces all fit (no "+N" collapse), so the
  // row stays legible. Cap so the row never runs off the card.
  const ghosts = extra > 0 ? 0 : Math.max(0, Math.min(placeholders, max - shown.length));

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((u, i) => (
        <View
          key={u.id}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ring,
            borderColor: colors.surface,
            overflow: "hidden",
            marginLeft: i === 0 ? 0 : -overlap,
            backgroundColor: colors.surfaceSoft,
            zIndex: shown.length - i,
          }}
        >
          <Image
            source={{ uri: u.avatarUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={120}
          />
        </View>
      ))}
      {Array.from({ length: ghosts }).map((_, i) => (
        <View
          key={`ph_${i}`}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ring,
            borderColor: colors.surface,
            marginLeft: shown.length === 0 && i === 0 ? 0 : -overlap,
            backgroundColor: colors.surfaceSoft,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 0,
          }}
        >
          <Ionicons name="person" size={size * 0.5} color={colors.line} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ring,
            borderColor: colors.surface,
            marginLeft: -overlap,
            backgroundColor: colors.brandSoft,
            alignItems: "center",
            justifyContent: "center",
            zIndex: 0,
          }}
        >
          <Text style={{ color: colors.brand, fontWeight: "700", fontSize: size * 0.32 }}>
            +{extra}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
