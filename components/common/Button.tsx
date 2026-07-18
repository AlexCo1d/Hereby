import { Pressable, Text, View, ActivityIndicator } from "react-native";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "sm";
type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ReactNode;
  className?: string;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  leftIcon,
  className = "",
}: Props) {
  const base =
    size === "sm"
      ? "h-10 rounded-xl items-center justify-center flex-row px-3"
      : "h-12 rounded-2xl items-center justify-center flex-row px-5";
  const bg =
    variant === "primary"
      ? "bg-brand"
      : variant === "secondary"
        ? "bg-surface-soft"
        : "bg-transparent";
  const text =
    variant === "primary"
      ? "text-white"
      : variant === "secondary"
        ? "text-ink"
        : "text-brand";
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      className={`${base} ${bg} ${disabled || loading ? "opacity-60" : ""} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : "#FF6B35"} />
      ) : (
        <>
          {leftIcon ? <View className="mr-2">{leftIcon}</View> : null}
          <Text numberOfLines={1} className={`${text} font-semibold ${size === "sm" ? "text-sm" : "text-base"}`}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
