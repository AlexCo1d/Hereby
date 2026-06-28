// Web (and default) implementation of the OSM map. Native platforms will
// resolve `OSMMap.native.tsx` instead via Metro's platform-extension rules,
// which keeps `react-native-maps` (native-only) out of the web bundle.
import { View, Text } from "react-native";
import { ReactNode } from "react";
import { colors } from "../../constants/theme";
import type { LatLng } from "../../services/types";

export type MapMarkerSpec = {
  id: string;
  coordinate: LatLng;
  render?: () => ReactNode;
  onPress?: () => void;
};

export type OSMMapProps = {
  center: LatLng;
  spanDeg?: number;
  markers?: MapMarkerSpec[];
  radiusMiles?: number;
  /** Fires when the user taps an empty spot on the map. Used to "drop" a
   *  center pin for area selection. */
  onMapPress?: (coord: LatLng) => void;
  /** Fires after the user finishes a pan/zoom gesture, reporting the new
   *  center of the viewport. Used for the Marketplace-style "drag the map,
   *  pin stays fixed in the middle" area picker. */
  onRegionChange?: (center: LatLng) => void;
  /** Programmatically re-center the map (used after geocoding a search query
   *  to fly the map to the searched location). Bumping the version triggers
   *  the recenter even if the lat/lng are unchanged. */
  recenterToken?: number;
  /** "Life circle" mode (area picker). When set, the map auto-zooms so this
   *  mileage maps to a CONSTANT on-screen ring that always fully fits the
   *  viewport. User zoom is disabled (so the ring never changes size); only
   *  panning moves the map under the fixed ring. Mutually exclusive with
   *  `spanDeg` / `radiusMiles` (which draw a geographic circle instead). */
  fixedRadiusMiles?: number;
  children?: ReactNode;
};

/** Fraction of the smaller viewport dimension used as the fixed ring radius.
 *  0.40 → ring diameter is 80% of the short side, leaving a comfortable margin
 *  so the whole "life circle" is always visible. Shared by every renderer so
 *  the drawn ring and the computed zoom agree. */
export const FIXED_RING_FRACTION = 0.4;

export function OSMMap(props: OSMMapProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#E8EEF2",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 220,
          height: 220,
          borderRadius: 110,
          borderWidth: 2,
          borderColor: colors.brand,
          backgroundColor: "rgba(255,107,53,0.18)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.brand, fontWeight: "600" }}>
          {props.radiusMiles ? `${props.radiusMiles} mi radius` : "Map"}
        </Text>
      </View>
      <Text style={{ color: colors.inkMuted, marginTop: 12, fontSize: 12 }}>
        OSM map (real tiles on iOS / Android)
      </Text>
    </View>
  );
}
