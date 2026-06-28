import { View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";

type Props = {
  value: number;
  size?: number;
  onChange?: (v: number) => void; // if provided -> interactive
  color?: string;
};

export function Stars({ value, size = 16, onChange, color = colors.brand }: Props) {
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        const Icon = (
          <Ionicons
            name={filled ? "star" : "star-outline"}
            size={size}
            color={filled ? color : colors.line}
          />
        );
        return onChange ? (
          <Pressable key={n} onPress={() => onChange(n)} className="mr-1">
            {Icon}
          </Pressable>
        ) : (
          <View key={n} className="mr-0.5">
            {Icon}
          </View>
        );
      })}
    </View>
  );
}
