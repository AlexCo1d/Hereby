// Native (iOS + Android) implementation. Tapping the field opens the OS-native
// pickers via @react-native-community/datetimepicker. Web resolves
// DateTimePickerField.web.tsx instead.
//
// iOS: a single inline "datetime" spinner. The spinner fires onChange on every
// tick as the user scrolls, so we must NOT unmount on the first event — we keep
// it mounted and apply the full picked datetime, dismissing only on "Done".
// Android: the OS shows a modal date picker, then we chain a time picker.
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

  // iOS: the datetime spinner reports the complete picked date; apply it as-is
  // and keep the spinner mounted so scrolling isn't interrupted.
  const onIosChange = (_: any, d?: Date) => {
    if (!d) return;
    const next = new Date(d);
    next.setSeconds(0, 0);
    onChange(next);
  };

  // Android date step: merge the picked day onto the current time, then chain
  // the time picker.
  const onAndroidDate = (event: any, d?: Date) => {
    setStage("idle");
    if (event?.type === "dismissed" || !d) return;
    const merged = new Date(value);
    merged.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
    onChange(merged);
    setTimeout(() => setStage("time"), 0);
  };

  // Android time step: merge the picked time onto the (already-updated) day.
  const onAndroidTime = (event: any, d?: Date) => {
    setStage("idle");
    if (event?.type === "dismissed" || !d) return;
    const merged = new Date(value);
    merged.setHours(d.getHours(), d.getMinutes(), 0, 0);
    onChange(merged);
  };

  const isIos = Platform.OS === "ios";

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

      {isIos && stage === "date" ? (
        <View className="mt-2 bg-surface-soft rounded-xl">
          <DateTimePicker
            value={value}
            mode="datetime"
            minimumDate={minimumDate}
            onChange={onIosChange}
            display="spinner"
          />
          <Pressable
            onPress={() => setStage("idle")}
            className="items-center py-2.5 mx-4 mb-2 rounded-xl"
            style={{ backgroundColor: colors.brand }}
          >
            <Text className="text-white text-sm font-semibold">Done</Text>
          </Pressable>
        </View>
      ) : null}

      {!isIos && stage === "date" ? (
        <DateTimePicker
          value={value}
          mode="date"
          minimumDate={minimumDate}
          onChange={onAndroidDate}
          display="default"
        />
      ) : null}
      {!isIos && stage === "time" ? (
        <DateTimePicker value={value} mode="time" onChange={onAndroidTime} display="default" />
      ) : null}
    </View>
  );
}
