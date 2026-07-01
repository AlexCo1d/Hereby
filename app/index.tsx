import { Redirect } from "expo-router";
import { useAuth } from "../stores/auth";

/**
 * Root entry. Renders an Expo Router <Redirect>, which (unlike router.replace
 * inside useEffect) is processed AFTER the root navigator mounts, so it
 * works on native without the "navigate before mounting Root Layout" error.
 */
export default function Index() {
  const user = useAuth((s) => s.user);
  const hasFinishedOnboarding = useAuth((s) => s.hasFinishedOnboarding);

  if (!user) return <Redirect href={"/(auth)/login" as any} />;
  if (!hasFinishedOnboarding) return <Redirect href={"/(onboarding)/profile" as any} />;
  return <Redirect href={"/(tabs)/discover" as any} />;
}
