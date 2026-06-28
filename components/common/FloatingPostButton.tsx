import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";

type Props = { onPress?: () => void; bottom?: number };

/**
 * The orange "+" floating action button that appears on Discover / Events /
 * the map screens. Position is absolute relative to its parent.
 */
export function FloatingPostButton({ onPress, bottom = 20 }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: "absolute",
        right: 20,
        bottom,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.brand,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: colors.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
      }}
    >
      <Ionicons name="add" size={32} color="white" />
    </Pressable>
  );
}
