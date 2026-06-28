// A round "use my current location" button, meant to float bottom-right over a
// map. Requests permission, reads one GPS fix, and hands the coords back.
// Works on native (expo-location) and web (the same module proxies to the
// browser Geolocation API).
import { useState } from "react";
import { Pressable, ActivityIndicator, Alert, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors } from "../../constants/theme";

type Props = {
  onLocate: (coord: { lat: number; lng: number }) => void;
  /** Distance from the bottom edge (to clear sliders / CTAs). Default 16. */
  bottom?: number;
};

export function LocateButton({ onLocate, bottom = 16 }: Props) {
  const [busy, setBusy] = useState(false);

  const locate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          Platform.OS === "web"
            ? "Allow location access in your browser to use this."
            : "Enable location for Hereby in Settings to center the map on you.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert("Couldn't get location", "Try again, or search / pan the map instead.");
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
