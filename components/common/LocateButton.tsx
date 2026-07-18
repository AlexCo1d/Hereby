// A round "use my current location" button, meant to float bottom-right over a
// map. Requests permission, reads one GPS fix, and hands the coords back.
// Works on native (expo-location) and web (the same module proxies to the
// browser Geolocation API).
import { useState } from "react";
import { Pressable, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors } from "../../constants/theme";
import { notify } from "../../services/notify";

type Props = {
  onLocate: (coord: { lat: number; lng: number }) => void;
  /** Distance from the bottom edge (to clear sliders / CTAs). Default 16. */
  bottom?: number;
};

export function LocateButton({ onLocate, bottom = 16 }: Props) {
  const [busy, setBusy] = useState(false);

  const locate = async () => {
    if (busy) return;

    // Web: call the browser Geolocation API DIRECTLY inside the click handler.
    // Safari/iOS (and Edge) only honour a geolocation request when it's invoked
    // synchronously from a user gesture. Awaiting expo-location's permission
    // check first (as the native path does) drops out of the gesture, so the
    // request silently never fires — the classic "spinner then nothing".
    // navigator.geolocation shows the browser's own permission prompt, so no
    // separate permission step is needed here.
    if (Platform.OS === "web") {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        notify(
          "Location unavailable",
          "This browser can't share your location. Search or pan the map instead.",
        );
        return;
      }
      setBusy(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBusy(false);
          onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          setBusy(false);
          notify(
            "Couldn't get location",
            err.code === err.PERMISSION_DENIED
              ? "Allow location access for this site in your browser, then try again. On Windows, also check that Location services are turned on."
              : "Location timed out. Make sure location services are on, or search / pan the map instead.",
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
      return;
    }

    // Native: expo-location with an explicit foreground permission request.
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        notify(
          "Location permission needed",
          "Enable location for Hereby in Settings to center the map on you.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      notify("Couldn't get location", "Try again, or search / pan the map instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={locate}
      disabled={busy}
      style={{
        position: "absolute",
        right: 14,
        bottom,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "white",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 5,
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.brand} />
      ) : (
        <Ionicons name="locate" size={22} color={colors.brand} />
      )}
    </Pressable>
  );
}
