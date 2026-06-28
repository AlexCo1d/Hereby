import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "../stores/auth";
import { api } from "../services/api";

/**
 * Auth gate using Expo Router v6's <Stack.Protected> guards. All routes are
 * always declared, but each group's `guard` prop decides whether navigation
 * to it is permitted at runtime. The actual landing route is decided by
 * `app/index.tsx`, which uses <Redirect> so the navigator gets to mount
 * before any redirection happens (avoiding the "navigate before mounting
 * Root Layout" error we'd hit with router.replace() inside an effect).
 */
export default function RootLayout() {
  const user = useAuth((s) => s.user);
  const hasFinishedOnboarding = useAuth((s) => s.hasFinishedOnboarding);
  const initAuth = useAuth((s) => s.initAuth);

  const loggedOut = !user;
  const needsOnboarding = !!user && !hasFinishedOnboarding;
  const fullyAuthed = !!user && hasFinishedOnboarding;

  // Reconcile with the live supabase session on boot (no-op in mock mode).
  // The persisted user is a fast first paint; this corrects it (or clears it
  // if the session expired).
  useEffect(() => {
    initAuth().catch(() => {});
  }, [initAuth]);

  // Server-cron stand-in: every 60s while the app is in foreground, sweep
  // any orders past `endAt + 30min` and finalize them (completed / no_show /
  // mutual-no-show auto-cancel). On a real backend this is a Postgres
  // scheduled function or Edge cron — here it just runs locally so the
  // mock state stays believable without a backend.
  useEffect(() => {
    if (!fullyAuthed) return;
    api.sweepAutoComplete().catch(() => {});
    const t = setInterval(() => {
      api.sweepAutoComplete().catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(t);
  }, [fullyAuthed]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={loggedOut}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={fullyAuthed}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="provider/[id]"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="order/[id]"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="post/new"
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="chat/[id]"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="profile/index"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="settings/area"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
