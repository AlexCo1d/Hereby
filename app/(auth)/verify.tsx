import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "../../components/common/Button";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const IS_SUPABASE = process.env.EXPO_PUBLIC_DATA_SOURCE === "supabase";

export default function VerifyScreen() {
  const pendingEmail = useAuth((s) => s.pendingEmail);
  const verifyOtp = useAuth((s) => s.verifyOtp);
  const login = useAuth((s) => s.login);

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const refs = useRef<(TextInput | null)[]>([]);
  const submittingRef = useRef(false);

  const code = digits.join("");

  // Resend cooldown tick.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const setAt = (i: number, v: string) => {
    const cleaned = v.replace(/\D/g, "");
    // Paste support: if multiple digits land in one box, spread them across.
    if (cleaned.length > 1) {
      const next = [...digits];
      for (let k = 0; k < cleaned.length && i + k < OTP_LENGTH; k++) next[i + k] = cleaned[k];
      setDigits(next);
      const focusAt = Math.min(i + cleaned.length, OTP_LENGTH - 1);
      refs.current[focusAt]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = cleaned.slice(0, 1);
    setDigits(next);
    if (cleaned && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const submit = async () => {
    if (submittingRef.current) return;
    if (code.length !== OTP_LENGTH) {
      setError(`Please enter all ${OTP_LENGTH} digits`);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(code);
      // Read the FRESH flag — verifyOtp updates hasFinishedOnboarding from the
      // user's DB row (supabase) so new accounts always hit onboarding.
      const onboarded = useAuth.getState().hasFinishedOnboarding;
      router.replace(onboarded ? "/(tabs)/discover" : "/(onboarding)/area");
    } catch (e: any) {
      setError(e?.message ?? "Invalid or expired code");
      setDigits(Array(OTP_LENGTH).fill(""));
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Auto-submit once all six digits are present.
  useEffect(() => {
    if (code.length === OTP_LENGTH && !submittingRef.current) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    if (cooldown > 0 || !pendingEmail) return;
    setError(null);
    try {
      await login(pendingEmail);
      setCooldown(RESEND_SECONDS);
    } catch (e: any) {
      setError(e?.message ?? "Couldn't resend the code");
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 px-6 pt-6">
          <Pressable onPress={() => router.back()} className="p-1 w-10">
            <Ionicons name="chevron-back" size={26} color={colors.ink} />
          </Pressable>

          <Text className="text-2xl font-bold text-ink mt-6">Enter your code</Text>
          <Text className="text-sm text-ink-muted mt-2 leading-5">
            We sent a 6-digit code to{" "}
            <Text className="font-semibold text-ink">{pendingEmail ?? "your email"}</Text>.
          </Text>
          <Pressable onPress={() => router.back()} className="mt-1">
            <Text className="text-sm text-brand font-semibold">Wrong email? Change it</Text>
          </Pressable>

          <View className="flex-row justify-between mt-7" style={{ gap: 8 }}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={d}
                onChangeText={(v) => setAt(i, v)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === "Backspace" && !digits[i] && i > 0) {
                    refs.current[i - 1]?.focus();
                  }
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                maxLength={i === 0 ? OTP_LENGTH : 1}
                className="text-center text-xl font-bold text-ink"
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: d ? colors.brand : colors.line,
                  backgroundColor: colors.surfaceSoft,
                }}
              />
            ))}
          </View>

          {error ? <Text className="text-red-500 text-xs mt-3">{error}</Text> : null}

          {!IS_SUPABASE ? (
            <Text className="text-xs text-ink-muted mt-4">
              Dev tip: any 6 digits work in this build (e.g. 123456).
            </Text>
          ) : null}

          <View className="mt-6">
            <Button label="Verify & continue" onPress={submit} loading={loading} />
          </View>

          <Pressable onPress={resend} disabled={cooldown > 0} className="mt-5 items-center">
            <Text
              className="text-sm font-semibold"
              style={{ color: cooldown > 0 ? colors.inkMuted : colors.brand }}
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
