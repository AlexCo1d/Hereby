import { useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../../components/common/Button";
import { useAuth, isEduEmail } from "../../stores/auth";
import { colors } from "../../constants/theme";

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const devLogin = useAuth((s) => s.devLogin);
  const devLoginEnabled = useAuth((s) => s.devLoginEnabled);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(trimmed);
      router.push("/(auth)/verify" as any);
    } catch (e: any) {
      setError(e?.message ?? "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  // DEV ONLY: skip the OTP step and jump straight in.
  const onDevLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await devLogin(trimmed);
      const onboarded = useAuth.getState().hasFinishedOnboarding;
      router.replace(onboarded ? "/(tabs)/discover" : ("/(onboarding)/profile" as any));
    } catch (e: any) {
      setError(e?.message ?? "Dev login failed");
    } finally {
      setLoading(false);
    }
  };

  const willBeBrowseOnly = email.includes("@") && !isEduEmail(email.trim());

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 px-6 pt-10" style={{ width: "100%", maxWidth: 440, alignSelf: "center" }}>
          {/* Brand */}
          <View className="items-center mb-10">
            <Image
              source={require("../../assets/icon.png")}
              style={{ width: 72, height: 72, borderRadius: 18 }}
            />
            <Text className="text-2xl font-bold text-ink mt-3">Hereby</Text>
            <Text className="text-sm text-ink-muted mt-1">Your campus, on demand!</Text>
          </View>

          <Text className="text-xl font-bold text-ink mb-1">Sign in or create account</Text>
          <Text className="text-sm text-ink-muted mb-5 leading-5">
            Enter your campus email — we'll send a 6-digit code. New here? Your account is created
            automatically.
          </Text>

          {/* Email field */}
          <Text className="text-sm font-semibold text-ink mb-2">Campus email</Text>
          <View
            className="flex-row items-center bg-surface-soft rounded-2xl px-4 border border-ink-line"
            style={{ height: 56 }}
          >
            <Ionicons name="mail-outline" size={18} color={colors.inkMuted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your .edu email"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onSubmitEditing={onSubmit}
              // Explicit height + padding so iOS doesn't clip the text vertically
              // inside the rounded container.
              style={{
                flex: 1,
                marginLeft: 12,
                height: 56,
                paddingVertical: 0,
                fontSize: 16,
                color: colors.ink,
              }}
            />
          </View>

          {willBeBrowseOnly ? (
            <View className="flex-row items-start mt-3 bg-brand-100 rounded-xl p-3">
              <Ionicons name="information-circle" size={16} color={colors.brand} />
              <Text className="text-xs text-ink ml-2 flex-1 leading-4">
                Not a .edu email — you'll continue in <Text className="font-bold">browse-only</Text> mode.
                You can view posts and events but can't book or post until you verify a .edu email.
              </Text>
            </View>
          ) : null}

          {error ? <Text className="text-red-500 text-xs mt-2">{error}</Text> : null}

          <View className="mt-6">
            <Button label="Continue" onPress={onSubmit} loading={loading} />
          </View>

          {devLoginEnabled ? (
            <Pressable onPress={onDevLogin} className="mt-4 flex-row items-center justify-center">
              <Ionicons name="flash" size={14} color={colors.brand} />
              <Text className="text-xs font-semibold ml-1" style={{ color: colors.brand }}>
                Dev: log in without code
              </Text>
            </Pressable>
          ) : null}

          <Text className="text-xs text-ink-muted text-center mt-6 leading-4">
            By continuing you agree to our Terms &amp; Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
