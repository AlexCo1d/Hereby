// Marketplace-style "Local area" editor:
//   • A search bar on top that geocodes free text / ZIP via Nominatim (OSM).
//   • A draggable map. The center pin is a fixed overlay in the dead center
//     of the map; the user pans the map under it.
//   • A radius slider + Apply button at the bottom.
//
// Compared to tap-to-drop-center, this matches the FB Marketplace pattern
// users already know and avoids the "I tapped the wrong spot" misclicks.
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { OSMMap } from "../../components/map/OSMMap";
import { Button } from "../../components/common/Button";
import { LocateButton } from "../../components/common/LocateButton";
import { AddressAutocomplete } from "../../components/common/AddressAutocomplete";
import { UCF_CENTER } from "../../services/mock/data";
import { useAuth } from "../../stores/auth";
import { colors } from "../../constants/theme";

export default function AreaSettingsScreen() {
  const user = useAuth((s) => s.user);
  const setAreaSettings = useAuth((s) => s.setAreaSettings);

  // The "current displayed center" reflects what's centered in the map view.
  // Updated by the user's pan gestures via OSMMap.onRegionChange.
  const [center, setCenter] = useState({
    lat: user?.centerLat ?? UCF_CENTER.lat,
    lng: user?.centerLng ?? UCF_CENTER.lng,
  });
  const [radius, setRadius] = useState(user?.radiusMiles ?? 5);

  // Bumping this token tells OSMMap to programmatically re-center, even when
  // the lat/lng coords happen to coincide with a previous value.
  const [recenterToken, setRecenterToken] = useState(0);

  // Track the pending region update so rapid panning doesn't thrash state.
  const pendingRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      if (pendingRef.current) {
        setCenter(pendingRef.current);
        pendingRef.current = null;
      }
    }, 120);
    return () => clearInterval(id);
  }, []);

  const save = () => {
    setAreaSettings({
      centerLat: center.lat,
      centerLng: center.lng,
      radiusMiles: radius,
    });
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View className="px-3 pt-2 pb-2 flex-row items-center border-b border-ink-line">
          <Pressable onPress={() => router.back()} className="p-1 mr-2">
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text className="text-lg font-bold text-ink flex-1 text-center">Local area</Text>
          <Pressable onPress={save} className="px-3 py-1">
            <Text className="text-brand font-semibold">Save</Text>
          </Pressable>
        </View>

        {/* Search */}
        <View className="px-4 py-3">
          <AddressAutocomplete
            near={center}
            placeholder="City, neighborhood, or ZIP code"
            onSelect={(hit) => {
              setCenter({ lat: hit.lat, lng: hit.lng });
              setRecenterToken((n) => n + 1);
            }}
          />
          <Text className="text-[11px] text-ink-muted mt-2">
            Or pan the map below — drop the pin wherever you'd like to anchor your local feed.
          </Text>
        </View>

        {/* Map with fixed center pin overlay */}
        <View className="flex-1">
          <OSMMap
            center={center}
            fixedRadiusMiles={radius}
            onRegionChange={(c) => {
              pendingRef.current = c;
            }}
            recenterToken={recenterToken}
          />
          {/* Centered, always-visible pin. pointerEvents="none" so the user
              still hits the map underneath. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View style={{ alignItems: "center" }}>
              <Ionicons name="location" size={36} color={colors.brand} />
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.brand,
                  marginTop: -4,
                }}
              />
            </View>
          </View>

          {/* Jump the map to the user's current GPS position. */}
          <LocateButton
            onLocate={(c) => {
              setCenter(c);
              setRecenterToken((n) => n + 1);
            }}
          />
        </View>

        {/* Radius slider */}
        <View className="px-5 pt-4 pb-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-ink">Radius</Text>
            <Text className="text-sm font-bold text-brand">{radius} mi</Text>
          </View>
          <Slider
            style={{ marginTop: 4 }}
            minimumValue={1}
            maximumValue={30}
            step={1}
            value={radius}
            minimumTrackTintColor={colors.brand}
            maximumTrackTintColor={colors.line}
            thumbTintColor={colors.brand}
            onValueChange={setRadius}
          />
        </View>

        <View className="px-5 pb-3">
          <Button label="Apply" variant="primary" onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
