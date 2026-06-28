// Native (iOS + Android) implementation. Tapping the field opens the OS-native
// date and time pickers in sequence via @react-native-community/datetimepicker.
// Web resolves DateTimePickerField.web.tsx instead.
import { useState } from "react";
import { Pressable, Text, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "../../constants/theme";

export type DateTimePickerFieldProps = {
  value: Date;
  onChange: (d: Date) => void;
  minimumDate?: Date;
};

function fmt(d: Date) {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DateTimePickerField({ value, onChange, minimumDate }: DateTimePickerFieldProps) {
  const [stage, setStage] = useState<"idle" | "date" | "time">("idle");

  const onDate = (_: any, d?: Date) => {
    setStage("idle");
    if (!d) return;
    // Preserve the previously selected time when the user only changed the date.
    const merged = new Date(value);
    merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(merged);
    // On Android the date picker dismisses after pick — open the time picker next.
    if (Platform.OS === "android") setTimeout(() => setStage("time"), 0);
  };

  const onTime = (_: any, d?: Date) => {
    setStage("idle");
    if (!d) return;
    const merged = new Date(value);
    merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
    onChange(merged);
  };

  return (
    <View>
      <Pressable
        onPress={() => setStage("date")}
        className="flex-row items-center bg-surface-soft rounded-xl px-4"
        style={{ height: 48 }}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.brand} />
        <Text className="ml-2 text-ink text-sm flex-1">{fmt(value)}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkMuted} />
      </Pressable>

      {stage === "date" ? (
        <DateTimePicker
          value={value}
          mode={Platform.OS === "ios" ? "datetime" : "date"}
          minimumDate={minimumDate}
          onChange={Platform.OS === "ios" ? onTime : onDate}
          display={Platform.OS === "ios" ? "spinner" : "default"}
        />
      ) : null}
      {stage === "time" ? (
        <DateTimePicker
          value={value}
          mode="time"
          onChange={onTime}
          display="default"
        />
      ) : null}
    </View>
  );
}
