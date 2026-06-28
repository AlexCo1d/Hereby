import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "../../components/common/Avatar";
import { Stars } from "../../components/common/Stars";
import { Button } from "../../components/common/Button";
import { InterestPicker } from "../../components/common/InterestPicker";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

export default function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);
  const addCustomTag = useAuth((s) => s.addCustomTag);
  const removeCustomTag = useAuth((s) => s.removeCustomTag);
  const logout = useAuth((s) => s.logout);
  const insets = useSafeAreaInsets();

  const [bioDraft, setBioDraft] = useState(user?.bio ?? "");
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(
    new Set(user?.interestIds ?? []),
  );

  if (!user) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
        <Text className="text-center mt-12 text-ink-muted">Not signed in</Text>
      </SafeAreaView>
    );
  }

  const toggleInterest = (id: string) => {
    const next = new Set(selectedInterests);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedInterests(next);
  };

  const save = () => {
    updateProfile({
      bio: bioDraft,
      interestIds: Array.from(selectedInterests),
    });
    Alert.alert("Saved", "Your profile has been updated.");
  };

  const onLogout = () => {
    // Skip the native confirm dialog on web (which doesn't render Alert
    // buttons), but still gate native with a confirmation.
    const doIt = () => {
      logout();
      router.replace("/(auth)/login" as any);
    };
    if (typeof window !== "undefined" && (window as any).confirm) {
      if ((window as any).confirm("Log out of Hereby?")) doIt();
    } else {
      Alert.alert("Log out", "Are you sure?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: doIt },
      ]);
    }
  };

  const verified = user.mode === "verified";

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-2 flex-row items-center border-b border-ink-line">
        <Pressable onPress={() => router.back()} className="p-1 mr-2">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text className="text-lg font-bold text-ink flex-1">Profile</Text>
        <Pressable onPress={save} className="px-3 py-1">
          <Text className="text-brand font-semibold">Save</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Identity card */}
        <View className="items-center pt-6 pb-4 px-5">
          <Avatar uri={user.avatarUrl} size={88} ring />
          <View className="flex-row items-center mt-3">
            <Text className="text-xl font-bold text-ink">{user.name}</Text>
            {verified ? (
              <View className="ml-2 flex-row items-center bg-brand-100 rounded-full px-2 py-0.5">
                <Ionicons name="shield-checkmark" size={12} color={colors.brand} />
                <Text className="text-[10px] font-semibold ml-1" style={{ color: colors.brand }}>
                  .edu verified
                </Text>
              </View>
            ) : (
              <View className="ml-2 flex-row items-center bg-surface-soft rounded-full px-2 py-0.5">
                <Ionicons name="eye-outline" size={12} color={colors.inkMuted} />
                <Text className="text-[10px] font-semibold ml-1 text-ink-muted">browse-only</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-ink-muted mt-1">{user.email}</Text>

          {/* Two rating scores per spec 0.7 */}
          <View className="flex-row mt-5 w-full" style={{ gap: 12 }}>
            <RatingTile
              label="Rating received"
              value={user.ratingReceived}
              count={user.ratingReceivedCount}
              hint="Average score others gave you"
            />
            <RatingTile
              label="Rating given"
              value={user.ratingGiven}
              count={user.ratingGivenCount}
              hint="Public — how generously you rate others"
              isPublic
            />
          </View>
        </View>

        {/* Bio */}
        <Section title="Bio">
          <TextInput
            multiline
            value={bioDraft}
            onChangeText={setBioDraft}
            placeholder="A few words about you — what you're into, what level you play at, etc."
            placeholderTextColor={colors.inkMuted}
            className="text-ink text-sm"
            style={{
              minHeight: 80,
              textAlignVertical: "top",
              backgroundColor: colors.surfaceSoft,
              borderRadius: 12,
              padding: 12,
            }}
          />
        </Section>

        {/* Interests + custom tags — unified manager (same as onboarding).
            Interests are committed on Save; custom tags persist immediately. */}
        <Section
          title="Interests & tags"
          subtitle="Tap to toggle interests. These power who you get matched with."
        >
          <InterestPicker
            compact
            selectedInterestIds={Array.from(selectedInterests)}
            onToggleInterest={toggleInterest}
            customTags={user.customTags}
            onAddCustomTag={addCustomTag}
            onRemoveCustomTag={removeCustomTag}
          />
        </Section>

        {/* Account */}
        <Section title="Account">
          <Row
            icon="location-outline"
            label={`Local area: ${user.radiusMiles} mi radius`}
            onPress={() => router.push("/settings/area" as any)}
          />
          <Row icon="school-outline" label={`Campus: ${user.campusId.toUpperCase()}`} />
          <Row icon="log-out-outline" label="Log out" danger onPress={onLogout} />
        </Section>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="px-5 pt-5">
      <Text className="text-base font-bold text-ink">{title}</Text>
      {subtitle ? <Text className="text-xs text-ink-muted mt-1 mb-2">{subtitle}</Text> : null}
      <View className="mt-2">{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center py-3 border-b border-ink-line"
    >
      <Ionicons name={icon} size={18} color={danger ? "#E5484D" : colors.ink} />
      <Text className={`ml-3 text-sm ${danger ? "text-red-500" : "text-ink"}`}>{label}</Text>
      <View className="flex-1" />
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.inkMuted} /> : null}
    </Pressable>
  );
}

function RatingTile({
  label,
  value,
  count,
  hint,
  isPublic,
}: {
  label: string;
  value: number;
  count: number;
  hint: string;
  isPublic?: boolean;
}) {
  return (
    <View
      className="flex-1 rounded-2xl p-3"
      style={{ backgroundColor: colors.surfaceSoft }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-ink-muted">{label}</Text>
        {isPublic ? (
          <Text className="text-[9px] font-bold" style={{ color: colors.brand }}>
            PUBLIC
          </Text>
        ) : null}
      </View>
      <View className="flex-row items-baseline mt-1">
        <Text className="text-2xl font-bold text-ink">
          {count === 0 ? "—" : value.toFixed(2)}
        </Text>
        <Text className="text-xs text-ink-muted ml-2">({count})</Text>
      </View>
      <Stars value={value} size={12} />
      <Text className="text-[10px] text-ink-muted mt-1 leading-3">{hint}</Text>
    </View>
  );
}
