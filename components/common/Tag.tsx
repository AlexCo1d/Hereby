import { View, Text, Pressable } from "react-native";
import { ReactNode } from "react";

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
  /** Tailwind background color class when active, e.g. "bg-accent-blue" */
  activeColorClass?: string;
  size?: "sm" | "md";
  icon?: ReactNode;
};

export function Tag({ label, active, onPress, activeColorClass = "bg-brand", size = "md", icon }: Props) {
  const px = size === "sm" ? "px-3" : "px-4";
  const py = size === "sm" ? "py-1" : "py-1.5";
  const text = size === "sm" ? "text-xs" : "text-sm";
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full ${px} ${py} flex-row items-center ${
        active ? activeColorClass : "bg-surface-soft"
      }`}
    >
      {icon ? <View className="mr-1">{icon}</View> : null}
      <Text className={`${text} font-medium ${active ? "text-white" : "text-ink"}`}>{label}</Text>
    </Pressable>
  );
}
