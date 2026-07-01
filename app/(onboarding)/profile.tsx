// First onboarding step: set a display name + avatar. New accounts land here
// (no email-prefix usernames) before picking their area and interests.
import { useState } from "react";
import { View, Text, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { AvatarNameEditor } from "../../components/common/AvatarNameEditor";
import { Button } from "../../components/common/Button";
import { useAuth } from "../../stores/auth";
import { generatedAvatar } from "../../services/avatar";

export default function OnboardingProfileScreen() {
  const user = useAuth((s) => s.user);
  const updateProfile = useAuth((s) => s.updateProfile);

  const seed = user?.email || user?.id || "hereby";
  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || generatedAvatar(seed));

  const canContinue = name.trim().length >= 2;

  const next = () => {
    if (!canContinue) {
      Alert.alert("Add a name", "Enter a display name so people know who you are.");
      return;
    }
    updateProfile({ name: name.trim(), avatarUrl });
    router.push("/(onboarding)/area" as any);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="px-5 pt-4 pb-3 bg-brand">
          <Text className="text-xl font-bold text-white">Set up your profile</Text>
          <Text className="text-xs text-white/90 mt-1 leading-4">
            A photo and name help people recognize you when you meet up.
          </Text>
        </View>

        <View className="flex-1 px-6 pt-10">
          <AvatarNameEditor
            name={name}
            avatarUrl={avatarUrl}
            seed={seed}
            userId={user?.id ?? "me"}
            onChangeName={setName}
            onChangeAvatar={setAvatarUrl}
          />
        </View>

        <View className="px-5 py-4">
          <Button label="Continue" variant="primary" onPress={next} disabled={!canContinue} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
