// Native (iOS / Android) implementation backed by react-native-maps and
// OpenStreetMap raster tiles. Web resolves the sibling `OSMMap.tsx` instead.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import MapView, { UrlTile, Marker, Circle } from "react-native-maps";
import { colors } from "../../constants/theme";
import type { OSMMapProps } from "./OSMMap";
import { FIXED_RING_FRACTION } from "./OSMMap";
export type { OSMMapProps, MapMarkerSpec } from "./OSMMap";

// latitudeDelta so a circle of `miles` shows as `pixelRadius` px in a viewport
// `heightPx` tall. (1 deg latitude ≈ 111.32 km.)
function latDeltaForRadius(miles: number, pixelRadius: number, heightPx: number) {
  const meters = miles * 1609.34;
  const metersPerPixel = meters / Math.max(1, pixelRadius);
  const visibleMeters = metersPerPixel * heightPx;
  return visibleMeters / 111320;
}

export function OSMMap(props: OSMMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const fixedMode = props.fixedRadiusMiles != null;
  const pixelRadius = Math.min(dims.w, dims.h) * FIXED_RING_FRACTION;

  // Legacy mode span; fixed mode derives its own delta from the viewport.
  const legacySpan = props.spanDeg ?? 0.04;
  const fixedDelta =
    fixedMode && dims.h > 0 && pixelRadius > 0
      ? latDeltaForRadius(props.fixedRadiusMiles!, pixelRadius, dims.h)
      : legacySpan;
  const span = fixedMode ? fixedDelta : legacySpan;

  // Re-animate on radius/recenter change. Skip the very first render so we
  // don't double-animate over initialRegion.
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (span <= 0) return;
    mapRef.current?.animateToRegion(
      {
        latitude: props.center.lat,
        longitude: props.center.lng,
        latitudeDelta: span,
        longitudeDelta: span,
      },
      350,
    );
    // In fixed mode, a radius change re-zooms; recenterToken flies to a point.
    // Both are covered by animating to (center, span).
  }, [props.recenterToken, props.fixedRadiusMiles, span]);

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDims((d) => (d.w === width && d.h === height ? d : { w: width, h: height }));
      }}
    >
      <MapView
        ref={(r) => {
          mapRef.current = r;
        }}
        style={{ flex: 1 }}
        initialRegion={{
          latitude: props.center.lat,
          longitude: props.center.lng,
          latitudeDelta: span > 0 ? span : 0.04,
          longitudeDelta: span > 0 ? span : 0.04,
        }}
        mapType="none"
        // Lock zoom/rotate/pitch in "life circle" mode so the fixed ring keeps
        // representing the chosen mileage; panning (scroll) stays on.
        zoomEnabled={!fixedMode}
        rotateEnabled={!fixedMode}
        pitchEnabled={!fixedMode}
        onPress={
          props.onMapPress
            ? (e: any) =>
                props.onMapPress!({
                  lat: e.nativeEvent.coordinate.latitude,
                  lng: e.nativeEvent.coordinate.longitude,
                })
            : undefined
        }
        onRegionChangeComplete={
          props.onRegionChange
            ? (region: any) =>
                props.onRegionChange!({ lat: region.latitude, lng: region.longitude })
            : undefined
        }
      >
        <UrlTile
          urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />
        {/* Geographic circle only in legacy (non-fixed) mode. */}
        {!fixedMode && props.radiusMiles ? (
          <Circle
            center={{ latitude: props.center.lat, longitude: props.center.lng }}
            radius={props.radiusMiles * 1609.34}
            strokeColor={colors.brand}
            strokeWidth={2}
            fillColor={"rgba(255,107,53,0.18)"}
          />
        ) : null}
        {props.markers?.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.coordinate.lat, longitude: m.coordinate.lng }}
            onPress={m.onPress}
          >
            {m.render?.()}
          </Marker>
        ))}
        {props.children}
      </MapView>

      {/* Fixed-size ring overlay (life-circle mode). */}
      {fixedMode && pixelRadius > 0 ? (
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
          <View
            style={{
              width: pixelRadius * 2,
              height: pixelRadius * 2,
              borderRadius: pixelRadius,
              borderWidth: 2,
              borderColor: colors.brand,
              backgroundColor: "rgba(255,107,53,0.14)",
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
