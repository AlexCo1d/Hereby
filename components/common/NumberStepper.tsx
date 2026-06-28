import { View, Text, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../constants/theme";

type Props = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Optional suffix shown to the right of the number, e.g. "people" */
  suffix?: string;
};

/**
 * Compact -/+ stepper with a tap-to-edit numeric field in the middle.
 * Used wherever a small integer needs to be customized (seats, etc).
 */
export function NumberStepper({ value, onChange, min = 1, max = 99, step = 1, suffix }: Props) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        hitSlop={8}
        className="w-10 h-10 rounded-full bg-surface-soft items-center justify-center"
      >
        <Ionicons name="remove" size={18} color={value > min ? colors.ink : colors.inkMuted} />
      </Pressable>
      <View className="px-4 min-w-[60px] items-center">
        <TextInput
          value={String(value)}
          onChangeText={(t) => {
            const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
            if (Number.isFinite(n)) onChange(clamp(n));
            else if (t === "") onChange(min);
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          style={{
            fontSize: 18,
            fontWeight: "700",
            color: colors.ink,
            textAlign: "center",
            paddingVertical: 0,
            minWidth: 28,
          }}
        />
        {suffix ? <Text className="text-[10px] text-ink-muted">{suffix}</Text> : null}
      </View>
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        hitSlop={8}
        className="w-10 h-10 rounded-full bg-surface-soft items-center justify-center"
      >
        <Ionicons name="add" size={18} color={value < max ? colors.ink : colors.inkMuted} />
      </Pressable>
    </View>
  );
}
