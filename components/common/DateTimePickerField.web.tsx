// Web implementation: use the native HTML <input type="datetime-local"> which
// renders a real OS picker in modern browsers — no extra dep needed.
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DateTimePickerFieldProps } from "./DateTimePickerField";
import { colors } from "../../constants/theme";

function toLocalIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePickerField({ value, onChange, minimumDate }: DateTimePickerFieldProps) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceSoft,
        borderRadius: 12,
        paddingHorizontal: 16,
        height: 48,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Ionicons name="calendar-outline" size={18} color={colors.brand} />
      {/* Real DOM input — rendered directly by React Native Web. */}
      <input
        type="datetime-local"
        value={toLocalIso(value)}
        min={minimumDate ? toLocalIso(minimumDate) : undefined}
        onChange={(e: any) => {
          const v = e.target.value as string;
          if (!v) return;
          onChange(new Date(v));
        }}
        style={{
          flex: 1,
          marginLeft: 8,
          border: "none",
          outline: "none",
          background: "transparent",
          color: colors.ink,
          fontSize: 14,
          fontFamily: "inherit",
        }}
      />
    </View>
  );
}
