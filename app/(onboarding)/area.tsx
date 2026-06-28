// Onboarding area picker — same Marketplace pattern as settings/area: pan the
// map under a fixed pin, or type a city / ZIP. Persists choice to the auth
// store immediately on Next so the rest of onboarding sees the right area.
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

export default function AreaScreen() {
  const setAreaSettings = useAuth((s) => s.setAreaSettings);

  const [center, setCenter] = useState({ lat: UCF_CENTER.lat, lng: UCF_CENTER.lng });
  const [radius, setRadius] = useState(5);
  const [recenterToken, setRecenterToken] = useState(0);

  // Throttle map pan updates so rapid gestures don't thrash state.
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

  const goNext = () => {
    setAreaSettings({ centerLat: center.lat, centerLng: center.lng, radiusMiles: radius });
    router.push({ pathname: "/(onboarding)/interests", params: { radius: String(radius) } });
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Brand header */}
        <View className="px-5 pt-3 pb-3 bg-brand">
          <Text className="text-xl font-bold text-white">Your Local Area</Text>
          <Text className="text-xs text-white/90 mt-1">
            So we only show posts you can actually reach.
          </Text>
        </View>

        {/* Search */}
        <View className="px-4 pt-3 pb-2">
          <AddressAutocomplete
            near={center}
            placeholder="City, neighborhood, or ZIP code"
            onSelect={(hit) => {
              setCenter({ lat: hit.lat, lng: hit.lng });
              setRecenterToken((n) => n + 1);
            }}
          />
          <Text className="text-[11px] text-ink-muted mt-2">
            Or pan the map below — the pin stays in the middle, drag the map under it.
          </Text>
        </View>

        {/* Map + fixed pin */}
        <View className="flex-1">
          <OSMMap
            center={center}
            fixedRadiusMiles={radius}
            onRegionChange={(c) => {
              pendingRef.current = c;
            }}
            recenterToken={recenterToken}
          />
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
        <View className="px-5 pt-3 pb-1">
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

        <View className="px-5 py-3 flex-row items-center justify-between">
          <Pressable onPress={goNext} hitSlop={8}>
            <Text className="text-ink-muted text-sm">Skip for now</Text>
          </Pressable>
          <Button label="Next" variant="primary" className="px-8" onPress={goNext} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
