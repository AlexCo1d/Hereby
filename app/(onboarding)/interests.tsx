import { useState } from "react";
import { View, Text, ScrollView, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import { Button } from "../../components/common/Button";
import { InterestPicker } from "../../components/common/InterestPicker";
import { useAuth } from "../../stores/auth";

export default function InterestsScreen() {
  const { radius } = useLocalSearchParams<{ radius?: string }>();
  const finishOnboarding = useAuth((s) => s.finishOnboarding);
  const addCustomTag = useAuth((s) => s.addCustomTag);
  const removeCustomTag = useAuth((s) => s.removeCustomTag);
  const setTagLevel = useAuth((s) => s.setTagLevel);
  const customTags = useAuth((s) => s.user?.customTags ?? []);
  const tagLevels = useAuth((s) => s.user?.tagLevels ?? {});
  const existingInterests = useAuth((s) => s.user?.interestIds ?? []);

  // Seed from whatever the user already had (so navigating back here, or
  // re-running onboarding, reflects current selections instead of resetting).
  const [selected, setSelected] = useState<Set<string>>(new Set(existingInterests));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const finish = (interestIds: string[]) => {
    finishOnboarding({ interestIds, radiusMiles: Number(radius) || 5 });
    router.replace("/(tabs)/discover" as any);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="px-5 pt-3 pb-4 bg-brand">
          <Text className="text-xl font-bold text-white">Choose Your Interests to Get Started</Text>
          <Text className="text-xs text-white/90 mt-1 leading-4">
            We'll recommend people with similar interests and abilities. You can change these any
            time in your profile.
          </Text>
        </View>

        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
          <View className="mt-4">
            <InterestPicker
              selectedInterestIds={Array.from(selected)}
              onToggleInterest={toggle}
              customTags={customTags}
              onAddCustomTag={addCustomTag}
              onRemoveCustomTag={removeCustomTag}
              tagLevels={tagLevels}
              onSetTagLevel={setTagLevel}
            />
          </View>
        </ScrollView>

        <View className="px-5 py-4">
          <View className="flex-row items-center justify-end mb-2">
            <Pressable onPress={() => finish(Array.from(selected))}>
              <Text className="text-ink-muted text-sm">Skip for now</Text>
            </Pressable>
          </View>
          <View className="flex-row justify-between">
            <Button
              label="Back"
              variant="secondary"
              className="flex-1 mr-2"
              onPress={() => router.back()}
            />
            <Button
              label="Next"
              variant="primary"
              className="flex-1 ml-2"
              onPress={() => finish(Array.from(selected))}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
